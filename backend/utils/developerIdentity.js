// The project developer's personal mailbox is reserved (decision #32).
//
// The same mailbox is configured as the Kenya Watch sender (MAIL_FROM /
// SMTP_USER) and sends OTP and notification email. If a citizen could register
// with it, a single inbox would control both a normal account and the mail
// that proves ownership of anything else - a straightforward takeover path.
// So it can never be used to create an account, on any path:
//   - citizen registration
//   - reviewer applications / re-applications
//   - admin-provisioned reviewer accounts
//   - agency invitations
//   - admin email edits of any account
// The Admin account itself is the single, deliberate exception: Admins are
// created out-of-band (scripts/bootstrap-admin.js) and log in with the
// ADMIN_EMAIL / ADMIN_PASSWORD_HASH pair, so only ADMIN_EMAIL is exempt here.
// Keeping the developer inbox out of that exemption means the mailbox that
// sends OTP mail can never also be an Admin login.
//
// Values are normalised to a bare lowercase address so that
// "officialbillionaire.ke+anything@..." cannot slip through as an alias.

const { normalizeEmail } = require("./adminIdentity");

const HARDCODED_RESERVED_ADDRESS = "officialbillionaire.ke@gmail.com";

function stripPlusAlias(email) {
  const clean = normalizeEmail(email);
  const at = clean.lastIndexOf("@");
  if (at <= 0) return clean;
  const local = clean.slice(0, at).split("+")[0];
  return `${local}${clean.slice(at)}`;
}

function reservedEmailList() {
  const configured = normalizeEmail(
    process.env.MAIL_FROM &&
      process.env.MAIL_FROM.match(/[\w.+-]+@[\w.-]+/)?.[0],
  );
  const smtpUser = normalizeEmail(
    process.env.SMTP_USER &&
      process.env.SMTP_USER.match(/[\w.+-]+@[\w.-]+/)?.[0],
  );
  const extra = String(process.env.RESERVED_EMAILS || "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
  // ADMIN_EMAIL is confirmed reserved too: the Admin record is created out of
  // band and logs in with that exact address + ADMIN_PASSWORD_HASH, so a
  // second, ordinary account on the same mailbox would be a takeover path.
  const adminLogin = normalizeEmail(process.env.ADMIN_EMAIL);
  return new Set(
    [HARDCODED_RESERVED_ADDRESS, configured, smtpUser, adminLogin, ...extra].filter(
      Boolean,
    ),
  );
}

/**
 * True when the address (or any +alias of it) belongs to the developer mailbox.
 */
function isReservedDeveloperEmail(email) {
  const bare = stripPlusAlias(email);
  if (!bare) return false;
  return reservedEmailList().has(bare);
}

/**
 * Admin-aware check used by account-creation paths. Returns true only when the
 * address is reserved AND is not the deliberately configured Admin login.
 */
function isBlockedAccountEmail(email) {
  if (!isReservedDeveloperEmail(email)) return false;
  return normalizeEmail(email) !== normalizeEmail(process.env.ADMIN_EMAIL);
}

/** Shared error text so every route answers identically. */
const RESERVED_EMAIL_ERROR =
  "This email address is reserved for the Kenya Watch developer inbox and cannot be used for an account. Please use a different email address.";

/**
 * Legacy safety net. Earlier versions stored the developer address in the
 * ADMIN_EMAIL variable, which left .env files that could accidentally reserve
 * the wrong mailbox. Logs a loud warning instead of silently failing.
 */
function warnIfAdminIdentityMisconfigured() {
  const configuredAdmin = normalizeEmail(process.env.ADMIN_EMAIL);
  if (!configuredAdmin) return;
  if (isReservedDeveloperEmail(configuredAdmin)) {
    console.warn(
      "[identity] ADMIN_EMAIL is set to the reserved developer inbox. " +
        "That mailbox can never be a user account and is where Kenya Watch sends mail. " +
        "Set ADMIN_EMAIL to a separate admin login address.",
    );
  }
}

module.exports = {
  HARDCODED_RESERVED_ADDRESS,
  RESERVED_EMAIL_ERROR,
  isBlockedAccountEmail,
  isReservedDeveloperEmail,
  reservedEmailList,
  stripPlusAlias,
  warnIfAdminIdentityMisconfigured,
};
