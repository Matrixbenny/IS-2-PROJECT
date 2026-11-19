const Report = require('../report.model');

// Decision #11: once a report is fully closed, the link to the reporter's account
// is cut after the retention window, unless an Admin has put the case on legal hold.
async function anonymizeExpired(retentionDays = Number(process.env.RETENTION_DAYS) || 90, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const candidates = await Report.find({
    user: { $ne: null },
    legalHold: false,
    status: { $in: ['Resolved', 'Rejected'] }
  });
  let anonymized = 0;
  for (const report of candidates) {
    const closingEntry = [...report.statusHistory].reverse().find((h) => h.status === report.status);
    const closedAt = closingEntry ? closingEntry.changedAt : report.createdAt;
    if (closedAt <= cutoff) {
      report.user = null;
      await report.save();
      anonymized += 1;
    }
  }
  return { anonymized, eligible: candidates.length, retentionDays };
}

module.exports = { anonymizeExpired };
