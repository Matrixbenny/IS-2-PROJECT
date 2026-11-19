const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: {
    type: String,
    required: function passwordRequired() {
      return this.role !== 'admin';
    }
  },
  role: { type: String, enum: ['user', 'admin', 'reviewer', 'reviewer_pending', 'agency'], default: 'user' },
  reviewerApplicationStatus: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
  reviewerApplicationNote: { type: String, default: null },
  reviewerApplicationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewerApplicationReviewedAt: { type: Date, default: null },
  reviewerApplicationRejectionReason: { type: String, default: null },
  reviewerApplicationDocuments: [{
    kind: { type: String, enum: ['cv', 'qualification'], required: true },
    gridFsId: { type: mongoose.Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    viewedAt: { type: Date, default: null },
    viewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  }],
  // Documents are retained after the Admin decision (decision #34) so the
  // exact submitted PDFs can always be re-opened. The flag marks a decision as
  // having been made; it is not a scheduled-deletion marker.
  reviewerApplicationDocumentsRetained: { type: Boolean, default: false },
  reviewerApplicationScreening: [{
    _id: false,
    kind: String,
    fingerprint: String,
    bytes: Number,
    producer: String,
    creationDate: String,
    pageCount: Number,
    imageBased: Boolean,
    digitallySigned: Boolean,
    encrypted: Boolean,
    flags: [{ level: String, message: String }]
  }],
  reviewerApplicationDocumentsVerifiedAt: { type: Date, default: null },
  reviewerApplicationDocumentsVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  agencySlug: { type: String, default: null },
  // --- Agency officer SELF-APPLICATION (officer applies, Admin verifies) ---
  // Mirrors the reviewer application: the officer's own account exists but is
  // inactive and cannot sign in until an Admin confirms identity, employment and
  // legal authority against the agency's official records.
  agencyApplicationStatus: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
  agencyApplicationStaffNumber: { type: String, default: null },
  agencyApplicationJobTitle: { type: String, default: null },
  agencyApplicationDutyStation: { type: String, default: null },
  agencyApplicationOfficialEmail: { type: String, default: null },
  agencyApplicationJustification: { type: String, default: null },
  agencyApplicationDeclaredAt: { type: Date, default: null },
  agencyApplicationDocuments: [{
    kind: { type: String, enum: ['authorisation_letter', 'staff_id'], required: true },
    gridFsId: { type: mongoose.Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    viewedAt: { type: Date, default: null },
    viewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  }],
  agencyApplicationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  agencyApplicationReviewedAt: { type: Date, default: null },
  agencyApplicationRejectionReason: { type: String, default: null },
  // Admin's recorded answers to the Kenya-specific verification checklist.
  // Every item must be checked before approval is accepted.
  agencyApplicationVerificationSteps: [{
    _id: false,
    key: String,
    done: Boolean,
    note: String
  }],
  agencyApplicationScreening: [{
    _id: false,
    kind: String,
    fingerprint: String,
    bytes: Number,
    producer: String,
    creationDate: String,
    pageCount: Number,
    imageBased: Boolean,
    digitallySigned: Boolean,
    encrypted: Boolean,
    flags: [{ level: String, message: String }]
  }],
  agencyVerificationReference: { type: String, default: null },
  agencyVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  agencyVerifiedAt: { type: Date, default: null },
  agencyInvitationAcceptedAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  emailNotificationsOptIn: { type: Boolean, default: false },
  // Optional SMS twin of the email preference (decision #33). Stored as E.164
  // (+2547XXXXXXXX). SMS is only sent when a provider is configured.
  smsNotificationsOptIn: { type: Boolean, default: false },
  phoneNumber: { type: String, default: null },
  // Zero-cost phone alerts: a browser Web Push subscription delivered by the
  // OS to the installed Kenya Watch app/icon. Needs no airtime, no SIM credit
  // and no SMS gateway - only internet (including free Wi-Fi).
  pushNotificationsOptIn: { type: Boolean, default: false },
  pushSubscriptions: [{
    _id: false,
    endpoint: { type: String, required: true },
    expirationTime: { type: Number, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    },
    createdAt: { type: Date, default: Date.now }
  }],
  resetPasswordTokenHash: { type: String, default: null },
  resetPasswordExpiry: { type: Date, default: null },
  // Every session cookie carries the version it was issued under. A password
  // change or reset bumps it, so a stolen session cannot outlive the change.
  tokenVersion: { type: Number, default: 0 },
  // Per-account brake on password guessing, on top of the per-network rate limit.
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 11);
  if (!this.isNew) this.tokenVersion = (this.tokenVersion || 0) + 1;
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);