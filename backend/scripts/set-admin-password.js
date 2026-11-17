require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { getConfiguredAdminEmail } = require('../utils/adminIdentity');

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error('Run this command in an interactive terminal so the password can be entered without echo.'));
      return;
    }

    const stdin = process.stdin;
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (key) => {
      if (key === '\u0003') {
        cleanup();
        reject(new Error('Password setup cancelled.'));
      } else if (key === '\r' || key === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(value);
      } else if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
      } else if (key >= ' ') {
        value += key;
      }
    };
    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.isRaw) stdin.setRawMode(false);
      stdin.pause();
    };

    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function replaceEnvValue(contents, name, value) {
  const lines = contents.split(/\r?\n/);
  const prefix = `${name}=`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) lines[index] = `${prefix}${value}`;
  else lines.push(`${prefix}${value}`);
  return `${lines.filter((line, lineIndex) => lineIndex < lines.length - 1 || line !== '').join('\n')}\n`;
}

async function main() {
  const adminEmail = getConfiguredAdminEmail();
  if (!adminEmail) throw new Error('Set ADMIN_EMAIL in backend/.env before configuring the Admin password.');
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in backend/.env so the existing Admin password can be removed from MongoDB.');

  const password = await readHidden('New Admin password (input hidden): ');
  const confirmation = await readHidden('Confirm Admin password (input hidden): ');
  if (password.length < 12) throw new Error('Use an Admin password of at least 12 characters.');
  if (password !== confirmation) throw new Error('The passwords did not match.');

  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection('users');
  const adminCount = await users.countDocuments({ role: 'admin' });
  if (adminCount > 1) throw new Error('Multiple Admin records exist; resolve them before removing stored Admin passwords.');
  const existingAdmin = await users.findOne({ role: 'admin' });
  if (existingAdmin && existingAdmin.email !== adminEmail) {
    throw new Error('The configured ADMIN_EMAIL does not match the existing Admin record.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const envPath = path.resolve(__dirname, '..', '.env');
  const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  fs.writeFileSync(envPath, replaceEnvValue(existingEnv, 'ADMIN_PASSWORD_HASH', passwordHash), { mode: 0o600 });

  if (existingAdmin) {
    const result = await users.updateOne(
      { _id: existingAdmin._id, role: 'admin', email: adminEmail },
      { $unset: { password: '' } }
    );
    if (result.matchedCount !== 1) throw new Error('Could not remove the Admin password field from MongoDB.');
    console.log('Admin password hash saved to backend/.env; the Admin password field was removed from MongoDB.');
  } else {
    console.log('Admin password hash saved to backend/.env. No Admin record exists yet; run bootstrap-admin.js to create it.');
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
