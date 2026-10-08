const express = require('express');
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

const router = express.Router();

function pickCategoryDetails(reportedCategory, submitted = {}) {
  const allowedFields = (CATEGORY_FIELDS[reportedCategory] || []).map((f) => f.name);
  const clean = {};
  for (const key of allowedFields) {
    if (submitted[key]) clean[key] = String(submitted[key]).slice(0, 500);
  }
  return clean;
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

// POST /api/reports - submit a new report, Path A (anonymous) or Path B (logged in) side by side (decision #3).
router.post('/', upload.array('evidence', 10), async (req, res) => {
  try {
    const { title, reportedCategory, description, county, subCounty, incidentDateTime } = req.body;
    if (!title || !reportedCategory || !description || !county || !subCounty) {
      return res.status(400).json({ error: 'Title, category, description, county and sub-county are required' });
    }
    if (!CATEGORIES.includes(reportedCategory)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (description.trim().length < 20) {
      return res.status(400).json({ error: 'Please provide a more detailed description (at least 20 characters)' });
    }

    let categorySpecificDetails = {};
    if (req.body.categorySpecificDetails) {
      try {
        const parsed = typeof req.body.categorySpecificDetails === 'string'
          ? JSON.parse(req.body.categorySpecificDetails)
          : req.body.categorySpecificDetails;
        categorySpecificDetails = pickCategoryDetails(reportedCategory, parsed);
      } catch (_) { /* ignore malformed JSON, keep empty */ }
    }

    const demographic = {
      ageGroup: req.body.ageGroup || undefined,
      gender: req.body.gender || undefined,
      occupation: req.body.occupation || undefined
    };

    // Evidence files are streamed through sharp (images) and written to GridFS (decision #17/#18).
    const evidence = [];
    if (req.files && req.files.length) {
      const bucket = getBucket();
      for (const file of req.files) {
        evidence.push(await storeEvidenceFile(bucket, file));
      }
    }

    let trackingReference = generateTrackingReference();
    // Extremely unlikely collision, but guard against it anyway rather than trust probability alone.
    for (let attempts = 0; attempts < 5 && await Report.exists({ trackingReference }); attempts++) {
      trackingReference = generateTrackingReference();
    }

    const isPathB = !!req.user;
    let accessKey = null;
    let accessKeyHash = null;
    if (!isPathB) {
      accessKey = generateAccessKey();
      accessKeyHash = await hashSecret(accessKey);
    }

    const report = new Report({
      trackingReference,
      accessKeyHash,
      user: isPathB ? req.user._id : null,
      title: title.trim(),
      reportedCategory,
      categorySpecificDetails,
      description: description.trim(),
      county,
      subCounty,
      incidentDateTime: incidentDateTime || undefined,
      demographic,
      evidence,
      statusHistory: [{ status: 'Received', changedAt: new Date(), changedBy: null }]
    });
    await report.save();

    classifyInBackground(report._id, { title, description, evidenceCount: evidence.length });

    const response = {
      message: 'Report submitted successfully',
      trackingReference,
      reportId: report._id
    };
    if (accessKey) {
      response.accessKey = accessKey;
      response.accessKeyWarning = 'Save this Access Key now - it is shown only once and cannot be recovered later.';
    }
    return res.status(201).json(response);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/reports - public case list, general tier only (decision #3/#21): never exposes identity.
router.get('/', async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).limit(200);
    return res.json(reports.map((r) => r.toGeneralTier()));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/mine - Path B's own submissions, deep tier (decision #3).
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user._id }).sort({ createdAt: -1 });
    return res.json(reports.map((r) => r.toDeepTier()));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function withSuggestedAgency(report) {
  return { ...report.toReviewerTier(), suggestedAgency: suggestAgencyForCategory(report.reportedCategory) };
}

// GET /api/reports/queue - Reviewer/Admin shared triage queue, reviewer tier (decision #24/#25).
router.get('/queue', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).limit(200);
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

    const report = await Report.findOne({ trackingReference: ref });
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
    const report = await Report.findById(req.params.id);
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
    const report = await Report.findById(req.params.id);
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

    const report = await Report.findById(req.params.id);
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

    const report = await Report.findById(req.params.id);
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
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    report.legalHold = !!legalHold;
    await report.save();
    return res.json(withSuggestedAgency(report));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/reports/:id/related-suggestions - soft suggestions only, never auto-merged (decision #16).
router.get('/:id/related-suggestions', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const alreadyLinked = report.relatedCaseLinks.map((id) => id.toString());
    const candidates = await Report.find({
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
      Report.findById(req.params.id),
      Report.findById(relatedId)
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
