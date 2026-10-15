const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Self-hosted human-verification challenge for the anonymous submission endpoint
// (decision #9) - proves a human is submitting without proving who, so it never
// weakens the anonymity guarantee.
//
// HONEST SCOPE: this is a layered challenge (text distortion + counting + semantic
// reasoning), significantly harder for naive scrapers than a single arithmetic sum.
// It is NOT unbreakable - a determined attacker with computer vision / an LLM can
// still solve it, and no self-hosted CAPTCHA can fully prevent that without tying
// the request to an identity, which this project explicitly refuses to do for
// Path A reports. Defence-in-depth (rate limiting, bcrypt-keyed access secrets)
// carries the remaining risk.

const CAPTCHA_SECRET = process.env.JWT_SECRET; // reuse the app's existing signing secret
const CHALLENGE_TTL = '10m';

// Question templates. Each produces { text, answer } where `answer` is a normalized
// lowercase string. Several layers are mixed so bots must solve varied, distorted,
// multi-step problems rather than one uniform pattern.
const QUESTION_TYPES = [
  // Layer 1 - reading distorted / spaced-out words (targets basic scrapers that
  // expect clean "a + b" text).
  () => {
    const words = ['kenya', 'honesty', 'report', 'citizen', 'safari', 'justice', 'nairobi'];
    const w = words[crypto.randomInt(words.length)];
    const glitched = w.split('').join(['_', '.', '~', ' '][crypto.randomInt(4)]);
    return { text: `Type the word you see (letters are separated): ${glitched}`, answer: w };
  },
  // Layer 2 - counting objects with distractors.
  () => {
    const items = ['elephants', 'giraffes', 'zebras', 'lions', 'rhinos'];
    const item = items[crypto.randomInt(items.length)];
    const count = crypto.randomInt(2, 8);
    const decoys = items.filter((x) => x !== item);
    const decoyCount = crypto.randomInt(1, 9);
    return {
      text: `Imagine ${count} ${item} and ${decoyCount} ${decoys[crypto.randomInt(decoys.length)]} at a water hole. How many ${item} are there?`,
      answer: String(count)
    };
  },
  // Layer 3 - reversed word (needs light string reasoning, not just regex on digits).
  () => {
    const words = ['table', 'water', 'money', 'bread', 'grass', 'stone'];
    const w = words[crypto.randomInt(words.length)];
    const reversed = w.split('').reverse().join('');
    return { text: `This word is written backwards: ${reversed}. Type it forwards.`, answer: w };
  },
  // Layer 4 - two-step arithmetic disguised in a mini-scenario.
  () => {
    const pens = crypto.randomInt(3, 12);
    const taken = crypto.randomInt(1, pens - 1);
    const added = crypto.randomInt(1, 5);
    return {
      text: `A clerk has ${pens} pens, gives away ${taken}, then buys ${added} more. How many pens now?`,
      answer: String(pens - taken + added)
    };
  },
  // Layer 5 - pick the odd one out from a category list.
  () => {
    const groups = [
      { list: ['mango', 'banana', 'orange', 'chair'], odd: 'chair', label: 'fruit' },
      { list: ['dog', 'cat', 'rabbit', 'spoon'], odd: 'spoon', label: 'animal' },
      { list: ['red', 'blue', 'green', 'tiger'], odd: 'tiger', label: 'colour' },
      { list: ['nairobi', 'kisumu', 'mombasa', 'london'], odd: 'london', label: 'city in Kenya' }
    ];
    const g = groups[crypto.randomInt(groups.length)];
    const shuffled = g.list.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return {
      text: `Which of these is NOT a ${g.label}: ${shuffled.join(', ')}?`,
      answer: g.odd
    };
  }
];

function hashAnswer(answer) {
  return crypto.createHash('sha256').update(String(answer).trim().toLowerCase()).digest('hex');
}

// --- reCAPTCHA-style behavioral check (self-hosted, "I'm not a robot" flow) ---
// The client collects lightweight interaction signals (time on page, pointer/keyboard
// activity, a honeypot field bots fill but humans never see). The server judges
// plausibility and - only if it passes - issues a short-lived signed 'human' token
// that the submit endpoint accepts. Nothing here records identity: the metrics are
// ephemeral aggregates, never stored.

function evaluateBehavior({ timeSpentMs = 0, pointerMoves = 0, keyEvents = 0, honeypot = '', hasPointer = true } = {}) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, 10 * 60 * 1000) : 0);
  const t = n(timeSpentMs);
  const p = n(pointerMoves);
  const k = n(keyEvents);
  // Bots that submit instantly (t < 1.2s) with zero interaction fail outright.
  if (t < 1200) return false;
  // Humans on touch devices may produce no pointer moves - then require either
  // key events or a longer dwell. Mouse users need at least a little movement.
  if (hasPointer) {
    if (p < 3 && k < 2 && t < 4000) return false;
  } else if (k < 1 && t < 5000) {
    return false;
  }
  // Honeypot: invisible field; any content means a bot filled it.
  if (String(honeypot || '').trim() !== '') return false;
  return true;
}

function issueBehaviorToken() {
  return jwt.sign({ kind: 'behavior' }, CAPTCHA_SECRET, { expiresIn: CHALLENGE_TTL });
}

// Legacy text-challenge tokens carry { kind: 'challenge', answerHash }.
function generateChallenge() {
  const q = QUESTION_TYPES[crypto.randomInt(QUESTION_TYPES.length)]();
  const answerHash = hashAnswer(q.answer);
  const token = jwt.sign({ kind: 'challenge', answerHash }, CAPTCHA_SECRET, { expiresIn: CHALLENGE_TTL });
  return { question: q.text, token };
}

// Unified check: a 'behavior' token passes as-is; a 'challenge' token requires a
// matching text answer; an 'image' token requires the exact selected tile ids
// (passed via `answer` as an array). Unknown/expired tokens fail closed.
function verifyChallenge(token, answer) {
  try {
    const payload = jwt.verify(token, CAPTCHA_SECRET);
    if (payload.kind === 'behavior') return true;
    if (payload.kind === 'image') {
      const { verifyImageSelection } = require('./imageCaptcha');
      // FormData submissions arrive as a JSON string; JSON bodies may pass an array.
      let ids = answer;
      if (typeof ids === 'string') {
        try { ids = JSON.parse(ids); } catch (_) { ids = String(ids).split(','); }
      }
      return verifyImageSelection(token, ids);
    }
    if (payload.kind === 'challenge' || payload.answerHash) {
      return payload.answerHash === hashAnswer(answer);
    }
    return false;
  } catch (err) {
    return false; // expired, tampered, or missing token all fail closed
  }
}

module.exports = { generateChallenge, verifyChallenge, evaluateBehavior, issueBehaviorToken };
