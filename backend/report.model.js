const mongoose = require('mongoose');
const { CATEGORIES } = require('./utils/categories');

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
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    }
  ],
  resolutionNote: { type: String, default: null },
  resolutionReference: { type: String, default: null },
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
    confidence: { type: Number, default: null }
  },
  tags: [String],

  agencyReferral: {
    agency: { type: String, default: null },
    referenceNumber: { type: String, default: null },
    notes: { type: String, default: null }
  },
  relatedCaseLinks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  createdAt: { type: Date, default: Date.now }
});

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
    citizenConfirmation: this.citizenConfirmation,
    comments: this.comments
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
    hasAccount: !!this.user
  };
};

module.exports = mongoose.model('Report', reportSchema);
