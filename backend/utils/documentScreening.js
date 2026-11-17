// Document authenticity screening for reviewer and agency applications.
// Produces a compact, admin-readable record per document: SHA-256 fingerprint,
// generation indicators, and flags an Admin must resolve before approval.
// Honest limit: screening guides the Admin; it cannot prove authenticity on
// its own — that still requires the official-channel checks below.
const {
  extractPdfStrings,
  generationIndicators,
  sha256,
} = require("./pdfScreening");

// Known-document registry lives in MongoDB via DocumentFingerprint model.
async function screenApplicationDocument(file, { DocumentFingerprint } = {}) {
  const meta = extractPdfStrings(file.buffer);
  const indicators = generationIndicators(meta);
  const fingerprint = sha256(file.buffer);
  const flags = [...indicators];

  let duplicate = null;
  if (DocumentFingerprint) {
    duplicate = await DocumentFingerprint.findOne({ fingerprint }).lean();
    if (duplicate) {
      flags.push({
        level: "warn",
        message: `This exact file was already submitted (first seen ${duplicate.createdAt ? new Date(duplicate.createdAt).toISOString().slice(0, 10) : "earlier"} by ${duplicate.submittedByEmail || "another applicant"}). Verify independently before accepting.`,
      });
    }
  }

  return {
    fingerprint,
    bytes: file.size,
    producer: meta.producer,
    creationDate: meta.creationDate,
    pageCount: meta.pageMarkers,
    imageBased: meta.imageCount > 0 && !meta.hasTextLayer,
    digitallySigned: meta.digitalSignature,
    encrypted: meta.encrypted,
    flags,
  };
}

module.exports = { screenApplicationDocument };
