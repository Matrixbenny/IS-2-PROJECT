const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const Report = require('../report.model');
const User = require('../user.model');
const { hashRecordingToken } = require('../utils/recordingToken');

// A dedicated test database - never touches the real kenya_watch dev data.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';

let app;

test.before(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
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
