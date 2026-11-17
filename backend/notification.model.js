const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['status_change', 'agency_update', 'reviewer_message', 'admin_action', 'security', 'case_update'],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
  link: { type: String, default: null },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
});

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);