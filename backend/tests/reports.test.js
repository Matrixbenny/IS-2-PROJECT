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

// A dedicated test database - never touches the real kenya_watch dev data.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';

let app;

test.before(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  app.set('trust proxy', 1);
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

// Use the same behavioral verification endpoint as the report form. When the
// interaction check is inconclusive, the endpoint returns a separate challenge.
async function solvedCaptcha() {
  const res = await request(app).post('/api/reports/captcha-verify').send({
    timeSpentMs: 5000,
    pointerMoves: 5,
    keyEvents: 0,
    honeypot: '',
    hasPointer: true
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.verified, true);
  return { captchaToken: res.body.token, captchaAnswer: '' };
}

test('GET /api/reports/categories returns the fixed category list and fields', async () => {
  const res = await request(app).get('/api/reports/categories');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.categories));
  assert.ok(res.body.categories.includes('Bribery'));
  assert.ok(res.body.fields.Bribery.some((f) => f.name === 'officialRole'));
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
      classification: { urgency: 'Critical', classifiedAt: new Date(Date.now() - 60 * 60 * 1000) }
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
  const adminLogin = await request(app).post('/api/auth/login').send({
    email: admin.email,
    password: 'StrongPassw0rd!'
  });
  const adminCookie = adminLogin.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
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
    users: roleCounts.user || 0
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
    .field('captchaAnswer', '')
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
  const login = await request(app).post('/api/auth/login').send({
    email: admin.email,
    password: 'StrongPassw0rd!'
  });
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
  const login = await request(app).post('/api/auth/login').send({
    email: admin.email,
    password: 'StrongPassw0rd!'
  });
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
  const login = await request(app).post('/api/auth/login').send({
    email: admin.email,
    password: 'StrongPassw0rd!'
  });
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
