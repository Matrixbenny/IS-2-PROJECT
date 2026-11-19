// Refuses to start a production server with settings that would quietly weaken it.
function productionProblems(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const problems = [];
  const secret = env.JWT_SECRET || '';
  if (secret.length < 32 || /replace-with|changeme|secret$/i.test(secret)) {
    problems.push('JWT_SECRET must be a random string of at least 32 characters.');
  }
  if (!env.SMTP_HOST) problems.push('SMTP_HOST is required: sign-in codes and password resets are sent by email.');
  if (!env.ADMIN_PASSWORD_HASH) problems.push('ADMIN_PASSWORD_HASH is required (see scripts/set-admin-password.js).');
  if (!/^https:\/\//.test(env.FRONTEND_ORIGIN || '')) problems.push('FRONTEND_ORIGIN must be an https:// URL.');
  if (env.MFA_REQUIRED === 'false') problems.push('MFA_REQUIRED=false disables the second sign-in step for agency officers, reviewers and the Admin.');
  return problems;
}

module.exports = { productionProblems };
