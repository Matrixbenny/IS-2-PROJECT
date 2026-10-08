// Manual/scheduled retention job (decision #11) - run periodically (e.g. via Windows Task
// Scheduler / cron) rather than a built-in background scheduler, consistent with this
// project's other one-off scripts (bootstrap-admin.js). Severs the identifying `user` link
// on fully-closed Path B reports once they've been resolved/rejected for longer than the
// retention window, unless an Admin has flagged the case under active legal hold.
//
// Usage: node scripts/anonymize-expired.js [retentionDays]  (default 90)
require('dotenv').config();
const mongoose = require('mongoose');
const Report = require('../report.model');

async function main() {
  const parsedArg = Number(process.argv[2]);
  const retentionDays = process.argv[2] !== undefined && Number.isFinite(parsedArg) ? parsedArg : 90;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  await mongoose.connect(process.env.MONGO_URI);

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
      anonymized++;
      console.log(`Anonymized ${report.trackingReference} (closed ${closedAt.toISOString()})`);
    }
  }

  console.log(`Done. ${anonymized} of ${candidates.length} eligible report(s) anonymized (retention window: ${retentionDays} days).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Anonymization job failed:', err.message);
  process.exit(1);
});
