const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const User = require('../user.model');
const LingoTerm = require('../lingo-term.model');
const { normaliseForMatching, detectLingoTerms, registerApprovedTerms } = require('../utils/kenyaLingo');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';
let app;
let reviewerCookie;
let adminCookie;
let citizenCookie;

async function cookieFrom(response) {
  return response.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
}
async function signIn(email, password) {
  return cookieFrom(await request(app).post('/api/auth/login').send({ email, password }));
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  process.env.ADMIN_EMAIL = 'lingo-admin@example.com';
  delete process.env.ADMIN_PASSWORD_HASH;
  await User.create({ name: 'Lingo Admin', email: 'lingo-admin@example.com', password: 'StrongAdminPass1!', role: 'admin' });
  await User.create({ name: 'Lingo Reviewer', email: 'lingo-reviewer@example.com', password: 'ReviewerPass1!', role: 'reviewer' });
  await User.create({ name: 'Lingo Citizen', email: 'lingo-citizen@example.com', password: 'CitizenPass1!' });
  adminCookie = await signIn('lingo-admin@example.com', 'StrongAdminPass1!');
  reviewerCookie = await signIn('lingo-reviewer@example.com', 'ReviewerPass1!');
  citizenCookie = await signIn('lingo-citizen@example.com', 'CitizenPass1!');
});

test.after(async () => {
  registerApprovedTerms({});
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

const suggestion = { term: 'Mchele ya Kazi', canonical: 'rushwa bribe job', meaning: 'Money paid to an official to be given a job.', language: 'Sheng' };

test('only reviewers and Admins can suggest terms, and suggestions must be plain vocabulary', async () => {
  assert.equal((await request(app).post('/api/lingo/suggestions').send(suggestion)).status, 401);
  assert.equal((await request(app).post('/api/lingo/suggestions').set('Cookie', citizenCookie).send(suggestion)).status, 403);

  const post = (body) => request(app).post('/api/lingo/suggestions').set('Cookie', reviewerCookie).send(body);
  assert.equal((await post({ ...suggestion, term: 'call 0712345678' })).status, 400, 'digits are refused');
  assert.equal((await post({ ...suggestion, term: 'http://x.example' })).status, 400, 'links are refused');
  assert.equal((await post({ ...suggestion, meaning: 'short' })).status, 400);
  assert.equal((await post({ ...suggestion, language: 'Klingon' })).status, 400);
  const builtIn = await post({ ...suggestion, term: 'hongo' });
  assert.equal(builtIn.status, 409, 'the built-in glossary already knows hongo');

  const created = await post(suggestion);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal((await post(suggestion)).status, 409, 'the same term cannot be suggested twice');
});

test('a suggestion has no effect until an Admin approves it, and then it takes effect immediately', async () => {
  assert.equal(normaliseForMatching('alitaka mchele ya kazi'), 'alitaka mchele ya kazi');

  const reviewerView = await request(app).get('/api/lingo/suggestions').set('Cookie', reviewerCookie);
  assert.equal(reviewerView.status, 403);
  const queue = await request(app).get('/api/lingo/suggestions').set('Cookie', adminCookie);
  assert.equal(queue.body.suggestions.length, 1);
  const id = queue.body.suggestions[0]._id;

  const approved = await request(app).patch('/api/lingo/suggestions/' + id).set('Cookie', adminCookie)
    .send({ decision: 'approved', canonical: 'rushwa bribe job offer' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.glossary.approved, 1);

  assert.equal(normaliseForMatching('alitaka mchele ya kazi'), 'alitaka rushwa bribe job offer');
  assert.deepEqual(detectLingoTerms('alitaka mchele ya kazi').terms, ['mchele ya kazi']);
  // Built-in terms are untouched.
  assert.match(normaliseForMatching('walinidai hongo'), /rushwa bribe/);
  // Already decided, so it cannot be decided again.
  const again = await request(app).patch('/api/lingo/suggestions/' + id).set('Cookie', adminCookie).send({ decision: 'rejected' });
  assert.equal(again.status, 404);
});

test('a rejected term never influences matching and can be suggested again later', async () => {
  const created = await request(app).post('/api/lingo/suggestions').set('Cookie', reviewerCookie)
    .send({ term: 'kula keki', canonical: 'rushwa bribe', meaning: 'Enjoying the national cake, meaning sharing public money.', language: 'Sheng' });
  assert.equal(created.status, 201);
  await request(app).patch('/api/lingo/suggestions/' + created.body.id).set('Cookie', adminCookie)
    .send({ decision: 'rejected', note: 'Too ambiguous to map to one crime.' }).expect(200);
  assert.equal(normaliseForMatching('kula keki'), 'kula keki');
  assert.equal(await LingoTerm.countDocuments({ term: 'kula keki', status: 'rejected' }), 1);
  const retry = await request(app).post('/api/lingo/suggestions').set('Cookie', reviewerCookie)
    .send({ term: 'kula keki', canonical: 'embezzle public funds', meaning: 'Sharing out stolen public money among officials.' });
  assert.equal(retry.status, 201);
});
