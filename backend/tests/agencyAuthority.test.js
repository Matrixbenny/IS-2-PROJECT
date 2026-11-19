const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const Report = require('../report.model');
const User = require('../user.model');
const { AGENCIES, slugify } = require('../utils/agencies');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';
const EACC = AGENCIES[0];
const brief = 'Allegation that a licensing clerk solicited a cash payment to process a permit in Westlands.';

let app;
let reviewerCookie;
let adminCookie;
let officerCookie;
let seq = 0;

async function cookieFrom(response) {
  return response.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
}

async function newCase(referralOverrides = {}) {
  seq += 1;
  return Report.create({
    trackingReference: 'KW-AUTH' + String(seq).padStart(2, '0'),
    title: 'Case ' + seq,
    reportedCategory: 'Bribery',
    description: 'A clerk demanded money before processing a permit in the ward office.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    status: 'In Review',
    agencyReferrals: [{ agency: EACC.name, referralSummary: brief, status: 'sent', referredAt: new Date(), ...referralOverrides }]
  });
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  process.env.ADMIN_EMAIL = 'authority-admin@example.com';
  delete process.env.ADMIN_PASSWORD_HASH;
  await User.create({ name: 'Authority Admin', email: 'authority-admin@example.com', password: 'StrongAdminPass1!', role: 'admin' });
  adminCookie = await cookieFrom(await request(app).post('/api/auth/login').send({
    email: 'authority-admin@example.com', password: 'StrongAdminPass1!'
  }));
  await User.create({ name: 'Authority Reviewer', email: 'authority-reviewer@example.com', password: 'ReviewerPass1!', role: 'reviewer' });
  reviewerCookie = await cookieFrom(await request(app).post('/api/auth/login').send({
    email: 'authority-reviewer@example.com', password: 'ReviewerPass1!'
  }));
  await User.create({
    name: 'Officer', email: 'authority-officer@example.gov', password: 'OfficerPass1!x', role: 'agency',
    agencySlug: slugify(EACC.name), agencyVerificationReference: 'T', agencyVerifiedAt: new Date(),
    agencyInvitationAcceptedAt: new Date()
  });
  officerCookie = await cookieFrom(await request(app).post('/api/auth/login').send({
    email: 'authority-officer@example.gov', password: 'OfficerPass1!x'
  }));
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('a reviewer cannot resolve or reject a case while an agency is still handling it', async () => {
  const report = await newCase();
  const resolve = await request(app).patch('/api/reports/' + report._id + '/status').set('Cookie', reviewerCookie)
    .send({ status: 'Resolved', resolutionNote: 'Closed by reviewer', resolutionReference: 'REF-1' });
  assert.equal(resolve.status, 409);
  assert.match(resolve.body.error, /agency is still handling/);
  const reject = await request(app).patch('/api/reports/' + report._id + '/status').set('Cookie', reviewerCookie)
    .send({ status: 'Rejected', rejectionReason: 'Not enough detail to proceed.' });
  assert.equal(reject.status, 409);
  // Moving between working states is still a reviewer decision.
  await request(app).patch('/api/reports/' + report._id + '/status').set('Cookie', reviewerCookie)
    .send({ status: 'In Review' }).expect(200);
  // An Admin can still intervene.
  await request(app).patch('/api/reports/' + report._id + '/status').set('Cookie', adminCookie)
    .send({ status: 'Rejected', rejectionReason: 'Duplicate of another case already handled.' }).expect(200);
});

test('a reviewer may end a referral only until the agency acts on it; after that only an Admin can', async () => {
  const report = await newCase();
  const referralId = report.agencyReferrals[0]._id;
  await request(app).post('/api/agency-portal/cases/' + report._id + '/updates').set('Cookie', officerCookie)
    .send({ status: 'acknowledged', note: 'We have taken this case.' }).expect(201);

  const url = '/api/reports/' + report._id + '/referrals/' + referralId + '/end';
  const byReviewer = await request(app).post(url).set('Cookie', reviewerCookie)
    .send({ reason: 'withdrawn', note: 'Reviewer would rather route it elsewhere.' });
  assert.equal(byReviewer.status, 403);
  assert.match(byReviewer.body.error, /Only an Admin/);
  await request(app).post(url).set('Cookie', adminCookie)
    .send({ reason: 'withdrawn', note: 'Admin confirmed it was sent in error.' }).expect(200);

  const fresh = await newCase();
  await request(app)
    .post('/api/reports/' + fresh._id + '/referrals/' + fresh.agencyReferrals[0]._id + '/end')
    .set('Cookie', reviewerCookie)
    .send({ reason: 'transferred', note: 'Misdirected before the agency saw it.' })
    .expect(200);
});

test('a reviewer can widen a released case file but cannot take material back after work begins', async () => {
  const report = await newCase({ caseFile: { narrative: report_text(), releasedAt: new Date() } });
  const referralId = report.agencyReferrals[0]._id;
  const url = '/api/reports/' + report._id + '/referrals/' + referralId + '/case-file';

  // Before the agency acts, a reviewer may narrow it.
  await request(app).patch(url).set('Cookie', reviewerCookie)
    .send({ releaseNarrative: false, releaseCategoryDetails: false, releaseEvidenceIds: [] }).expect(200);
  await request(app).patch(url).set('Cookie', reviewerCookie)
    .send({ releaseNarrative: true, releaseCategoryDetails: false, releaseEvidenceIds: [] }).expect(200);

  await request(app).post('/api/agency-portal/cases/' + report._id + '/updates').set('Cookie', officerCookie)
    .send({ status: 'acknowledged', note: 'We have taken this case.' }).expect(201);

  const narrow = await request(app).patch(url).set('Cookie', reviewerCookie)
    .send({ releaseNarrative: false, releaseCategoryDetails: false, releaseEvidenceIds: [] });
  assert.equal(narrow.status, 403);
  await request(app).patch(url).set('Cookie', adminCookie)
    .send({ releaseNarrative: false, releaseCategoryDetails: false, releaseEvidenceIds: [] }).expect(200);
});

function report_text() {
  return 'A clerk demanded money before processing a permit in the ward office.';
}

test('an agency can return a case outside its mandate, and it surfaces for rerouting', async () => {
  const report = await newCase();
  const url = '/api/agency-portal/cases/' + report._id + '/updates';
  const vague = await request(app).post(url).set('Cookie', officerCookie).send({ status: 'returned', note: 'Not ours.' });
  assert.equal(vague.status, 400);

  const returned = await request(app).post(url).set('Cookie', officerCookie)
    .send({ status: 'returned', note: 'This concerns a county procurement matter outside our mandate.' });
  assert.equal(returned.status, 201, JSON.stringify(returned.body));
  assert.equal(returned.body.returned, true);

  const saved = await Report.findById(report._id);
  assert.equal(saved.activeReferrals().length, 0);
  assert.equal(saved.agencyReferrals[0].endReason, 'declined');
  assert.match(saved.agencyReferrals[0].endNote, /outside our mandate/);

  const cases = await request(app).get('/api/agency-portal/cases').set('Cookie', officerCookie);
  assert.ok(!cases.body.some((item) => item.id === report._id.toString()), 'the agency no longer holds the case');

  const queue = await request(app).get('/api/reports/queue').set('Cookie', reviewerCookie);
  assert.equal(queue.body.find((item) => item._id === report._id.toString()).referralReturned, true);
  const overview = await request(app).get('/api/reports/admin-overview').set('Cookie', adminCookie);
  const row = overview.body.agencyReferrals.returnedForRerouting.find((item) => item.trackingReference === report.trackingReference);
  assert.ok(row);
  assert.match(row.reason, /outside our mandate/);
});

test('charges filed place the case under legal hold so court evidence cannot be removed', async () => {
  const report = await newCase();
  const url = '/api/agency-portal/cases/' + report._id + '/updates';
  await request(app).post(url).set('Cookie', officerCookie).send({ status: 'acknowledged', note: 'Received.' }).expect(201);
  await request(app).post(url).set('Cookie', officerCookie).send({
    status: 'closed', note: 'Charged.', outcome: 'investigated_charged', outcomeReference: 'EACC/INV/9',
    outcomeSummary: 'The clerk has been charged with soliciting a bribe and will appear in court.',
    legalBasis: 'ACECA 2003 section 39'
  }).expect(201);
  assert.equal((await Report.findById(report._id)).legalHold, true);
  const archive = await request(app).delete('/api/reports/' + report._id).set('Cookie', adminCookie);
  assert.equal(archive.status, 409);
});

test('public statistics show agency response only once enough referrals exist', async () => {
  const stats = await request(app).get('/api/stats/public');
  assert.equal(stats.status, 200);
  assert.ok(stats.body.justiceLoop.referred >= 1);
  // Fewer than the minimum have been handled, so no institution is named yet.
  assert.deepEqual(stats.body.justiceLoop.agencies, []);

  for (let i = 0; i < 5; i += 1) {
    await newCase({
      status: 'closed',
      referredAt: new Date(Date.now() - 48 * 3600 * 1000),
      agencyUpdates: [{ note: 'ack', status: 'acknowledged', createdAt: new Date(Date.now() - 24 * 3600 * 1000) }],
      resolution: { outcome: 'investigated_no_action' }
    });
  }
  const after = await request(app).get('/api/stats/public');
  const row = after.body.justiceLoop.agencies.find((item) => item.agency === EACC.name);
  assert.ok(row, 'EACC row appears');
  assert.ok(row.referred >= 5);
  assert.equal(row.medianHoursToAcknowledge >= 20 && row.medianHoursToAcknowledge <= 30, true);
  assert.ok(row.outcomes.investigated_no_action >= 5);
  // Nothing that could identify a case is exposed.
  assert.ok(!JSON.stringify(after.body.justiceLoop).includes('KW-AUTH'));
});
