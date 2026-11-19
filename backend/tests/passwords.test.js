const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const User = require('../user.model');
const mailer = require('../utils/mailer');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';
let app;
let ip = 20;
const post = (path) => request(app).post(path).set('X-Forwarded-For', '203.0.113.' + (ip += 1));
const cookieOf = (res) => res.headers['set-cookie'].find((c) => c.startsWith('kw_token=')).split(';')[0];

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  app.set('trust proxy', 1);
});
test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

async function signIn(email, password) {
  const res = await post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return cookieOf(res);
}

test('a signed-in user can change their password and other devices are signed out', async () => {
  await User.create({ name: 'Change Me', email: 'change-me@example.com', password: 'OldPassw0rd!' });
  const laptop = await signIn('change-me@example.com', 'OldPassw0rd!');
  const phone = await signIn('change-me@example.com', 'OldPassw0rd!');
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', phone)).status, 200);

  const changed = await post('/api/auth/change-password').set('Cookie', laptop)
    .send({ currentPassword: 'OldPassw0rd!', newPassword: 'BrandNewPassw0rd!' });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const freshLaptop = cookieOf(changed);

  assert.equal((await request(app).get('/api/auth/me').set('Cookie', freshLaptop)).status, 200, 'this device stays signed in');
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', phone)).status, 401, 'other devices are signed out');
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', laptop)).status, 401, 'the old cookie no longer works');

  const oldLogin = await post('/api/auth/login').send({ email: 'change-me@example.com', password: 'OldPassw0rd!' });
  assert.equal(oldLogin.status, 401);
  await signIn('change-me@example.com', 'BrandNewPassw0rd!');
});

test('changing a password needs the right current password and a strong, different new one', async () => {
  await User.create({ name: 'Guard', email: 'guard@example.com', password: 'OldPassw0rd!' });
  const cookie = await signIn('guard@example.com', 'OldPassw0rd!');
  const attempt = (body) => post('/api/auth/change-password').set('Cookie', cookie).send(body);

  assert.equal((await post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: 'y' })).status, 401);
  assert.equal((await attempt({ currentPassword: 'WrongPassw0rd!', newPassword: 'BrandNewPassw0rd!' })).status, 400);
  assert.equal((await attempt({ currentPassword: 'OldPassw0rd!', newPassword: 'weak' })).status, 400);
  const same = await attempt({ currentPassword: 'OldPassw0rd!', newPassword: 'OldPassw0rd!' });
  assert.equal(same.status, 400);
  assert.match(same.body.error, /different/);
  // Nothing changed, so the original password still works and the session survived.
  await signIn('guard@example.com', 'OldPassw0rd!');
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', cookie)).status, 200);
});

test('resetting a forgotten password signs out sessions that were open before it', async (t) => {
  await User.create({ name: 'Forgetful', email: 'forgetful@example.com', password: 'OldPassw0rd!' });
  const stolen = await signIn('forgetful@example.com', 'OldPassw0rd!');
  const messages = [];
  t.mock.method(mailer, 'sendMail', async (message) => { messages.push(message); return { messageId: 'm' }; });

  await post('/api/auth/forgot-password').send({ email: 'forgetful@example.com' }).expect(200);
  const link = new URL(messages[0].text.match(/https?:\/\/[^\s]+/)[0]);
  const reset = await post('/api/auth/reset-password').send({
    email: link.searchParams.get('email'), token: link.searchParams.get('token'), newPassword: 'ResetPassw0rd!'
  });
  assert.equal(reset.status, 200);
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', stolen)).status, 401);
  await signIn('forgetful@example.com', 'ResetPassw0rd!');
});

test('agency officers receive a reset link that opens the Agency Case Portal', async (t) => {
  await User.create({
    name: 'Officer', email: 'officer-reset@example.gov', password: 'OldPassw0rd!', role: 'agency',
    agencySlug: 'ethics-and-anti-corruption-commission-eacc', agencyVerificationReference: 'T',
    agencyVerifiedAt: new Date(), agencyInvitationAcceptedAt: new Date()
  });
  const messages = [];
  t.mock.method(mailer, 'sendMail', async (message) => { messages.push(message); return { messageId: 'm' }; });
  process.env.AGENCY_PORTAL_ORIGIN = 'https://portal.example';
  try {
    await post('/api/auth/forgot-password').send({ email: 'officer-reset@example.gov' }).expect(200);
  } finally {
    delete process.env.AGENCY_PORTAL_ORIGIN;
  }
  const match = messages[0].text.match(/https:\/\/portal\.example\/agency-portal\/#reset\?email=([^&\s]+)&token=([0-9a-f]{64})/);
  assert.ok(match, messages[0].text);
  const reset = await post('/api/auth/reset-password').send({
    email: decodeURIComponent(match[1]), token: match[2], newPassword: 'OfficerNewPassw0rd!'
  });
  assert.equal(reset.status, 200);
});
