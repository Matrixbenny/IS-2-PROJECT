require("dotenv").config();
const mongoose = require("mongoose");

// Classifier evaluation: measures agreement between the keyword classifier's
// inferred category and the final human-reviewed category (the double-blind
// categoryReview workflow's adjudicated label, falling back to independent
// reviewer annotations). Run: node scripts/evaluate-classifier.js
//
// Honest framing for the report: this is agreement with human labels on live
// cases, not a controlled train/test accuracy figure - state it that way.

async function main() {
  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/kenya_watch",
    {
      serverSelectionTimeoutMS: 5000,
    },
  );
  const reports = mongoose.connection.db.collection("reports");

  // Priority of "human truth": adjudicated category > agreeing annotation pair >
  // single annotation (single labels are noted separately as weaker ground truth).
  const cases = await reports
    .aggregate([
      { $match: { archivedAt: null } },
      {
        $project: {
          reportedCategory: 1,
          classificationCategory: "$classification.category",
          adjudicatedCategory: "$categoryReview.adjudicatedCategory",
          annotations: "$categoryReview.annotations",
        },
      },
    ])
    .toArray();

  let evaluated = 0;
  let agreed = 0;
  let strongGroundTruth = 0;
  let agreedStrong = 0;
  let reporterCategoryAgreed = 0;
  let reporterCategoryTotal = 0;
  const confusion = [];

  for (const c of cases) {
    if (!c.classificationCategory || !c.reportedCategory) continue;
    const annotations = (c.annotations || []).filter((a) => a.category);
    const categoryCounts = {};
    for (const a of annotations)
      categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
    const humanLabel =
      c.adjudicatedCategory ||
      Object.entries(categoryCounts).find(([, n]) => n >= 2)?.[0] ||
      null;
    const hasAdjudication =
      Boolean(c.adjudicatedCategory) ||
      Object.values(categoryCounts).some((n) => n >= 2);

    evaluated += 1;
    const match = humanLabel === c.classificationCategory;
    if (match) agreed += 1;
    if (hasAdjudication) {
      strongGroundTruth += 1;
      if (match) agreedStrong += 1;
    }
    // The reporter's self-selected category is a weak but always-available proxy
    // for the true category - report agreement with it separately.
    reporterCategoryTotal += 1;
    if (c.reportedCategory === c.classificationCategory) reporterCategoryAgreed += 1;
    if (!match && humanLabel) {
      confusion.push({
        ref: c.reportedCategory,
        classifier: c.classificationCategory,
        human: humanLabel,
        strength: hasAdjudication ? "adjudicated/agreed" : "single annotation",
      });
    }
  }

  const pct = (n, d) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`);
  console.log("=== Kenya Watch classifier evaluation ===");
  console.log(
    `reports with both classifier output and a reporter category: ${evaluated}`,
  );
  console.log(
    `agreement with human labels (all available): ${agreed}/${evaluated} = ${pct(agreed, evaluated)}`,
  );
  console.log(
    `agreement on adjudicated/double-agreed labels only: ${agreedStrong}/${strongGroundTruth} = ${pct(agreedStrong, strongGroundTruth)}`,
  );
  console.log(
    `agreement with the reporter's own category selection (weak proxy): ${reporterCategoryAgreed}/${reporterCategoryTotal} = ${pct(reporterCategoryAgreed, reporterCategoryTotal)}`,
  );
  if (confusion.length) {
    console.log("\ndisagreements (classifier -> human):");
    for (const row of confusion.slice(0, 15)) {
      console.log(
        `  reporter said [${row.ref}] | classifier [${row.classifier}] | human [${row.human}] (${row.strength})`,
      );
    }
  }
  console.log(
    "\nNote: agreement on live operational data, not a controlled test-set accuracy figure.",
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("ERR:", err.message);
  process.exit(1);
});
