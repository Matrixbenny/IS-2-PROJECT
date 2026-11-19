const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const Report = require('../report.model');
const User = require('../user.model');
const { getBucket } = require('../utils/gridfs');
const { hashRecordingToken } = require('../utils/recordingToken');
const { AGENCIES, slugify } = require('../utils/agencies');
const { verifyImageSelection } = require('../utils/imageCaptcha');

// A dedicated test database - never touches the real kenya_watch dev data.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';

let app;

// Test admins are seeded with a database password, so clear the environment hash
// (which may be set in the developer's .env) to make the seeded password authoritative.
async function loginAsAdmin(email, password) {
  process.env.ADMIN_EMAIL = email;
  delete process.env.ADMIN_PASSWORD_HASH;
  return request(app).post('/api/auth/login').send({ email, password });
}

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

function combinations(values, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix);
    return output;
  }
  for (let index = start; index <= values.length - (size - prefix.length); index++) {
    combinations(values, size, index + 1, [...prefix, values[index]], output);
  }
  return output;
}

async function solvedCaptcha() {
  const res = await request(app).get('/api/reports/captcha-image');
  assert.strictEqual(res.status, 200);
  let selected;
  for (let size = 2; size <= 5 && !selected; size++) {
    selected = combinations(Array.from({ length: 9 }, (_, index) => index), size)
      .find((ids) => verifyImageSelection(res.body.token, ids));
  }
  assert.ok(selected, 'image challenge should have a valid selection');
  return { captchaToken: res.body.token, captchaAnswer: JSON.stringify(selected) };
}

test('GET /api/reports/categories returns the fixed category list and fields', async () => {
  const res = await request(app).get('/api/reports/categories');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.categories));
  assert.ok(res.body.categories.includes('Bribery'));
  assert.ok(res.body.fields.Bribery.some((f) => f.name === 'officialRole'));
});

test('CAPTCHA endpoints issue challenge-only verification and remove the behavior bypass', async () => {
  const challenge = await request(app).get('/api/reports/captcha-image');
  assert.strictEqual(challenge.status, 200);
  assert.strictEqual(challenge.body.imageMode, true);
  assert.strictEqual(challenge.body.tiles.length, 9);

  const removedBypass = await request(app).post('/api/reports/captcha-verify').send({
    timeSpentMs: 60000,
    pointerMoves: 100,
    keyEvents: 100,
    hasPointer: true
  });
  assert.strictEqual(removedBypass.status, 404);
  assert.strictEqual(removedBypass.body.token, undefined);
});

test('GET /api/reports/admin-overview returns exact database counts and is Admin-only', async () => {
  const unauthorized = await request(app).get('/api/reports/admin-overview');
  assert.strictEqual(unauthorized.status, 401);

  const user = await User.create({
    name: 'Overview User',
    email: 'overview-user@example.com',
    password: 'StrongPassw0rd!'
  });
  const userLogin = await request(app).post('/api/auth/login').send({
    email: user.email,
    password: 'StrongPassw0rd!'
  });
  const userCookie = userLogin.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
  const forbidden = await request(app)
    .get('/api/reports/admin-overview')
    .set('Cookie', userCookie);
  assert.strictEqual(forbidden.status, 403);

  const attentionCases = await Report.create([
    {
      trackingReference: 'KW-OVRCR1',
      title: 'Critical unclaimed case',
      reportedCategory: 'Bribery',
      description: 'Critical unclaimed report for admin overview.',
      county: 'Nairobi',
      subCounty: 'Westlands',
      status: 'In Review',
      classification: { urgency: 'Critical', classifiedAt: new Date(Date.now() - 60 * 60 * 1000) },
      agencyReferrals: [{
        agency: 'Ethics and Anti-Corruption Commission (EACC)',
        referenceNumber: 'EACC-TEST-1',
        referredAt: new Date(),
        agencyUpdates: [{
          note: 'Acknowledgement received.',
          publicMessage: 'A reporter message awaiting moderation.',
          publicMessageStatus: 'pending'
        }]
      }]
    },
    {
      trackingReference: 'KW-OVRHI1',
      title: 'High unclaimed case',
      reportedCategory: 'Bribery',
      description: 'High priority unclaimed report for admin overview.',
      county: 'Nairobi',
      subCounty: 'Kibra',
      classification: { urgency: 'High', classifiedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
    },
    {
      trackingReference: 'KW-OVRCL1',
      title: 'Claimed critical case',
      reportedCategory: 'Bribery',
      description: 'Claimed cases should not appear in admin attention list.',
      county: 'Nairobi',
      subCounty: 'Kibra',
      claimedBy: user._id,
      classification: { urgency: 'Critical', classifiedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) }
    },
    {
      trackingReference: 'KW-OVRRE1',
      title: 'Resolved critical case',
      reportedCategory: 'Bribery',
      description: 'Resolved cases should not appear in admin attention list.',
      county: 'Nairobi',
      subCounty: 'Kibra',
      status: 'Resolved',
      classification: { urgency: 'Critical', classifiedAt: new Date(Date.now() - 4 * 60 * 60 * 1000) }
    },
    {
      trackingReference: 'KW-OVRAR1',
      title: 'Archived critical case',
      reportedCategory: 'Bribery',
      description: 'Archived cases should not appear in admin attention list.',
      county: 'Nairobi',
      subCounty: 'Kibra',
      archivedAt: new Date(),
      classification: { urgency: 'Critical', classifiedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) }
    }
  ]);

  const admin = await User.create({
    name: 'Overview Admin',
    email: 'overview-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const adminLogin = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  const adminCookie = adminLogin.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
  await User.create(AGENCIES.slice(0, 2).map((agency, index) => ({
    name: `Agency Officer ${index + 1}`,
    email: `agency-officer-${index + 1}@example.gov`,
    password: 'AgencyOfficerPass1!',
    role: 'agency',
    agencySlug: slugify(agency.name),
    agencyVerificationReference: `Test verification ${index + 1}`,
    agencyVerifiedBy: admin._id,
    agencyVerifiedAt: new Date(),
    agencyInvitationAcceptedAt: new Date(),
    isActive: true
  })));
  const response = await request(app)
    .get('/api/reports/admin-overview')
    .set('Cookie', adminCookie);
  assert.strictEqual(response.status, 200);

  const active = await Report.countDocuments({ archivedAt: null });
  const archived = await Report.countDocuments({ archivedAt: { $ne: null } });
  const statuses = await Report.aggregate([
    { $match: { archivedAt: null } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const roles = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  const statusCounts = Object.fromEntries(statuses.map(({ _id, count }) => [_id, count]));
  const roleCounts = Object.fromEntries(roles.map(({ _id, count }) => [_id, count]));

  assert.strictEqual(response.body.reports.active, active);
  assert.strictEqual(response.body.reports.archived, archived);
  assert.strictEqual(response.body.reports.total, active + archived);
  assert.deepStrictEqual(response.body.reports.byStatus, {
    Received: statusCounts.Received || 0,
    'In Review': statusCounts['In Review'] || 0,
    Resolved: statusCounts.Resolved || 0,
    Rejected: statusCounts.Rejected || 0
  });
  assert.deepStrictEqual(response.body.accounts, {
    total: Object.values(roleCounts).reduce((total, count) => total + count, 0),
    admins: roleCounts.admin || 0,
    reviewers: roleCounts.reviewer || 0,
    users: roleCounts.user || 0,
    agencyOfficers: roleCounts.agency || 0
  });
  assert.deepStrictEqual(
    response.body.attention.slice(0, 2).map((report) => report._id),
    attentionCases.slice(0, 2).map((report) => report._id.toString()),
    'unclaimed cases should be ranked by urgency before age'
  );
  assert.ok(response.body.attention.every((report) => ![
    attentionCases[2]._id.toString(),
    attentionCases[3]._id.toString(),
    attentionCases[4]._id.toString()
  ].includes(report._id)));
  assert.deepStrictEqual(response.body.agencyReferrals.byAgency, [{
    _id: 'Ethics and Anti-Corruption Commission (EACC)',
    reports: 1,
    updates: 1
  }]);
  assert.strictEqual(response.body.agencyReferrals.total, 1);
  assert.strictEqual(response.body.agencyReferrals.updates, 1);
  assert.strictEqual(response.body.agencyReferrals.pendingReporterMessages, 1);
  assert.strictEqual(response.body.agencyReferrals.messagesForReview[0].reportId, attentionCases[0]._id.toString());
  assert.strictEqual(response.body.agencyReferrals.recent[0]._id, attentionCases[0]._id.toString());

  const invalidAgency = await request(app)
    .post(`/api/reports/${attentionCases[0]._id}/refer`)
    .set('Cookie', adminCookie)
    .send({ agency: 'Not a configured agency' });
  assert.strictEqual(invalidAgency.status, 400);

  // A case can be referred to several agencies at once; the first stays active.
  const secondReferral = await request(app)
    .post(`/api/reports/${attentionCases[0]._id}/refer`)
    .set('Cookie', adminCookie)
    .send({
      agency: AGENCIES[1].name,
      referenceNumber: 'DCI-TEST-2',
      notes: 'Internal follow-up contact made.',
      referralSummary: 'A verified and minimal summary for the receiving agency to assess and follow up on the reported matter.',
      transferConfirmed: true
    });
  assert.strictEqual(secondReferral.status, 200);
  const activeNow = secondReferral.body.agencyReferrals.filter((item) => !item.endedAt);
  assert.deepStrictEqual(activeNow.map((item) => item.agency), [AGENCIES[0].name, AGENCIES[1].name]);
  const dci = activeNow.find((item) => item.agency === AGENCIES[1].name);
  assert.strictEqual(dci.agencyUpdates.length, 0);
  assert.strictEqual(dci.referenceNumber, 'DCI-TEST-2');
  assert.strictEqual(secondReferral.body.routingFeedback.length, 1);

  const duplicateReferral = await request(app)
    .post(`/api/reports/${attentionCases[0]._id}/refer`)
    .set('Cookie', adminCookie)
    .send({
      agency: AGENCIES[1].name,
      referralSummary: 'A duplicate packet should not silently restart a referral lifecycle.',
      transferConfirmed: true
    });
  assert.strictEqual(duplicateReferral.status, 409);

  // Ending the first referral (sent to the wrong place) keeps it as history and
  // withdraws its unreviewed reporter message.
  const eacc = activeNow.find((item) => item.agency === AGENCIES[0].name);
  const ended = await request(app)
    .post(`/api/reports/${attentionCases[0]._id}/referrals/${eacc._id}/end`)
    .set('Cookie', adminCookie)
    .send({ reason: 'transferred', note: 'Better handled by the DCI.' });
  assert.strictEqual(ended.status, 200);
  const afterEnd = await Report.findById(attentionCases[0]._id);
  assert.deepStrictEqual(afterEnd.activeReferrals().map((item) => item.agency), [AGENCIES[1].name]);
  const endedEacc = afterEnd.agencyReferrals.find((item) => item.agency === AGENCIES[0].name);
  assert.strictEqual(endedEacc.endReason, 'transferred');
  assert.strictEqual(endedEacc.agencyUpdates[0].publicMessageStatus, 'superseded');

  const legacyReferral = await Report.create({
    trackingReference: 'KW-LEGACY1',
    title: 'Legacy handoff needing a structured brief',
    reportedCategory: 'Bribery',
    description: 'An old demo referral must be deliberately prepared before portal access.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    agencyReferrals: [{
      agency: AGENCIES[0].name,
      agencyUpdates: [{ note: 'Earlier demo update.' }]
    }]
  });
  const upgradedLegacyReferral = await request(app)
    .post(`/api/reports/${legacyReferral._id}/refer`)
    .set('Cookie', adminCookie)
    .send({
      agency: AGENCIES[0].name,
      referralSummary: 'The reviewer has prepared a new minimum-data brief for the authorised agency portal.',
      transferConfirmed: true
    });
  assert.strictEqual(upgradedLegacyReferral.status, 200);
  const [oldEntry, newEntry] = upgradedLegacyReferral.body.agencyReferrals;
  assert.ok(oldEntry.endedAt);
  assert.strictEqual(oldEntry.agencyUpdates[0].note, 'Earlier demo update.');
  assert.strictEqual(newEntry.referralSummary.length > 40, true);
  assert.strictEqual(newEntry.endedAt, null);
});

test('POST /api/reports records additional wrongdoing types and rejects invalid ones', async () => {
  const base = {
    title: 'Bribe to hide missing funds',
    reportedCategory: 'Bribery',
    description: 'A finance officer was paid to hide funds that went missing from the ward account.',
    county: 'Nairobi',
    subCounty: 'Westlands'
  };
  const ok = await request(app).post('/api/reports').send({
    ...base,
    // The main category and "Other" are dropped; duplicates collapse.
    additionalCategories: JSON.stringify(['Embezzlement', 'Embezzlement', 'Bribery', 'Other']),
    ...(await solvedCaptcha())
  });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.deepStrictEqual((await Report.findById(ok.body.reportId)).additionalCategories, ['Embezzlement']);

  const invalid = await request(app).post('/api/reports').send({
    ...base,
    additionalCategories: JSON.stringify(['Not a category']),
    ...(await solvedCaptcha())
  });
  assert.strictEqual(invalid.status, 400);

  const tooMany = await request(app).post('/api/reports').send({
    ...base,
    additionalCategories: JSON.stringify(['Embezzlement', 'Procurement Fraud', 'Extortion', 'Nepotism/Favoritism']),
    ...(await solvedCaptcha())
  });
  assert.strictEqual(tooMany.status, 400);
});

test('POST /api/reports rejects a submission missing required fields', async () => {
  const res = await request(app).post('/api/reports').send({ title: 'Incomplete report' });
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /api/reports rejects an invalid category', async () => {
  const res = await request(app).post('/api/reports').send({
    title: 'Test',
    reportedCategory: 'Not A Real Category',
    description: 'This description is long enough to pass the minimum length check.',
    county: 'Nairobi',
    subCounty: 'Westlands'
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/reports rejects a description shorter than 20 characters', async () => {
  const res = await request(app).post('/api/reports').send({
    title: 'Test',
    reportedCategory: 'Bribery',
    description: 'Too short',
    county: 'Nairobi',
    subCounty: 'Westlands'
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/reports rejects a submission with a missing CAPTCHA answer', async () => {
  const res = await request(app).post('/api/reports').send({
    title: 'Test',
    reportedCategory: 'Bribery',
    description: 'This description is long enough to pass the minimum length check.',
    county: 'Nairobi',
    subCounty: 'Westlands'
  });
  assert.strictEqual(res.status, 400);
});

test('oversized live recording segments return a clear size error', async () => {
  const start = await request(app).post('/api/recordings').send({
    mediaType: 'audio',
    mimeType: 'audio/webm'
  });
  assert.strictEqual(start.status, 201);
  const response = await request(app)
    .post('/api/recordings/chunk')
    .set('X-Recording-Token', start.body.token)
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.alloc(5 * 1024 * 1024 + 1));
  assert.strictEqual(response.status, 413);
  assert.match(response.body.error, /5 MB/);
  const cancel = await request(app)
    .post('/api/recordings/cancel')
    .set('X-Recording-Token', start.body.token);
  assert.strictEqual(cancel.status, 204);
});

test('live recording chunks persist to GridFS before finish and attach to an anonymous report', async () => {
  const start = await request(app).post('/api/recordings').send({
    mediaType: 'audio',
    mimeType: 'audio/webm;codecs=opus'
  });
  assert.strictEqual(start.status, 201);
  const { token } = start.body;
  const sessionId = hashRecordingToken(token);
  const session = await mongoose.connection.db.collection('recordingSessions').findOne({ _id: sessionId });
  assert.ok(session);

  const chunk = Buffer.alloc(300000, 7);
  const chunkResponse = await request(app)
    .post('/api/recordings/chunk')
    .set('X-Recording-Token', token)
    .set('Content-Type', 'application/octet-stream')
    .send(chunk);
  assert.strictEqual(chunkResponse.status, 200);
  assert.strictEqual(session.bytesWritten, 0, 'the session read before upload must be unchanged');
  const activeSession = await mongoose.connection.db.collection('recordingSessions').findOne({ _id: sessionId });
  assert.strictEqual(activeSession.bytesWritten, chunk.length);
  assert.ok(
    await mongoose.connection.db.collection('evidence.chunks').countDocuments({ files_id: session.fileId }) > 0,
    'GridFS must already contain the recording chunk before the recorder is finalized'
  );

  const finish = await request(app)
    .post('/api/recordings/finish')
    .set('X-Recording-Token', token);
  assert.strictEqual(finish.status, 200);
  const storedFile = await mongoose.connection.db.collection('evidence.files').findOne({ _id: session.fileId });
  assert.strictEqual(storedFile.length, chunk.length);
  assert.strictEqual(storedFile.metadata.contentType, 'audio/webm;codecs=opus');

  const captcha = await solvedCaptcha();
  const reportResponse = await request(app).post('/api/reports').send({
    title: '  Live recording test  ',
    reportedCategory: 'Bribery',
    description: '  A detailed test report with a live audio recording attached.  ',
    county: '  Nairobi  ',
    subCounty: ' Westlands ',
    categorySpecificDetails: JSON.stringify({
      demandedOrOffered: '  KES 500  ',
      unexpectedField: 'This field is not part of the Bribery form'
    }),
    recordingToken: token,
    ...captcha
  });
  assert.strictEqual(reportResponse.status, 201);
  assert.match(reportResponse.body.trackingReference, /^KW-[A-Z0-9]{6}$/);
  assert.ok(reportResponse.body.accessKey, 'Anonymous submissions must receive an Access Key');
  const report = await Report.findById(reportResponse.body.reportId);
  assert.strictEqual(report.title, 'Live recording test');
  assert.strictEqual(report.description, 'A detailed test report with a live audio recording attached.');
  assert.strictEqual(report.county, 'Nairobi');
  assert.strictEqual(report.subCounty, 'Westlands');
  assert.deepStrictEqual(report.categorySpecificDetails, { demandedOrOffered: 'KES 500' });
  assert.ok(report.evidence.some((item) => item.gridFsId.toString() === session.fileId.toString()));
  const recordingEvidence = report.evidence.find((item) => item.gridFsId.toString() === session.fileId.toString());
  const parseBuffer = (response, callback) => {
    const chunks = [];
    response.on('data', (part) => chunks.push(part));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
  };
  const evidenceResponse = await request(app)
    .get(`/api/evidence/${report._id}/${recordingEvidence._id}`)
    .query({ ref: report.trackingReference, key: reportResponse.body.accessKey })
    .buffer(true)
    .parse(parseBuffer);
  assert.strictEqual(evidenceResponse.status, 200);
  assert.ok(evidenceResponse.headers['content-type'].startsWith('audio/webm'));
  assert.deepStrictEqual(evidenceResponse.body, chunk);
  assert.strictEqual(
    await mongoose.connection.db.collection('recordingSessions').countDocuments({ _id: sessionId }),
    0,
    'an attached recording session token should no longer be reusable'
  );
});

test('uploaded evidence bytes are stored unchanged in GridFS and downloaded unchanged', async () => {
  const originalFile = Buffer.from(
    '255044462d312e370a255acbcd0a312030206f626a0a3c3c202f54797065202f436174616c6f67203e3e0a656e646f626a0a2525454f460a',
    'hex'
  );
  const captcha = await solvedCaptcha();
  const response = await request(app)
    .post('/api/reports')
    .set('X-Forwarded-For', '198.51.100.17')
    .field('title', 'Exact evidence file')
    .field('reportedCategory', 'Bribery')
    .field('description', 'A detailed report to verify exact evidence file persistence.')
    .field('county', 'Nairobi')
    .field('subCounty', 'Westlands')
    .field('captchaToken', captcha.captchaToken)
    .field('captchaAnswer', captcha.captchaAnswer)
    .attach('evidence', originalFile, { filename: 'original.pdf', contentType: 'application/pdf' });

  assert.strictEqual(response.status, 201);
  const report = await Report.findById(response.body.reportId);
  assert.strictEqual(report.evidence.length, 1);
  const fileId = report.evidence[0].gridFsId;
  const storedFile = await mongoose.connection.db.collection('evidence.files').findOne({ _id: fileId });
  assert.strictEqual(storedFile.length, originalFile.length);
  assert.strictEqual(storedFile.filename, 'original.pdf');
  assert.ok(await mongoose.connection.db.collection('evidence.chunks').countDocuments({ files_id: fileId }) > 0);

  const downloadedResponse = await request(app)
    .get(`/api/evidence/${report._id}/${report.evidence[0]._id}`)
    .query({ ref: report.trackingReference, key: response.body.accessKey })
    .buffer(true)
    .parse((stream, callback) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  assert.strictEqual(downloadedResponse.status, 200);
  assert.deepStrictEqual(downloadedResponse.body, originalFile);
  assert.match(downloadedResponse.headers['content-disposition'], /original\.pdf/);

  const downloaded = await new Promise((resolve, reject) => {
    const chunks = [];
    getBucket().openDownloadStream(fileId)
      .on('data', (chunk) => chunks.push(chunk))
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)));
  });
  assert.deepStrictEqual(downloaded, originalFile);
});

test('GET /api/reports (public list) never exposes the narrative description', async () => {
  const res = await request(app).get('/api/reports');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
  for (const report of res.body) {
    assert.strictEqual(report.description, undefined, 'General tier must not include the description field');
  }
});

test('DELETE /api/reports/:id archives a report, retaining its audit record and hiding it from active views', async () => {
  const report = await Report.create({
    trackingReference: 'KW-ARCH01',
    title: 'Archive test report',
    reportedCategory: 'Bribery',
    description: 'A report used to verify audit-preserving deletion behavior.',
    county: 'Nairobi',
    subCounty: 'Westlands'
  });
  const admin = await User.create({
    name: 'Test Admin',
    email: 'archive-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const unauthorized = await request(app).delete(`/api/reports/${report._id}`);
  assert.strictEqual(unauthorized.status, 401);

  const updated = await request(app)
    .patch(`/api/reports/${report._id}/status`)
    .set('Cookie', cookie)
    .send({ status: 'In Review' });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual((await Report.findById(report._id)).status, 'In Review');

  const archived = await request(app)
    .delete(`/api/reports/${report._id}`)
    .set('Cookie', cookie);
  assert.strictEqual(archived.status, 204);

  const retained = await Report.findById(report._id);
  assert.ok(retained.archivedAt);
  assert.strictEqual(retained.archivedBy.toString(), admin._id.toString());
  assert.strictEqual((await request(app).get(`/api/reports/${report._id}`)).status, 404);

  const publicList = await request(app).get('/api/reports');
  assert.ok(!publicList.body.some((item) => item._id === report._id.toString()));
});

test('DELETE /api/reports/:id refuses to archive reports under legal hold', async () => {
  const report = await Report.create({
    trackingReference: 'KW-HOLD01',
    title: 'Legal hold test report',
    reportedCategory: 'Bribery',
    description: 'A report used to verify legal holds prevent archiving.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    legalHold: true
  });
  const admin = await User.create({
    name: 'Legal Hold Admin',
    email: 'legal-hold-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const archived = await request(app)
    .delete(`/api/reports/${report._id}`)
    .set('Cookie', cookie);
  assert.strictEqual(archived.status, 409);
  assert.strictEqual((await Report.findById(report._id)).archivedAt, null);
});

test('archived reports can be restored or permanently deleted with their GridFS evidence', async () => {
  const admin = await User.create({
    name: 'Archive Lifecycle Admin',
    email: 'archive-lifecycle-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const report = await Report.create({
    trackingReference: 'KW-LIFEC01',
    title: 'Archived lifecycle test',
    reportedCategory: 'Bribery',
    description: 'A report used to test restore and permanent deletion.',
    county: 'Nairobi',
    subCounty: 'Westlands'
  });
  const bucket = getBucket();
  const fileId = new mongoose.Types.ObjectId();
  await new Promise((resolve, reject) => {
    const stream = bucket.openUploadStreamWithId(fileId, 'lifecycle-evidence.pdf');
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(Buffer.from('stored evidence'));
  });
  report.evidence.push({ gridFsId: fileId, filename: 'lifecycle-evidence.pdf', type: 'document' });
  report.archivedAt = new Date();
  await report.save();

  const archivedList = await request(app).get('/api/reports/archived').set('Cookie', cookie);
  assert.ok(archivedList.body.some((item) => item._id === report._id.toString()));

  const restored = await request(app)
    .patch(`/api/reports/${report._id}/restore`)
    .set('Cookie', cookie);
  assert.strictEqual(restored.status, 200);
  assert.strictEqual((await Report.findById(report._id)).archivedAt, null);
  assert.strictEqual((await request(app).get(`/api/reports/${report._id}`)).status, 200);

  await request(app).delete(`/api/reports/${report._id}`).set('Cookie', cookie).expect(204);
  const permanent = await request(app)
    .delete(`/api/reports/${report._id}/permanent`)
    .set('Cookie', cookie);
  assert.strictEqual(permanent.status, 204);
  assert.strictEqual(await Report.findById(report._id), null);
  assert.strictEqual(await mongoose.connection.db.collection('evidence.files').findOne({ _id: fileId }), null);
  assert.strictEqual(await mongoose.connection.db.collection('evidence.chunks').countDocuments({ files_id: fileId }), 0);
});

// ---------------------------------------------------------------------------
// Security-critical regressions (fix #11): the two behaviors most likely to be
// broken silently by a future edit are (a) evidence authorization and (b)
// captcha fail-closed verification. These tests pin both.

test('GET /api/evidence rejects unauthenticated, wrong-key, and wrong-report access', async () => {
  // A Path A report with a known Access Key and one uploaded file.
  const captcha = await solvedCaptcha();
  const unique = Date.now();
  const created = await request(app)
    .post('/api/reports')
    .field('title', `Evidence auth test ${unique}`)
    .field('reportedCategory', 'Bribery')
    .field('description', 'Security regression test for the evidence authorization rules.')
    .field('county', 'Nairobi')
    .field('subCounty', 'Central')
    .field('captchaToken', captcha.captchaToken)
    .field('captchaAnswer', captcha.captchaAnswer)
    .attach('evidence', Buffer.from('secret-evidence-bytes'), { filename: 'secret-note.pdf', contentType: 'application/pdf' });
  assert.strictEqual(created.status, 201);
  const report = await Report.findById(created.body.reportId);
  assert.ok(report.evidence.length >= 1);
  const evidenceUrl = `/api/evidence/${report._id}/${report.evidence[0]._id}`;

  // 1. No credentials at all -> 403 (never leak whether the file exists).
  const anonymous = await request(app).get(evidenceUrl);
  assert.strictEqual(anonymous.status, 403);

  // 2. Correct reference but WRONG access key -> 403.
  const wrongKey = await request(app).get(evidenceUrl)
    .query({ ref: report.trackingReference, key: 'wrong-key ENTIRELY' });
  assert.strictEqual(wrongKey.status, 403);

  // 3. Valid key but WRONG tracking reference -> 403.
  const wrongRef = await request(app).get(evidenceUrl)
    .query({ ref: 'KW-AAAAAA', key: created.body.accessKey });
  assert.strictEqual(wrongRef.status, 403);

  // 4. Correct pair -> 200 with the exact stored bytes.
  const correct = await request(app).get(evidenceUrl)
    .query({ ref: report.trackingReference, key: created.body.accessKey })
    .buffer(true);
  assert.strictEqual(correct.status, 200);
  assert.strictEqual(correct.body.toString(), 'secret-evidence-bytes');
});

test('captcha verification fails closed on tampered, wrong-signature, and wrong-answer tokens', async () => {
  const { generateChallenge, verifyChallenge } = require('../utils/captcha');

  // 1. Correct answer to a fresh text challenge passes.
  const challenge = generateChallenge();
  const payload = require('jsonwebtoken').decode(challenge.token);
  // Recover the answer from the question type generators deterministically:
  // brute-force small candidate spaces per layer until verifyChallenge returns true,
  // proving a valid answer IS accepted.
  let validAnswer = null;
  const candidates = [];
  for (let n = 0; n <= 30; n++) candidates.push(String(n));
  const wordCandidates = ['kenya', 'honesty', 'report', 'citizen', 'safari', 'justice', 'nairobi',
    'table', 'water', 'money', 'bread', 'grass', 'stone', 'chair', 'spoon', 'tiger', 'london',
    'fruit', 'animal', 'colour', 'city in kenya', 'mango', 'banana', 'orange', 'dog', 'cat',
    'rabbit', 'red', 'blue', 'green', 'kisumu', 'mombasa'];
  candidates.push(...wordCandidates);
  for (const candidate of candidates) {
    if (verifyChallenge(challenge.token, candidate)) { validAnswer = candidate; break; }
  }
  assert.ok(validAnswer, 'a genuinely correct answer must be accepted');

  // 2. A wrong answer to a valid token fails.
  assert.strictEqual(verifyChallenge(challenge.token, 'definitely-not-the-answer'), false);

  // 3. A tampered token (payload edited, signature stripped) fails closed.
  const [header, , signature] = challenge.token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ kind: 'challenge', answerHash: 'f' * 64 }))
    .toString('base64url');
  assert.strictEqual(verifyChallenge(`${header}.${forgedPayload}.${signature}`, validAnswer), false);

  // 4. A token signed with the WRONG secret fails (simulates secret rotation attacks).
  const otherSecret = require('jsonwebtoken').sign(
    { kind: 'behavior' },
    'attacker-controlled-secret-that-is-not-ours'
  );
  assert.strictEqual(verifyChallenge(otherSecret, ''), false);

  // 5. An expired token fails. Sign one with a -1s lifetime using the real secret.
  const realSecret = process.env.CAPTCHA_SECRET || process.env.JWT_SECRET;
  const expired = require('jsonwebtoken').sign({ kind: 'behavior' }, realSecret, { expiresIn: -1 });
  assert.strictEqual(verifyChallenge(expired, ''), false);

  // 6. Garbage / empty tokens fail.
  assert.strictEqual(verifyChallenge('not-a-jwt', ''), false);
  assert.strictEqual(verifyChallenge('', ''), false);
});
