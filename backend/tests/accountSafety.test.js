const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const User = require('../user.model');
const Report = require('../report.model');
const mailer = require('../utils/mailer');
const { referralHealth, findOverdueReferrals, notifyNewReferral, sendOverdueReminders } = require('../utils/referralSla');
const { productionProblems } = require('../utils/productionChecks');
const { anonymizeExpired } = require('../utils/retention');
const { AGENCIES, slugify } = require('../utils/agencies');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';
const EACC = AGENCIES[0];
const DAY = 24 * 60 * 60 * 1000;
const realSend = mailer.sendMail;
let app;
let sent = [];

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  process.env.ADMIN_EMAIL = 'safety-admin@example.com';
  delete process.env.ADMIN_PASSWORD_HASH;
  await User.deleteMany({ email: /^safety-/ });
  await Report.deleteMany({ trackingReference: /^KW-SAFE/ });
  await User.create({ name: 'Safety Admin', email: 'safety-admin@example.com', password: 'StrongAdminPass1!', role: 'admin' });
  await User.create({ name: 'Safety Citizen', email: 'safety-citizen@example.com', password: 'CitizenPass1!x', role: 'user' });
  await User.create({
    name: 'Safety Officer', email: 'safety-officer@example.gov', password: 'OfficerPass1!x', role: 'agency',
    agencySlug: slugify(EACC.name), agencyVerificationReference: 'T', agencyVerifiedAt: new Date(),
    agencyInvitationAcceptedAt: new Date()
  });
  mailer.sendMail = async (message) => { sent.push(message); return { accepted: [message.to], rejected: [] }; };
});

test.beforeEach(() => { sent = []; });
test.after(async () => {
  mailer.sendMail = realSend;
  await User.deleteMany({ email: /^safety-/ });
  await Report.deleteMany({ trackingReference: /^KW-SAFE/ });
  await mongoose.disconnect();
});

test('with MFA on, an agency officer needs the emailed code to get a session', async () => {
  process.env.MFA_REQUIRED = 'true';
  try {
    const first = await request(app).post('/api/auth/login').send({ email: 'safety-officer@example.gov', password: 'OfficerPass1!x' });
    assert.equal(first.status, 202);
    assert.equal(first.body.mfaRequired, true);
    assert.equal(first.headers['set-cookie'], undefined, 'no session before the code is entered');
    const code = /\b(\d{6})\b/.exec(sent[0].text)[1];

    const wrong = await request(app).post('/api/auth/login/verify').send({ challengeId: first.body.challengeId, code: code === '000000' ? '111111' : '000000' });
    assert.equal(wrong.status, 401);
    const right = await request(app).post('/api/auth/login/verify').send({ challengeId: first.body.challengeId, code });
    assert.equal(right.status, 200);
    assert.ok(right.headers['set-cookie'].some((value) => value.startsWith('kw_token=')));
    const reuse = await request(app).post('/api/auth/login/verify').send({ challengeId: first.body.challengeId, code });
    assert.equal(reuse.status, 401, 'a code works once');
  } finally {
    delete process.env.MFA_REQUIRED;
  }
});

test('citizens are never asked for a code, and a code dies after five wrong guesses', async () => {
  process.env.MFA_REQUIRED = 'true';
  try {
    const citizen = await request(app).post('/api/auth/login').send({ email: 'safety-citizen@example.com', password: 'CitizenPass1!x' });
    assert.equal(citizen.status, 200);
    const first = await request(app).post('/api/auth/login').send({ email: 'safety-admin@example.com', password: 'StrongAdminPass1!' });
    assert.equal(first.status, 202);
    const code = /\b(\d{6})\b/.exec(sent[0].text)[1];
    const wrongCode = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/auth/login/verify').send({ challengeId: first.body.challengeId, code: wrongCode });
    }
    const late = await request(app).post('/api/auth/login/verify').send({ challengeId: first.body.challengeId, code });
    assert.equal(late.status, 401, 'the right code no longer works after too many wrong ones');
  } finally {
    delete process.env.MFA_REQUIRED;
  }
});

test('five wrong passwords lock the account for a while, even for the right password', async () => {
  for (let i = 0; i < 5; i += 1) {
    await request(app).post('/api/auth/login').send({ email: 'safety-citizen@example.com', password: 'wrong-password' });
  }
  const locked = await request(app).post('/api/auth/login').send({ email: 'safety-citizen@example.com', password: 'CitizenPass1!x' });
  assert.equal(locked.status, 429);
  await User.updateOne({ email: 'safety-citizen@example.com' }, { $set: { lockedUntil: null, failedLoginCount: 0 } });
  const open = await request(app).post('/api/auth/login').send({ email: 'safety-citizen@example.com', password: 'CitizenPass1!x' });
  assert.equal(open.status, 200);
});

test('referralHealth flags silent referrals and ignores ended or closed ones', () => {
  const now = new Date();
  const ago = (days) => new Date(now.getTime() - days * DAY);
  assert.equal(referralHealth({ status: 'sent', referredAt: ago(1), agencyUpdates: [] }, now), null);
  assert.equal(referralHealth({ status: 'sent', referredAt: ago(4), agencyUpdates: [] }, now).kind, 'unacknowledged');
  assert.equal(referralHealth({ status: 'under_review', referredAt: ago(40), agencyUpdates: [{ createdAt: ago(15) }] }, now).kind, 'stalled');
  assert.equal(referralHealth({ status: 'under_review', referredAt: ago(40), agencyUpdates: [{ createdAt: ago(2) }] }, now), null);
  assert.equal(referralHealth({ status: 'closed', referredAt: ago(90), agencyUpdates: [] }, now), null);
  assert.equal(referralHealth({ status: 'sent', referredAt: ago(90), endedAt: ago(1), agencyUpdates: [] }, now), null);
});

test('officers are told about a new referral by reference only, and reminded once per interval', async () => {
  const count = await notifyNewReferral(EACC.name, 'KW-SAFE01');
  assert.equal(count, 1);
  assert.match(sent[0].subject, /KW-SAFE01/);
  assert.doesNotMatch(sent[0].text, /clerk|bribe|demand/i, 'no case details by email');

  sent = [];
  await Report.create({
    trackingReference: 'KW-SAFE02', title: 'Stale', reportedCategory: 'Bribery',
    description: 'A clerk demanded money for a permit at the ward office.',
    county: 'Nairobi', subCounty: 'Westlands', status: 'In Review',
    agencyReferrals: [{ agency: EACC.name, referralSummary: 'x', status: 'sent', referredAt: new Date(Date.now() - 5 * DAY) }]
  });
  assert.ok((await findOverdueReferrals()).some((item) => item.trackingReference === 'KW-SAFE02'));
  const first = await sendOverdueReminders();
  assert.ok(first.reminded >= 1);
  assert.ok(sent.some((message) => /KW-SAFE02/.test(message.subject)));
  sent = [];
  await sendOverdueReminders();
  assert.equal(sent.filter((message) => /KW-SAFE02/.test(message.subject)).length, 0, 'not re-sent within the interval');
});

test('the overdue list is for Admins only', async () => {
  const anon = await request(app).get('/api/reports/overdue-referrals');
  assert.equal(anon.status, 401);
});

test('retention unlinks closed reports past the window but spares legal holds', async () => {
  const old = new Date(Date.now() - 200 * DAY);
  const owner = await User.findOne({ email: 'safety-citizen@example.com' });
  const base = {
    reportedCategory: 'Bribery', description: 'A clerk demanded money for a permit at the ward office.',
    county: 'Nairobi', subCounty: 'Westlands', status: 'Resolved', user: owner._id,
    statusHistory: [{ status: 'Resolved', changedAt: old }]
  };
  const free = await Report.create({ ...base, trackingReference: 'KW-SAFE03', title: 'Closed' });
  const held = await Report.create({ ...base, trackingReference: 'KW-SAFE04', title: 'Held', legalHold: true });
  await anonymizeExpired(90);
  assert.equal((await Report.findById(free._id)).user, null);
  assert.ok((await Report.findById(held._id)).user);
});

test('production refuses weak settings', () => {
  assert.deepEqual(productionProblems({ NODE_ENV: 'development' }), []);
  assert.ok(productionProblems({ NODE_ENV: 'production', JWT_SECRET: 'short' }).length >= 4);
  assert.deepEqual(productionProblems({
    NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48), SMTP_HOST: 'smtp.example.com',
    ADMIN_PASSWORD_HASH: 'hash', FRONTEND_ORIGIN: 'https://kenyawatch.example'
  }), []);
});
