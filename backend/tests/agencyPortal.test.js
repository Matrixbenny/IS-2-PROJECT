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

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';
const agency = AGENCIES[0];
const otherAgency = AGENCIES[1];
let app;
let admin;
let adminCookie;
let agencyOfficer;
let agencySessionCookie;
let report;

async function cookieFrom(response) {
  return response.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  process.env.ADMIN_EMAIL = 'agency-admin@example.com';
  // The seeded Admin signs in with its database password, so the environment hash
  // (possibly present in the developer's .env) must not override it.
  delete process.env.ADMIN_PASSWORD_HASH;
  admin = await User.create({
    name: 'Portal Admin',
    email: process.env.ADMIN_EMAIL,
    password: 'StrongAdminPass1!',
    role: 'admin'
  });
  adminCookie = await cookieFrom(await request(app).post('/api/auth/login').send({
    email: admin.email,
    password: 'StrongAdminPass1!'
  }));
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('Admin invites a verified named agency officer with a one-time setup link', async () => {
  const missingVerification = await request(app)
    .post('/api/users/agency-invitations')
    .set('Cookie', adminCookie)
    .send({
      name: 'Agency Officer',
      email: 'officer@example.gov',
      agencySlug: slugify(agency.name),
      verificationReference: 'Liaison record 4',
      identityVerified: false
    });
  assert.strictEqual(missingVerification.status, 400);

  const invitation = await request(app)
    .post('/api/users/agency-invitations')
    .set('Cookie', adminCookie)
    .send({
      name: 'Agency Officer',
      email: 'officer@example.gov',
      agencySlug: slugify(agency.name),
      verificationReference: 'Liaison record 4',
      identityVerified: true
    });
  assert.strictEqual(invitation.status, 201);
  assert.strictEqual(invitation.body.role, 'agency');
  assert.strictEqual(invitation.body.agencySlug, slugify(agency.name));
  assert.strictEqual(invitation.body.isActive, false);
  assert.ok(invitation.body.setupUrl);
  assert.strictEqual(invitation.body.password, undefined);

  const pendingLogin = await request(app).post('/api/auth/login').send({
    email: invitation.body.email,
    password: 'anything'
  });
  assert.strictEqual(pendingLogin.status, 401);
  const pendingAgencyList = await request(app)
    .get('/api/reports/agencies')
    .set('Cookie', adminCookie);
  assert.strictEqual(pendingAgencyList.status, 200);
  assert.ok(!pendingAgencyList.body.agencies.some((item) => item.slug === slugify(agency.name)));

  const reissued = await request(app)
    .post(`/api/users/${invitation.body.id}/agency-invitation`)
    .set('Cookie', adminCookie);
  assert.strictEqual(reissued.status, 200);
  assert.notStrictEqual(reissued.body.setupUrl, invitation.body.setupUrl);
  const expiredSetupUrl = new URL(invitation.body.setupUrl);
  const expiredActivation = await request(app).post('/api/auth/reset-password').send({
    email: expiredSetupUrl.searchParams.get('email'),
    token: expiredSetupUrl.searchParams.get('token'),
    newPassword: 'AgencyOfficerPass1!'
  });
  assert.strictEqual(expiredActivation.status, 400);

  const setupUrl = new URL(reissued.body.setupUrl);
  const activation = await request(app).post('/api/auth/reset-password').send({
    email: setupUrl.searchParams.get('email'),
    token: setupUrl.searchParams.get('token'),
    newPassword: 'AgencyOfficerPass1!'
  });
  assert.strictEqual(activation.status, 200);
  agencyOfficer = await User.findById(invitation.body.id);
  assert.strictEqual(agencyOfficer.isActive, true);
  assert.ok(agencyOfficer.agencyInvitationAcceptedAt);

  const roleLogin = await request(app).post('/api/auth/login').send({
    email: agencyOfficer.email,
    password: 'AgencyOfficerPass1!'
  });
  assert.strictEqual(roleLogin.status, 200);
  assert.strictEqual(roleLogin.body.user.role, 'agency');
  assert.strictEqual(roleLogin.body.user.agencySlug, slugify(agency.name));
  agencySessionCookie = await cookieFrom(roleLogin);
  const activeAgencyList = await request(app)
    .get('/api/reports/agencies')
    .set('Cookie', adminCookie);
  assert.ok(activeAgencyList.body.agencies.some((item) => item.slug === slugify(agency.name)));

  const roleEscalation = await request(app)
    .patch(`/api/users/${agencyOfficer._id}/role`)
    .set('Cookie', adminCookie)
    .send({ role: 'agency' });
  assert.strictEqual(roleEscalation.status, 403);
});

test('Agency portal is scoped, shares only a referral brief, and returns only approved reporter updates', async () => {
  const reporter = await User.create({
    name: 'Private reporter name',
    email: 'private-reporter@example.com',
    password: 'ReporterPass1!'
  });
  report = await Report.create({
    trackingReference: 'KW-AGY001',
    accessKeyHash: await hashSecret('private-tracking-key'),
    user: reporter._id,
    title: 'Sensitive internal title',
    reportedCategory: 'Bribery',
    categorySpecificDetails: { officialRole: 'Private narrative detail' },
    description: 'This detailed original complaint is not shared with agency officers.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    agencyReferrals: [{
      agency: agency.name,
      referralSummary: 'A reviewer-approved brief describing the reported procurement concern and requested oversight.',
      status: 'sent',
      referredAt: new Date(),
      notes: 'Internal liaison note not shared with the partner.'
    }],
    evidence: [{ gridFsId: new mongoose.Types.ObjectId(), filename: 'evidence.pdf', type: 'document' }]
  });
  await Report.create({
    trackingReference: 'KW-AGY002',
    title: 'Archived referral',
    reportedCategory: 'Bribery',
    description: 'Archived cases must not be available in the partner portal.',
    county: 'Nairobi',
    subCounty: 'Kibra',
    archivedAt: new Date(),
    agencyReferrals: [{ agency: agency.name, referralSummary: 'Archived referral details are unavailable to partners.' }]
  });
  await Report.create({
    trackingReference: 'KW-AGY003',
    title: 'Another agency case',
    reportedCategory: 'Embezzlement',
    description: 'A case for a different partner.',
    county: 'Nairobi',
    subCounty: 'Kibra',
    agencyReferrals: [{
      agency: otherAgency.name,
      referralSummary: 'This brief belongs to another institution and is not visible to this officer.'
    }]
  });
  await Report.create({
    trackingReference: 'KW-AGY006',
    title: 'Legacy unstructured referral',
    reportedCategory: 'Bribery',
    description: 'A previous demo referral has no new minimal-data packet yet.',
    county: 'Nairobi',
    subCounty: 'Kibera',
    agencyReferrals: [{ agency: agency.name }]
  });
  const otherOfficer = await User.create({
    name: 'Other Agency Officer',
    email: 'other-officer@example.gov',
    password: 'OtherOfficerPass1!',
    role: 'agency',
    agencySlug: slugify(otherAgency.name),
    agencyVerificationReference: 'Other liaison record',
    agencyVerifiedBy: admin._id,
    agencyVerifiedAt: new Date(),
    agencyInvitationAcceptedAt: new Date()
  });
  const otherLogin = await request(app).post('/api/auth/login').send({
    email: otherOfficer.email,
    password: 'OtherOfficerPass1!'
  });
  const otherCookie = await cookieFrom(otherLogin);

  const unauthorized = await request(app).get('/api/agency-portal/cases');
  assert.strictEqual(unauthorized.status, 401);

  const cases = await request(app)
    .get('/api/agency-portal/cases')
    .set('Cookie', agencySessionCookie);
  assert.strictEqual(cases.status, 200, JSON.stringify(cases.body));
  assert.deepStrictEqual(cases.body.map((item) => item.id), [report._id.toString()]);
  assert.strictEqual(cases.body[0].referralSummary, report.agencyReferrals[0].referralSummary);
  assert.strictEqual(cases.body[0].description, undefined);
  assert.strictEqual(cases.body[0].categorySpecificDetails, undefined);
  assert.strictEqual(cases.body[0].title, undefined);
  assert.strictEqual(cases.body[0].notes, undefined);
  assert.strictEqual(cases.body[0].referenceNumber, null);
  const evidenceAccess = await request(app)
    .get(`/api/evidence/${report._id}/${report.evidence[0]._id}`)
    .set('Cookie', agencySessionCookie);
  assert.strictEqual(evidenceAccess.status, 403);

  const wrongAgencyCases = await request(app)
    .get('/api/agency-portal/cases')
    .set('Cookie', otherCookie);
  assert.deepStrictEqual(wrongAgencyCases.body.map((item) => item.trackingReference), ['KW-AGY003']);
  assert.ok(!wrongAgencyCases.body.some((item) => item.id === report._id.toString()));
  const wrongAgencyUpdate = await request(app)
    .post(`/api/agency-portal/cases/${report._id}/updates`)
    .set('Cookie', otherCookie)
    .send({ status: 'acknowledged', note: 'This must not cross agency boundaries.' });
  assert.strictEqual(wrongAgencyUpdate.status, 404);

  const prematureStatus = await request(app)
    .post(`/api/agency-portal/cases/${report._id}/updates`)
    .set('Cookie', agencySessionCookie)
    .send({ status: 'under_review', note: 'Cannot skip acknowledgement.' });
  assert.strictEqual(prematureStatus.status, 409);

  const update = await request(app)
    .post(`/api/agency-portal/cases/${report._id}/updates`)
    .set('Cookie', agencySessionCookie)
    .send({
      status: 'acknowledged',
      referenceNumber: 'EACC-2026-44',
      note: 'The receiving desk has acknowledged the secure case packet.',
      publicMessage: 'Your report has been received by the responsible agency.'
    });
  assert.strictEqual(update.status, 201);
  const savedReport = await Report.findById(report._id);
  assert.strictEqual(savedReport.agencyReferrals[0].status, 'acknowledged');
  assert.strictEqual(savedReport.agencyReferrals[0].agencyUpdates[0].createdByEmail, agencyOfficer.email);
  assert.strictEqual(savedReport.agencyReferrals[0].agencyUpdates[0].publicMessageStatus, 'pending');

  const hiddenReporterMessage = await request(app)
    .get('/api/reports/track')
    .query({ ref: 'KW-AGY001', key: 'private-tracking-key' });
  assert.strictEqual(hiddenReporterMessage.status, 200);
  assert.strictEqual(hiddenReporterMessage.body.agencyReferrals[0].status, 'acknowledged');
  assert.deepStrictEqual(hiddenReporterMessage.body.agencyReferrals[0].updates, []);

  const approval = await request(app)
    .patch(`/api/agency-portal/cases/${report._id}/updates/${savedReport.agencyReferrals[0].agencyUpdates[0]._id}/review`)
    .set('Cookie', adminCookie)
    .send({ decision: 'approved' });
  assert.strictEqual(approval.status, 200);

  const visibleReporterMessage = await request(app)
    .get('/api/reports/track')
    .query({ ref: 'KW-AGY001', key: 'private-tracking-key' });
  assert.deepStrictEqual(visibleReporterMessage.body.agencyReferrals[0].updates.map((item) => item.message), [
    'Your report has been received by the responsible agency.'
  ]);
});

test('agency access can be deactivated without deleting referral audit attribution', async () => {
  const deactivated = await request(app)
    .patch(`/api/users/${agencyOfficer._id}/active`)
    .set('Cookie', adminCookie)
    .send({ isActive: false });
  assert.strictEqual(deactivated.status, 200);
  assert.strictEqual(deactivated.body.isActive, false);

  const rejectedRequest = await request(app)
    .get('/api/agency-portal/cases')
    .set('Cookie', agencySessionCookie);
  assert.strictEqual(rejectedRequest.status, 401);
  const reportAfterDeactivation = await Report.findById(report._id);
  assert.strictEqual(reportAfterDeactivation.agencyReferrals[0].agencyUpdates[0].createdByEmail, agencyOfficer.email);
});
