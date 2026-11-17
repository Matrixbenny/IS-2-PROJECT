// Registry of every application-document fingerprint ever submitted. When the
// same file bytes reappear under a new applicant, that is a strong signal of a
// recycled or forged document and the Admin sees it at approval time.
const mongoose = require("mongoose");

const documentFingerprintSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true, index: true },
  kind: { type: String, required: true },
  applicantEmail: { type: String, default: null },
  submittedByEmail: { type: String, default: null },
  applicationRole: {
    type: String,
    enum: ["reviewer", "agency"],
    required: true,
  },
  firstSeenAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model(
  "DocumentFingerprint",
  documentFingerprintSchema,
);
