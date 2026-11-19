const mongoose = require('mongoose');
const { CATEGORIES } = require('./utils/categories');

// Released case file: the material an agency officer is authorised to
// investigate. Defined as an explicit sub-schema because the nested evidence
// array must keep its own ObjectId ids (an inline object would be cast to
// plain strings and lose them).
const releasedEvidenceSchema = new mongoose.Schema({
  evidenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  filename: String,
  type: String,
  releasedAt: { type: Date, default: Date.now }
}, { _id: false });

const caseFileSchema = new mongoose.Schema({
  narrative: { type: String, default: null },
  categoryDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  reporterContact: { type: Boolean, default: false },
  evidence: [releasedEvidenceSchema],
  releasedAt: { type: Date, default: null },
  releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  releasedByName: { type: String, default: null },
  // Set when a later reviewer/Admin extends or narrows the release.
  lastUpdatedAt: { type: Date, default: null }
}, { _id: false });

const agencyAccessLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  userEmail: String,
  action: { type: String, enum: ['view_case_file', 'download_evidence'], default: 'view_case_file' },
  evidenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  filename: String,
  ipAddress: String,
  at: { type: Date, default: Date.now }
}, { _id: false });

const informationRequestSchema = new mongoose.Schema({
  question: String,
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  requestedByEmail: String,
  requestedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['open', 'answered'], default: 'open' },
  answer: { type: String, default: null },
  answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  answeredByEmail: String,
  answeredAt: { type: Date, default: null }
}, { _id: true });

const agencyUpdateSchema = new mongoose.Schema({
  note: String,
  status: {
    type: String,
    enum: ['acknowledged', 'under_review', 'information_requested', 'action_taken', 'closed'],
    default: null
  },
  publicMessage: { type: String, default: null },
  publicMessageStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected', 'superseded'],
    default: 'none'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByName: { type: String, default: null },
  createdByEmail: { type: String, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const previousReferralSchema = new mongoose.Schema({
  agency: String,
  referralSummary: String,
  referenceNumber: String,
  notes: String,
  status: String,
  referredAt: Date,
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sentByName: String,
  endedAt: { type: Date, default: Date.now },
  agencyUpdates: [agencyUpdateSchema]
}, { _id: false });

const agencyReferralSchema = new mongoose.Schema({
  agency: { type: String, default: null },
  referralSummary: { type: String, default: null },
  referenceNumber: { type: String, default: null },
  notes: { type: String, default: null },
  // Case file released to the receiving agency (real investigation needs the
  // material, not just a summary). The referring reviewer decides item by item.
  caseFile: caseFileSchema,
  // Every read of a released file by an agency officer - the accountability
  // record that makes releasing sensitive material defensible.
  accessLog: [agencyAccessLogSchema],
  // Agency asks Kenya Watch for more information; the reviewer answers.
  informationRequests: [informationRequestSchema],
  // How the receiving institution disposed of the case. This is what turns an
  // investigation into an outcome the reporter is entitled to know about.
  resolution: {
    outcome: {
      type: String,
      // investigated_charged: files were charged in court (EACC/ODPP route).
      // investigated_no_action: investigated, insufficient evidence to charge.
      // referred_elsewhere: passed to another body with jurisdiction.
      // administrative_action: disciplinary or administrative measures taken.
      // not_pursued: outside the institution's mandate.
      enum: ['investigated_charged', 'investigated_no_action', 'referred_elsewhere', 'administrative_action', 'not_pursued', null],
      default: null
    },
    // Case or file number the institution opened (e.g. EACC/INV/2026/117).
    outcomeReference: { type: String, default: null },
    // Plain-language account the reporter can read without legal training.
    outcomeSummary: { type: String, default: null },
    // Legal basis relied on, e.g. sections charged under the Anti-Corruption and
    // Economic Crimes Act 2003.
    legalBasis: { type: String, default: null },
    courtsInvolved: { type: String, default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedByEmail: { type: String, default: null }
  },
  status: {
    type: String,
    enum: ['sent', 'acknowledged', 'under_review', 'information_requested', 'action_taken', 'closed'],
    default: 'sent'
  },
  referredAt: { type: Date, default: null },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sentByName: { type: String, default: null },
  previousReferrals: [previousReferralSchema],
  agencyUpdates: [agencyUpdateSchema]
}, { _id: false });

const reportSchema = new mongoose.Schema({
  // Public lookup handle (decision #21) - always present regardless of submission path.
  trackingReference: { type: String, required: true, unique: true },
  // Path A (anonymous) only - a hash of the one-time-shown Access Key. Path B never sets this.
  accessKeyHash: { type: String, default: null },
  // Path B only - the submitting citizen's account. Sealed from Reviewers at the data layer (decision #8/#25).
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  title: { type: String, required: true },
  reportedCategory: { type: String, required: true, enum: CATEGORIES },
  categorySpecificDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  description: { type: String, required: true },

  county: { type: String, required: true },
  subCounty: { type: String, required: true },
  incidentDateTime: { type: Date },

  demographic: {
    ageGroup: String,
    gender: String,
    occupation: String
  },

  evidence: [
    {
      gridFsId: { type: mongoose.Schema.Types.ObjectId, required: true },
      filename: String,
      type: { type: String, enum: ['image', 'video', 'audio', 'document'] },
      uploadedAt: { type: Date, default: Date.now }
    }
  ],

  status: { type: String, default: 'Received', enum: ['Received', 'In Review', 'Resolved', 'Rejected'] },
  statusHistory: [
    {
      status: String,
      changedAt: { type: Date, default: Date.now },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      // Reporter-facing plain-language explanation of the change. Never contains
      // reviewer identity - it is shown to the citizen on the tracking page.
      note: { type: String, default: null }
    }
  ],
  resolutionNote: { type: String, default: null },
  resolutionReference: { type: String, default: null },
  // Plain-language reason recorded when a Reviewer/Admin rejects a case; shown to
  // the reporter (deep tier) so rejection is never a silent dead end.
  rejectionReason: { type: String, default: null },
  citizenConfirmation: { type: String, enum: ['none', 'confirmed', 'disputed'], default: 'none' },

  comments: [
    {
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      text: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],

  // Internal, ML-inferred - never shown to the reporter, even in deep tier (decision #29).
  classification: {
    category: { type: String, default: null },
    urgency: { type: String, enum: ['Low', 'Medium', 'High', 'Critical', null], default: null },
    confidence: { type: Number, default: null },
    // Sheng/Kiswahili/dialect terms recognised during keyword triage
    // (decision #31). Reviewer-facing hint only; never a finding.
    lingoTerms: { type: [String], default: [] },
    // When classification completed - the escalation clock (decision #24) starts here, not at submission.
    classifiedAt: { type: Date, default: null }
  },
  categoryReview: {
    annotations: [
      {
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        decision: {
          type: String,
          enum: ['category', 'insufficient_information'],
          default: 'category',
          required: true
        },
        category: {
          type: String,
          enum: [...CATEGORIES, null],
          default: null,
          required: function categoryRequired() {
            return this.decision === 'category';
          }
        },
        note: { type: String, default: null },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    status: {
      type: String,
      enum: ['awaiting_second_review', 'agreed', 'needs_adjudication', 'adjudicated', 'insufficient_information'],
      default: 'awaiting_second_review'
    },
    adjudicatedCategory: { type: String, enum: [...CATEGORIES, null], default: null },
    adjudicatedDecision: {
      type: String,
      enum: ['category', 'insufficient_information', null],
      default: null
    },
    adjudicatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adjudicatedAt: { type: Date, default: null },
    adjudicationNote: { type: String, default: null }
  },
  tags: [String],

  agencyReferral: agencyReferralSchema,
  relatedCaseLinks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  claimedAt: { type: Date, default: null },
  // Set by an Admin when a case is under active legal proceedings - exempts it from
  // the automatic identity-anonymization retention window (decision #11).
  legalHold: { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  createdAt: { type: Date, default: Date.now }
});

reportSchema.index({ archivedAt: 1, createdAt: -1 });
reportSchema.index({ county: 1, archivedAt: 1, createdAt: -1 });
reportSchema.index({ user: 1, archivedAt: 1, createdAt: -1 });
reportSchema.index({ claimedBy: 1, status: 1, 'classification.urgency': 1, 'classification.classifiedAt': 1 });

// General tier (decision #21): safe for public browsing or Tracking Reference alone.
reportSchema.methods.toGeneralTier = function toGeneralTier() {
  return {
    _id: this._id,
    trackingReference: this.trackingReference,
    title: this.title,
    reportedCategory: this.reportedCategory,
    county: this.county,
    subCounty: this.subCounty,
    incidentDateTime: this.incidentDateTime,
    status: this.status,
    createdAt: this.createdAt,
    evidenceCount: this.evidence.length
  };
};

// Deep tier (decision #21): Reference+Key, Path B owner, or Reviewer/Admin. Never the sealed `user` field.
reportSchema.methods.toDeepTier = function toDeepTier() {
  return {
    ...this.toGeneralTier(),
    description: this.description,
    categorySpecificDetails: this.categorySpecificDetails,
    demographic: this.demographic,
    evidence: this.evidence.map((e) => ({ id: e._id, type: e.type, filename: e.filename, uploadedAt: e.uploadedAt })),
    statusHistory: this.statusHistory,
    resolutionNote: this.resolutionNote,
    resolutionReference: this.resolutionReference,
    rejectionReason: this.rejectionReason,
    citizenConfirmation: this.citizenConfirmation,
    comments: this.comments,
    // The reporter is told a human has the case, never which human. This is
    // what makes "claimed and under review" visible on the tracking page.
    caseStatus: {
      claimed: Boolean(this.claimedBy),
      claimedAt: this.claimedAt || null,
      underReview: this.status === 'In Review'
    },
    agencyProgress: this.agencyReferral?.agency ? {
      agency: this.agencyReferral.agency,
      status: this.agencyReferral.status || 'sent',
      referredAt: this.agencyReferral.referredAt,
      // The outcome the institution reached, in language the reporter can read.
      outcome: this.agencyReferral.resolution?.outcome || null,
      outcomeSummary: this.agencyReferral.resolution?.outcomeSummary || null,
      outcomeReference: this.agencyReferral.resolution?.outcomeReference || null,
      legalBasis: this.agencyReferral.resolution?.legalBasis || null,
      closedAt: this.agencyReferral.resolution?.closedAt || null,
      updates: (this.agencyReferral.agencyUpdates || [])
        .filter((update) => update.publicMessageStatus === 'approved' && update.publicMessage)
        .map((update) => ({ message: update.publicMessage, createdAt: update.createdAt }))
    } : null
  };
};

// Reviewer/Admin tier: deep tier plus the internal triage-only fields.
reportSchema.methods.toReviewerTier = function toReviewerTier() {
  return {
    ...this.toDeepTier(),
    classification: this.classification,
    tags: this.tags,
    agencyReferral: this.agencyReferral,
    relatedCaseLinks: this.relatedCaseLinks,
    claimedBy: this.claimedBy,
    legalHold: this.legalHold,
    archivedAt: this.archivedAt,
    hasAccount: !!this.user
  };
};

module.exports = mongoose.model('Report', reportSchema);
