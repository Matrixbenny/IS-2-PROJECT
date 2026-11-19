const express = require('express');
const mongoose = require('mongoose');
const Report = require('../report.model');
const User = require('../user.model');
const { CATEGORIES, CATEGORY_FIELDS } = require('../utils/categories');
const { generateTrackingReference, generateAccessKey, hashSecret, verifySecret } = require('../utils/tracking');
const { classifyReportText } = require('../utils/classifier');
const { MAX_CANDIDATES, MAX_SUGGESTIONS, suggestRelatedCases } = require('../utils/relatedCaseMatcher');
const {
  ModelArtifactError,
  classifyText,
  scoreCategories,
  hasIndependentCategoryAssessment
} = require('../utils/experimentalCategoryModel');
const { suggestRouting } = require('../utils/routing');
const { upload } = require('../middleware/upload');
const { storeEvidenceFile } = require('../utils/evidence');
const { getBucket, deleteGridFsFile } = require('../utils/gridfs');
const { requireAuth, requireRole } = require('../middleware/auth');
const { AGENCIES, slugify } = require('../utils/agencies');
const mailer = require('../utils/mailer');
const { notifyReporterOfStatusChange } = require('../utils/reportStatusNotifications');
const { SELF_REVIEW_ERROR, isBlockedSelfReview, isOwnReport } = require('../utils/selfReview');
const { generateChallenge, verifyChallenge } = require('../utils/captcha');
const { generateImageChallenge, verifyImageSelection } = require('../utils/imageCaptcha');
const { hashRecordingToken } = require('../utils/recordingToken');
const {
  ReceiptEmailError,
  requestReceiptOtp,
  verifyReceiptOtp
} = require('../utils/reportEmailReceipt');

const router = express.Router();

// A referral the agency has not acknowledged within this window, or that has
// seen no activity for this long, is flagged to the Admin as stalled.
const REFERRAL_UNACKNOWLEDGED_HOURS = 72;
const REFERRAL_IDLE_DAYS = 14;

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
        classification: {
          category: result.category,
          urgency: result.urgency,
          confidence: result.confidence,
          classifiedAt: new Date(),
          lingoTerms: result.lingoTerms || []
        },
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
router.get('/agencies', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const activePartners = await User.distinct('agencySlug', {
      role: 'agency',
      isActive: true,
      agencyInvitationAcceptedAt: { $ne: null }
    });
    return res.json({
      agencies: AGENCIES
        .filter((agency) => activePartners.includes(slugify(agency.name)))
        .map((agency) => ({ name: agency.name, slug: slugify(agency.name) }))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/agency-partners - the public list of partner institutions.
// An officer applying for an account must pick the institution they work for,
// and because they are not signed in yet the reviewer/admin /agencies list (which
// also reveals which agencies have live officers) is not available to them.
router.get('/agency-partners', (req, res) => {
  return res.json({
    agencies: AGENCIES.map((agency) => ({ name: agency.name, slug: slugify(agency.name) }))
  });
});

// GET /api/reports/captcha-challenge - self-hosted human-verification challenge (decision #9).
router.get('/captcha-challenge', (req, res) => {
  res.json(generateChallenge());
});

// GET /api/reports/captcha-image - issues a challenge that must be solved before submission.
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

// POST /api/reports - submit a new report, Path A (anonymous) or Path B (logged in) side by side (decision #3).
router.post('/', upload.array('evidence', 10), async (req, res) => {
  let claimedRecordingId;
  const uploadedEvidenceIds = [];
  let reportSaved = false;
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
    // Other kinds of wrongdoing the same case involves (a bribe to hide embezzled
    // funds, for example). Optional; they help route the case to every relevant agency.
    let additionalCategories = [];
    if (req.body.additionalCategories) {
      const submitted = typeof req.body.additionalCategories === 'string'
        ? JSON.parse(req.body.additionalCategories)
        : req.body.additionalCategories;
      if (!Array.isArray(submitted) || submitted.some((item) => !CATEGORIES.includes(item))) {
        return res.status(400).json({ error: 'Additional categories must be chosen from the category list' });
      }
      additionalCategories = Array.from(new Set(submitted))
        .filter((item) => item !== reportedCategory && item !== 'Other');
      if (additionalCategories.length > 3) {
        return res.status(400).json({ error: 'Choose at most three additional categories' });
      }
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

    // Original uploaded bytes are written to GridFS after malware scanning.
    const evidence = [];
    if (req.files && req.files.length) {
      const bucket = getBucket();
      for (const file of req.files) {
        const storedEvidence = await storeEvidenceFile(bucket, file);
        uploadedEvidenceIds.push(storedEvidence.gridFsId);
        evidence.push(storedEvidence);
      }
    }
    if (recordingSession) {
      // The live recording is kept exactly as recorded: same GridFS id, same
      // filename (which already carries the real container extension, e.g.
      // .webm / .ogg / .mp4), same stored bytes. Only the evidence "type"
      // label (audio/video) is normalised, and even that keeps any unexpected
      // value instead of failing the whole submission.
      evidence.push({
        gridFsId: recordingSession.fileId,
        filename: recordingSession.filename,
        type: ['image', 'video', 'audio', 'document'].includes(recordingSession.mediaType)
          ? recordingSession.mediaType
          : 'video'
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
      additionalCategories,
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
    reportSaved = true;
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
    if (!reportSaved) {
      for (const fileId of uploadedEvidenceIds) {
        try {
          await deleteGridFsFile(fileId);
        } catch (cleanupError) {
          console.error('Could not remove evidence from a failed report submission:', cleanupError.message);
        }
      }
    }
    if (claimedRecordingId) {
      await mongoose.connection.db.collection('recordingSessions').updateOne(
        { _id: claimedRecordingId, status: 'attaching' },
        { $set: { status: 'ready' }, $unset: { reportId: '' } }
      ).catch((cleanupError) => console.error('Could not release a recording session:', cleanupError.message));
    }
    return res.status(400).json({ error: err.message });
  }
});

router.post('/email-receipt/request-otp', async (req, res) => {
  try {
    return res.json(await requestReceiptOtp(req.body || {}));
  } catch (error) {
    if (error instanceof ReceiptEmailError) return res.status(error.status).json({ error: error.message });
    console.error('[report receipt] verification request failed:', error.message);
    return res.status(500).json({ error: 'Could not request an email verification code.' });
  }
});

router.post('/email-receipt/verify-otp', async (req, res) => {
  try {
    return res.json(await verifyReceiptOtp(req.body || {}));
  } catch (error) {
    if (error instanceof ReceiptEmailError) return res.status(error.status).json({ error: error.message });
    console.error('[report receipt] code verification failed:', error.message);
    return res.status(500).json({ error: 'Could not verify the email code.' });
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

// POST /api/reports/:id/comments - Path B owner adds follow-up info to their own
// report. Comments are additive and reviewer-visible; identity stays sealed because
// toReviewerTier()/toDeepTier() never expose the user field alongside comments.
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== 'string' || text.trim().length < 2) {
      return res.status(400).json({ error: 'Write a short message (at least 2 characters)' });
    }
    const report = await Report.findOne({ _id: req.params.id, user: req.user._id, archivedAt: null });
    if (!report) return res.status(404).json({ error: 'Report not found among your submissions' });
    const comment = { author: req.user._id, text: text.trim().slice(0, 2000), createdAt: new Date() };
    report.comments.push(comment);
    await report.save();
    return res.status(201).json({ message: 'Additional information added to your report', comments: report.toDeepTier().comments });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

function withSuggestedAgency(report, user) {
  const result = report.toReviewerTier();
  // Lets the queue flag cases where the receiving agency is waiting on us.
  result.openInformationRequests = report.activeReferrals()
    .reduce((total, referral) => total + (referral.informationRequests || []).filter((item) => item.status === 'open').length, 0);
  const annotations = report.categoryReview?.annotations || [];
  const ownAnnotation = user && annotations.find((item) => item.reviewer.toString() === user._id.toString());
  const isAdjudicator = user
    && report.categoryReview?.adjudicatedBy?.toString() === user._id.toString();
  const canViewFinalLabel = Boolean(ownAnnotation || isAdjudicator);
  const isBlinded = !canViewFinalLabel;
  result.categoryReview = {
    status: report.categoryReview?.status || 'awaiting_second_review',
    annotationCount: annotations.length,
    ownAnnotationSubmitted: Boolean(ownAnnotation),
    ownDecision: ownAnnotation?.decision || (ownAnnotation?.category ? 'category' : null),
    ownCategory: ownAnnotation?.category || null,
    adjudicatedDecision: canViewFinalLabel
      ? report.categoryReview?.adjudicatedDecision || (report.categoryReview?.adjudicatedCategory ? 'category' : null)
      : null,
    adjudicatedCategory: canViewFinalLabel
      ? report.categoryReview?.adjudicatedCategory || null
      : null
  };
  if (isBlinded) {
    delete result.reportedCategory;
    delete result.categorySpecificDetails;
    result.classification = null;
    result.tags = [];
    return result;
  }
  return result;
}

function findActiveReport(id) {
  return Report.findOne({ _id: id, archivedAt: null });
}

// GET /api/reports/queue - Reviewer/Admin shared triage queue, reviewer tier (decision #24/#25).
// Sorted so the most urgent unclaimed work rises to the top: urgency rank, then
// classification age (oldest first), then submission age - the same logic the
// escalation monitor uses, so the queue and the escalation page agree.
router.get('/queue', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const reports = await Report.find({ archivedAt: null }).limit(200);
    const urgencyRank = { Critical: 3, High: 2, Medium: 1, Low: 0 };
    const sorted = reports.sort((a, b) => {
      const ra = urgencyRank[a.classification?.urgency] ?? 0;
      const rb = urgencyRank[b.classification?.urgency] ?? 0;
      if (ra !== rb) return rb - ra;
      const ca = a.classification?.classifiedAt || a.createdAt;
      const cb = b.classification?.classifiedAt || b.createdAt;
      return new Date(ca) - new Date(cb);
    });
    // A reviewer who is also a reporter must see that a case is their own, and
    // must not be offered the review controls for it (decision #36).
    const ownFlags = req.user.role === 'reviewer'
      ? await Promise.all(sorted.map((report) => isOwnReport(report, req.user)))
      : [];
    return res.json(sorted.map((report, index) => ({
      ...withSuggestedAgency(report, req.user),
      isOwnReport: Boolean(ownFlags[index]),
      // Lets the queue show "claim" vs "yours" vs "taken" without exposing
      // who holds a case, only that it is held.
      claimedByMe: Boolean(report.claimedBy && report.claimedBy.toString() === req.user._id.toString()),
      claimedByOther: Boolean(report.claimedBy && report.claimedBy.toString() !== req.user._id.toString())
    })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/my-claimed - the cases THIS reviewer has claimed, so they have
// a personal worklist instead of hunting through the shared queue.
router.get('/my-claimed', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const filters = { archivedAt: null, claimedBy: req.user._id };
    // The reviewer workspace defaults to live work; closed cases stay reachable
    // through ?includeClosed=true so nothing disappears from their history.
    if (req.query.includeClosed !== 'true') filters.status = { $in: ['Received', 'In Review'] };

    const reports = await Report.find(filters).sort({ claimedAt: -1, createdAt: -1 }).limit(200);
    return res.json(reports.map((report) => ({
      ...withSuggestedAgency(report, req.user),
      isOwnReport: false
    })));
  } catch (err) {
    console.error('[reviewer] could not load claimed cases:', err.message);
    return res.status(500).json({ error: 'Could not load your claimed cases' });
  }
});

// Experimental model suggestions are available only after this reviewer records their own category.
router.get('/:id/ml-category-suggestion', requireRole('reviewer', 'admin'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid report id' });
  }
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (!hasIndependentCategoryAssessment(report.categoryReview, req.user._id)) {
      return res.status(409).json({ error: 'Submit your independent category assessment before viewing a model suggestion.' });
    }

    return res.json({
      ...classifyText({ title: report.title, description: report.description }),
      realWorldPerformanceClaim: false,
      advisoryOnly: true
    });
  } catch (error) {
    if (error instanceof ModelArtifactError) return res.status(503).json({ error: error.message });
    return res.status(500).json({ error: 'Could not generate the experimental category suggestion.' });
  }
});

// Independent reviewer labels are collected separately from the reporter's selected category.
router.get('/:id/category-review', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (await isBlockedSelfReview(report, req.user)) {
      return res.status(403).json({ error: SELF_REVIEW_ERROR });
    }
    const review = report.categoryReview;
    const ownAnnotation = review.annotations.find((item) => item.reviewer.toString() === req.user._id.toString());
    const isAdjudicator = review.adjudicatedBy?.toString() === req.user._id.toString();
    const canViewFinalLabel = Boolean(ownAnnotation || isAdjudicator);
    const result = {
      status: review.status,
      annotationCount: review.annotations.length,
      ownAnnotationSubmitted: Boolean(ownAnnotation),
      ownDecision: ownAnnotation?.decision || (ownAnnotation?.category ? 'category' : null),
      ownCategory: ownAnnotation?.category || null,
      adjudicatedDecision: canViewFinalLabel
        ? review.adjudicatedDecision || (review.adjudicatedCategory ? 'category' : null)
        : null,
      adjudicatedCategory: canViewFinalLabel
        ? review.adjudicatedCategory
        : null
    };
    if (req.user.role === 'admin' && review.status === 'needs_adjudication') {
      result.proposedAnnotations = review.annotations.map((item) => ({
        decision: item.decision || (item.category ? 'category' : 'insufficient_information'),
        category: item.category,
        note: item.note,
        createdAt: item.createdAt
      }));
    }
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid report id' });
  }
});

router.post('/:id/category-review/annotations', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { category, note } = req.body || {};
    const decision = req.body?.decision || (CATEGORIES.includes(category) ? 'category' : null);
    if (!['category', 'insufficient_information'].includes(decision)) {
      return res.status(400).json({ error: 'Select a category or mark the report insufficient for classification' });
    }
    if (decision === 'category' && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Select a valid report category' });
    }
    if (decision === 'insufficient_information' && category !== undefined && category !== null && category !== '') {
      return res.status(400).json({ error: 'Do not include a category when marking a report insufficient for classification' });
    }
    if (note !== undefined && typeof note !== 'string') return res.status(400).json({ error: 'Annotation note must be text' });
    const cleanNote = note ? cleanText(note, 'Annotation note', 1000, false) : null;
    if (decision === 'insufficient_information' && !cleanNote) {
      return res.status(400).json({ error: 'Briefly explain why the report cannot be classified from the available information' });
    }
    const selfReport = await findActiveReport(req.params.id);
    if (!selfReport) return res.status(404).json({ error: 'Report not found' });
    if (await isBlockedSelfReview(selfReport, req.user)) {
      return res.status(403).json({ error: SELF_REVIEW_ERROR });
    }
    const result = await Report.updateOne(
      {
        _id: req.params.id,
        archivedAt: null,
        'categoryReview.status': 'awaiting_second_review',
        'categoryReview.annotations.reviewer': { $ne: req.user._id },
        'categoryReview.annotations.1': { $exists: false }
      },
      {
        $push: {
          'categoryReview.annotations': {
            reviewer: req.user._id,
            decision,
            category: decision === 'category' ? category : null,
            note: cleanNote,
            createdAt: new Date()
          }
        }
      }
    );
    if (!result.matchedCount) {
      const report = await findActiveReport(req.params.id);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      if (report.categoryReview.annotations.some((item) => item.reviewer.toString() === req.user._id.toString())) {
        return res.status(409).json({ error: 'You have already submitted an independent label for this report' });
      }
      return res.status(409).json({ error: 'This report is no longer accepting independent category labels' });
    }

    const report = await Report.findById(req.params.id);
    if (report.categoryReview.annotations.length === 2) {
      const [first, second] = report.categoryReview.annotations;
      if (
        first.decision === 'insufficient_information'
        && second.decision === 'insufficient_information'
      ) {
        report.categoryReview.status = 'insufficient_information';
        report.categoryReview.adjudicatedDecision = 'insufficient_information';
        report.categoryReview.adjudicatedCategory = null;
        report.categoryReview.adjudicatedAt = new Date();
      } else if (
        first.decision === 'category'
        && second.decision === 'category'
        && first.category === second.category
      ) {
        report.categoryReview.status = 'agreed';
        report.categoryReview.adjudicatedDecision = 'category';
        report.categoryReview.adjudicatedCategory = first.category;
        report.categoryReview.adjudicatedAt = new Date();
      } else {
        report.categoryReview.status = 'needs_adjudication';
      }
      await report.save();
    }
    return res.status(201).json({
      status: report.categoryReview.status,
      annotationCount: report.categoryReview.annotations.length,
      ownAnnotationSubmitted: true,
      ownDecision: decision,
      ownCategory: decision === 'category' ? category : null,
      adjudicatedDecision: report.categoryReview.adjudicatedDecision,
      adjudicatedCategory: report.categoryReview.adjudicatedCategory
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/category-review/adjudication', requireRole('admin'), async (req, res) => {
  try {
    const { category, note } = req.body || {};
    const decision = req.body?.decision || (CATEGORIES.includes(category) ? 'category' : null);
    if (!['category', 'insufficient_information'].includes(decision)) {
      return res.status(400).json({ error: 'Select a category or mark the report insufficient for classification' });
    }
    if (decision === 'category' && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Select a valid report category' });
    }
    if (decision === 'insufficient_information' && category !== undefined && category !== null && category !== '') {
      return res.status(400).json({ error: 'Do not include a category when adjudicating as insufficient for classification' });
    }
    if (typeof note !== 'string') return res.status(400).json({ error: 'Explain the adjudication decision' });
    const cleanNote = cleanText(note, 'Adjudication note', 1000, false);
    if (!cleanNote) return res.status(400).json({ error: 'Explain the adjudication decision' });

    const report = await Report.findOne({ _id: req.params.id, archivedAt: null });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.categoryReview.status !== 'needs_adjudication' || report.categoryReview.annotations.length < 2) {
      return res.status(409).json({ error: 'Only independently reviewed disagreements can be adjudicated' });
    }
    report.categoryReview.status = 'adjudicated';
    report.categoryReview.adjudicatedDecision = decision;
    report.categoryReview.adjudicatedCategory = decision === 'category' ? category : null;
    report.categoryReview.adjudicatedBy = req.user._id;
    report.categoryReview.adjudicatedAt = new Date();
    report.categoryReview.adjudicationNote = cleanNote;
    await report.save();
    return res.json({
      status: report.categoryReview.status,
      adjudicatedDecision: report.categoryReview.adjudicatedDecision,
      adjudicatedCategory: report.categoryReview.adjudicatedCategory,
      adjudicatedAt: report.categoryReview.adjudicatedAt
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/archived', requireRole('admin'), async (req, res) => {
  try {
    const reports = await Report.find({ archivedAt: { $ne: null } }).sort({ archivedAt: -1 }).limit(200);
    return res.json(reports.map((report) => withSuggestedAgency(report, req.user)));
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
        ...withSuggestedAgency(r, req.user),
        minutesSinceClassified: Math.round((Date.now() - r.classification.classifiedAt.getTime()) / 60000)
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/admin-overview', requireRole('admin'), async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - ESCALATION_THRESHOLD_MINUTES * 60 * 1000);
    const escalationFilter = {
      archivedAt: null,
      claimedBy: null,
      status: { $in: ['Received', 'In Review'] },
      'classification.urgency': { $in: ['High', 'Critical'] },
      'classification.classifiedAt': { $lte: cutoff }
    };
    const [
      activeReports,
      archivedReports,
      statuses,
      roles,
      escalations,
      attention,
      agencyReferrals,
      recentAgencyReferrals,
      pendingAgencyMessageCount,
      pendingAgencyMessages
    ] = await Promise.all([
      Report.countDocuments({ archivedAt: null }),
      Report.countDocuments({ archivedAt: { $ne: null } }),
      Report.aggregate([
        { $match: { archivedAt: null } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      Report.countDocuments(escalationFilter),
      Report.aggregate([
        {
          $match: {
            archivedAt: null,
            claimedBy: null,
            status: { $in: ['Received', 'In Review'] }
          }
        },
        {
          $addFields: {
            urgencyRank: {
              $switch: {
                branches: [
                  { case: { $eq: ['$classification.urgency', 'Critical'] }, then: 3 },
                  { case: { $eq: ['$classification.urgency', 'High'] }, then: 2 },
                  { case: { $eq: ['$classification.urgency', 'Medium'] }, then: 1 }
                ],
                default: 0
              }
            }
          }
        },
        { $sort: { urgencyRank: -1, 'classification.classifiedAt': 1, createdAt: 1 } },
        { $limit: 5 },
        {
          $project: {
            _id: 1,
            trackingReference: 1,
            title: 1,
            status: 1,
            county: 1,
            subCounty: 1,
            createdAt: 1,
            'classification.urgency': 1
          }
        }
      ]),
      Report.aggregate([
        { $match: { archivedAt: null } },
        { $unwind: '$agencyReferrals' },
        { $match: { 'agencyReferrals.agency': { $type: 'string', $ne: '' }, 'agencyReferrals.endedAt': null } },
        {
          $group: {
            _id: '$agencyReferrals.agency',
            reports: { $sum: 1 },
            updates: { $sum: { $size: { $ifNull: ['$agencyReferrals.agencyUpdates', []] } } }
          }
        },
        { $sort: { reports: -1, _id: 1 } }
      ]),
      Report.aggregate([
        { $match: { archivedAt: null } },
        { $unwind: '$agencyReferrals' },
        { $match: { 'agencyReferrals.agency': { $type: 'string', $ne: '' }, 'agencyReferrals.endedAt': null } },
        { $addFields: { dashboardReferralAt: { $ifNull: ['$agencyReferrals.referredAt', '$createdAt'] } } },
        { $sort: { dashboardReferralAt: -1 } },
        { $limit: 5 },
        {
          $project: {
            _id: 1,
            trackingReference: 1,
            title: 1,
            status: 1,
            county: 1,
            subCounty: 1,
            agency: '$agencyReferrals.agency',
            referralStatus: '$agencyReferrals.status',
            referenceNumber: '$agencyReferrals.referenceNumber',
            referredAt: '$dashboardReferralAt',
            agencyUpdateCount: { $size: { $ifNull: ['$agencyReferrals.agencyUpdates', []] } }
          }
        }
      ]),
      Report.aggregate([
        { $match: { archivedAt: null } },
        { $unwind: '$agencyReferrals' },
        { $unwind: '$agencyReferrals.agencyUpdates' },
        {
          $match: {
            'agencyReferrals.endedAt': null,
            'agencyReferrals.agencyUpdates.publicMessageStatus': 'pending',
            'agencyReferrals.agencyUpdates.publicMessage': { $type: 'string', $ne: '' }
          }
        },
        { $count: 'count' }
      ]),
      Report.aggregate([
        { $match: { archivedAt: null } },
        { $unwind: '$agencyReferrals' },
        { $unwind: '$agencyReferrals.agencyUpdates' },
        {
          $match: {
            'agencyReferrals.endedAt': null,
            'agencyReferrals.agencyUpdates.publicMessageStatus': 'pending',
            'agencyReferrals.agencyUpdates.publicMessage': { $type: 'string', $ne: '' }
          }
        },
        { $sort: { 'agencyReferrals.agencyUpdates.createdAt': 1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 0,
            reportId: '$_id',
            trackingReference: 1,
            agency: '$agencyReferrals.agency',
            updateId: '$agencyReferrals.agencyUpdates._id',
            message: '$agencyReferrals.agencyUpdates.publicMessage',
            createdAt: '$agencyReferrals.agencyUpdates.createdAt'
          }
        }
      ])
    ]);

    // Agency questions that no reviewer has answered yet: the investigation is
    // stalled until Kenya Watch replies, so the Admin must be able to see them.
    const openInfoRows = await Report.aggregate([
      { $match: { archivedAt: null } },
      { $unwind: '$agencyReferrals' },
      { $unwind: '$agencyReferrals.informationRequests' },
      { $match: { 'agencyReferrals.endedAt': null, 'agencyReferrals.informationRequests.status': 'open' } },
      { $sort: { 'agencyReferrals.informationRequests.requestedAt': 1 } },
      {
        $project: {
          _id: 0,
          reportId: '$_id',
          trackingReference: 1,
          agency: '$agencyReferrals.agency',
          question: '$agencyReferrals.informationRequests.question',
          requestedAt: '$agencyReferrals.informationRequests.requestedAt'
        }
      }
    ]);

    // Justice delayed is justice denied: referrals the agency has not even
    // acknowledged, or that have had no activity for weeks, are surfaced here.
    const now = Date.now();
    const sentCutoff = new Date(now - REFERRAL_UNACKNOWLEDGED_HOURS * 3600 * 1000);
    const idleCutoff = new Date(now - REFERRAL_IDLE_DAYS * 86400 * 1000);
    const staleRows = await Report.aggregate([
      { $match: { archivedAt: null } },
      { $unwind: '$agencyReferrals' },
      { $match: { 'agencyReferrals.endedAt': null, 'agencyReferrals.status': { $ne: 'closed' } } },
      {
        $addFields: {
          lastActivity: {
            $max: { $concatArrays: [
              [{ $ifNull: ['$agencyReferrals.referredAt', '$createdAt'] }],
              { $map: { input: { $ifNull: ['$agencyReferrals.agencyUpdates', []] }, as: 'u', in: '$$u.createdAt' } }
            ] }
          },
          staleBefore: { $cond: [{ $eq: ['$agencyReferrals.status', 'sent'] }, sentCutoff, idleCutoff] }
        }
      },
      { $match: { $expr: { $lt: ['$lastActivity', '$staleBefore'] } } },
      { $sort: { lastActivity: 1 } },
      {
        $project: {
          _id: 0,
          reportId: '$_id',
          trackingReference: 1,
          agency: '$agencyReferrals.agency',
          status: '$agencyReferrals.status',
          lastActivity: 1
        }
      }
    ]);

    // How often reviewers accept the routing aid's recommendation.
    const routingRows = await Report.aggregate([
      { $match: { archivedAt: null } },
      { $unwind: '$routingFeedback' },
      { $group: { _id: '$routingFeedback.followedSuggestion', count: { $sum: 1 } } }
    ]);
    const routingFollowed = routingRows.find((row) => row._id === true)?.count || 0;
    const routingTotal = routingRows.reduce((sum, row) => sum + row.count, 0);

    const statusCounts = Object.fromEntries(statuses.map(({ _id, count }) => [_id, count]));
    const roleCounts = Object.fromEntries(roles.map(({ _id, count }) => [_id, count]));
    return res.json({
      reports: {
        active: activeReports,
        archived: archivedReports,
        total: activeReports + archivedReports,
        byStatus: {
          Received: statusCounts.Received || 0,
          'In Review': statusCounts['In Review'] || 0,
          Resolved: statusCounts.Resolved || 0,
          Rejected: statusCounts.Rejected || 0
        }
      },
      accounts: {
        total: Object.values(roleCounts).reduce((total, count) => total + count, 0),
        admins: roleCounts.admin || 0,
        reviewers: roleCounts.reviewer || 0,
        users: roleCounts.user || 0,
        agencyOfficers: roleCounts.agency || 0
      },
      escalations: {
        count: escalations,
        thresholdMinutes: ESCALATION_THRESHOLD_MINUTES
      },
      attention,
      agencyReferrals: {
        total: agencyReferrals.reduce((sum, item) => sum + item.reports, 0),
        updates: agencyReferrals.reduce((sum, item) => sum + item.updates, 0),
        byAgency: agencyReferrals,
        recent: recentAgencyReferrals,
        pendingReporterMessages: pendingAgencyMessageCount[0]?.count || 0,
        messagesForReview: pendingAgencyMessages,
        openInformationRequests: openInfoRows.length,
        informationRequestsAwaitingAnswer: openInfoRows.slice(0, 10),
        staleCount: staleRows.length,
        staleReferrals: staleRows.slice(0, 10),
        staleThresholds: { unacknowledgedHours: REFERRAL_UNACKNOWLEDGED_HOURS, idleDays: REFERRAL_IDLE_DAYS },
        routing: {
          decisions: routingTotal,
          followedSuggestion: routingFollowed
        }
      }
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
    if (req.user?.role === 'reviewer') {
      return res.json({
        ...withSuggestedAgency(report, req.user),
        isOwnReport: await isOwnReport(report, req.user)
      });
    }
    if (isStaff) return res.json(withSuggestedAgency(report, req.user));
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
    if (await isBlockedSelfReview(report, req.user)) {
      return res.status(403).json({ error: SELF_REVIEW_ERROR });
    }
    if (report.claimedBy && report.claimedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'This case is already claimed by another reviewer' });
    }
    const alreadyClaimedByMe = report.claimedBy
      && report.claimedBy.toString() === req.user._id.toString();
    report.claimedBy = req.user._id;
    report.claimedAt = new Date();

    // Claiming is the citizen's first sign that a human is on the case, so it
    // moves the report into review and records it in the history the reporter
    // can see when tracking. Only the first claim does this - re-claiming (or
    // an Admin picking up a case already in review) must not add a duplicate
    // entry or drag a Resolved/Rejected case backwards.
    const firstClaim = !alreadyClaimedByMe;
    if (firstClaim && report.status === 'Received') {
      report.status = 'In Review';
      report.statusHistory.push({
        status: 'In Review',
        changedAt: new Date(),
        changedBy: req.user._id,
        note: 'Claimed by a Kenya Watch reviewer and now under review.'
      });
    }
    await report.save();

    if (firstClaim && report.status === 'In Review') {
      notifyReporterOfStatusChange(report, {
        status: 'In Review',
        resolutionNote: null,
        resolutionReference: null,
        rejectionReason: null
      });
    }
    return res.json(withSuggestedAgency(report, req.user));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/reports/:id/routing-suggestion - which institution(s) should receive
// this case. Combines the reporter's category (and any extra wrongdoing types they
// flagged), the narrative keywords and - only once the reviewer has recorded their
// own independent category - the experimental model. Advisory: the reviewer
// confirms or corrects every referral.
router.get('/:id/routing-suggestion', requireRole('reviewer', 'admin'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid report id' });
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const annotations = report.categoryReview?.annotations || [];
    const hasOwnAssessment = annotations.some((item) => item.reviewer.toString() === req.user._id.toString())
      || report.categoryReview?.adjudicatedBy?.toString() === req.user._id.toString();
    if (!hasOwnAssessment) {
      return res.status(409).json({ error: 'Submit your independent category assessment before viewing routing suggestions.' });
    }
    const routing = await buildRouting(report, req.user);
    const existing = report.activeReferrals().map((referral) => referral.agency);
    return res.json({
      ...routing,
      agencies: routing.agencies.map((agency) => ({ ...agency, alreadyReferred: existing.includes(agency.name) })),
      advisoryOnly: true
    });
  } catch (err) {
    console.error('[routing] suggestion failed:', err.message);
    return res.status(500).json({ error: 'Could not generate routing suggestions' });
  }
});

async function availableAgencySlugs() {
  return new Set(await User.distinct('agencySlug', {
    role: 'agency',
    isActive: true,
    agencyInvitationAcceptedAt: { $ne: null }
  }));
}

async function buildRouting(report, user) {
  let modelScores = null;
  if (hasIndependentCategoryAssessment(report.categoryReview, user._id)) {
    try {
      modelScores = scoreCategories({ title: report.title, description: report.description });
    } catch (error) {
      // The model is optional. Without it routing still works from the reporter's
      // categories and the narrative.
      if (!(error instanceof ModelArtifactError)) throw error;
    }
  }
  return suggestRouting({
    reportedCategory: report.reportedCategory,
    additionalCategories: report.additionalCategories,
    title: report.title,
    description: report.description,
    modelScores
  }, { availableSlugs: await availableAgencySlugs() });
}

// Builds the released case file for one referral. Only evidence that belongs to
// this report can be released; every item defaults to NOT released.
function buildReleasedEvidence(report, evidenceIds) {
  const ids = Array.isArray(evidenceIds) ? evidenceIds.map(String) : [];
  const released = report.evidence
    .filter((item) => ids.includes(item._id.toString()))
    .map((item) => ({ evidenceId: item._id, filename: item.filename, type: item.type, releasedAt: new Date() }));
  return { ids, released, valid: ids.length === released.length };
}

const EVIDENCE_REVIEW_ERROR = 'Confirm that you have reviewed every file you are releasing before it goes to an agency.';

// POST /api/reports/:id/refer - Reviewer/Admin refers a case to an Agency/Institution (decision #7).
// A case can be referred to several agencies, each with its own case file; an agency
// can hold only one active referral per case.
router.post('/:id/refer', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const {
      agency, referenceNumber, notes, referralSummary, transferConfirmed, evidenceReviewed,
      // Case file packet. The reviewer explicitly selects what the receiving
      // agency may investigate. Defaults are all OFF so nothing sensitive is
      // shared by accident.
      releaseNarrative, releaseCategoryDetails, releaseEvidenceIds, releaseReporterContact
    } = req.body;
    const selfCheck = await findActiveReport(req.params.id);
    if (!selfCheck) return res.status(404).json({ error: 'Report not found' });
    if (await isBlockedSelfReview(selfCheck, req.user)) {
      return res.status(403).json({ error: SELF_REVIEW_ERROR });
    }
    if (!agency) return res.status(400).json({ error: 'An agency is required' });
    const agencyInfo = AGENCIES.find((item) => item.name === agency);
    if (!agencyInfo) return res.status(400).json({ error: 'Select an agency from the approved list' });
    if (transferConfirmed !== true) {
      return res.status(400).json({ error: 'Confirm that you are authorised to share this case with the selected agency' });
    }
    if (typeof referralSummary !== 'string') return res.status(400).json({ error: 'A referral brief is required' });
    const cleanSummary = cleanText(referralSummary, 'Referral brief', 5000, false);
    if (cleanSummary.length < 40) return res.status(400).json({ error: 'The referral brief must be at least 40 characters' });
    if (referenceNumber !== undefined && typeof referenceNumber !== 'string') {
      return res.status(400).json({ error: 'Agency reference number must be text' });
    }
    if (notes !== undefined && typeof notes !== 'string') {
      return res.status(400).json({ error: 'Referral notes must be text' });
    }
    const cleanReference = referenceNumber ? cleanText(referenceNumber, 'Agency reference number', 120) : null;
    const cleanNotes = notes ? cleanText(notes, 'Referral notes', 2000, false) : null;
    const agencyAccountExists = await User.exists({
      role: 'agency',
      agencySlug: slugify(agency),
      isActive: true,
      agencyInvitationAcceptedAt: { $ne: null }
    });
    if (!agencyAccountExists) {
      return res.status(409).json({ error: 'This agency has no active, verified portal account. Complete partner onboarding before referral.' });
    }

    const report = selfCheck;
    const existing = report.activeReferralFor(agency);
    if (existing && existing.referralSummary) {
      return res.status(409).json({ error: 'This case is already referred to that agency. Use the existing referral to adjust what it can see.' });
    }
    // An old referral with no structured brief cannot be used by the portal. It is
    // closed out as history and replaced, keeping its earlier updates on record.
    if (existing) {
      for (const update of existing.agencyUpdates || []) {
        if (update.publicMessageStatus === 'pending') {
          update.publicMessageStatus = 'superseded';
          update.reviewedAt = new Date();
        }
      }
      existing.endedAt = new Date();
      existing.endReason = 'withdrawn';
      existing.endNote = 'Replaced by a structured referral.';
      existing.endedBy = req.user._id;
    }

    const evidence = buildReleasedEvidence(report, releaseEvidenceIds);
    if (!evidence.valid) {
      return res.status(400).json({ error: 'One or more selected evidence files do not belong to this report.' });
    }
    if (evidence.released.length > 0 && evidenceReviewed !== true) {
      return res.status(400).json({ error: EVIDENCE_REVIEW_ERROR });
    }
    // Kenya Watch never holds a reporter's identity for anonymous reports, so
    // there is nothing to hand over. Contact details can only be released for a
    // registered reporter who has explicitly opted in to being contacted about
    // their case - otherwise the flag is recorded as requested but the agency is
    // told to work through the Kenya Watch liaison.
    const reporterAccount = report.user ? await User.findById(report.user).select('emailNotificationsOptIn').lean() : null;
    const reporterAllowsContact = Boolean(reporterAccount && reporterAccount.emailNotificationsOptIn);
    const releaseContact = releaseReporterContact === true && reporterAllowsContact;

    // Record what the routing aid suggested next to what the reviewer decided, so
    // its usefulness can be measured. Failure here must never block a referral.
    try {
      const routing = await buildRouting(report, req.user);
      const suggested = routing.agencies.filter((item) => item.recommended).map((item) => item.name);
      report.routingFeedback.push({
        reviewer: req.user._id,
        suggested,
        chosen: agency,
        followedSuggestion: suggested.includes(agency),
        modelUsed: routing.modelUsed
      });
    } catch (feedbackError) {
      console.error('[routing] could not record routing feedback:', feedbackError.message);
    }

    report.agencyReferrals.push({
      agency,
      referralSummary: cleanSummary,
      referenceNumber: cleanReference || existing?.referenceNumber || null,
      notes: cleanNotes || existing?.notes || null,
      status: 'sent',
      referredAt: new Date(),
      sentBy: req.user._id,
      sentByName: req.user.name,
      agencyUpdates: [],
      caseFile: {
        narrative: releaseNarrative === true ? report.description : null,
        categoryDetails: releaseCategoryDetails === true ? report.categorySpecificDetails : null,
        reporterContact: releaseContact,
        evidence: evidence.released,
        releasedAt: new Date(),
        releasedBy: req.user._id,
        releasedByName: req.user.name,
        lastUpdatedAt: new Date()
      },
      accessLog: [],
      informationRequests: []
    });
    await report.save();
    return res.json(withSuggestedAgency(report, req.user));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

function findReferral(report, referralId) {
  if (!mongoose.Types.ObjectId.isValid(referralId)) return null;
  return report.agencyReferrals.id(referralId);
}

// PATCH /api/reports/:id/referrals/:referralId/case-file - widen or narrow what
// the receiving agency can see (for example after it asks for another file).
// Narrowing takes effect immediately: a file no longer released can no longer be
// downloaded.
router.patch('/:id/referrals/:referralId/case-file', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (await isBlockedSelfReview(report, req.user)) return res.status(403).json({ error: SELF_REVIEW_ERROR });
    const referral = findReferral(report, req.params.referralId);
    if (!referral || referral.endedAt) return res.status(404).json({ error: 'Active referral not found' });
    const { releaseNarrative, releaseCategoryDetails, releaseEvidenceIds, evidenceReviewed } = req.body || {};
    const evidence = buildReleasedEvidence(report, releaseEvidenceIds);
    if (!evidence.valid) return res.status(400).json({ error: 'One or more selected evidence files do not belong to this report.' });
    const alreadyReleased = new Set((referral.caseFile?.evidence || []).map((item) => item.evidenceId.toString()));
    const newlyReleased = evidence.released.filter((item) => !alreadyReleased.has(item.evidenceId.toString()));
    if (newlyReleased.length > 0 && evidenceReviewed !== true) {
      return res.status(400).json({ error: EVIDENCE_REVIEW_ERROR });
    }
    // Files that stay released keep their original release time.
    const kept = (referral.caseFile?.evidence || []).filter((item) => evidence.ids.includes(item.evidenceId.toString()));
    referral.caseFile.narrative = releaseNarrative === true ? report.description : null;
    referral.caseFile.categoryDetails = releaseCategoryDetails === true ? report.categorySpecificDetails : null;
    referral.caseFile.evidence = [...kept, ...newlyReleased];
    referral.caseFile.lastUpdatedAt = new Date();
    await report.save();
    return res.json({ message: 'Case file updated for the receiving agency' });
  } catch (err) {
    console.error('[reviewer] case file update failed:', err.message);
    return res.status(500).json({ error: 'Could not update the case file' });
  }
});

// POST /api/reports/:id/referrals/:referralId/end - stop an agency's involvement
// because the case was sent to the wrong place (transferred) or the referral is
// being withdrawn. The record stays for the audit trail.
router.post('/:id/referrals/:referralId/end', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { reason, note } = req.body || {};
    if (!['transferred', 'withdrawn'].includes(reason)) {
      return res.status(400).json({ error: 'Choose whether the referral was transferred or withdrawn' });
    }
    if (typeof note !== 'string' || note.trim().length < 10) {
      return res.status(400).json({ error: 'Record why the referral is ending (at least 10 characters)' });
    }
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (await isBlockedSelfReview(report, req.user)) return res.status(403).json({ error: SELF_REVIEW_ERROR });
    const referral = findReferral(report, req.params.referralId);
    if (!referral || referral.endedAt) return res.status(404).json({ error: 'Active referral not found' });
    for (const update of referral.agencyUpdates || []) {
      if (update.publicMessageStatus === 'pending') {
        update.publicMessageStatus = 'superseded';
        update.reviewedAt = new Date();
      }
    }
    referral.endedAt = new Date();
    referral.endReason = reason;
    referral.endNote = note.trim().slice(0, 2000);
    referral.endedBy = req.user._id;
    await report.save();
    return res.json({ message: 'Referral ended. The agency no longer sees this case.' });
  } catch (err) {
    console.error('[reviewer] ending referral failed:', err.message);
    return res.status(500).json({ error: 'Could not end the referral' });
  }
});

// POST /api/reports/:id/referrals/:referralId/reopen - Admin only. A closed
// referral that was closed in error, or where new facts have emerged, returns to
// review. The earlier outcome is kept in the referral's reopen history, and the
// report leaves "Resolved" if that outcome was what resolved it.
router.post('/:id/referrals/:referralId/reopen', requireRole('admin'), async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (typeof reason !== 'string' || reason.trim().length < 20) {
      return res.status(400).json({ error: 'Record why the referral is being reopened (at least 20 characters)' });
    }
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const referral = findReferral(report, req.params.referralId);
    if (!referral || referral.endedAt) return res.status(404).json({ error: 'Active referral not found' });
    if (referral.status !== 'closed') return res.status(409).json({ error: 'Only a closed referral can be reopened' });

    const cleanReason = reason.trim().slice(0, 2000);
    referral.reopenHistory.push({
      reopenedBy: req.user._id,
      reopenedByName: req.user.name,
      reason: cleanReason,
      previousOutcome: referral.resolution?.outcome || null,
      previousOutcomeReference: referral.resolution?.outcomeReference || null,
      previousOutcomeSummary: referral.resolution?.outcomeSummary || null
    });
    referral.agencyUpdates.push({
      note: `Reopened by Kenya Watch Admin: ${cleanReason}`,
      status: 'under_review',
      publicMessageStatus: 'none',
      createdBy: req.user._id,
      createdByName: req.user.name,
      createdByEmail: req.user.email,
      createdAt: new Date()
    });
    referral.status = 'under_review';
    referral.resolution = {};
    if (report.status === 'Resolved') {
      report.status = 'In Review';
      report.resolutionNote = null;
      report.resolutionReference = null;
      report.statusHistory.push({
        status: 'In Review',
        changedAt: new Date(),
        changedBy: req.user._id,
        note: `${referral.agency} referral reopened: ${cleanReason}`
      });
    }
    await report.save();
    return res.json({ message: 'Referral reopened for the agency' });
  } catch (err) {
    console.error('[admin] reopening referral failed:', err.message);
    return res.status(500).json({ error: 'Could not reopen the referral' });
  }
});

// GET /api/reports/:id/information-requests - open questions from the receiving
// agencies, shown in the reviewer workspace so they can be answered.
router.get('/:id/information-requests', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const requests = [];
    for (const referral of report.activeReferrals()) {
      for (const item of referral.informationRequests || []) {
        requests.push({
          _id: item._id,
          referralId: referral._id,
          agency: referral.agency,
          question: item.question,
          status: item.status,
          requestedAt: item.requestedAt,
          requestedByEmail: item.requestedByEmail,
          answer: item.answer,
          answeredAt: item.answeredAt,
          answeredByEmail: item.answeredByEmail
        });
      }
    }
    return res.json({ requests });
  } catch (err) {
    return res.status(500).json({ error: 'Could not load information requests' });
  }
});

// POST /api/reports/:id/information-requests/:requestId/answer - the reviewer's
// reply. It goes back to the asking agency's portal only; never shown publicly.
router.post('/:id/information-requests/:requestId/answer', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { answer } = req.body || {};
    if (typeof answer !== 'string' || answer.trim().length < 5) {
      return res.status(400).json({ error: 'Write an answer of at least 5 characters' });
    }
    if (answer.trim().length > 5000) {
      return res.status(400).json({ error: 'Keep the answer to 5000 characters or fewer' });
    }
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    let request = null;
    for (const referral of report.activeReferrals()) {
      request = (referral.informationRequests || []).find((item) => item._id.toString() === req.params.requestId);
      if (request) break;
    }
    if (!request) return res.status(404).json({ error: 'Information request not found' });
    request.answer = answer.trim();
    request.status = 'answered';
    request.answeredBy = req.user._id;
    request.answeredByEmail = req.user.email;
    request.answeredAt = new Date();
    await report.save();
    return res.json({ message: 'Answer sent back to the requesting agency' });
  } catch (err) {
    console.error('[reviewer] information request answer failed:', err.message);
    return res.status(500).json({ error: 'Could not save the answer' });
  }
});

// PATCH /api/reports/:id/status - Reviewer/Admin status update; Resolved requires a note+reference (decision #6).
router.patch('/:id/status', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { status, resolutionNote, resolutionReference, rejectionReason } = req.body;
    const validStatuses = ['Received', 'In Review', 'Resolved', 'Rejected'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (status === 'Resolved' && (!resolutionNote || !resolutionReference)) {
      return res.status(400).json({ error: 'Resolving a case requires both a resolution note and a reference' });
    }
    if (status === 'Rejected' && (!rejectionReason || String(rejectionReason).trim().length < 10)) {
      return res.status(400).json({ error: 'Rejecting a case requires a plain-language reason (at least 10 characters) so the reporter is never left guessing' });
    }

    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (await isBlockedSelfReview(report, req.user)) {
      return res.status(403).json({ error: SELF_REVIEW_ERROR });
    }

    report.status = status;
    if (status === 'Resolved') {
      report.resolutionNote = cleanText(resolutionNote, 'Resolution note', 2000, false);
      report.resolutionReference = cleanText(resolutionReference, 'Resolution reference', 200, false);
      report.rejectionReason = null;
    }
    if (status === 'Rejected') {
      report.rejectionReason = cleanText(rejectionReason, 'Rejection reason', 1000, false);
    }
    if (status !== 'Resolved' && status !== 'Rejected') {
      report.rejectionReason = null;
    }
    report.statusHistory.push({ status, changedAt: new Date(), changedBy: req.user._id });
    await report.save();

    // Path B opted-in notification (decision #23) - Path A never gets proactive
    // contact, by design. Fire-and-forget: a failed email never fails the update.
    notifyReporterOfStatusChange(report, { status, resolutionNote, resolutionReference, rejectionReason });

    return res.json(withSuggestedAgency(report, req.user));
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
    return res.json(withSuggestedAgency(report, req.user));
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

router.patch('/:id/restore', requireRole('admin'), async (req, res) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, archivedAt: { $ne: null } });
    if (!report) return res.status(404).json({ error: 'Archived report not found' });
    report.archivedAt = null;
    await report.save();
    return res.json(withSuggestedAgency(report, req.user));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/permanent', requireRole('admin'), async (req, res) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, archivedAt: { $ne: null } });
    if (!report) return res.status(404).json({ error: 'Archived report not found' });
    if (report.legalHold) return res.status(409).json({ error: 'A report under legal hold cannot be permanently deleted' });

    const fileIds = report.evidence.map((item) => item.gridFsId);
    for (const fileId of fileIds) {
      await deleteGridFsFile(fileId);
    }
    await Report.updateMany(
      { relatedCaseLinks: report._id },
      { $pull: { relatedCaseLinks: report._id } }
    );
    await Report.deleteOne({ _id: report._id, archivedAt: { $ne: null } });
    return res.status(204).end();
  } catch (err) {
    console.error('Could not permanently delete archived report:', err.message);
    return res.status(500).json({ error: 'Could not permanently delete the archived report and its evidence.' });
  }
});

// GET /api/reports/:id/related-suggestions - soft suggestions only, never auto-merged (decision #16).
router.get('/:id/related-suggestions', requireRole('reviewer', 'admin'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid report ID' });
  }

  try {
    const report = await findActiveReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (await isBlockedSelfReview(report, req.user)) {
      return res.status(403).json({ error: SELF_REVIEW_ERROR });
    }
    const hasOwnCategoryReview = report.categoryReview.annotations.some(
      (item) => item.reviewer.toString() === req.user._id.toString()
        && (item.decision === 'category' || (!item.decision && item.category))
    );
    if (!hasOwnCategoryReview) {
      return res.status(403).json({ error: 'Submit a category assessment before viewing related-case suggestions' });
    }

    const alreadyLinked = report.relatedCaseLinks.map((id) => id.toString());
    const candidates = await Report.find({
      archivedAt: null,
      _id: { $ne: report._id, $nin: alreadyLinked },
      county: report.county
    })
      .select('_id title description county subCounty createdAt')
      .sort({ createdAt: -1 })
      .limit(MAX_CANDIDATES)
      .lean();

    const suggestions = suggestRelatedCases(report, candidates, { limit: MAX_SUGGESTIONS });
    return res.json(suggestions.map(({ report: candidate, similarity, sharedTerms, lingoMatched }) => ({
      id: candidate._id,
      title: candidate.title,
      subCounty: candidate.subCounty,
      lingoMatched: !!lingoMatched,
      createdAt: candidate.createdAt,
      similarityPercent: Number((similarity * 100).toFixed(1)),
      sharedTerms
    })));
  } catch (err) {
    console.error('Could not generate related-case suggestions:', err.message);
    return res.status(500).json({ error: 'Could not generate related-case suggestions' });
  }
});

// POST /api/reports/:id/link - Reviewer/Admin manually links two cases; always additive, never destructive.
router.post('/:id/link', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { relatedId } = req.body;
    if (req.user.role === 'reviewer') {
      const blocked = await findActiveReport(req.params.id);
      if (blocked && await isBlockedSelfReview(blocked, req.user)) {
        return res.status(403).json({ error: SELF_REVIEW_ERROR });
      }
    }
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
    return res.json(withSuggestedAgency(report, req.user));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
