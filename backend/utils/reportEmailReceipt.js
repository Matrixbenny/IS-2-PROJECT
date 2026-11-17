const crypto = require('crypto');
const EmailOtpChallenge = require('../email-otp-challenge.model');
const Report = require('../report.model');
const mailer = require('./mailer');
const { hashSecret, verifySecret } = require('./tracking');
const { normalizeEmail } = require('./adminIdentity');

class ReceiptEmailError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ReceiptEmailError';
  }
}

async function requestReceiptOtp({ trackingReference, accessKey, email }) {
  const cleanEmail = normalizeEmail(email);
  if (
    typeof trackingReference !== 'string' ||
    typeof accessKey !== 'string' ||
    accessKey.length > 200 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
  ) {
    throw new ReceiptEmailError(400, 'Enter a valid email address and the report tracking credentials.');
  }

  const report = await Report.findOne({ trackingReference, archivedAt: null });
  if (!report || !await verifySecret(accessKey, report.accessKeyHash)) {
    throw new ReceiptEmailError(400, 'The tracking details could not be verified.');
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = await hashSecret(otp);
  await EmailOtpChallenge.findOneAndUpdate(
    { report: report._id },
    { email: cleanEmail, otpHash, attempts: 0, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  try {
    await mailer.sendMail({
      to: cleanEmail,
      subject: 'Your Kenya Watch email verification code',
      text: `Your Kenya Watch verification code is:\n\n${otp}\n\nEnter this six-digit code on the report receipt page. It expires in 10 minutes. If you did not request it, ignore this email.`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.5;max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:22px;margin:0 0 16px">Confirm your email</h1><p>Enter this verification code on the Kenya Watch report receipt page:</p><div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;margin:20px 0;padding:20px;text-align:center"><span style="display:inline-block;font-family:Consolas,Monaco,monospace;font-size:36px;font-weight:700;letter-spacing:10px;line-height:1.3;-webkit-user-select:all;user-select:all">${otp}</span></div><p style="font-size:14px;color:#475569">Tap and hold the code to select and copy it. It expires in <strong>10 minutes</strong>.</p><p style="font-size:13px;color:#64748b">If you did not request this code, you can ignore this email.</p></div>`
    });
  } catch (mailError) {
    await EmailOtpChallenge.deleteOne({ report: report._id, otpHash });
    console.error('[report receipt] verification email delivery failed:', mailError.message);
    throw new ReceiptEmailError(503, 'Could not send the verification email. Please try again later.');
  }

  return { message: 'A verification code was sent to that email address. It expires in 10 minutes.' };
}

async function verifyReceiptOtp({ trackingReference, accessKey, otp }) {
  if (
    typeof trackingReference !== 'string' ||
    typeof accessKey !== 'string' ||
    accessKey.length > 200 ||
    typeof otp !== 'string' ||
    !/^\d{6}$/.test(otp)
  ) {
    throw new ReceiptEmailError(400, 'Enter the tracking credentials and six-digit email code.');
  }

  const report = await Report.findOne({ trackingReference, archivedAt: null });
  if (!report || !await verifySecret(accessKey, report.accessKeyHash)) {
    throw new ReceiptEmailError(400, 'The tracking details or verification code could not be verified.');
  }
  const challenge = await EmailOtpChallenge.findOneAndUpdate(
    {
      report: report._id,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 }
    },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!challenge) {
    throw new ReceiptEmailError(400, 'The verification code is invalid or expired. Request a new code.');
  }

  const validOtp = await verifySecret(otp, challenge.otpHash);
  if (!validOtp) {
    if (challenge.attempts >= 5) await challenge.deleteOne();
    throw new ReceiptEmailError(400, 'The verification code is invalid or expired. Request a new code.');
  }

  await challenge.deleteOne();
  try {
    await mailer.sendMail({
      to: challenge.email,
      subject: `Your Kenya Watch report ${report.trackingReference} receipt`,
      text: `Your report tracking details are below. Keep them private: anyone with both can view the private tracking information for this report.\n\nTracking Reference: ${report.trackingReference}\nAccess Key: ${accessKey}\n\nYou requested that these credentials be sent to this email address.`
    });
  } catch (mailError) {
    console.error('[report receipt] credential email delivery failed:', mailError.message);
    throw new ReceiptEmailError(503, 'Email verification succeeded, but the receipt could not be sent. Request a new code and try again.');
  }

  return { message: 'Your report tracking details were sent to the verified email address.' };
}

module.exports = { ReceiptEmailError, requestReceiptOtp, verifyReceiptOtp };
