const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const User = require('../user.model');
const { verifyAdminPassword } = require('../utils/adminPassword');

test('Admin records can be created without any database password', async () => {
  const admin = new User({
    name: 'Configured Admin',
    email: 'admin@example.com',
    role: 'admin'
  });

  await admin.validate();
  assert.equal(admin.password, undefined);
  assert.equal(await admin.comparePassword('not-a-password'), false);
});

test('non-Admin accounts still require a database password hash', async () => {
  const user = new User({
    name: 'Citizen',
    email: 'citizen@example.com',
    role: 'user'
  });

  await assert.rejects(user.validate(), (error) => Boolean(error.errors.password));
});

test('Admin password verification uses the environment hash and rejects unconfigured hashes', async () => {
  const originalHash = process.env.ADMIN_PASSWORD_HASH;
  try {
    delete process.env.ADMIN_PASSWORD_HASH;
    assert.deepEqual(await verifyAdminPassword('any-password'), { configured: false, valid: false });

    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('unique admin passphrase', 12);
    assert.deepEqual(await verifyAdminPassword('unique admin passphrase'), { configured: true, valid: true });
    assert.deepEqual(await verifyAdminPassword('incorrect passphrase'), { configured: true, valid: false });

    process.env.ADMIN_PASSWORD_HASH = 'invalid-hash';
    assert.deepEqual(await verifyAdminPassword('unique admin passphrase'), { configured: false, valid: false });
  } finally {
    if (originalHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = originalHash;
  }
});
