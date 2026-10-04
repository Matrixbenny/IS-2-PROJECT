const express = require('express');
const Report = require('../report.model');
const { CATEGORIES, CATEGORY_FIELDS } = require('../utils/categories');
const { generateTrackingReference, generateAccessKey, hashSecret, verifySecret } = require('../utils/tracking');
const { classifyReportText } = require('../utils/classifier');
const { upload } = require('../middleware/upload');
const { storeEvidenceFile } = require('../utils/evidence');
const { getBucket } = require('../utils/gridfs');
const { requireAuth, requireRole } = require('../middleware/auth');

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
        classification: { category: result.category, urgency: result.urgency, confidence: result.confidence },
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

// GET /api/reports/queue - Reviewer/Admin shared triage queue, reviewer tier (decision #24/#25).
router.get('/queue', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).limit(200);
    return res.json(reports.map((r) => r.toReviewerTier()));
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
    if (isStaff) return res.json(report.toReviewerTier());
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
    return res.json(report.toReviewerTier());
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
    return res.json(report.toReviewerTier());
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
