const { AGENCIES } = require('./agencies');

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Demo-only access codes (NOT a real auth system) so the concept Agency Partner
// Portal can be shown without building full accounts for institutions we have no
// real access to. Clearly a prototype per decision #7 - Kenya Watch never auto-
// submits anything externally; this just visualises what a referral hand-off could look like.
const AGENCY_DEMO_CODES = {
  'ethics-and-anti-corruption-commission-eacc': 'EACC-DEMO-2026',
  'directorate-of-criminal-investigations-dci': 'DCI-DEMO-2026',
  'office-of-the-auditor-general': 'OAG-DEMO-2026',
  'office-of-the-ombudsman': 'OMB-DEMO-2026',
  'public-service-commission': 'PSC-DEMO-2026'
};

function findAgencyBySlug(slug) {
  return AGENCIES.find((a) => slugify(a.name) === slug) || null;
}

function isValidDemoCode(slug, code) {
  return AGENCY_DEMO_CODES[slug] && AGENCY_DEMO_CODES[slug] === code;
}

module.exports = { slugify, findAgencyBySlug, isValidDemoCode, AGENCY_DEMO_CODES };
