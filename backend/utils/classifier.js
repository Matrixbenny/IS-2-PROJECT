const { CATEGORIES } = require('./categories');
const { detectLingoTerms, normaliseForMatching } = require('./kenyaLingo');

// Simple keyword-weighted classifier. Not a trained ML model - this is an honest,
// lightweight assistive layer per decision #5/#28: it only has to be useful enough
// to triage and prioritize, never a hard dependency the workflow can be blocked by.
// Keywords carry weights: unambiguous markers ("kickback", "bid rigging") score 3,
// strong signals ("bribe", "embezzle") 2, weak/contextual words ("relative",
// "supplier") 1 - so one weak match can no longer outweigh a strong one.
const CATEGORY_KEYWORDS = {
  'Bribery': [
    ['bribe', 2], ['kickback', 3], ['gratification', 3], ['demanded money', 3], ['paid him', 2], ['paid her', 2], ['under the table', 3],
    ['hongo', 3], ['rushwa', 3], ['kitu kidogo', 1], ['pesa ya chai', 2], ['toa chai', 1],
    // A demand for money by an official is the commonest way a bribe is described
    // in plain English, without the word "bribe" ever appearing.
    ['demanded', 2], ['demanding', 2], ['demand for money', 3], ['pay to', 1], ['unofficial payment', 3],
    ['facilitation fee', 3], ['asked for money', 3], ['asked me for', 1], ['paid the officer', 2], ['brown envelope', 3],
    ['pay something extra', 3], ['extra payment', 3], ['asked me to pay', 2], ['asked to pay', 1], ['pay before', 2]
  ],
  // (Bribery continued in aliases below to keep lists readable)
  'Embezzlement': [
    ['embezzle', 3], ['misappropriat', 3], ['diverted funds', 3], ['missing funds', 2], ['public funds', 1], ['stolen money', 2],
    ['fedha za umma zimepotea', 2], ['fedha za umma zilitumika vibaya', 2], ['matumizi mabaya ya fedha za umma', 2],
    // Money "disappearing" from a public budget is how embezzlement is usually told.
    ['funds missing', 3], ['money disappeared', 3], ['zimepotea', 2], ['imepotea', 2], ['cdf', 1], ['took all the money', 3]
  ],
  'Procurement Fraud': [
    ['tender', 1], ['bid rigging', 3], ['procurement', 2], ['inflated contract', 3], ['ghost supplier', 3], ['supplier', 1],
    ['zabuni', 1], ['kupanga zabuni', 3], ['bei ya mkataba imepandishwa', 2]
  ],
  'Abuse of Office': [
    ['abuse of office', 3], ['misused his position', 3], ['misused her position', 3], ['official position', 1],
    ['matumizi mabaya ya mamlaka', 3], ['ametumia vibaya ofisi', 2]
  ],
  'Nepotism/Favoritism': [
    ['nepotism', 3], ['favoritism', 2], ['relative', 1], ['cousin', 1], ['hired his', 2], ['hired her', 2], ['family member', 1],
    ['kuajiri ndugu', 2], ['upendeleo kwa ndugu', 2], ['jamaa yake amepewa kazi', 2]
  ],
  'Extortion': [
    // "forced to pay" and "threatened" must stay whole phrases: a bare "pay"
    // or "threatened" scores ordinary reports as extortion (a friendly police
    // stop contains "police officer", which feeds this category via the alias
    // list below, so one stray point is enough to misfile the case).
    ['extort', 3], ['threatened to', 3], ['forced to pay', 3], ['coerced', 2],
    ['kulazimishwa kulipa', 3], ['kulazimishwa kutoa pesa', 3], ['vitisho vya kulipa', 2],
    // Threats carry the coercion that separates extortion from a bribe.
    ['if i refused', 3], ['if you refuse', 3], ['or else', 2], ['kutishia', 3], ['refused extort', 3]
  ],
  'Fraud/Forgery of Documents': [
    ['forged', 3], ['forgery', 3], ['fake document', 3], ['falsified', 2], ['counterfeit', 3],
    ['hati bandia', 2], ['cheti bandia', 2], ['kughushi nyaraka', 3]
  ],
  'Conflict of Interest': [
    ['conflict of interest', 3], ['undisclosed interest', 3], ['personal interest', 2], ['financial interest', 2],
    ['mgongano wa maslahi', 3], ['maslahi binafsi', 2]
  ]
};

// Keyword aliases recognised via the Kenya-lingo normaliser (utils/kenyaLingo.js).
// These score the categories the lingo expansions feed into.
const CATEGORY_ALIAS_KEYWORDS = {
  'Bribery': [
    ['demanded money', 3], ['forced to pay', 3], ['steal theft bribery', 1]
  ],
  'Embezzlement': [
    ['embezzle public funds', 3], ['public funds government money', 3]
  ],
  'Extortion': [
    // Naming a police officer is not itself evidence of extortion: a friendly
    // roadblock report contains "police officer" and nothing improper. The
    // category needs the officer AND coercion, so the officer term no longer
    // scores on its own. "forced to pay" is already weighted under the main
    // Bribery/Extortion lists.
  ]
};

const CRITICAL_KEYWORDS = [
  'minister', 'governor', 'cabinet', 'cartel', 'murder', 'killed', 'threatened to kill', 'millions', 'billion',
  // Sheng/Kiswahili escalation signals (see utils/kenyaLingo.js)
  'waziri', 'gavana', 'kuuawa', 'kutishiwa maisha',
  // Sheng escalation signals (researched: Mbogi Genje/Tuko Sheng lists)
  'mambaru', 'musu bullet', 'ridhe bullet', 'mafia', 'cartel'
];
const HIGH_KEYWORDS = [
  'police', 'county official', 'director', 'commissioner', 'hundred thousand', 'million',
  'polisi', 'afisa wa kaunti', 'mkurugenzi', 'mamilioni',
  // Sheng high-urgency signals
  'police officer', 'detectives dci', 'city council enforcement officer',
  'threatened extort', 'forced to pay extort'
];

// Uses the shared Kenya-lingo pipeline so English, Kiswahili, Sheng and mixed
// code-switching all land in the same keyword space (decision #31).
const normalizeText = normaliseForMatching;

// Score every category, not only the best one. A single report can describe
// more than one kind of wrongdoing (for example a bribe to hide embezzlement),
// and routing needs to see all of them.
function scoreAllCategories(text) {
  const lower = normalizeText(text);
  const scores = {};
  for (const category of Object.keys(CATEGORY_KEYWORDS)) {
    scores[category] = CATEGORY_KEYWORDS[category].reduce(
      (sum, [kw, weight]) => (lower.includes(kw) ? sum + weight : sum),
      0
    );
  }
  for (const [category, keywords] of Object.entries(CATEGORY_ALIAS_KEYWORDS)) {
    scores[category] = (scores[category] || 0) + keywords.reduce(
      (sum, [kw, weight]) => (lower.includes(kw) ? sum + weight : sum),
      0
    );
  }
  return scores;
}

function scoreCategory(text) {
  const scores = scoreAllCategories(text);
  let best = 'Other';
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  const totalHits = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalHits === 0 ? 0.3 : Math.min(0.95, 0.5 + bestScore * 0.08);
  return { category: best, confidence, totalHits };
}

function scoreUrgency(text, evidenceCount) {
  const lower = normalizeText(text);
  if (CRITICAL_KEYWORDS.some((kw) => lower.includes(kw))) return 'Critical';
  if (HIGH_KEYWORDS.some((kw) => lower.includes(kw)) || evidenceCount >= 3) return 'High';
  if (evidenceCount >= 1) return 'Medium';
  return 'Low';
}

function deriveTags(text) {
  const lower = normalizeText(text);
  const tags = new Set();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(([kw]) => lower.includes(kw))) tags.add(category.toLowerCase().replace(/[^a-z]+/g, '-'));
  }
  return Array.from(tags).slice(0, 5);
}

// Runs the (synchronous, cheap) classification logic. Callers should invoke this
// off the request/response cycle (e.g. via setImmediate) so it never blocks submission.
function classifyReportText({ title = '', description = '', evidenceCount = 0 }) {
  const text = `${title} ${description}`;
  const { category, confidence } = scoreCategory(text);
  const urgency = scoreUrgency(text, evidenceCount);
  const tags = deriveTags(text);
  const cleanCategory = CATEGORIES.includes(category) ? category : 'Other';
  return {
    category: cleanCategory,
    urgency,
    confidence: Number(confidence.toFixed(2)),
    tags,
    // Which Sheng/Kiswahili/dialect terms were recognised - shown to reviewers
    // as a hint only and stored for ML dataset review. Never a finding.
    lingoTerms: detectLingoTerms(text).terms
  };
}

module.exports = { classifyReportText, scoreAllCategories };
