const mongoose = require('mongoose');


const reportSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String },
  evidence: [
    {
      url: String, // URL or path to file
      type: String, // image, video, document, etc.
      uploadedAt: { type: Date, default: Date.now }
    }
  ],
  demographic: {
    ageGroup: String,
    gender: String,
    occupation: String
  },
  status: { type: String, default: 'Received', enum: ['Received', 'In Review', 'Resolved', 'Rejected'] },
  statusHistory: [
    {
      status: String,
      changedAt: { type: Date, default: Date.now },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  ],
  tags: [String],
  comments: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      text: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who submitted
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);
