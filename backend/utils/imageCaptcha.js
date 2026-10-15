const crypto = require("crypto");

// Self-hosted image-selection CAPTCHA (the "select all images with X" style).
// Each tile is a small procedural SVG drawn from primitive shapes - there is no
// alt text, filename hint, or metadata that leaks the object class, and every
// render is randomized (colors, positions, background) so naive bots cannot
// pattern-match against a static sprite sheet. A scraper would need actual
// computer vision to classify the drawings, which raises the bar far above a
// text question.
//
// HONEST SCOPE: a well-resourced attacker with a trained vision model can still
// solve this. Combined with rate limiting and the behavioral checkbox, it is
// proportionate defence for this project's threat model.

const OBJECTS = {
  bus: {
    label: "buses",
    body: "#f59e0b",
    draw: (c) => `
    <rect x="10" y="${c + 12}" width="80" height="38" rx="5" fill="#f59e0b"/>
    <rect x="16" y="${c + 18}" width="18" height="14" rx="2" fill="#bae6fd"/>
    <rect x="40" y="${c + 18}" width="18" height="14" rx="2" fill="#bae6fd"/>
    <rect x="64" y="${c + 18}" width="18" height="14" rx="2" fill="#bae6fd"/>
    <circle cx="28" cy="${c + 52}" r="7" fill="#1e293b"/>
    <circle cx="72" cy="${c + 52}" r="7" fill="#1e293b"/>`,
  },
  trafficLight: {
    label: "traffic lights",
    draw: (c) => `
    <rect x="38" y="${c + 4}" width="24" height="52" rx="4" fill="#1e293b"/>
    <circle cx="50" cy="${c + 15}" r="6" fill="#dc2626"/>
    <circle cx="50" cy="${c + 30}" r="6" fill="#f59e0b"/>
    <circle cx="50" cy="${c + 45}" r="6" fill="#16a34a"/>
    <rect x="47" y="${c + 56}" width="6" height="20" fill="#475569"/>`,
  },
  bicycle: {
    label: "bicycles",
    draw: (c) => `
    <circle cx="28" cy="${c + 44}" r="14" fill="none" stroke="#1e293b" stroke-width="4"/>
    <circle cx="72" cy="${c + 44}" r="14" fill="none" stroke="#1e293b" stroke-width="4"/>
    <path d="M 28 ${c + 44} L 45 ${c + 18} L 62 ${c + 44} M 45 ${c + 18} L 72 ${c + 44} M 22 ${c + 18} L 45 ${c + 18} L 40 ${c + 10}" fill="none" stroke="#0d9488" stroke-width="4" stroke-linecap="round"/>`,
  },
  cat: {
    label: "cats",
    draw: (c) => `
    <circle cx="50" cy="${c + 34}" r="20" fill="#a16207"/>
    <path d="M 36 ${c + 20} L 32 ${c + 4} L 46 ${c + 14} Z" fill="#a16207"/>
    <path d="M 64 ${c + 20} L 68 ${c + 4} L 54 ${c + 14} Z" fill="#a16207"/>
    <circle cx="43" cy="${c + 32}" r="3" fill="#0f172a"/>
    <circle cx="57" cy="${c + 32}" r="3" fill="#0f172a"/>
    <path d="M 46 ${c + 40} L 54 ${c + 40} L 50 ${c + 44} Z" fill="#fca5a5"/>
    <path d="M 68 ${c + 40} Q 84 ${c + 34} 80 ${c + 20}" stroke="#a16207" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  },
  tree: {
    label: "trees",
    draw: (c) => `
    <rect x="46" y="${c + 44}" width="9" height="26" fill="#78350f"/>
    <circle cx="50" cy="${c + 30}" r="22" fill="#16a34a"/>
    <circle cx="34" cy="${c + 40}" r="14" fill="#15803d"/>
    <circle cx="66" cy="${c + 40}" r="14" fill="#15803d"/>`,
  },
  house: {
    label: "houses",
    draw: (c) => `
    <rect x="22" y="${c + 30}" width="56" height="38" fill="#e7e5e4"/>
    <path d="M 16 ${c + 30} L 50 ${c + 6} L 84 ${c + 30} Z" fill="#b91c1c"/>
    <rect x="44" y="${c + 46}" width="13" height="22" fill="#78350f"/>
    <rect x="28" y="${c + 38}" width="12" height="12" fill="#7dd3fc"/>
    <rect x="62" y="${c + 38}" width="12" height="12" fill="#7dd3fc"/>`,
  },
};

const TARGETS = ["bus", "trafficLight", "bicycle", "cat", "tree", "house"];
const DECOYS = TARGETS.filter((t) => t !== "bus"); // all non-target types

const TILE_SIZE = 100;
const PALETTE = ["#fef3c7", "#ecfdf5", "#eff6ff", "#fdf2f8", "#f8fafc"];

function renderTileSvg(type, seed) {
  const def = OBJECTS[type];
  // Random vertical offset and background so every render of the same object differs.
  const offset = crypto.randomInt(0, 8);
  const bg = PALETTE[seed % PALETTE.length];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}" width="${TILE_SIZE}" height="${TILE_SIZE}">` +
    `<rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${bg}"/>` +
    def.draw(offset) +
    `</svg>`
  );
}

// Correct tile ids are stored ENCRYPTED (AES-256-GCM) inside the signed token.
// JWT only signs its payload - a client could base64-decode and read plain ids,
// so encryption is mandatory here to keep the answer key secret from the browser.
function sealIds(ids) {
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(ids), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function openIds(sealed) {
  try {
    const [ivB64, tagB64, dataB64] = String(sealed).split('.');
    const key = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch (err) {
    return null;
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generates a 3x3 image challenge. Returns { prompt, token, tiles: [{id, svg}] }.
// Correct tile ids are AES-256-GCM encrypted inside the signed JWT so the
// browser can decode the token but still cannot read the answer key.
function generateImageChallenge() {
  const target = TARGETS[crypto.randomInt(TARGETS.length)];
  const targetCount = crypto.randomInt(2, 6); // 2..5 correct tiles
  const cells = [];
  for (let i = 0; i < targetCount; i++) cells.push(target);
  while (cells.length < 9) {
    const decoy = DECOYS[crypto.randomInt(DECOYS.length)];
    cells.push(decoy);
  }
  const shuffled = shuffle(cells);
  const tiles = shuffled.map((type, index) => ({
    id: index,
    svg: renderTileSvg(type, crypto.randomInt(1000)),
  }));
  const correctIds = shuffled
    .map((type, index) => (type === target ? index : null))
    .filter((v) => v !== null);
  const token = require("jsonwebtoken").sign(
    { kind: "image", sealed: sealIds(correctIds.join(",")) },
    process.env.JWT_SECRET,
    { expiresIn: "10m" },
  );
  return {
    prompt: `Select all images with ${OBJECTS[target].label}`,
    token,
    tiles,
  };
}

// Verifies an image-selection answer: the selected tile ids must exactly match
// the encrypted set inside the token.
function verifyImageSelection(token, selectedIds) {
  try {
    const payload = require("jsonwebtoken").verify(
      token,
      process.env.JWT_SECRET,
    );
    if (payload.kind !== "image" || !payload.sealed) return false;
    const expectedStr = openIds(payload.sealed);
    if (expectedStr === null) return false;
    const expected = expectedStr
      .split(",")
      .map(Number)
      .sort((a, b) => a - b)
      .join(",");
    const got = (Array.isArray(selectedIds) ? selectedIds : [])
      .map(Number)
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b)
      .join(",");
    return expected === got;
  } catch (err) {
    return false; // expired, tampered, or missing token fails closed
  }
}

module.exports = { generateImageChallenge, verifyImageSelection };
