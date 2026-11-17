const express = require("express");
const Report = require("../report.model");

const router = express.Router();

// GET /api/stats/public - aggregate-only transparency page (decision #27).
// Breakdown is always by the citizen's self-selected reportedCategory, never the
// internal ML classification.category, which stays a Reviewer-only triage signal.
router.get("/public", async (req, res) => {
  try {
    const reports = await Report.find({ archivedAt: null })
      .select(
        "reportedCategory county status createdAt statusHistory classification.urgency",
      )
      .lean();

    const total = reports.length;
    const resolved = reports.filter((r) => r.status === "Resolved").length;
    const resolutionRate =
      total === 0 ? 0 : Number(((resolved / total) * 100).toFixed(1));

    const categoryCounts = {};
    const countyCounts = {};
    for (const r of reports) {
      categoryCounts[r.reportedCategory] =
        (categoryCounts[r.reportedCategory] || 0) + 1;
      countyCounts[r.county] = (countyCounts[r.county] || 0) + 1;
    }

    const toSortedArray = (counts) =>
      Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    // Median hours from submission to the first "In Review" statusHistory entry -
    // an honest responsiveness signal, aggregated so no case is identifiable.
    const reviewLagHours = reports
      .map((r) => {
        const firstReview = (r.statusHistory || []).find(
          (h) => h.status === "In Review",
        );
        return firstReview
          ? (new Date(firstReview.changedAt) - new Date(r.createdAt)) / 3600000
          : null;
      })
      .filter((h) => h !== null && h >= 0)
      .sort((a, b) => a - b);
    const medianReviewLagHours = reviewLagHours.length
      ? Math.round(reviewLagHours[Math.floor(reviewLagHours.length / 2)] * 10) / 10
      : null;

    // Resolution rate per county (only counties with at least 2 reports, to avoid
    // 0%-or-100% noise from single cases identifying a report by its county).
    const byCounty = toSortedArray(countyCounts).map(({ name, count }) => {
      const countyResolved = reports.filter(
        (r) => r.county === name && r.status === "Resolved",
      ).length;
      return {
        name,
        count,
        resolutionRate:
          count < 2
            ? null
            : Number(((countyResolved / count) * 100).toFixed(1)),
      };
    });

    // Category x urgency matrix (reporter category vs internal urgency triage).
    const urgencyLevels = ["Low", "Medium", "High", "Critical"];
    const categoryUrgency = toSortedArray(categoryCounts).map(({ name }) => {
      const row = { name };
      for (const level of urgencyLevels) {
        row[level] = reports.filter(
          (r) =>
            r.reportedCategory === name && r.classification?.urgency === level,
        ).length;
      }
      return row;
    });

    return res.json({
      totalReports: total,
      resolvedReports: resolved,
      resolutionRate,
      medianReviewLagHours,
      byCategory: toSortedArray(categoryCounts),
      byCounty,
      categoryUrgency,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
