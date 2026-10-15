// One-off, command-line-only setup step (decision #15) - creates the single bootstrap
// Admin account outside the public app. Refuses to run if an admin already exists, so it
// can never be used as a silent backdoor after initial deployment.
//
// Usage: set ADMIN_BOOTSTRAP_PASSWORD securely, then run
// node scripts/bootstrap-admin.js "Full Name" "admin@example.com"
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../user.model');
const { normalizeEmail, getConfiguredAdminEmail } = require('../utils/adminIdentity');

async function main() {
  const [, , name, email] = process.argv;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!name || !email || !password) {
    console.error('Set ADMIN_BOOTSTRAP_PASSWORD and run: node scripts/bootstrap-admin.js "Full Name" "admin@example.com"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }
  const configuredAdminEmail = getConfiguredAdminEmail();
  if (!configuredAdminEmail) {
    console.error('Set ADMIN_EMAIL in the backend environment before creating the Admin account.');
    process.exit(1);
  }
  if (normalizeEmail(email) !== configuredAdminEmail) {
    console.error('The Admin email must match the configured ADMIN_EMAIL.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.error(`An admin account already exists (${existingAdmin.email}). Refusing to create another via bootstrap.`);
    process.exit(1);
  }

  const existingAccount = await User.findOne({ email: configuredAdminEmail });
  if (existingAccount) {
    console.error('An account already uses the configured Admin email. Refusing to create another account.');
    process.exit(1);
  }

  const admin = new User({ name, email: configuredAdminEmail, password, role: 'admin' });
  await admin.save();
  console.log(`Admin account created: ${admin.email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
