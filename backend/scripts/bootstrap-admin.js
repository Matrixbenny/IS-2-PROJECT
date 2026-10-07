// One-off, command-line-only setup step (decision #15) - creates the single bootstrap
// Admin account outside the public app. Refuses to run if an admin already exists, so it
// can never be used as a silent backdoor after initial deployment.
//
// Usage: node scripts/bootstrap-admin.js "Full Name" "admin@example.com" "StrongPassw0rd!"
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../user.model');

async function main() {
  const [, , name, email, password] = process.argv;
  if (!name || !email || !password) {
    console.error('Usage: node scripts/bootstrap-admin.js "Full Name" "admin@example.com" "StrongPassw0rd!"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.error(`An admin account already exists (${existingAdmin.email}). Refusing to create another via bootstrap.`);
    process.exit(1);
  }

  const admin = new User({ name, email, password, role: 'admin' });
  await admin.save();
  console.log(`Admin account created: ${admin.email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
