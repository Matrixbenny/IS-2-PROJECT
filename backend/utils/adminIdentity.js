function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function getConfiguredAdminEmail() {
  return normalizeEmail(process.env.ADMIN_EMAIL);
}

function isConfiguredAdminEmail(email) {
  const configuredEmail = getConfiguredAdminEmail();
  return !!configuredEmail && normalizeEmail(email) === configuredEmail;
}

module.exports = { normalizeEmail, getConfiguredAdminEmail, isConfiguredAdminEmail };
