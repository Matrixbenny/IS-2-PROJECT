// Manual run of the retention job (the server also runs it daily).
// Usage: node scripts/anonymize-expired.js [retentionDays]  (default 90 or RETENTION_DAYS)
require('dotenv').config();
const mongoose = require('mongoose');
const { anonymizeExpired } = require('../utils/retention');

async function main() {
  const parsedArg = Number(process.argv[2]);
  const days = process.argv[2] !== undefined && Number.isFinite(parsedArg) ? parsedArg : undefined;
  await mongoose.connect(process.env.MONGO_URI);
  const result = await anonymizeExpired(days);
  console.log(`Done. ${result.anonymized} of ${result.eligible} eligible report(s) anonymized (retention window: ${result.retentionDays} days).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
