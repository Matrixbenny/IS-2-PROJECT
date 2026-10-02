const express = require('express');
const Report = require('../report.model');
const { verifySecret } = require('../utils/tracking');
const { getBucket } = require('../utils/gridfs');

const router = express.Router();

// GET /api/evidence/:reportId/:fileId - the only way to ever read a raw evidence file (decision #17).
// Accepts exactly one of: Reviewer/Admin session, Path B owner session, or ?ref=&key= for that report.
router.get('/:reportId/:fileId', async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const isStaff = req.user && ['reviewer', 'admin'].includes(req.user.role);
    const isOwner = req.user && report.user && report.user.toString() === req.user._id.toString();

    let authorized = isStaff || isOwner;
    if (!authorized && req.query.ref && req.query.key) {
      authorized = req.query.ref === report.trackingReference && await verifySecret(req.query.key, report.accessKeyHash);
    }
    if (!authorized) return res.status(403).json({ error: 'Not authorized to view this evidence file' });

    const evidenceItem = report.evidence.find((e) => e._id.toString() === req.params.fileId);
    if (!evidenceItem) return res.status(404).json({ error: 'Evidence file not found on this report' });

    const bucket = getBucket();
    res.set('Content-Disposition', `inline; filename="${evidenceItem.filename}"`);
    bucket.openDownloadStream(evidenceItem.gridFsId)
      .on('error', () => res.status(404).json({ error: 'File not found in storage' }))
      .pipe(res);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
