// Routing suggestions: which institution(s) should receive a case.
//
// One report can describe several kinds of wrongdoing at once (a bribe paid to
// hide embezzlement, a forged tender document, a police officer extorting a
// supplier). The old single-category lookup always returned one agency and could
// not express that. This module detects every category present, then picks the
// smallest sensible set of agencies that together cover them.
//
// It only SUGGESTS. A human reviewer confirms or corrects every referral, and
// what they chose is recorded so the suggestions can be measured and improved.
const { AGENCIES, slugify } = require('./agencies');
const { CATEGORIES } = require('./categories');
const { scoreAllCategories } = require('./classifier');
const { normaliseForMatching } = require('./kenyaLingo');

// A single unambiguous or strong keyword in the narrative is enough to count a
// category as "present"; one weak word is not.
const NARRATIVE_MIN_SCORE = 3;
// Relative model score above which a second category is worth mentioning. The
// score ranks categories for one report and is not a calibrated probability.
const MODEL_MIN_SCORE = 0.25;

const SOURCE_WEIGHT = { reporter: 1, reporterExtra: 0.8, narrative: 0.6, model: 0.5 };
const SOURCE_LABEL = {
  reporter: 'selected by the reporter',
  reporterExtra: 'also flagged by the reporter',
  narrative: 'found in the narrative',
  model: 'suggested by the experimental model'
};

function detectCategories({ reportedCategory, additionalCategories = [], title = '', description = '', modelScores = null }) {
  const found = new Map();
  const add = (category, source) => {
    if (!CATEGORIES.includes(category) || category === 'Other') return;
    const entry = found.get(category) || { category, sources: [], weight: 0 };
    if (!entry.sources.includes(source)) {
      entry.sources.push(source);
      entry.weight += SOURCE_WEIGHT[source];
    }
    found.set(category, entry);
  };

  add(reportedCategory, 'reporter');
  for (const category of additionalCategories || []) add(category, 'reporterExtra');

  const scores = scoreAllCategories(`${title} ${description}`);
  for (const [category, score] of Object.entries(scores)) {
    if (score >= NARRATIVE_MIN_SCORE) add(category, 'narrative');
  }
  if (Array.isArray(modelScores)) {
    for (const { category, score } of modelScores) {
      if (score >= MODEL_MIN_SCORE) add(category, 'model');
    }
  }
  return Array.from(found.values());
}

function suggestRouting(input, { availableSlugs = null } = {}) {
  const detected = detectCategories(input);
  const text = normaliseForMatching(`${input.title || ''} ${input.description || ''}`);
  const byCategory = new Map(detected.map((entry) => [entry.category, entry]));

  const candidates = [];
  for (const [order, agency] of AGENCIES.entries()) {
    const matched = agency.handles.filter((category) => byCategory.has(category));
    if (matched.length === 0) continue;
    const triggered = Array.isArray(agency.textTriggers)
      && agency.textTriggers.some((term) => text.includes(term));
    // Specialist bodies (e.g. police oversight) apply only when the narrative
    // actually involves their subject; the category alone is not enough.
    if (agency.textTriggers && !triggered) continue;

    const score = matched.reduce((sum, category) => sum + byCategory.get(category).weight, 0)
      + (agency.role === 'investigator' ? 0.2 : 0);
    candidates.push({
      name: agency.name,
      slug: slugify(agency.name),
      role: agency.role,
      legalBasis: agency.legalBasis,
      // Prosecutors decide on charging after investigators finish a file; they
      // are not an intake destination for a raw complaint.
      stage: agency.role === 'prosecutor' ? 'follow_on' : 'intake',
      specialist: Boolean(agency.textTriggers),
      order,
      matched,
      score: Number(score.toFixed(2))
    });
  }

  // 1) Every detected category gets its lead investigator, by mandate order in
  //    AGENCIES (the EACC leads on corruption offences, the DCI on forgery).
  // 2) Any category still uncovered then takes the best-scoring remaining agency
  //    (e.g. the Ombudsman for nepotism). Others are listed as alternatives.
  // Specialists (police oversight) apply whenever their trigger fires.
  const intake = candidates
    .filter((candidate) => candidate.stage === 'intake')
    .sort((a, b) => a.order - b.order);
  const covered = new Set();
  const recommendedNames = new Set();
  const choose = (candidate) => {
    recommendedNames.add(candidate.name);
    candidate.matched.forEach((category) => covered.add(category));
  };
  for (const category of byCategory.keys()) {
    const lead = intake.find((candidate) => candidate.role === 'investigator' && candidate.matched.includes(category));
    if (lead && !recommendedNames.has(lead.name)) choose(lead);
    else if (lead) lead.matched.forEach((item) => covered.add(item));
  }
  const byScore = [...intake].sort((a, b) => b.score - a.score || a.order - b.order);
  for (const candidate of byScore) {
    if (recommendedNames.has(candidate.name)) continue;
    if (candidate.specialist || candidate.matched.some((category) => !covered.has(category))) choose(candidate);
  }

  const agencies = candidates
    .sort((a, b) => {
      if (a.stage !== b.stage) return a.stage === 'intake' ? -1 : 1;
      const ar = recommendedNames.has(a.name);
      const br = recommendedNames.has(b.name);
      if (ar !== br) return ar ? -1 : 1;
      // Recommended agencies follow mandate order (the EACC leads on corruption);
      // alternatives are ranked by how well they match.
      if (ar) return a.order - b.order;
      return b.score - a.score || a.order - b.order;
    })
    .map((candidate) => {
      const recommended = recommendedNames.has(candidate.name);
      const reasons = candidate.matched.map((category) => {
        const sources = byCategory.get(category).sources.map((source) => SOURCE_LABEL[source]).join(', ');
        return `${category} (${sources})`;
      });
      let note = null;
      if (candidate.stage === 'follow_on') {
        note = 'Decides on prosecution after an investigating agency completes its file. Refer once an investigation has produced one.';
      } else if (candidate.specialist) {
        note = 'Applies because the narrative involves the conduct of this institution\'s subject.';
      } else if (!recommended) {
        note = 'Alternative: its mandate overlaps with the recommended agencies already selected.';
      }
      return {
        name: candidate.name,
        slug: candidate.slug,
        role: candidate.role,
        legalBasis: candidate.legalBasis,
        stage: candidate.stage,
        score: candidate.score,
        recommended,
        categories: candidate.matched,
        reasons,
        note,
        available: availableSlugs ? availableSlugs.has(candidate.slug) : null
      };
    });

  return {
    categories: detected.map(({ category, sources }) => ({
      category,
      sources: sources.map((source) => SOURCE_LABEL[source])
    })),
    agencies,
    modelUsed: Array.isArray(input.modelScores),
    multiAgency: agencies.filter((agency) => agency.recommended).length > 1,
    disclaimer: 'Routing suggestions are an aid, not a jurisdiction decision. A reviewer must confirm or correct every referral.'
  };
}

module.exports = { suggestRouting, detectCategories };
