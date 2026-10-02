// Fixed category list citizens self-select from (decision #29), shared by the model,
// the classifier, and the frontend form so every layer stays in sync.
const CATEGORIES = [
  'Bribery',
  'Embezzlement',
  'Procurement Fraud',
  'Abuse of Office',
  'Nepotism/Favoritism',
  'Extortion',
  'Fraud/Forgery of Documents',
  'Conflict of Interest',
  'Other'
];

// Optional "if known" category-specific fields, grounded in ACECA's statutory elements.
const CATEGORY_FIELDS = {
  'Bribery': [
    { name: 'officialRole', label: 'Role/position of the person involved' },
    { name: 'demandedOrOffered', label: 'What was demanded or offered' },
    { name: 'actionRequested', label: 'What action it was for' },
    { name: 'paymentMade', label: 'Was payment made, or only demanded?' }
  ],
  'Embezzlement': [
    { name: 'publicBody', label: 'Public body/department involved' },
    { name: 'fundsDescription', label: 'Description of the funds/property' },
    { name: 'approximateAmount', label: 'Approximate amount (if known)' },
    { name: 'budgetLine', label: 'Project/budget line it was meant for' },
    { name: 'diversionMethod', label: 'How the diversion allegedly happened' }
  ],
  'Procurement Fraud': [
    { name: 'procuringEntity', label: 'Procuring entity' },
    { name: 'tenderReference', label: 'Tender/contract reference (if known)' },
    { name: 'manipulationNature', label: 'Nature of the manipulation' },
    { name: 'supplierInvolved', label: 'Supplier/company involved' },
    { name: 'approximateValue', label: 'Approximate contract value' }
  ],
  'Abuse of Office': [
    { name: 'officePosition', label: 'Office/position held' },
    { name: 'decisionTaken', label: 'The decision or action taken' },
    { name: 'beneficiary', label: 'Who benefited' },
    { name: 'howImproper', label: 'How it was improper' }
  ],
  'Nepotism/Favoritism': [
    { name: 'relationship', label: 'Relationship between the officer and beneficiary' },
    { name: 'benefitInQuestion', label: 'The appointment/tender/benefit in question' }
  ],
  'Extortion': [
    { name: 'demanded', label: 'What was demanded' },
    { name: 'threatUsed', label: 'Under what threat' },
    { name: 'paymentMade', label: 'Was payment made?' }
  ],
  'Fraud/Forgery of Documents': [
    { name: 'documents', label: 'Which document(s)' },
    { name: 'whatWasFalsified', label: 'What was falsified' }
  ],
  'Conflict of Interest': [
    { name: 'personalInterest', label: 'Nature of the personal/financial interest' },
    { name: 'decisionAffected', label: 'The decision it affected' },
    { name: 'disclosedBeforehand', label: 'Was it disclosed beforehand?' }
  ],
  'Other': []
};

module.exports = { CATEGORIES, CATEGORY_FIELDS };
