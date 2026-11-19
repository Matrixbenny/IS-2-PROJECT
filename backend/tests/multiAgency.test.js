const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const Report = require('../report.model');
const User = require('../user.model');
const { AGENCIES, slugify } = require('../utils/agencies');
const { hashSecret } = require('../utils/tracking');
const { migrateLegacyReferrals } = require('../utils/migrateReferrals');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';
const EACC = AGENCIES[0];
const DCI = AGENCIES[1];

let app;
let reviewer;
let reviewerCookie;
let adminCookie;
let eaccCookie;
let dciCookie;
let report;

async function cookieFrom(response) {
  return response.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
}

async function makeOfficer(email, password, agency) {
  await User.create({
    name: `Officer ${email}`,
    email,
    password,
    role: 'agency',
    agencySlug: slugify(agency.name),
    agencyVerificationReference: 'Test liaison record',
    agencyVerifiedAt: new Date(),
    agencyInvitationAcceptedAt: new Date()
  });
  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.strictEqual(login.status, 200, JSON.stringify(login.body));
  return cookieFrom(login);
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  process.env.ADMIN_EMAIL = 'multi-admin@example.com';
  delete process.env.ADMIN_PASSWORD_HASH;
  await User.create({ name: 'Multi Admin', email: 'multi-admin@example.com', password: 'StrongAdminPass1!', role: 'admin' });
  adminCookie = await cookieFrom(await request(app).post('/api/auth/login').send({
    email: 'multi-admin@example.com', password: 'StrongAdminPass1!'
  }));
  reviewer = await User.create({ name: 'Multi Reviewer', email: 'multi-reviewer@example.com', password: 'ReviewerPass1!', role: 'reviewer' });
  reviewerCookie = await cookieFrom(await request(app).post('/api/auth/login').send({
    email: 'multi-reviewer@example.com', password: 'ReviewerPass1!'
  }));
  eaccCookie = await makeOfficer('multi-eacc@example.gov', 'OfficerPass1!x', EACC);
  dciCookie = await makeOfficer('multi-dci@example.gov', 'OfficerPass1!y', DCI);

  report = await Report.create({
    trackingReference: 'KW-MULTI1',
    accessKeyHash: await hashSecret('multi-key'),
    title: 'Land transfer with a bribe and a forged deed',
    reportedCategory: 'Bribery',
    additionalCategories: ['Fraud/Forgery of Documents'],
    description: 'The registry officer took a payment and a forged title deed was used to move the land.',
    county: 'Kiambu',
    subCounty: 'Thika',
    status: 'In Review'
  });
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

const brief = 'Allegation of a payment to a registry officer and use of a forged title deed to transfer land.';

test('routing suggestions stay hidden until the reviewer records an independent assessment', async () => {
  const early = await request(app).get(`/api/reports/${report._id}/routing-suggestion`).set('Cookie', reviewerCookie);
  assert.strictEqual(early.status, 409);

  await Report.updateOne({ _id: report._id }, {
    $push: { 'categoryReview.annotations': { reviewer: reviewer._id, decision: 'category', category: 'Bribery' } }
  });
  const suggestion = await request(app).get(`/api/reports/${report._id}/routing-suggestion`).set('Cookie', reviewerCookie);
  assert.strictEqual(suggestion.status, 200, JSON.stringify(suggestion.body));
  const recommended = suggestion.body.agencies.filter((a) => a.recommended).map((a) => a.name);
  assert.deepStrictEqual(recommended.sort(), [DCI.name, EACC.name].sort());
  assert.strictEqual(suggestion.body.multiAgency, true);
  assert.strictEqual(suggestion.body.agencies.every((a) => a.available !== undefined), true);
  assert.strictEqual(suggestion.body.advisoryOnly, true);
});

test('a case is referred to two agencies at once, each with its own case file', async () => {
  const evidenceId = new mongoose.Types.ObjectId();
  await Report.updateOne({ _id: report._id }, {
    $push: { evidence: { _id: evidenceId, gridFsId: new mongoose.Types.ObjectId(), filename: 'deed.pdf', type: 'document' } }
  });

  // Releasing evidence requires the reviewer to confirm they reviewed it.
  const unreviewed = await request(app).post(`/api/reports/${report._id}/refer`).set('Cookie', reviewerCookie).send({
    agency: DCI.name, referralSummary: brief, transferConfirmed: true, releaseEvidenceIds: [evidenceId.toString()]
  });
  assert.strictEqual(unreviewed.status, 400);
  assert.match(unreviewed.body.error, /reviewed every file/);

  await request(app).post(`/api/reports/${report._id}/refer`).set('Cookie', reviewerCookie).send({
    agency: EACC.name, referralSummary: brief, transferConfirmed: true, releaseNarrative: true
  }).expect(200);
  const second = await request(app).post(`/api/reports/${report._id}/refer`).set('Cookie', reviewerCookie).send({
    agency: DCI.name, referralSummary: brief, transferConfirmed: true,
    releaseEvidenceIds: [evidenceId.toString()], evidenceReviewed: true
  });
  assert.strictEqual(second.status, 200, JSON.stringify(second.body));
  assert.strictEqual(second.body.agencyReferrals.length, 2);
  // Both suggestions were followed, and that is recorded for later measurement.
  assert.deepStrictEqual(second.body.routingFeedback.map((item) => item.followedSuggestion), [true, true]);

  const eaccView = await request(app).get('/api/agency-portal/cases').set('Cookie', eaccCookie);
  assert.match(eaccView.body[0].caseFile.narrative, /registry officer/);
  assert.strictEqual(eaccView.body[0].caseFile.evidence.length, 0);
  assert.deepStrictEqual(eaccView.body[0].alsoReferredTo, [DCI.name]);
  const dciView = await request(app).get('/api/agency-portal/cases').set('Cookie', dciCookie);
  assert.strictEqual(dciView.body[0].caseFile.narrative, null);
  assert.deepStrictEqual(dciView.body[0].caseFile.evidence.map((file) => file.filename), ['deed.pdf']);
});

test('the report stays open until every agency has closed, then resolves with each outcome visible', async () => {
  const closeBody = (reference, summary) => ({
    status: 'closed', note: 'Finished.', outcome: 'investigated_no_action',
    outcomeReference: reference, outcomeSummary: summary
  });
  for (const cookie of [eaccCookie, dciCookie]) {
    await request(app).post(`/api/agency-portal/cases/${report._id}/updates`).set('Cookie', cookie)
      .send({ status: 'acknowledged', note: 'Received.' }).expect(201);
  }

  const first = await request(app).post(`/api/agency-portal/cases/${report._id}/updates`).set('Cookie', eaccCookie)
    .send(closeBody('EACC/INV/1', 'We investigated the bribery allegation and found insufficient evidence to charge.'));
  assert.strictEqual(first.status, 201, JSON.stringify(first.body));
  assert.strictEqual(first.body.resolved, false);
  assert.match(first.body.message, /1 other agency is still working/);
  assert.strictEqual((await Report.findById(report._id)).status, 'In Review');

  const midway = await request(app).get('/api/reports/track').query({ ref: 'KW-MULTI1', key: 'multi-key' });
  assert.strictEqual(midway.body.status, 'In Review');
  const eaccProgress = midway.body.agencyReferrals.find((item) => item.agency === EACC.name);
  const dciProgress = midway.body.agencyReferrals.find((item) => item.agency === DCI.name);
  assert.strictEqual(eaccProgress.outcome, 'investigated_no_action');
  assert.strictEqual(dciProgress.outcome, null);

  const last = await request(app).post(`/api/agency-portal/cases/${report._id}/updates`).set('Cookie', dciCookie)
    .send({ ...closeBody('DCI/FILE/9', 'The forged deed was traced and the file has been sent for prosecution.'), outcome: 'referred_elsewhere' });
  assert.strictEqual(last.body.resolved, true);
  assert.strictEqual((await Report.findById(report._id)).status, 'Resolved');
});

test('an Admin can reopen a closed referral and the report leaves Resolved', async () => {
  const saved = await Report.findById(report._id);
  const dciReferral = saved.agencyReferrals.find((item) => item.agency === DCI.name);

  const byReviewer = await request(app)
    .post(`/api/reports/${report._id}/referrals/${dciReferral._id}/reopen`)
    .set('Cookie', reviewerCookie).send({ reason: 'New evidence has come to light on this matter.' });
  assert.strictEqual(byReviewer.status, 403);

  const tooShort = await request(app)
    .post(`/api/reports/${report._id}/referrals/${dciReferral._id}/reopen`)
    .set('Cookie', adminCookie).send({ reason: 'oops' });
  assert.strictEqual(tooShort.status, 400);

  await request(app)
    .post(`/api/reports/${report._id}/referrals/${dciReferral._id}/reopen`)
    .set('Cookie', adminCookie).send({ reason: 'New evidence has come to light on this matter.' })
    .expect(200);
  const reopened = await Report.findById(report._id);
  const after = reopened.agencyReferrals.find((item) => item.agency === DCI.name);
  assert.strictEqual(after.status, 'under_review');
  assert.strictEqual(after.reopenHistory.length, 1);
  assert.strictEqual(after.reopenHistory[0].previousOutcome, 'referred_elsewhere');
  assert.strictEqual(reopened.status, 'In Review');

  const view = await request(app).get('/api/agency-portal/cases').set('Cookie', dciCookie);
  assert.strictEqual(view.body[0].referralStatus, 'under_review');
  assert.strictEqual(view.body[0].resolution, null);
});

test('narrowing a case file stops the agency downloading a file that is no longer released', async () => {
  const saved = await Report.findById(report._id);
  const dciReferral = saved.agencyReferrals.find((item) => item.agency === DCI.name);
  const evidenceId = dciReferral.caseFile.evidence[0].evidenceId.toString();

  // The DCI has already worked the case, so only an Admin can take material back.
  await request(app)
    .patch(`/api/reports/${report._id}/referrals/${dciReferral._id}/case-file`)
    .set('Cookie', reviewerCookie)
    .send({ releaseNarrative: false, releaseCategoryDetails: false, releaseEvidenceIds: [] })
    .expect(403);
  await request(app)
    .patch(`/api/reports/${report._id}/referrals/${dciReferral._id}/case-file`)
    .set('Cookie', adminCookie)
    .send({ releaseNarrative: false, releaseCategoryDetails: false, releaseEvidenceIds: [] })
    .expect(200);
  const denied = await request(app)
    .get(`/api/agency-portal/cases/${report._id}/evidence/${evidenceId}`).set('Cookie', dciCookie);
  assert.strictEqual(denied.status, 403);
});

test('stale referrals and routing acceptance appear on the Admin overview', async () => {
  await Report.create({
    trackingReference: 'KW-STALE1',
    title: 'Referral nobody has acknowledged',
    reportedCategory: 'Bribery',
    description: 'This referral has been waiting for the agency for a long time now.',
    county: 'Nairobi',
    subCounty: 'Kibra',
    status: 'In Review',
    agencyReferrals: [{
      agency: EACC.name,
      referralSummary: brief,
      status: 'sent',
      referredAt: new Date(Date.now() - 5 * 24 * 3600 * 1000)
    }]
  });
  const overview = await request(app).get('/api/reports/admin-overview').set('Cookie', adminCookie);
  assert.strictEqual(overview.status, 200, JSON.stringify(overview.body));
  assert.ok(overview.body.agencyReferrals.staleReferrals.some((item) => item.trackingReference === 'KW-STALE1'));
  assert.ok(overview.body.agencyReferrals.routing.decisions >= 2);
  assert.ok(overview.body.agencyReferrals.routing.followedSuggestion >= 2);
});

test('legacy single-referral records are migrated without losing history', async () => {
  await mongoose.connection.db.collection('reports').insertOne({
    trackingReference: 'KW-OLD001',
    title: 'Old shape',
    reportedCategory: 'Bribery',
    description: 'A record stored before multi-agency referrals existed.',
    county: 'Nairobi',
    subCounty: 'Kibra',
    createdAt: new Date(),
    agencyReferral: {
      agency: EACC.name,
      referralSummary: brief,
      status: 'acknowledged',
      previousReferrals: [{ agency: DCI.name, referralSummary: brief, status: 'sent', agencyUpdates: [{ note: 'Earlier.' }] }]
    }
  });
  assert.strictEqual(await migrateLegacyReferrals(), 1);
  const migrated = await Report.findOne({ trackingReference: 'KW-OLD001' }).lean();
  assert.strictEqual(migrated.agencyReferral, undefined);
  assert.deepStrictEqual(migrated.agencyReferrals.map((item) => [item.agency, item.endedAt ? 'ended' : 'active']), [
    [DCI.name, 'ended'],
    [EACC.name, 'active']
  ]);
  assert.strictEqual(migrated.agencyReferrals[0].agencyUpdates[0].note, 'Earlier.');
  assert.strictEqual(await migrateLegacyReferrals(), 0, 'running the migration again changes nothing');
});
