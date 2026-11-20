const test = require('node:test');
const assert = require('node:assert/strict');
const { warnIfAdminIdentityMisconfigured } = require('../utils/developerIdentity');

function warningsFor(env) {
  const saved = {};
  for (const key of Object.keys(env)) { saved[key] = process.env[key]; process.env[key] = env[key]; }
  const original = console.warn;
  const seen = [];
  console.warn = (msg) => seen.push(String(msg));
  try {
    warnIfAdminIdentityMisconfigured();
  } finally {
    console.warn = original;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  return seen;
}

test('a separate admin address does not trigger the reserved-inbox warning', () => {
  const seen = warningsFor({ ADMIN_EMAIL: 'admin@example.org', SMTP_USER: 'sender@example.org', MAIL_FROM: 'Kenya Watch <sender@example.org>' });
  assert.equal(seen.length, 0);
});

test('using the sending mailbox as ADMIN_EMAIL is still reported', () => {
  const seen = warningsFor({ ADMIN_EMAIL: 'Sender+admin@example.org', SMTP_USER: 'sender@example.org', MAIL_FROM: '' });
  assert.equal(seen.length, 1);
  assert.match(seen[0], /reserved developer inbox/);
});
