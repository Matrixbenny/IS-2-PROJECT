// Kenya lingo normalisation (decision #31).
//
// Kenyan reports are rarely "pure English" or "pure Kiswahili". Citizens mix
// English, Kiswahili, Sheng and local dialects in one sentence ("walinidai
// chai ya 5k nikiwa kwa ofisi ya lands") and spell the same word several ways
// ("hongo" / "hongoh" / "chai" / "kitu kidogo"). The keyword classifier, the
// TF-IDF related-report matcher and the experimental category model all
// tokenise text, so without a shared normaliser the same allegation looks like
// three unrelated documents.
//
// This module is deliberately conservative and explainable:
//   1. normaliseText()  - NFKD, strip accents, lowercase, collapse punctuation.
//   2. expandLingoTerms() - replace known Sheng/dialect tokens with a
//      canonical English/Kiswahili phrase using word boundaries, so "chai" as a
//      bribe is matched but "chai baridi" (tea) is not silently corrupted.
//   3. normaliseForMatching() - the full pipeline, used by every layer.
//
// It never changes what a citizen wrote. Report narratives are stored exactly
// as submitted; this text is only used for matching, grouping and model input.

// Canonical forms are chosen to match the vocabulary in classifier.js and the
// ML training data, e.g. "hongo" -> "rushwa bribe", which the bribery
// keyword list already understands.
const SHENG_AND_DIALECT_TERMS = {
  // --- money-for-favour synonyms (bribery / extortion) ---
  'kitu kidogo': 'rushwa bribe',
  'chai ya': 'rushwa bribe',
  'pesa ya chai': 'rushwa bribe',
  'toa chai': 'toa rushwa bribe',
  'kupiga chai': 'rushwa bribe',
  'chai mzee': 'rushwa bribe',
  hongo: 'rushwa bribe',
  hongoh: 'rushwa bribe',
  'hongoo': 'rushwa bribe',
  'hongo ya': 'rushwa bribe',
  'nikikataa': 'refused extort',
  'nikikataa kulipa': 'refused forced to pay extort',
  'tulikataa': 'refused extort',
  'pesa chini ya meza': 'rushwa bribe under the table',
  'chini ya meza': 'under the table bribe',
  'kutiwa mfukoni': 'rushwa bribe',
  kuchomea: 'rushwa bribe',
  kuchoma: 'rushwa bribe',
  'kutoa kitu': 'rushwa bribe',
  'pesa ya mkono': 'rushwa bribe',
  bakshishi: 'rushwa bribe',
  'zawadi ya kazi': 'rushwa bribe',
  chaidai: 'demanded money bribe',
  nidai: 'demanded money',
  wanadai: 'demanded money',
  'alikuwa anadai': 'demanded money',

  // --- embezzlement / misappropriation ---
  'kula pesa': 'embezzle misappropriated funds',
  'kuliwa pesa': 'embezzle misappropriated funds',
  'kula za umma': 'embezzle public funds',
  'pesa imeliwa': 'embezzle misappropriated funds',
  'kumezwa': 'embezzle misappropriated funds',
  'kupotea kwa pesa': 'missing funds',
  'pesa hazieleweki': 'missing funds unexplained',
  'kuchota': 'diverted funds misappropriat',
  'kuchota pesa': 'diverted funds misappropriat',
  'kukata pesa': 'diverted funds misappropriat',
  'kufuja': 'misappropriat waste public funds',
  'kufuja pesa': 'misappropriat waste public funds',
  'matumizi mabaya': 'misappropriat misuse of public funds',

  // --- procurement / tenders (mixed English / Kiswahili / Sheng) ---
  'zabuni': 'tender procurement',
  'kupanga zabuni': 'bid rigging tender',
  'kupanga': 'rigged arranged irregular',
  'tender zimepangwa': 'bid rigging tender',
  'kupokea hongo kwa tender': 'bribe tender procurement',
  'mkataba wa hewa': 'ghost supplier inflated contract',
  'kampuni ya hewa': 'ghost supplier',
  'tender ya hewa': 'ghost supplier inflated contract',
  'bei imepandishwa': 'inflated contract inflated price',
  'kupeana tender': 'awarded tender supplier',
  'tender ya ndugu': 'tender nepotism relative',

  // --- nepotism / favouritism ---
  'kuajiri ndugu': 'nepotism hired relative',
  'ameajiri ndugu': 'nepotism hired relative',
  'kuweka ndugu': 'nepotism hired relative',
  'kupendelea': 'favoritism nepotism',
  'upendeleo': 'favoritism nepotism',
  'kujuana': 'favoritism relative connection',
  'tuajiri': 'hired',
  'wetu': 'relative favoritism',
  'jamaa yake': 'relative nepotism',
  'ndugu yake': 'relative nepotism',
  'mtoto wake': 'relative nepotism',
  'mtu wake': 'relative favoritism',

  // --- abuse of office ---
  'kutumia ofisi': 'abuse of office misuse position',
  'kutumia cheo': 'abuse of office misuse position',
  'kutumia mamlaka': 'abuse of office misuse authority',
  'amejipatia': 'misappropriat benefited personally',
  'kujipatia': 'benefited personally',
  'kunyanyasa': 'abuse extort intimidate',
  'kudhulumu': 'abuse extort',

  // --- extortion / threats ---
  'vitisho': 'threatened extort',
  'kunilazimisha': 'forced to pay extort',
  'kulazimishwa': 'forced to pay extort',
  'kunitishia': 'threatened extort',
  'atakufanya nini': 'threatened extort',
  'nikikataa': 'refused extort',
  'hamna njia': 'forced extortion',
  'lazima ulipe': 'forced to pay extort',
  'utalipa': 'forced to pay extort',
  // Threats that accompany a demand. Before these were mapped, a Sheng
  // extortion report scored as bribery: "nikikataa" carried the extort canon,
  // but the threat beside it was invisible, so the money words won.
  'kutishia': 'threatened extort',
  'kutishia maisha': 'threatened to kill extort',
  'kutishiwa': 'threatened extort',
  'kutishiwa maisha': 'threatened to kill extort',
  'kunichoma': 'threatened extort',
  'kunichomeka': 'threatened extort',
  'kuchomeka': 'threatened extort',
  'kunichoma kisu': 'threatened extort coerced',
  'kuchoma kisu': 'threatened extort coerced',
  'kukuua': 'threatened to kill',
  'kuuawa': 'threatened to kill',
  'nitakuua': 'threatened to kill',
  'tutakuua': 'threatened to kill',
  'kukupiga': 'coerced threatened extort',
  'kunipiga': 'coerced threatened extort',
  'kukudhuru': 'threatened extort',
  'utajuta': 'threatened extort coerced',

  // --- money in the corruption sense (Sheng) ---
  // These are deliberately mapped to "bribe" and not only to "money": in a
  // corruption narrative the money word is the improper benefit, and mapping it
  // to a neutral canon left embezzlement and bribery reports scoring as Other.
  'mullah': 'bribe money amount',
  'mula': 'bribe money amount',
  'doo nyingi': 'bribe money amount',
  'chedaz nyingi': 'bribe money amount',
  'mkwanja mnene': 'bribe money amount',

  // --- Oxford-recognised corruption loanwords (added to the OED, 2024) ---
  // kitu kidogo = a bribe / token inducement; panya route = smugglers' secret path.
  'kitu kidogo kidogo': 'rushwa bribe small',
  'toza kitu kidogo': 'pay bribe',
  'panya route': 'smuggling evasion secret route',
  panya: 'smuggle evasion',

  // --- tender/procurement Sheng ("Udingo ndio maana magidha ako ndani") ---
  'gava pesa': 'government funds public money',
  'pesa za gava': 'government funds public money',
  'serikali pesa': 'government funds public money',
  'pesa za serikali': 'public funds government money',
  'magidha': 'court case prosecution',
  'govala': 'government state',

  // --- money slang (Wikipedia Sheng lexicon): chedaz, doe, mkwanja etc. ---
  chedaz: 'money',
  cheddar: 'money',
  mkwanja: 'money',
  makwarkwar: 'money',
  cheng: 'money',
  ganji: 'money',
  chapaa: 'money',
  doo: 'money',
  doe: 'money',
  mundez: 'money',
  thao: 'one thousand money amount',
  jirongo: 'five hundred money amount',
  finje: 'fifty money amount',
  mbao: 'twenty money amount',
  kobole: 'five money amount small amount',

  // --- commonly reported actors/locations ---
  karao: 'police officer',
  karaoke: 'police officer',
  kanjo: 'city council enforcement officer',
  kanjoo: 'city council enforcement officer',
  msapere: 'elder respected person',
  mdosi: 'boss supervisor',
  doshi: 'boss supervisor',
  'mtu wa serikali': 'government official',
  mserikali: 'government official',
  
  // --- Gengetone / Twitter-era Sheng (Tuko 50+ list, Mbogi Genje, The Star 2020) ---
  godha: 'steal theft',
  zamwa: 'pickpocketed theft stolen',
  msanii: 'thief thug',
  mambaru: 'detectives dci police investigation',
  njege: 'police officer',
  karau: 'police officer',
  kanja: 'pay give money',
  dau: 'money',
  baroda: 'money',
  mita: 'one million money amount',
  jill: 'two hundred money amount',
  salasa: 'thirty money amount',
  kinde: 'ten money amount',
  chwani: 'fifty money amount',
  imbo: 'fake counterfeit',
  mbwenya: 'court case legal',
  kanairo: 'nairobi',
  sonko: 'rich person influential',

  // --- fraud / forgery ---
  'cheti bandia': 'fake document forged forgery',
  'hati bandia': 'fake document forged forgery',
  'kubuni nyaraka': 'forged falsified documents',
  'kuchakachua': 'falsified forged rigged',
  'kuchakachua nyaraka': 'forged falsified documents',
  'nyaraka za uongo': 'fake document forged',
  'kudanganya': 'fraud deception',
  'kupotosha': 'fraud deception mislead',

  // --- conflict of interest ---
  'maslahi binafsi': 'conflict of interest personal interest',
  'mgongano wa maslahi': 'conflict of interest',
  'anafaa mwenyewe': 'personal interest conflict',

  // --- locations / offices that co-occur with corruption in Sheng ---
  'ofisi ya ardhi': 'lands office land registry',
  'ofisi ya lands': 'lands office land registry',
  'ofisi ya polisi': 'police station',
  'kwa chief': 'chief office',
  'kwa afisi': 'office',
  'hospitali ya umma': 'public hospital',
  'shule ya serikali': 'public school',

  // --- Kenya first names are irrelevant tokens for matching; keep the
  // generic word "mtu" but map obvious filler/hedges out of the way.
  'sijui': 'do not know unclear',
  'sina uhakika': 'not sure unclear',
  labda: 'maybe unclear',
  whatsapp: 'whatsapp',
  whatsap: 'whatsapp',
  whatsappi: 'whatsapp'
};

// Very common Sheng/Kiswahili filler words that add noise to TF-IDF once the
// terms above have been expanded. "kwa", "na", "ya" etc. are already stop
// words in relatedCaseMatcher.js; these are the Sheng-only additions.
// --- Sheng filler words that are NOT signals of corruption (updated) ---
const LINGO_STOP_WORDS = new Set([
  'sasa', 'basi', 'kweli', 'sana', 'tu', 'enyewe', 'mzee', 'wewe', 'mimi', 'yeye',
  'sisi', 'nyinyi', 'wao', 'hapa', 'pale', 'kule', 'huko', 'siku', 'leo', 'jana',
  'kesho', 'pole', 'sawa', 'ndio', 'ndiyo', 'hapana', 'bwana', 'mama', 'ndugu',
  'aki', 'ati', 'eti', 'jo', 'buda', 'maze', 'mbesha', 'sande', 'asante', 'karibu',
  'sema', 'ongea', 'jua', 'ona', 'endelea', 'kamata'
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPhrasePatterns(glossary) {
  // Longest phrase first so "pesa ya chai" wins over "chai".
  return Object.entries(glossary)
    .sort((left, right) => right[0].length - left[0].length)
    .map(([term, canonical]) => ({
      // Match whole words/phrases, refusing to fire when the token is part of a
      // longer word (so "chaidai" never also matches "chai").
      pattern: new RegExp(`(?<![\p{L}\p{N}])${escapeRegExp(term)}(?![\p{L}\p{N}])`, 'gu'),
      canonical
    }));
}

// Terms a reviewer proposed and an Admin approved. They extend, and can never
// replace, the built-in glossary above.
let approvedTerms = {};
let PHRASE_PATTERNS = buildPhrasePatterns(SHENG_AND_DIALECT_TERMS);

function registerApprovedTerms(terms) {
  approvedTerms = {};
  for (const [term, canonical] of Object.entries(terms || {})) {
    if (!(term in SHENG_AND_DIALECT_TERMS)) approvedTerms[term] = canonical;
  }
  PHRASE_PATTERNS = buildPhrasePatterns({ ...SHENG_AND_DIALECT_TERMS, ...approvedTerms });
}

function glossaryTermCount() {
  return { builtIn: Object.keys(SHENG_AND_DIALECT_TERMS).length, approved: Object.keys(approvedTerms).length };
}

const LINGO_STOP_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${Array.from(LINGO_STOP_WORDS).map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
  'gu'
);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Applies the Sheng/Kiswahili/dialect glossary to already-normalised text.
 * Returns the expanded text.
 */
function expandLingoTerms(normalizedValue) {
  let text = normalizedValue;
  for (const { pattern, canonical } of PHRASE_PATTERNS) {
    text = text.replace(pattern, ` ${canonical} `);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The shared preprocessing pipeline for grouping, keyword triage and model
 * input. Deterministic, synchronous and cheap: safe to call per request.
 */
function normaliseForMatching(value) {
  return expandLingoTerms(normalizeText(value));
}

/**
 * Same as normaliseForMatching but also removes Sheng filler words. Used by
 * TF-IDF so that "sasa", "basi" etc. do not create false similarity between
 * otherwise unrelated reports.
 */
function normaliseForSimilarity(value) {
  const expanded = normaliseForMatching(value);
  return expanded.replace(LINGO_STOP_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Reports which Sheng/Kiswahili/dialect terms were recognised in a piece of
 * text. Reviewers see this as a small "language signals" hint; it is never
 * used as a finding.
 */
function detectLingoTerms(value) {
  const text = ` ${normalizeText(value)} `;
  const found = [];
  for (const term of Object.keys({ ...SHENG_AND_DIALECT_TERMS, ...approvedTerms })) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'u');
    if (pattern.test(text) && !found.includes(term)) found.push(term);
  }
  return {
    terms: found.slice(0, 12),
    normalized: normaliseForMatching(value)
  };
}

module.exports = {
  SHENG_AND_DIALECT_TERMS,
  registerApprovedTerms,
  glossaryTermCount,
  LINGO_STOP_WORDS,
  normalizeText,
  expandLingoTerms,
  normaliseForMatching,
  normaliseForSimilarity,
  detectLingoTerms
};
