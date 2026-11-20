const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const createApp = require('../app');

// In production one service serves the API, the agency portal and the built app.
test('production serves the built app for client routes but never for /api', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-build-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Kenya Watch</title>');
  const saved = { NODE_ENV: process.env.NODE_ENV, FRONTEND_BUILD_DIR: process.env.FRONTEND_BUILD_DIR };
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_BUILD_DIR = dir;
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const app = createApp();

  const home = await request(app).get('/');
  assert.equal(home.status, 200);
  assert.match(home.text, /<title>Kenya Watch<\/title>/);

  const head = await request(app).head('/');
  assert.equal(head.status, 200);

  const deepLink = await request(app).get('/track');
  assert.equal(deepLink.status, 200);
  assert.match(deepLink.text, /Kenya Watch/);

  const health = await request(app).get('/api/health');
  assert.deepEqual(health.body, { status: 'ok' });

  const missingApi = await request(app).get('/api/no-such-route');
  assert.equal(missingApi.status, 404);
  assert.deepEqual(missingApi.body, { error: 'Not found' });
});

test('outside production the API does not serve the app', async () => {
  const app = createApp();
  const home = await request(app).get('/');
  assert.equal(home.text, 'Kenya Watch backend is running!');
});
