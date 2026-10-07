// Agencies/institutions mapped to the corruption categories they typically handle
// (decision #7) - a structured referral record, not a live system integration.
const AGENCIES = [
  {
    name: 'Ethics and Anti-Corruption Commission (EACC)',
    handles: ['Bribery', 'Extortion', 'Abuse of Office', 'Conflict of Interest']
  },
  {
    name: 'Directorate of Criminal Investigations (DCI)',
    handles: ['Bribery', 'Extortion', 'Fraud/Forgery of Documents']
  },
  {
    name: 'Office of the Auditor-General',
    handles: ['Embezzlement', 'Procurement Fraud']
  },
  {
    name: 'Office of the Ombudsman',
    handles: ['Abuse of Office', 'Nepotism/Favoritism']
  },
  {
    name: 'Public Service Commission',
    handles: ['Nepotism/Favoritism', 'Abuse of Office']
  }
];

// Suggests the agency most associated with a category, without requiring exact location data.
function suggestAgencyForCategory(category) {
  const match = AGENCIES.find((a) => a.handles.includes(category));
  return match ? match.name : null;
}

module.exports = { AGENCIES, suggestAgencyForCategory };
