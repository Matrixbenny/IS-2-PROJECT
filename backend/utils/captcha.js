const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Self-hosted human-verification challenge for the anonymous submission endpoint
// (decision #9) - proves a human is submitting without proving who, so it never
// weakens the anonymity guarantee. HONEST SCOPE: a simple arithmetic challenge
// deters naive scripted mass-submission; it is not a robust defence against a
// determined attacker (no CAPTCHA is, without also tying the request to an
// identity, which this project explicitly refuses to do for Path A reports).
const CAPTCHA_SECRET = process.env.JWT_SECRET; // reuse the app's existing signing secret
const CHALLENGE_TTL = '10m';

function hashAnswer(answer) {
  return crypto.createHash('sha256').update(String(answer).trim().toLowerCase()).digest('hex');
}

function generateChallenge() {
  const a = crypto.randomInt(1, 10);
  const b = crypto.randomInt(1, 10);
  const question = `What is ${a} + ${b}?`;
  const token = jwt.sign({ answerHash: hashAnswer(a + b) }, CAPTCHA_SECRET, { expiresIn: CHALLENGE_TTL });
  return { question, token };
}

function verifyChallenge(token, answer) {
  try {
    const payload = jwt.verify(token, CAPTCHA_SECRET);
    return payload.answerHash === hashAnswer(answer);
  } catch (err) {
    return false; // expired, tampered, or missing token all fail closed
  }
}

module.exports = { generateChallenge, verifyChallenge };
