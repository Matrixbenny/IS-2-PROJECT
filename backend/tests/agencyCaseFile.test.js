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
const { getBucket } = require('../utils/gridfs');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';
const agency = AGENCIES[0];
const otherAgency = AGENCIES[1];
const FILE_BYTES = Buffer.from('%PDF-1.4 released evidence bytes');

let app;
let reviewerCookie;
let officerCookie;
let otherOfficerCookie;
let report;
let releasedEvidenceId;
let withheldEvidenceId;

async function cookieFrom(response) {
  return response.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
}

async function makeOfficer(email, password, targetAgency) {
  await User.create({
    name: `Officer ${email}`,
    email,
    password,
    role: 'agency',
    agencySlug: slugify(targetAgency.name),
    agencyVerificationReference: 'Test liaison record',
    agencyVerifiedAt: new Date(),
    agencyInvitationAcceptedAt: new Date()
  });
  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.strictEqual(login.status, 200, JSON.stringify(login.body));
  return cookieFrom(login);
}

async function storeFile(filename) {
  const id = new mongoose.Types.ObjectId();
  await new Promise((resolve, reject) => {
    getBucket().openUploadStreamWithId(id, filename, { metadata: { contentType: 'application/pdf' } })
      .on('error', reject)
      .on('finish', resolve)
      .end(FILE_BYTES);
  });
  return id;
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  await User.create({
    name: 'Case File Reviewer',
    email: 'casefile-reviewer@example.com',
    password: 'ReviewerPass1!',
    role: 'reviewer'
  });
  reviewerCookie = await cookieFrom(await request(app).post('/api/auth/login').send({
    email: 'casefile-reviewer@example.com',
    password: 'ReviewerPass1!'
  }));
  officerCookie = await makeOfficer('casefile-officer@example.gov', 'OfficerPass1!x', agency);
  otherOfficerCookie = await makeOfficer('casefile-other@example.gov', 'OtherOfficer1!x', otherAgency);

  const reporter = await User.create({
    name: 'Anonymous-ish Reporter',
    email: 'casefile-reporter@example.com',
    password: 'ReporterPass1!',
    emailNotificationsOptIn: true
  });
  releasedEvidenceId = await storeFile('receipt.pdf');
  withheldEvidenceId = await storeFile('private-photo.pdf');
  report = await Report.create({
    trackingReference: 'KW-CASEF1',
    accessKeyHash: await hashSecret('casefile-key'),
    user: reporter._id,
    title: 'Clerk demanded a bribe',
    reportedCategory: 'Bribery',
    categorySpecificDetails: { officialRole: 'Licensing clerk', amountRequested: 5000 },
    description: 'The licensing clerk demanded KES 5,000 to process my permit.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    status: 'In Review',
    claimedBy: (await User.findOne({ email: 'casefile-reviewer@example.com' }))._id,
    evidence: [
      { gridFsId: releasedEvidenceId, filename: 'receipt.pdf', type: 'document' },
      { gridFsId: withheldEvidenceId, filename: 'private-photo.pdf', type: 'document' }
    ]
  });
  report = await Report.findById(report._id);
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('a reviewer releases a case file and the named officer receives exactly that file', async () => {
  const referral = await request(app)
    .post(`/api/reports/${report._id}/refer`)
    .set('Cookie', reviewerCookie)
    .send({
      agency: agency.name,
      referralSummary: 'Allegation that a licensing clerk solicited a cash payment to process a permit in Westlands.',
      transferConfirmed: true,
      releaseNarrative: true,
      releaseCategoryDetails: true,
      releaseEvidenceIds: [report.evidence[0]._id.toString()],
      evidenceReviewed: true,
      releaseReporterContact: true
    });
  assert.strictEqual(referral.status, 200, JSON.stringify(referral.body));
  releasedEvidenceId = report.evidence[0]._id.toString();
  withheldEvidenceId = report.evidence[1]._id.toString();

  const cases = await request(app).get('/api/agency-portal/cases').set('Cookie', officerCookie);
  assert.strictEqual(cases.status, 200);
  assert.strictEqual(cases.body.length, 1);
  const [item] = cases.body;
  assert.match(item.caseFile.narrative, /licensing clerk demanded KES 5,000/);
  assert.strictEqual(item.caseFile.categoryDetails.officialRole, 'Licensing clerk');
  assert.deepStrictEqual(item.caseFile.evidence.map((file) => file.filename), ['receipt.pdf']);
  assert.strictEqual(item.caseFile.reporterContact, true);
  assert.strictEqual(item.resolution, null);
  // The reporter's identity is never exposed in the portal payload.
  assert.ok(!JSON.stringify(item).includes('casefile-reporter@example.com'));
  assert.ok(!JSON.stringify(item).includes('Anonymous-ish Reporter'));

  // Opening the released case file is logged once, however often the portal refreshes.
  await request(app).get('/api/agency-portal/cases').set('Cookie', officerCookie);
  const logged = await Report.findById(report._id);
  const views = logged.agencyReferrals[0].accessLog.filter((entry) => entry.action === 'view_case_file');
  assert.strictEqual(views.length, 1);
  assert.strictEqual(views[0].userEmail, 'casefile-officer@example.gov');
});

test('only released evidence can be downloaded, only by the right agency, and each download is logged', async () => {
  const ok = await request(app)
    .get(`/api/agency-portal/cases/${report._id}/evidence/${releasedEvidenceId}`)
    .set('Cookie', officerCookie)
    .buffer(true)
    .parse((res, callback) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(ok.body, FILE_BYTES);
  assert.match(ok.headers['content-disposition'], /receipt\.pdf/);

  const withheld = await request(app)
    .get(`/api/agency-portal/cases/${report._id}/evidence/${withheldEvidenceId}`)
    .set('Cookie', officerCookie);
  assert.strictEqual(withheld.status, 403);

  const wrongAgency = await request(app)
    .get(`/api/agency-portal/cases/${report._id}/evidence/${releasedEvidenceId}`)
    .set('Cookie', otherOfficerCookie);
  assert.strictEqual(wrongAgency.status, 404);

  const anonymous = await request(app).get(`/api/agency-portal/cases/${report._id}/evidence/${releasedEvidenceId}`);
  assert.strictEqual(anonymous.status, 401);

  const saved = await Report.findById(report._id);
  const downloads = saved.agencyReferrals[0].accessLog.filter((entry) => entry.action === 'download_evidence');
  assert.strictEqual(downloads.length, 1);
  assert.strictEqual(downloads[0].filename, 'receipt.pdf');
});

test('an agency question reaches reviewers and Admins, and the answer returns to the officer', async () => {
  await request(app).post(`/api/agency-portal/cases/${report._id}/updates`).set('Cookie', officerCookie)
    .send({ status: 'acknowledged', note: 'Received and assigned to an investigator.' })
    .expect(201);

  const tooShort = await request(app)
    .post(`/api/agency-portal/cases/${report._id}/information-requests`)
    .set('Cookie', officerCookie).send({ question: 'when?' });
  assert.strictEqual(tooShort.status, 400);

  await request(app).post(`/api/agency-portal/cases/${report._id}/information-requests`)
    .set('Cookie', officerCookie)
    .send({ question: 'What date and time was the payment demanded?' })
    .expect(201);

  const queue = await request(app).get('/api/reports/queue').set('Cookie', reviewerCookie);
  const queued = queue.body.find((entry) => entry._id === report._id.toString());
  assert.strictEqual(queued.openInformationRequests, 1);

  const requests = await request(app).get(`/api/reports/${report._id}/information-requests`).set('Cookie', reviewerCookie);
  const requestId = requests.body.requests[0]._id;
  await request(app)
    .post(`/api/reports/${report._id}/information-requests/${requestId}/answer`)
    .set('Cookie', reviewerCookie)
    .send({ answer: 'The reporter says it was the morning of 3 March, at the counter.' })
    .expect(200);

  const cases = await request(app).get('/api/agency-portal/cases').set('Cookie', officerCookie);
  const [item] = cases.body;
  assert.strictEqual(item.informationRequests[0].status, 'answered');
  assert.match(item.informationRequests[0].answer, /3 March/);
});

test('closing a case requires a real outcome, then resolves the citizen\'s report with that outcome', async () => {
  const closeUrl = `/api/agency-portal/cases/${report._id}/updates`;
  const noOutcome = await request(app).post(closeUrl).set('Cookie', officerCookie)
    .send({ status: 'closed', note: 'Done.' });
  assert.strictEqual(noOutcome.status, 400);

  const chargedWithoutBasis = await request(app).post(closeUrl).set('Cookie', officerCookie).send({
    status: 'closed',
    note: 'Prosecution authorised.',
    outcome: 'investigated_charged',
    outcomeReference: 'EACC/INV/2026/117',
    outcomeSummary: 'The clerk has been charged with soliciting a bribe and will appear in court.'
  });
  assert.strictEqual(chargedWithoutBasis.status, 400);

  const closed = await request(app).post(closeUrl).set('Cookie', officerCookie).send({
    status: 'closed',
    note: 'Prosecution authorised by ODPP.',
    outcome: 'investigated_charged',
    outcomeReference: 'EACC/INV/2026/117',
    outcomeSummary: 'The clerk has been charged with soliciting a bribe and will appear in court.',
    legalBasis: 'ACECA 2003 section 39',
    courtsInvolved: 'Milimani Anti-Corruption Court'
  });
  assert.strictEqual(closed.status, 201, JSON.stringify(closed.body));
  assert.strictEqual(closed.body.resolved, true);

  // The citizen sees the result on their tracking page.
  const tracked = await request(app).get('/api/reports/track').query({ ref: 'KW-CASEF1', key: 'casefile-key' });
  assert.strictEqual(tracked.status, 200);
  assert.strictEqual(tracked.body.status, 'Resolved');
  assert.strictEqual(tracked.body.agencyReferrals[0].outcome, 'investigated_charged');
  assert.match(tracked.body.agencyReferrals[0].outcomeSummary, /charged with soliciting a bribe/);
  assert.strictEqual(tracked.body.agencyReferrals[0].legalBasis, 'ACECA 2003 section 39');

  // The officer's own view keeps the recorded outcome and offers no further actions.
  const cases = await request(app).get('/api/agency-portal/cases').set('Cookie', officerCookie);
  assert.strictEqual(cases.body[0].referralStatus, 'closed');
  assert.strictEqual(cases.body[0].resolution.outcomeReference, 'EACC/INV/2026/117');

  const reopen = await request(app).post(closeUrl).set('Cookie', officerCookie)
    .send({ status: 'under_review', note: 'Trying to reopen.' });
  assert.strictEqual(reopen.status, 409);
});
