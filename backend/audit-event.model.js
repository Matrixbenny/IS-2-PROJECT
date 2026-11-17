const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorRole: { type: String, default: null },
  targetType: { type: String, required: true },
  targetId: { type: String, default: null, index: true },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null, index: true },
  outcome: { type: String, enum: ['success', 'denied', 'failed'], default: 'success', index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipHash: { type: String, default: null },
  userAgent: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
});

auditEventSchema.index({ createdAt: -1 });
auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

auditEventSchema.statics.record = async function record({
  action,
  actor = null,
  actorRole = null,
  targetType,
  targetId = null,
  report = null,
  outcome = 'success',
  metadata = {},
  ipHash = null,
  userAgent = null
}) {
  return this.create({
    action,
    actor,
    actorRole,
    targetType,
    targetId,
    report,
    outcome,
    metadata,
    ipHash,
    userAgent
  });
};

module.exports = mongoose.model('AuditEvent', auditEventSchema);