const test = require('node:test');
const assert = require('node:assert/strict');
const EmailOtpChallenge = require('../email-otp-challenge.model');
const Report = require('../report.model');
const mailer = require('../utils/mailer');
const { hashSecret } = require('../utils/tracking');
const {
  ReceiptEmailError,
  requestReceiptOtp,
  verifyReceiptOtp
} = require('../utils/reportEmailReceipt');
const report = {
  _id: '507f1f77bcf86cd799439011',
  trackingReference: 'KW-TEST01',
  archivedAt: null,
  accessKeyHash: null
};

test('emails report credentials only after valid tracking key and email OTP verification', async (t) => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  report.accessKeyHash = await hashSecret('test-access-key');
  let challenge;
  const messages = [];

  t.after(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });
  t.mock.method(Report, 'findOne', async () => report);
  t.mock.method(EmailOtpChallenge, 'findOneAndUpdate', async (_query, update) => {
    if (update.$inc) {
      if (!challenge || challenge.attempts >= 5) return null;
      challenge.attempts += update.$inc.attempts;
      return challenge;
    }
    challenge = {
      report: report._id,
      email: update.email,
      otpHash: update.otpHash,
      expiresAt: update.expiresAt,
      attempts: update.attempts,
      deleteOne: async () => { challenge = null; },
      save: async () => {}
    };
    return challenge;
  });
  t.mock.method(EmailOtpChallenge, 'deleteOne', async () => { challenge = null; });
  t.mock.method(mailer, 'sendMail', async (message) => {
    messages.push(message);
    return { messageId: `mail-${messages.length}` };
  });

  const requestResult = await requestReceiptOtp({
    trackingReference: report.trackingReference,
    accessKey: 'test-access-key',
    email: 'recipient@example.com'
  });
  assert.match(requestResult.message, /verification code was sent/i);
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /verification code is:\n\n\d{6}/i);
  assert.match(messages[0].html, /font-size:36px/);
  assert.match(messages[0].html, /user-select:all/);
  assert.notEqual(challenge.otpHash, messages[0].text.match(/\b\d{6}\b/)?.[0]);

  const otp = messages[0].text.match(/\b\d{6}\b/)[0];
  const wrongOtp = otp === '000000' ? '000001' : '000000';
  await assert.rejects(
    verifyReceiptOtp({
      trackingReference: report.trackingReference,
      accessKey: 'test-access-key',
      otp: wrongOtp
    }),
    (error) => error instanceof ReceiptEmailError && error.status === 400
  );
  assert.equal(messages.length, 1);

  const verified = await verifyReceiptOtp({
    trackingReference: report.trackingReference,
    accessKey: 'test-access-key',
    otp
  });
  assert.match(verified.message, /sent to the verified email/i);
  assert.match(messages[1].text, /Tracking Reference: KW-TEST01/);
  assert.match(messages[1].text, /Access Key: test-access-key/);
  assert.equal(challenge, null);
});

test('does not send an OTP when report tracking credentials are invalid', async (t) => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  report.accessKeyHash = await hashSecret('test-access-key');
  const messages = [];
  t.after(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });
  t.mock.method(Report, 'findOne', async () => report);
  t.mock.method(mailer, 'sendMail', async (message) => {
    messages.push(message);
    return { messageId: 'unexpected' };
  });

  await assert.rejects(
    requestReceiptOtp({
      trackingReference: report.trackingReference,
      accessKey: 'wrong-key',
      email: 'recipient@example.com'
    }),
    (error) => error instanceof ReceiptEmailError && error.status === 400
  );
  assert.equal(messages.length, 0);
});

test('expires the challenge after five incorrect OTP attempts', async (t) => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  report.accessKeyHash = await hashSecret('test-access-key');
  let challenge;
  const messages = [];
  t.after(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });
  t.mock.method(Report, 'findOne', async () => report);
  t.mock.method(EmailOtpChallenge, 'findOneAndUpdate', async (_query, update) => {
    if (update.$inc) {
      if (!challenge || challenge.attempts >= 5) return null;
      challenge.attempts += update.$inc.attempts;
      return challenge;
    }
    challenge = {
      report: report._id,
      email: update.email,
      otpHash: update.otpHash,
      expiresAt: update.expiresAt,
      attempts: 0,
      deleteOne: async () => { challenge = null; }
    };
    return challenge;
  });
  t.mock.method(EmailOtpChallenge, 'deleteOne', async () => { challenge = null; });
  t.mock.method(mailer, 'sendMail', async (message) => {
    messages.push(message);
    return { messageId: 'otp-mail' };
  });

  await requestReceiptOtp({
    trackingReference: report.trackingReference,
    accessKey: 'test-access-key',
    email: 'recipient@example.com'
  });
  const otp = messages[0].text.match(/\b\d{6}\b/)[0];
  const wrongOtp = otp === '000000' ? '000001' : '000000';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      verifyReceiptOtp({
        trackingReference: report.trackingReference,
        accessKey: 'test-access-key',
        otp: wrongOtp
      }),
      (error) => error instanceof ReceiptEmailError && error.status === 400
    );
  }
  assert.equal(challenge, null);
});
