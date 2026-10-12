const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');

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

test('POST /api/auth/register rejects a password shorter than 8 characters', async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Test User', email: 'short-pass@example.com', password: 'abc123'
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/auth/register creates a Path B account and sets an httpOnly session cookie', async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Test User', email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.user.role, 'user', 'Public registration must always default to the user role');
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('kw_token='));
  assert.ok(cookie, 'Login must set the kw_token cookie');
  assert.match(cookie, /HttpOnly/i);
});

test('POST /api/auth/register rejects a duplicate email', async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Another User', email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 409);
});

test('POST /api/auth/login rejects an incorrect password without revealing whether the account exists', async () => {
  const res = await request(app).post('/api/auth/login').send({
    email: 'testuser@example.com', password: 'WrongPassword!'
  });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, 'Invalid email or password');
});

test('POST /api/auth/login succeeds with the correct password', async () => {
  const res = await request(app).post('/api/auth/login').send({
    email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.user.email, 'testuser@example.com');
});

test('GET /api/auth/me requires authentication', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.status, 401);
});
