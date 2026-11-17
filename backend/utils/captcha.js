const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || process.env.JWT_SECRET; // dedicated secret, falling back to the app signing secret
const CHALLENGE_TTL = '10m';
const consumedTokens = new Map();

const QUESTION_TYPES = [
  () => {
    const words = ['kenya', 'honesty', 'report', 'citizen', 'safari', 'justice', 'nairobi'];
    const w = words[crypto.randomInt(words.length)];
    const glitched = w.split('').join(['_', '.', '~', ' '][crypto.randomInt(4)]);
    return { text: `Type the word you see (letters are separated): ${glitched}`, answer: w };
  },
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
  () => {
    const words = ['table', 'water', 'money', 'bread', 'grass', 'stone'];
    const w = words[crypto.randomInt(words.length)];
    const reversed = w.split('').reverse().join('');
    return { text: `This word is written backwards: ${reversed}. Type it forwards.`, answer: w };
  },
  () => {
    const pens = crypto.randomInt(3, 12);
    const taken = crypto.randomInt(1, pens - 1);
    const added = crypto.randomInt(1, 5);
    return {
      text: `A clerk has ${pens} pens, gives away ${taken}, then buys ${added} more. How many pens now?`,
      answer: String(pens - taken + added)
    };
  },
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

function generateChallenge() {
  const q = QUESTION_TYPES[crypto.randomInt(QUESTION_TYPES.length)]();
  const answerHash = hashAnswer(q.answer);
  const token = jwt.sign(
    { kind: 'challenge', answerHash, jti: crypto.randomUUID() },
    CAPTCHA_SECRET,
    { expiresIn: CHALLENGE_TTL },
  );
  return { question: q.text, token };
}

// Text alternatives use a normalized answer; image challenges require the exact tile ids.
function verifyChallenge(token, answer) {
  try {
    const payload = jwt.verify(token, CAPTCHA_SECRET);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    for (const [hash, expiry] of consumedTokens) {
      if (expiry <= now) consumedTokens.delete(hash);
    }
    if (consumedTokens.has(tokenHash)) return false;

    let valid = false;
    if (payload.kind === 'image') {
      const { verifyImageSelection } = require('./imageCaptcha');
      // FormData submissions arrive as a JSON string; JSON bodies may pass an array.
      let ids = answer;
      if (typeof ids === 'string') {
        try { ids = JSON.parse(ids); } catch (_) { ids = String(ids).split(','); }
      }
      valid = verifyImageSelection(token, ids);
    } else if (payload.kind === 'challenge') {
      valid = payload.answerHash === hashAnswer(answer);
    }
    if (!valid) return false;

    consumedTokens.set(tokenHash, payload.exp * 1000);
    if (consumedTokens.size > 10000) {
      for (const [hash, expiry] of consumedTokens) {
        if (expiry <= now || consumedTokens.size > 10000) consumedTokens.delete(hash);
      }
    }
    return true;
  } catch (err) {
    return false; // expired, tampered, or missing token all fail closed
  }
}

module.exports = { generateChallenge, verifyChallenge };
