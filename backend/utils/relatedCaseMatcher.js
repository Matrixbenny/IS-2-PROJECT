const { normaliseForSimilarity } = require('./kenyaLingo');

const MAX_SUGGESTIONS = 5;
const MIN_SIMILARITY = 0.12;
const MAX_CANDIDATES = 500;
const MAX_TEXT_LENGTH = 5000;

const STOP_WORDS = new Set((
  'a an and are as at be been being by for from had has have he her hers him his i in is it its me my of on or our ours she that the their them then there they this to was we were what when where which who will with you your ' +
  'ya au ama ambaye ambayo baada basi bila cha chini huku ila ili katika kwa kutoka kuwa kufanya hivyo hii hizo hizi huyo ikiwa kama kwenye kila lakini maana maana yake mtu na ni njia pia sasa sana tena tu wale wewe yeye ' +
  'report reports alleged allegation alleged incident case cases corruption corruption-related'
).split(/\s+/).filter(Boolean));

// Canonical tokens produced by the Kenya-lingo glossary. When two reports
// share one of these, the reviewer sees a "language match" hint explaining
// that the similarity came from a Sheng/Kiswahili/dialect term, not a typo.
const LINGO_SHARED_TERMS = new Set([
  'rushwa', 'bribe', 'hongo', 'embezzle', 'misappropriat', 'diverted', 'tender',
  'procurement', 'rigged', 'nepotism', 'favoritism', 'relative', 'extort',
  'threatened', 'forged', 'falsified', 'conflict', 'lands', 'office', 'police'
]);

// Sheng/Kiswahili/dialect terms are expanded to their canonical form first,
// so "hongo" in one report and "bribe" in another share a term (decision #31).
function tokenize(text) {
  const words = normaliseForSimilarity(text).match(/[\p{L}\p{N}]+/gu) || [];
  const tokens = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (word.length > 1 && !STOP_WORDS.has(word)) tokens.push(word);
    if (
      index + 1 < words.length
      && word.length > 1
      && words[index + 1].length > 1
      && !STOP_WORDS.has(word)
      && !STOP_WORDS.has(words[index + 1])
    ) {
      tokens.push(`${word}_${words[index + 1]}`);
    }
  }
  return tokens;
}

function vectorizeDocuments(documents) {
  const tokenized = documents.map(tokenize);
  const documentFrequency = new Map();
  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  const totalDocuments = tokenized.length;
  return tokenized.map((tokens) => {
    const counts = new Map();
    for (const term of tokens) counts.set(term, (counts.get(term) || 0) + 1);
    const vector = new Map();
    let magnitudeSquared = 0;
    for (const [term, count] of counts) {
      const inverseDocumentFrequency = Math.log(
        (totalDocuments + 1) / ((documentFrequency.get(term) || 0) + 1)
      ) + 1;
      const weight = (1 + Math.log(count)) * inverseDocumentFrequency;
      vector.set(term, weight);
      magnitudeSquared += weight * weight;
    }
    return {
      vector,
      magnitude: Math.sqrt(magnitudeSquared)
    };
  });
}

function reportText(report) {
  return `${report.title || ''} ${report.description || ''}`.slice(0, MAX_TEXT_LENGTH);
}

function suggestRelatedCases(queryReport, candidates, options = {}) {
  const limit = Number.isInteger(options.limit) ? Math.max(0, options.limit) : MAX_SUGGESTIONS;
  const threshold = Number.isFinite(options.minimumSimilarity)
    ? Math.max(0, options.minimumSimilarity)
    : MIN_SIMILARITY;
  if (limit === 0 || !Array.isArray(candidates) || candidates.length === 0) return [];

  const eligible = candidates
    .filter((candidate) => (
      candidate
      && candidate._id
      && String(candidate._id) !== String(queryReport?._id)
      && String(candidate.county || '').toLocaleLowerCase('en')
        === String(queryReport?.county || '').toLocaleLowerCase('en')
    ))
    .slice(0, MAX_CANDIDATES);
  if (eligible.length === 0) return [];

  const vectors = vectorizeDocuments([
    reportText(queryReport || {}),
    ...eligible.map(reportText)
  ]);
  const query = vectors[0];
  if (query.magnitude === 0) return [];

  const suggestions = [];
  for (let index = 0; index < eligible.length; index += 1) {
    const candidateVector = vectors[index + 1];
    if (candidateVector.magnitude === 0) continue;

    let dotProduct = 0;
    const sharedTerms = [];
    for (const [term, queryWeight] of query.vector) {
      const candidateWeight = candidateVector.vector.get(term);
      if (candidateWeight === undefined) continue;
      dotProduct += queryWeight * candidateWeight;
      if (!term.includes('_')) sharedTerms.push({ term, weight: queryWeight * candidateWeight });
    }
    const similarity = dotProduct / (query.magnitude * candidateVector.magnitude);
    if (similarity < threshold) continue;

    suggestions.push({
      report: eligible[index],
      similarity,
      lingoMatched: sharedTerms
        .map(({ term }) => term)
        .some((term) => LINGO_SHARED_TERMS.has(term)),
      sharedTerms: sharedTerms
        .sort((left, right) => right.weight - left.weight)
        .slice(0, 3)
        .map(({ term }) => term)
    });
  }

  return suggestions
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);
}

module.exports = {
  LINGO_SHARED_TERMS,
  MAX_CANDIDATES,
  MAX_SUGGESTIONS,
  MIN_SIMILARITY,
  suggestRelatedCases
};
