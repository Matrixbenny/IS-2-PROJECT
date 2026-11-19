// Institutions in Kenya's anti-corruption architecture, mapped to the categories
// they are mandated to handle. This is a referral record, not a live integration.
//
// The chain in practice: EACC and DCI investigate; the ODPP decides whether to
// charge and prosecutes; the Judiciary tries the case; the Auditor-General and
// Ombudsman work alongside on audit and maladministration. County governments
// and the Public Service Commission handle staff discipline.
const AGENCIES = [
  {
    name: "Ethics and Anti-Corruption Commission (EACC)",
    handles: [
      "Bribery",
      "Extortion",
      "Abuse of Office",
      "Conflict of Interest",
      "Embezzlement",
      "Procurement Fraud",
    ],
    role: "investigator",
    legalBasis: "Anti-Corruption and Economic Crimes Act, 2003",
  },
  {
    name: "Directorate of Criminal Investigations (DCI)",
    handles: [
      "Bribery",
      "Extortion",
      "Fraud/Forgery of Documents",
      "Embezzlement",
    ],
    role: "investigator",
    legalBasis: "National Police Service Act, 2011",
  },
  {
    name: "Office of the Director of Public Prosecutions (ODPP)",
    handles: [
      "Bribery",
      "Extortion",
      "Embezzlement",
      "Procurement Fraud",
      "Fraud/Forgery of Documents",
      "Abuse of Office",
    ],
    role: "prosecutor",
    legalBasis:
      "Constitution Article 157; Office of the Director of Public Prosecutions Act, 2013",
  },
  {
    name: "Office of the Auditor-General",
    handles: ["Embezzlement", "Procurement Fraud"],
    role: "auditor",
    legalBasis: "Constitution Articles 229 and 248; Public Audit Act, 2015",
  },
  {
    name: "Office of the Ombudsman",
    handles: ["Abuse of Office", "Nepotism/Favoritism"],
    role: "oversight",
    legalBasis: "Commission on Administrative Justice Act, 2011",
  },
  {
    name: "Public Service Commission",
    handles: ["Nepotism/Favoritism", "Abuse of Office"],
    role: "administrative",
    legalBasis: "Constitution Article 234; Public Service Commission Act, 2017",
  },
  {
    name: "Independent Policing Oversight Authority (IPOA)",
    handles: ["Bribery", "Extortion", "Abuse of Office"],
    role: "oversight",
    // Only relevant when the allegation involves police conduct, so it is
    // suggested from the narrative rather than from the category alone.
    textTriggers: ["police", "polisi", "traffic officer", "administration police", "gsu", "askari"],
    legalBasis: "Independent Policing Oversight Authority Act, 2011",
  },
  {
    name: "Office of the Registrar of Political Parties",
    handles: ["Conflict of Interest"],
    role: "oversight",
    legalBasis: "Political Parties Act, 2011",
  },
];

// Suggests the agency most associated with a category, without requiring exact location data.
function suggestAgencyForCategory(category) {
  const match = AGENCIES.find((a) => a.handles.includes(category));
  return match ? match.name : null;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

module.exports = { AGENCIES, suggestAgencyForCategory, slugify };
