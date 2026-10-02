const { CATEGORIES } = require('./categories');

// Simple keyword-weighted classifier. Not a trained ML model - this is an honest,
// lightweight assistive layer per decision #5/#28: it only has to be useful enough
// to triage and prioritize, never a hard dependency the workflow can be blocked by.
const CATEGORY_KEYWORDS = {
  'Bribery': ['bribe', 'kickback', 'gratification', 'demanded money', 'paid him', 'paid her', 'under the table'],
  'Embezzlement': ['embezzle', 'misappropriat', 'diverted funds', 'missing funds', 'public funds', 'stolen money'],
  'Procurement Fraud': ['tender', 'bid rigging', 'procurement', 'inflated contract', 'ghost supplier', 'supplier'],
  'Abuse of Office': ['abuse of office', 'misused his position', 'misused her position', 'official position'],
  'Nepotism/Favoritism': ['nepotism', 'favoritism', 'relative', 'cousin', 'hired his', 'hired her', 'family member'],
  'Extortion': ['extort', 'threatened', 'forced to pay', 'coerced'],
  'Fraud/Forgery of Documents': ['forged', 'forgery', 'fake document', 'falsified', 'counterfeit'],
  'Conflict of Interest': ['conflict of interest', 'undisclosed interest', 'personal interest', 'financial interest']
};

const CRITICAL_KEYWORDS = ['minister', 'governor', 'cabinet', 'cartel', 'murder', 'killed', 'threatened to kill', 'millions', 'billion'];
const HIGH_KEYWORDS = ['police', 'county official', 'director', 'commissioner', 'hundred thousand', 'million'];

function scoreCategory(text) {
  const lower = text.toLowerCase();
  const scores = {};
  for (const category of Object.keys(CATEGORY_KEYWORDS)) {
    scores[category] = CATEGORY_KEYWORDS[category].reduce(
      (count, kw) => (lower.includes(kw) ? count + 1 : count),
      0
    );
  }
  let best = 'Other';
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  const totalHits = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalHits === 0 ? 0.3 : Math.min(0.95, 0.5 + bestScore * 0.15);
  return { category: best, confidence, totalHits };
}

function scoreUrgency(text, evidenceCount) {
  const lower = text.toLowerCase();
  if (CRITICAL_KEYWORDS.some((kw) => lower.includes(kw))) return 'Critical';
  if (HIGH_KEYWORDS.some((kw) => lower.includes(kw)) || evidenceCount >= 3) return 'High';
  if (evidenceCount >= 1) return 'Medium';
  return 'Low';
}

function deriveTags(text) {
  const lower = text.toLowerCase();
  const tags = new Set();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) tags.add(category.toLowerCase().replace(/[^a-z]+/g, '-'));
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
  return {
    category: CATEGORIES.includes(category) ? category : 'Other',
    urgency,
    confidence: Number(confidence.toFixed(2)),
    tags
  };
}

module.exports = { classifyReportText };
