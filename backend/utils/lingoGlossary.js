const LingoTerm = require('../lingo-term.model');
const { registerApprovedTerms } = require('./kenyaLingo');

// Loads Admin-approved terms from the database into the shared normaliser, so
// triage, related-case matching and the model all start reading them at once.
async function refreshApprovedTerms() {
  const approved = await LingoTerm.find({ status: 'approved' }).select('term canonical').lean();
  registerApprovedTerms(Object.fromEntries(approved.map((item) => [item.term, item.canonical])));
  return approved.length;
}

module.exports = { refreshApprovedTerms };
