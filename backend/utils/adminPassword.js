const bcrypt = require('bcryptjs');

async function verifyAdminPassword(candidate) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || !/^\$2[aby]\$12\$/.test(hash)) {
    return { configured: false, valid: false };
  }
  return { configured: true, valid: await bcrypt.compare(candidate, hash) };
}

module.exports = { verifyAdminPassword };
