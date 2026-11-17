const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  tokenId: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revokedReason: { type: String, default: null },
  mfaVerified: { type: Boolean, default: false },
  lastSeenAt: { type: Date, default: Date.now },
  ipHash: { type: String, default: null },
  userAgent: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1, revokedAt: 1, createdAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);