require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  const reports = mongoose.connection.db.collection("reports");
  const ref = process.argv[2];
  if (!ref) {
    console.log("usage: node scripts/peek-report.js <trackingReference>");
    process.exit(1);
  }
  const d = await reports.findOne({ trackingReference: ref });
  if (!d) {
    console.log("not found");
    process.exit(1);
  }
  console.log("status =", d.status);
  const referrals = d.agencyReferrals || [];
  console.log("referrals =", referrals.length);
  for (const r of referrals) {
    const updates = r.agencyUpdates || [];
    console.log(
      `  ${r.agency}: status=${r.status}${r.endedAt ? " (ended: " + r.endReason + ")" : ""}`,
      `updates=${updates.length}`,
      `pendingMessages=${updates.filter((u) => u.publicMessageStatus === "pending").length}`,
    );
  }
  console.log("evidenceCount =", (d.evidence || []).length);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("ERR:", err.message);
  process.exit(1);
});
