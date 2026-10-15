const express = require('express');
const mongoose = require('mongoose');
const Report = require('../report.model');
const User = require('../user.model');
const { CATEGORIES, CATEGORY_FIELDS } = require('../utils/categories');
const { generateTrackingReference, generateAccessKey, hashSecret, verifySecret } = require('../utils/tracking');
const { classifyReportText } = require('../utils/classifier');
const { upload } = require('../middleware/upload');
const { storeEvidenceFile } = require('../utils/evidence');
const { getBucket } = require('../utils/gridfs');
const { requireAuth, requireRole } = require('../middleware/auth');
const { AGENCIES, suggestAgencyForCategory } = require('../utils/agencies');
const { sendMail } = require('../utils/mailer');
const { generateChallenge, verifyChallenge, evaluateBehavior, issueBehaviorToken } = require('../utils/captcha');
const { generateImageChallenge, verifyImageSelection } = require('../utils/imageCaptcha');
const { hashRecordingToken } = require('../utils/recordingToken');

const router = express.Router();

function pickCategoryDetails(reportedCategory, submitted = {}) {
  const allowedFields = (CATEGORY_FIELDS[reportedCategory] || []).map((f) => f.name);
  const clean = {};
  for (const key of allowedFields) {
    const value = submitted[key];
    if (value === undefined || value === null || value === '') continue;
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`Category detail "${key}" must be plain text`);
    }
    const text = String(value).normalize('NFC').trim();
    if (text.length > 500) throw new Error(`Category detail "${key}" must be 500 characters or fewer`);
    if (text) clean[key] = text;
  }
  return clean;
}

function cleanText(value, field, maxLength, collapseWhitespace = true) {
  if (typeof value !== 'string') throw new Error(`${field} must be text`);
  const normalized = value.normalize('NFC').trim();
  const text = collapseWhitespace ? normalized.replace(/\s+/g, ' ') : normalized;
  if (text.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer`);
  return text;
}

// Fires the (cheap, synchronous) classifier off the request/response cycle so submission
// never waits on it (decision #28). Unavailability of this step never blocks the workflow.
function classifyInBackground(reportId, { title, description, evidenceCount }) {
  setImmediate(async () => {
    try {
      const result = classifyReportText({ title, description, evidenceCount });
      await Report.findByIdAndUpdate(reportId, {
        classification: { category: result.category, urgency: result.urgency, confidence: result.confidence, classifiedAt: new Date() },
        tags: result.tags
      });
    } catch (err) {
      console.error('Background classification failed for report', reportId, err.message);
    }
  });
}

// GET /api/reports/categories - shared source of truth so the frontend form never hardcodes this.
router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES, fields: CATEGORY_FIELDS });
});

// GET /api/reports/agencies - the Agency/Institution referral list (decision #7).
router.get('/agencies', requireRole('reviewer', 'admin'), (req, res) => {
  res.json({ agencies: AGENCIES });
});

// GET /api/reports/captcha-challenge - self-hosted human-verification challenge (decision #9).
router.get('/captcha-challenge', (req, res) => {
  res.json(generateChallenge());
});

// POST /api/reports/captcha-verify - reCAPTCHA-style "I'm not a robot" endpoint.
// Receives interaction metrics, judges plausibility, and returns a signed
// human-verification token on success (the submit endpoint then accepts it
// in place of a text-challenge answer). Falls back to a text challenge when
// the behavioral check fails, so genuine users are never locked out.
router.get('/captcha-image', (req, res) => {
  const imageChallenge = generateImageChallenge();
  res.json({
    verified: false,
    imageMode: true,
    prompt: imageChallenge.prompt,
    token: imageChallenge.token,
    tiles: imageChallenge.tiles
  });
});

// POST /api/reports/captcha-verify - reCAPTCHA-style "I'm not a robot" endpoint.
// Receives interaction metrics, judges plausibility, and returns a signed
// human-verification token on success (the submit endpoint then accepts it
// in place of a text-challenge answer). Falls back to an image-selection
// challenge when the behavioral check fails, so bots never get a free pass.
router.post('/captcha-verify', (req, res) => {
  const { timeSpentMs, pointerMoves, keyEvents, honeypot, hasPointer } = req.body || {};
  if (evaluateBehavior({ timeSpentMs, pointerMoves, keyEvents, honeypot, hasPointer })) {
    return res.json({ verified: true, token: issueBehaviorToken() });
  }
  // Behavioral check failed - escalate to the image-selection challenge
  // ("select all images with X"), the hardest-to-script option.
  const imageChallenge = generateImageChallenge();
  return res.json({
    verified: false,
    imageMode: true,
    prompt: imageChallenge.prompt,
    token: imageChallenge.token,
    tiles: imageChallenge.tiles
  });
});

// POST /api/reports - submit a new report, Path A (anonymous) or Path B (logged in) side by side (decision #3).
router.post('/', upload.array('evidence', 10), async (req, res) => {
  let claimedRecordingId;
  try {
    const { reportedCategory, captchaToken, captchaAnswer } = req.body;
    if (!captchaToken || !verifyChallenge(captchaToken, captchaAnswer)) {
      return res.status(400).json({ error: 'Incorrect or expired verification answer - please try the challenge again' });
    }
    const title = cleanText(req.body.title, 'Title', 200);
    const description = cleanText(req.body.description, 'Description', 20000, false);
    const county = cleanText(req.body.county, 'County', 100);
    const subCounty = cleanText(req.body.subCounty, 'Sub-county', 100);
    if (!title || !reportedCategory || !description || !county || !subCounty) {
      return res.status(400).json({ error: 'Title, category, description, county and sub-county are required' });
    }
    if (!CATEGORIES.includes(reportedCategory)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (description.length < 20) {
      return res.status(400).json({ error: 'Please provide a more detailed description (at least 20 characters)' });
    }

    let categorySpecificDetails = {};
    if (req.body.categorySpecificDetails) {
      const parsed = typeof req.body.categorySpecificDetails === 'string'
        ? JSON.parse(req.body.categorySpecificDetails)
        : req.body.categorySpecificDetails;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return res.status(400).json({ error: 'Category details must be a JSON object' });
      }
      categorySpecificDetails = pickCategoryDetails(reportedCategory, parsed);
    }

    const demographic = {
      ageGroup: req.body.ageGroup ? cleanText(req.body.ageGroup, 'Age group', 100) : undefined,
      gender: req.body.gender ? cleanText(req.body.gender, 'Gender', 100) : undefined,
      occupation: req.body.occupation ? cleanText(req.body.occupation, 'Occupation', 120) : undefined
    };
    const cleanIncidentDateTime = req.body.incidentDateTime
      ? cleanText(req.body.incidentDateTime, 'Incident date and time', 100)
      : undefined;
    const parsedIncidentDateTime = cleanIncidentDateTime ? new Date(cleanIncidentDateTime) : undefined;
    if (parsedIncidentDateTime && Number.isNaN(parsedIncidentDateTime.getTime())) {
      return res.status(400).json({ error: 'Incident date and time must be a valid date' });
    }

    let recordingSession = null;
    if (req.body.recordingToken) {
      if (typeof req.body.recordingToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(req.body.recordingToken)) {
        return res.status(400).json({ error: 'The live recording is invalid. Please record it again.' });
      }
      if ((req.files || []).length >= 10) {
        return res.status(400).json({ error: 'A report can include at most 10 evidence items, including the recording.' });
      }
      recordingSession = await mongoose.connection.db.collection('recordingSessions').findOne({
        _id: hashRecordingToken(req.body.recordingToken),
        status: 'ready',
        expiresAt: { $gt: new Date() }
      });
      if (!recordingSession) {
        return res.status(400).json({ error: 'The live recording is no longer available. Please record it again.' });
      }
    }

    // Evidence files are streamed through sharp (images) and written to GridFS (decision #17/#18).
    const evidence = [];
    if (req.files && req.files.length) {
      const bucket = getBucket();
      for (const file of req.files) {
        evidence.push(await storeEvidenceFile(bucket, file));
      }
    }
    if (recordingSession) {
      evidence.push({
        gridFsId: recordingSession.fileId,
        filename: recordingSession.filename,
        type: recordingSession.mediaType
      });
    }

    let trackingReference = generateTrackingReference();
    // Extremely unlikely collision, but guard against it anyway rather than trust probability alone.
    for (let attempts = 0; attempts < 5 && await Report.exists({ trackingReference }); attempts++) {
      trackingReference = generateTrackingReference();
    }

    const isPathB = !!req.user;
    // Every report gets an Access Key now - anonymous (Path A) and logged-in (Path B)
    // alike. This keeps the "report now, sign in later" story safe: a citizen who
    // created an account after submitting can still reach their case via Reference+Key
    // if they lose the session, without the key ever exposing WHO they are.
    let accessKey = generateAccessKey();
    const accessKeyHash = await hashSecret(accessKey);

    const report = new Report({
      trackingReference,
      accessKeyHash,
      user: isPathB ? req.user._id : null,
      title: title.trim(),
      reportedCategory,
      categorySpecificDetails,
      description,
      county,
      subCounty,
      incidentDateTime: parsedIncidentDateTime,
      demographic,
      evidence,
      statusHistory: [{ status: 'Received', changedAt: new Date(), changedBy: null }]
    });
    if (recordingSession) {
      const claimed = await mongoose.connection.db.collection('recordingSessions').findOneAndUpdate(
        {
          _id: recordingSession._id,
          status: 'ready',
          expiresAt: { $gt: new Date() }
        },
        { $set: { status: 'attaching', reportId: report._id } },
        { returnDocument: 'after' }
      );
      if (!claimed) {
        return res.status(409).json({ error: 'The recording is already being attached to another report.' });
      }
      claimedRecordingId = recordingSession._id;
    }
    await report.save();
    if (claimedRecordingId) {
      try {
        await mongoose.connection.db.collection('recordingSessions').deleteOne({ _id: claimedRecordingId });
        claimedRecordingId = null;
      } catch (cleanupError) {
        console.error('Could not clean up an attached recording session:', cleanupError.message);
      }
    }

    classifyInBackground(report._id, { title, description, evidenceCount: evidence.length });

    const response = {
      message: 'Report submitted successfully',
      trackingReference,
      reportId: report._id,
      accessKey,
      accessKeyWarning: 'Save this Access Key now - it is shown only once and cannot be recovered later.'
    };
    return res.status(201).json(response);
  } catch (err) {
    if (claimedRecordingId) {
      await mongoose.connection.db.collection('recordingSessions').updateOne(
        { _id: claimedRecordingId, status: 'attaching' },
        { $set: { status: 'ready' }, $unset: { reportId: '' } }
      ).catch((cleanupError) => console.error('Could not release a recording session:', cleanupError.message));
    }
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/reports - public case list, general tier only (decision #3/#21): never exposes identity.
router.get('/', async (req, res) => {
  try {
    const reports = await Report.find({ archivedAt: null }).sort({ createdAt: -1 }).limit(200);
    return res.json(reports.map((r) => r.toGeneralTier()));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/mine - Path B's own submissions, deep tier (decision #3).
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user._id, archivedAt: null }).sort({ createdAt: -1 });
    return res.json(reports.map((r) => r.toDeepTier()));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function withSuggestedAgency(report) {
  return { ...report.toReviewerTier(), suggestedAgency: suggestAgencyForCategory(report.reportedCategory) };
}

function findActiveReport(id) {
  return Report.findOne({ _id: id, archivedAt: null });
}

// GET /api/reports/queue - Reviewer/Admin shared triage queue, reviewer tier (decision #24/#25).
router.get('/queue', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const reports = await Report.find({ archivedAt: null }).sort({ createdAt: -1 }).limit(200);
    return res.json(reports.map(withSuggestedAgency));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/escalations - Admin-only: High/Critical cases left unclaimed past the
// threshold, timed from when classification completed, not from submission (decision #24).
const ESCALATION_THRESHOLD_MINUTES = Number(process.env.ESCALATION_THRESHOLD_MINUTES) || 60;
router.get('/escalations', requireRole('admin'), async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - ESCALATION_THRESHOLD_MINUTES * 60 * 1000);
    const reports = await Report.find({
      archivedAt: null,
      claimedBy: null,
      status: { $in: ['Received', 'In Review'] },
      'classification.urgency': { $in: ['High', 'Critical'] },
      'classification.classifiedAt': { $lte: cutoff }
    }).sort({ 'classification.classifiedAt': 1 });
    return res.json({
      thresholdMinutes: ESCALATION_THRESHOLD_MINUTES,
      cases: reports.map((r) => ({
        ...withSuggestedAgency(r),
        minutesSinceClassified: Math.round((Date.now() - r.classification.classifiedAt.getTime()) / 60000)
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/track - anonymous deep-tier lookup via Tracking Reference + Access Key (decision #21).
router.get('/track', async (req, res) => {
  try {
    const { ref, key } = req.query;
    if (!ref || !key) return res.status(400).json({ error: 'Tracking reference and access key are required' });

    const report = await Report.findOne({ trackingReference: ref, archivedAt: null });
    if (!report) return res.status(404).json({ error: 'No report found for that tracking reference' });

    const valid = await verifySecret(key, report.accessKeyHash);
    if (!valid) return res.status(403).json({ error: 'Incorrect access key' });

    return res.json(report.toDeepTier());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/:id - single report, deep tier if the Path B owner or a Reviewer/Admin, else general tier.
router.get('/:id', async (req, res) => {
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const isOwner = req.user && report.user && report.user.toString() === req.user._id.toString();
    const isStaff = req.user && ['reviewer', 'admin'].includes(req.user.role);
    if (isStaff) return res.json(withSuggestedAgency(report));
    if (isOwner) return res.json(report.toDeepTier());
    return res.json(report.toGeneralTier());
  } catch (err) {
    return res.status(400).json({ error: 'Invalid report id' });
  }
});

// POST /api/reports/:id/claim - a Reviewer claims a case to avoid duplicate work (decision #24).
router.post('/:id/claim', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.claimedBy && report.claimedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'This case is already claimed by another reviewer' });
    }
    report.claimedBy = req.user._id;
    await report.save();
    return res.json(withSuggestedAgency(report));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/reports/:id/refer - Reviewer/Admin refers a case to an Agency/Institution (decision #7).
router.post('/:id/refer', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { agency, referenceNumber, notes } = req.body;
    if (!agency) return res.status(400).json({ error: 'An agency is required' });

    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    report.agencyReferral = { agency, referenceNumber: referenceNumber || null, notes: notes || null };
    await report.save();
    return res.json(withSuggestedAgency(report));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/reports/:id/status - Reviewer/Admin status update; Resolved requires a note+reference (decision #6).
router.patch('/:id/status', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { status, resolutionNote, resolutionReference } = req.body;
    const validStatuses = ['Received', 'In Review', 'Resolved', 'Rejected'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (status === 'Resolved' && (!resolutionNote || !resolutionReference)) {
      return res.status(400).json({ error: 'Resolving a case requires both a resolution note and a reference' });
    }

    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    report.status = status;
    if (status === 'Resolved') {
      report.resolutionNote = resolutionNote;
      report.resolutionReference = resolutionReference;
    }
    report.statusHistory.push({ status, changedAt: new Date(), changedBy: req.user._id });
    await report.save();

    // Path B opted-in notification (decision #23) - Path A never gets proactive contact, by design.
    if (report.user) {
      User.findById(report.user).then((owner) => {
        if (owner && owner.emailNotificationsOptIn) {
          sendMail({
            to: owner.email,
            subject: `Your Kenya Watch report ${report.trackingReference} is now "${status}"`,
            text: `Your report "${report.title}" (${report.trackingReference}) status changed to: ${status}.` +
              (status === 'Resolved' ? ` Resolution: ${resolutionNote}` : '')
          }).catch((err) => console.error('[status email] send failed:', err.message));
        }
      }).catch(() => {});
    }

    return res.json(withSuggestedAgency(report));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/reports/:id/legal-hold - Admin-only: exempts a case from automatic
// identity anonymization while it's under active legal proceedings (decision #11).
router.patch('/:id/legal-hold', requireRole('admin'), async (req, res) => {
  try {
    const { legalHold } = req.body;
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    report.legalHold = !!legalHold;
    await report.save();
    return res.json(withSuggestedAgency(report));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/reports/:id - Admin-only soft deletion preserves the case audit trail.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.legalHold) {
      return res.status(409).json({ error: 'A report under legal hold cannot be archived' });
    }

    report.archivedAt = new Date();
    report.archivedBy = req.user._id;
    await report.save();
    return res.status(204).end();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/reports/:id/related-suggestions - soft suggestions only, never auto-merged (decision #16).
router.get('/:id/related-suggestions', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const alreadyLinked = report.relatedCaseLinks.map((id) => id.toString());
    const candidates = await Report.find({
      archivedAt: null,
      _id: { $ne: report._id, $nin: alreadyLinked },
      reportedCategory: report.reportedCategory,
      county: report.county
    }).sort({ createdAt: -1 }).limit(10);

    return res.json(candidates.map((c) => ({
      id: c._id,
      trackingReference: c.trackingReference,
      title: c.title,
      reportedCategory: c.reportedCategory,
      subCounty: c.subCounty,
      createdAt: c.createdAt
    })));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/reports/:id/link - Reviewer/Admin manually links two cases; always additive, never destructive.
router.post('/:id/link', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { relatedId } = req.body;
    if (!relatedId) return res.status(400).json({ error: 'relatedId is required' });
    if (relatedId === req.params.id) return res.status(400).json({ error: 'A case cannot be linked to itself' });

    const [report, related] = await Promise.all([
      findActiveReport(req.params.id),
      findActiveReport(relatedId)
    ]);
    if (!report || !related) return res.status(404).json({ error: 'Report not found' });

    if (!report.relatedCaseLinks.some((id) => id.toString() === relatedId)) {
      report.relatedCaseLinks.push(related._id);
      await report.save();
    }
    if (!related.relatedCaseLinks.some((id) => id.toString() === req.params.id)) {
      related.relatedCaseLinks.push(report._id);
      await related.save();
    }
    return res.json(withSuggestedAgency(report));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
