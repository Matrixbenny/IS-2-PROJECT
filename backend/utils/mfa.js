const crypto = require('crypto');
const LoginChallenge = require('../login-challenge.model');
const mailer = require('./mailer');

// Second factor for the accounts that can see evidence or change outcomes:
// agency officers, reviewers and the Admin. A 6-digit code is emailed after the
// password is accepted. It is on by default in production (set MFA_REQUIRED=false
// to opt out knowingly) and off elsewhere unless MFA_REQUIRED=true, so local
// development and tests are not blocked by a mailbox.
const PRIVILEGED_ROLES = ['agency', 'reviewer', 'admin'];
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function isEnabled() {
  if (process.env.MFA_REQUIRED === 'true') return true;
  if (process.env.MFA_REQUIRED === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function isRequiredFor(user) {
  return isEnabled() && PRIVILEGED_ROLES.includes(user.role);
}

function hashCode(challengeId, code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(`${challengeId}:${code}`).digest('hex');
}

async function startChallenge(user) {
  const challengeId = crypto.randomBytes(24).toString('hex');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await LoginChallenge.deleteMany({ user: user._id });
  await LoginChallenge.create({
    challengeId,
    user: user._id,
    codeHash: hashCode(challengeId, code),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000)
  });
  await mailer.sendMail({
    to: user.email,
    subject: 'Your Kenya Watch sign-in code',
    text: `Your sign-in code is ${code}. It expires in ${CODE_MINUTES} minutes.\n\nIf you did not just try to sign in, change your password: someone else knows it.`,
    html: `<p>Your Kenya Watch sign-in code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p>
      <p>It expires in ${CODE_MINUTES} minutes. If you did not just try to sign in, change your password: someone else knows it.</p>`
  });
  return { challengeId, expiresInMinutes: CODE_MINUTES };
}

// Returns { ok: true, userId } or { ok: false, error }. A wrong code counts against
// the challenge; after MAX_ATTEMPTS it is destroyed and the password step must be repeated.
async function verifyChallenge(challengeId, code) {
  const generic = { ok: false, error: 'That code is not valid or has expired. Sign in again to get a new one.' };
  if (typeof challengeId !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return generic;
  const challenge = await LoginChallenge.findOne({ challengeId });
  if (!challenge || challenge.expiresAt <= new Date()) return generic;
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await challenge.deleteOne();
    return generic;
  }
  const expected = Buffer.from(challenge.codeHash, 'hex');
  const given = Buffer.from(hashCode(challengeId, code.trim()), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    challenge.attempts += 1;
    await challenge.save();
    return generic;
  }
  await challenge.deleteOne();
  return { ok: true, userId: challenge.user };
}

module.exports = { isEnabled, isRequiredFor, startChallenge, verifyChallenge, MAX_ATTEMPTS, CODE_MINUTES };
