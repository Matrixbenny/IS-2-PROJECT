const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String },
  evidenceUrls: [String], // URLs or paths to uploaded files
  demographic: {
    ageGroup: String,
    gender: String,
    occupation: String
  },
  status: { type: String, default: 'Received' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);
