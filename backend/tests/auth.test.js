const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const User = require('../user.model');
const Report = require('../report.model');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';

let app;
let authTestAddress = 10;

function authPost(path) {
  authTestAddress += 1;
  return request(app)
    .post(path)
    .set('X-Forwarded-For', `198.51.100.${authTestAddress}`);
}

async function loginAsAdmin(email, password) {
  process.env.ADMIN_EMAIL = email;
  return authPost('/api/auth/login').send({ email, password });
}

test.before(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  app.set('trust proxy', 1);
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  authTestAddress = 10;
});

test('POST /api/auth/register rejects a password shorter than 8 characters', async () => {
  const res = await authPost('/api/auth/register').send({
    name: 'Test User', email: 'short-pass@example.com', password: 'abc123'
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/auth/register creates a Path B account and sets an httpOnly session cookie', async () => {
  const res = await authPost('/api/auth/register').send({
    name: 'Test User', email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.user.role, 'user', 'Public registration must always default to the user role');
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('kw_token='));
  assert.ok(cookie, 'Login must set the kw_token cookie');
  assert.match(cookie, /HttpOnly/i);

  const user = await User.findOne({ email: 'testuser@example.com' });
  assert.ok(user.password !== 'StrongPassw0rd!', 'Passwords must not be stored in plaintext');
  assert.match(user.password, /^\$2[aby]\$11\$/, 'Passwords must use salted bcrypt with the configured work factor');
  assert.strictEqual(await user.comparePassword('StrongPassw0rd!'), true);
  assert.strictEqual(await user.comparePassword('WrongPassword!'), false);
});

test('POST /api/auth/register rejects a duplicate email', async () => {
  const res = await authPost('/api/auth/register').send({
    name: 'Another User', email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 409);
});

test('Admin identity is reserved and registration cannot assign the Admin role', async () => {
  const admin = await User.create({
    name: 'Configured Admin',
    email: 'fixed-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });

  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = admin.email;
  try {
    const reserved = await authPost('/api/auth/register').send({
      name: 'Impersonator',
      email: ` ${admin.email.toUpperCase()} `,
      password: 'OtherPassw0rd!'
    });
    assert.strictEqual(reserved.status, 409);

    const ordinary = await authPost('/api/auth/register').send({
      name: 'Ordinary User',
      email: 'ordinary-role@example.com',
      password: 'StrongPassw0rd!',
      role: 'admin'
    });
    assert.strictEqual(ordinary.status, 201);
    assert.strictEqual(ordinary.body.user.role, 'user');

    const incorrect = await authPost('/api/auth/login').send({
      email: admin.email,
      password: 'WrongPassword!'
    });
    assert.strictEqual(incorrect.status, 401);

    const correct = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
    assert.strictEqual(correct.status, 200);
    assert.strictEqual(correct.body.user.role, 'admin');
    const adminCookie = correct.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

    const disallowedAdminCreate = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({
        name: 'Another Admin',
        email: 'another-admin@example.com',
        password: 'StrongPassw0rd!',
        role: 'admin'
      });
    assert.strictEqual(disallowedAdminCreate.status, 403);

    const reservedReviewerEmail = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({
        name: 'Reserved Email',
        email: admin.email,
        password: 'OtherPassw0rd!'
      });
    assert.strictEqual(reservedReviewerEmail.status, 409);

    const impersonatedEmail = await request(app)
      .patch(`/api/users/${ordinary.body.user.id}`)
      .set('Cookie', adminCookie)
      .send({ email: admin.email });
    assert.strictEqual(impersonatedEmail.status, 409);

    const changedAdminEmail = await request(app)
      .patch(`/api/users/${admin._id}`)
      .set('Cookie', adminCookie)
      .send({ email: 'alternate-admin@example.com' });
    assert.strictEqual(changedAdminEmail.status, 409);

    const deletedAdmin = await request(app)
      .delete(`/api/users/${admin._id}`)
      .set('Cookie', adminCookie);
    assert.strictEqual(deletedAdmin.status, 409);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
    await User.deleteOne({ _id: admin._id });
    await User.deleteOne({ email: 'ordinary-role@example.com' });
  }
});

test('Admin session is rejected when it does not match the configured Admin identity', async () => {
  const admin = await User.create({
    name: 'Session Admin',
    email: 'session-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = 'different-admin@example.com';
  try {
    const currentUser = await request(app).get('/api/auth/me').set('Cookie', cookie);
    assert.strictEqual(currentUser.status, 401);
    const adminOverview = await request(app).get('/api/reports/admin-overview').set('Cookie', cookie);
    assert.strictEqual(adminOverview.status, 401);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
    await User.deleteOne({ _id: admin._id });
  }
});

test('POST /api/auth/login rejects an incorrect password without revealing whether the account exists', async () => {
  const res = await authPost('/api/auth/login').send({
    email: 'testuser@example.com', password: 'WrongPassword!'
  });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, 'Invalid email or password');
});

test('POST /api/auth/login succeeds with the correct password', async () => {
  const res = await authPost('/api/auth/login').send({
    email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.user.email, 'testuser@example.com');
});

test('GET /api/auth/me requires authentication', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.status, 401);
});

test('Admin user CRUD updates account data, removes deleted users, and anonymizes report references', async () => {
  const admin = await User.create({
    name: 'Account Admin',
    email: 'account-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const created = await request(app)
    .post('/api/users')
    .set('Cookie', cookie)
    .send({
      name: 'Managed Reviewer',
      email: 'managed-reviewer@example.com',
      password: 'StrongPassw0rd!',
      role: 'reviewer'
    });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.role, 'reviewer');
  assert.strictEqual(created.body.password, undefined);

  const userId = created.body.id;
  const user = await User.findById(userId);
  const report = await Report.create({
    trackingReference: 'KW-USER01',
    title: 'User relation test',
    reportedCategory: 'Bribery',
    description: 'Verifies report relations survive account removal.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    user: user._id,
    claimedBy: user._id,
    archivedBy: user._id,
    statusHistory: [{ status: 'In Review', changedBy: user._id }],
    comments: [{ author: user._id, text: 'Reviewer note' }]
  });
  const otherUser = await User.create({
    name: 'Unrelated Account',
    email: 'unrelated-account@example.com',
    password: 'StrongPassw0rd!'
  });
  const otherReport = await Report.create({
    trackingReference: 'KW-USER02',
    title: 'Other user relation test',
    reportedCategory: 'Bribery',
    description: 'Verifies deleting one account preserves other account references.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    user: otherUser._id,
    claimedBy: user._id,
    archivedBy: otherUser._id,
    statusHistory: [
      { status: 'Received', changedBy: otherUser._id },
      { status: 'In Review', changedBy: user._id }
    ],
    comments: [
      { author: otherUser._id, text: 'Other reviewer note' },
      { author: user._id, text: 'Reviewer note' }
    ]
  });

  const updated = await request(app)
    .patch(`/api/users/${userId}`)
    .set('Cookie', cookie)
    .send({ name: 'Updated Reviewer', email: 'updated-reviewer@example.com' });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.body.name, 'Updated Reviewer');
  assert.strictEqual(updated.body.email, 'updated-reviewer@example.com');

  const promoted = await request(app)
    .patch(`/api/users/${userId}/role`)
    .set('Cookie', cookie)
    .send({ role: 'admin' });
  assert.strictEqual(promoted.status, 403);
  assert.strictEqual((await User.findById(userId)).role, 'reviewer');

  const listed = await request(app).get('/api/users').set('Cookie', cookie);
  const listedUser = listed.body.find((item) => item._id === userId);
  assert.ok(listedUser);
  assert.strictEqual(listedUser.password, undefined);

  const deleted = await request(app).delete(`/api/users/${userId}`).set('Cookie', cookie);
  assert.strictEqual(deleted.status, 204);
  assert.strictEqual(await User.findById(userId), null);
  const retainedReport = await Report.findById(report._id);
  assert.strictEqual(retainedReport.user, null);
  assert.strictEqual(retainedReport.claimedBy, null);
  assert.strictEqual(retainedReport.archivedBy, null);
  assert.strictEqual(retainedReport.statusHistory[0].changedBy, null);
  assert.strictEqual(retainedReport.comments[0].author, null);
  const retainedOtherReport = await Report.findById(otherReport._id);
  assert.strictEqual(retainedOtherReport.user.toString(), otherUser._id.toString());
  assert.strictEqual(retainedOtherReport.claimedBy, null);
  assert.strictEqual(retainedOtherReport.archivedBy.toString(), otherUser._id.toString());
  assert.strictEqual(retainedOtherReport.statusHistory[0].changedBy.toString(), otherUser._id.toString());
  assert.strictEqual(retainedOtherReport.statusHistory[1].changedBy, null);
  assert.strictEqual(retainedOtherReport.comments[0].author.toString(), otherUser._id.toString());
  assert.strictEqual(retainedOtherReport.comments[1].author, null);
  assert.ok((await request(app).get('/api/users').set('Cookie', cookie)).body.every((item) => item._id !== userId));
  await User.deleteOne({ _id: admin._id });
  await User.deleteOne({ _id: otherUser._id });
});

test('Admins cannot delete themselves or remove the last Admin', async () => {
  const admin = await User.create({
    name: 'Sole Admin',
    email: 'sole-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const selfDelete = await request(app).delete(`/api/users/${admin._id}`).set('Cookie', cookie);
  assert.strictEqual(selfDelete.status, 409);

  const demoteAdmin = await request(app)
    .patch(`/api/users/${admin._id}/role`)
    .set('Cookie', cookie)
    .send({ role: 'reviewer' });
  assert.strictEqual(demoteAdmin.status, 409);

  const deleteLastAdmin = await request(app).delete(`/api/users/${admin._id}`).set('Cookie', cookie);
  assert.strictEqual(deleteLastAdmin.status, 409);
  assert.ok(await User.findById(admin._id));
});
