require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  const reports = mongoose.connection.db.collection("reports");
  const ref = process.argv[2] || "KW-JRWSJH";
  const d = await reports.findOne({ trackingReference: ref });
  if (!d) {
    console.log("not found");
    process.exit(1);
  }
  const u =
    ((d.agencyReferral && d.agencyReferral.agencyUpdates) || [])[0] || {};
  console.log("agencyReferral.status =", d.agencyReferral.status);
  console.log("updateCount =", (d.agencyReferral.agencyUpdates || []).length);
  console.log("publicMessageStatus =", u.publicMessageStatus);
  console.log("evidenceCount =", (d.evidence || []).length);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("ERR:", err.message);
  process.exit(1);
});
