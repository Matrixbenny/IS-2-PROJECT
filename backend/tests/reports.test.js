const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');

// A dedicated test database - never touches the real kenya_watch dev data.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27018/kenya_watch_test';

let app;

test.before(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

// Fetches a real challenge and solves it, since the answer is only ever revealed as
// "What is X + Y?" - this exercises the actual verify path rather than bypassing it.
async function solvedCaptcha() {
  const res = await request(app).get('/api/reports/captcha-challenge');
  const match = res.body.question.match(/(\d+) \+ (\d+)/);
  const answer = Number(match[1]) + Number(match[2]);
  return { captchaToken: res.body.token, captchaAnswer: answer };
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

test('POST /api/reports accepts a valid anonymous submission and issues a Tracking Reference + Access Key', async () => {
  const captcha = await solvedCaptcha();
  const res = await request(app).post('/api/reports').send({
    title: 'Backend test submission',
    reportedCategory: 'Bribery',
    description: 'A sufficiently detailed description for an automated backend test case.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    ...captcha
  });
  assert.strictEqual(res.status, 201);
  assert.match(res.body.trackingReference, /^KW-[A-Z0-9]{6}$/);
  assert.ok(res.body.accessKey, 'Path A submissions must receive an Access Key');
});

test('GET /api/reports (public list) never exposes the narrative description', async () => {
  const res = await request(app).get('/api/reports');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
  for (const report of res.body) {
    assert.strictEqual(report.description, undefined, 'General tier must not include the description field');
  }
});
