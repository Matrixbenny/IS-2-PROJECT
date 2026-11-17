// A Reviewer must never review their own case (decision #36).
//
// Reviewers can also be citizens, and a reviewer may report a case from a
// citizen account that uses the same email address as their reviewer account.
// Two independent checks cover both shapes:
//
//   1. Identity: the report's citizen owner shares the reviewer's email. The
//      report's `user` field is sealed from Reviewers at the data layer, so
//      this lookup happens here, on the server, and only returns a boolean.
//   2. Authorship: the reviewer is the account that submitted the report at
//      all (defence in depth - covers a future case where an email changes).
//
// A conflict must never be resolved by simply hiding the report: the reviewer
// would still be able to act on it via an API call. Every route that lets a
// reviewer touch a case calls assertNotOwnReport() first, and the queue marks
// the case as own so the UI cannot offer the controls.

const User = require("../user.model");
const { normalizeEmail } = require("./adminIdentity");

const SELF_REVIEW_ERROR =
  "This is your own report. A reviewer cannot claim, label, refer or resolve a case they submitted - ask another reviewer or the Admin to handle it.";

/**
 * True when the reviewer owns the report - by account link or shared email.
 * @param {{ user?: any, ownerEmail?: string|null }} report  a report document/lean object
 * @param {{ _id?: any, id?: any, email?: string, role?: string }} user  req.user
 */
async function isOwnReport(report, user) {
  if (!report || !user || user.role !== "reviewer") return false;
  const viewerId = String(user._id || user.id || "");

  if (report.user && String(report.user) === viewerId) return true;

  let ownerEmail = report.ownerEmail;
  if (ownerEmail === undefined) {
    if (!report.user) return false;
    const owner = await User.findById(report.user).select("email").lean();
    ownerEmail = owner?.email || null;
  }
  if (!ownerEmail || !user.email) return false;
  return normalizeEmail(ownerEmail) === normalizeEmail(user.email);
}

/** Convenience for route handlers: returns true when the caller must stop. */
async function isBlockedSelfReview(report, user) {
  if (!user || user.role !== "reviewer") return false;
  return isOwnReport(report, user);
}

module.exports = { SELF_REVIEW_ERROR, isBlockedSelfReview, isOwnReport };
