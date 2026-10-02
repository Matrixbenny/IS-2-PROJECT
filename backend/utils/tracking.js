const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const WORDS = require('./wordlist');

// Cryptographically-random integer in [0, max)
function randomInt(max) {
  return crypto.randomInt(max);
}

// Short, URL/voice-safe public reference, e.g. KW-7F3Q2A (decision #21).
function generateTrackingReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += alphabet[randomInt(alphabet.length)];
  return `KW-${suffix}`;
}

// Diceware-style secret passphrase, e.g. purple-tiger-lemon-forest. Shown once, never stored raw.
function generateAccessKey(wordCount = 4) {
  const chosen = [];
  for (let i = 0; i < wordCount; i++) chosen.push(WORDS[randomInt(WORDS.length)]);
  return chosen.join('-');
}

async function hashSecret(plain) {
  return bcrypt.hash(plain, 11);
}

async function verifySecret(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { generateTrackingReference, generateAccessKey, hashSecret, verifySecret };
