const express = require("express");
const Report = require("../report.model");

const router = express.Router();

// An agency's figures appear only once it has handled at least this many
// referrals, so a single case cannot be identified through this public page.
const MIN_REFERRALS_FOR_PUBLIC_AGENCY_FIGURES = 5;

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
};

// Is the law doing its job? Public, aggregate accountability for the institutions
// that receive referrals: how many reached them, how quickly they responded, and
// what they decided. Referrals a reviewer ended as misdirected are not counted
// against an agency; a referral an agency sent back as outside its mandate is
// reported separately.
function buildJusticeLoop(reports) {
  const perAgency = new Map();
  for (const report of reports) {
    for (const referral of report.agencyReferrals || []) {
      if (!referral.agency) continue;
      if (referral.endReason === 'transferred' || referral.endReason === 'withdrawn') continue;
      const row = perAgency.get(referral.agency) || {
        agency: referral.agency, referred: 0, acknowledged: 0, closed: 0, returned: 0,
        outcomes: {}, hoursToAcknowledge: []
      };
      row.referred += 1;
      if (referral.endReason === 'declined') row.returned += 1;
      const acknowledgement = (referral.agencyUpdates || [])
        .filter((update) => update.createdAt)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
      if (acknowledgement && referral.referredAt) {
        row.acknowledged += 1;
        row.hoursToAcknowledge.push((new Date(acknowledgement.createdAt) - new Date(referral.referredAt)) / 3600000);
      }
      if (referral.status === 'closed' && referral.resolution?.outcome) {
        row.closed += 1;
        row.outcomes[referral.resolution.outcome] = (row.outcomes[referral.resolution.outcome] || 0) + 1;
      }
      perAgency.set(referral.agency, row);
    }
  }
  const rows = Array.from(perAgency.values());
  const totals = rows.reduce((sum, row) => ({
    referred: sum.referred + row.referred,
    acknowledged: sum.acknowledged + row.acknowledged,
    closed: sum.closed + row.closed
  }), { referred: 0, acknowledged: 0, closed: 0 });
  return {
    ...totals,
    minReferralsForAgencyFigures: MIN_REFERRALS_FOR_PUBLIC_AGENCY_FIGURES,
    agencies: rows
      .filter((row) => row.referred >= MIN_REFERRALS_FOR_PUBLIC_AGENCY_FIGURES)
      .map((row) => ({
        agency: row.agency,
        referred: row.referred,
        acknowledgedRate: Number(((row.acknowledged / row.referred) * 100).toFixed(1)),
        medianHoursToAcknowledge: median(row.hoursToAcknowledge),
        closed: row.closed,
        returned: row.returned,
        outcomes: row.outcomes
      }))
      .sort((a, b) => b.referred - a.referred)
  };
}

// GET /api/stats/public - aggregate-only transparency page (decision #27).
// Breakdown is always by the citizen's self-selected reportedCategory, never the
// internal ML classification.category, which stays a Reviewer-only triage signal.
router.get("/public", async (req, res) => {
  try {
    const reports = await Report.find({ archivedAt: null })
      .select(
        "reportedCategory county status createdAt statusHistory classification.urgency agencyReferrals",
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
      justiceLoop: buildJusticeLoop(reports),
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
