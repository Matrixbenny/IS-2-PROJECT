const express = require('express');
const Report = require('../report.model');

const router = express.Router();

// GET /api/stats/public - aggregate-only transparency page (decision #27).
// Breakdown is always by the citizen's self-selected reportedCategory, never the
// internal ML classification.category, which stays a Reviewer-only triage signal.
router.get('/public', async (req, res) => {
  try {
    const reports = await Report.find().select('reportedCategory county status').lean();

    const total = reports.length;
    const resolved = reports.filter((r) => r.status === 'Resolved').length;
    const resolutionRate = total === 0 ? 0 : Number(((resolved / total) * 100).toFixed(1));

    const categoryCounts = {};
    const countyCounts = {};
    for (const r of reports) {
      categoryCounts[r.reportedCategory] = (categoryCounts[r.reportedCategory] || 0) + 1;
      countyCounts[r.county] = (countyCounts[r.county] || 0) + 1;
    }

    const toSortedArray = (counts) => Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return res.json({
      totalReports: total,
      resolvedReports: resolved,
      resolutionRate,
      byCategory: toSortedArray(categoryCounts),
      byCounty: toSortedArray(countyCounts)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
