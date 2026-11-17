require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('Usage: node set-password.js <email> <newPassword>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const account = await mongoose.connection.db.collection('users').findOne({ email: email.toLowerCase() }, { projection: { role: 1 } });
  if (account?.role === 'admin') {
    console.error('Admin passwords are configured outside MongoDB. Use scripts/set-admin-password.js instead.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const result = await mongoose.connection.db
    .collection('users')
    .updateOne({ email: email }, { $set: { password: hash, isActive: true } });
  if (result.matchedCount === 0) {
    console.error(`No user found with email: ${email}`);
  } else {
    console.log(`Password updated for ${email}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
