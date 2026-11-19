const mongoose = require('mongoose');

// A Kenyan word or phrase (Sheng, Kiswahili, a local dialect) that a reviewer met
// in a report and that the built-in glossary does not know. An Admin approves it
// before it can influence any matching. This is how the glossary keeps learning
// from real use without scraping anyone's private posts.
const lingoTermSchema = new mongoose.Schema({
  term: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
  // What the term should be read as: plain English or Kiswahili words the
  // classifier already understands, e.g. "rushwa bribe".
  canonical: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  // A plain explanation for the Admin deciding on it. Must not identify anyone.
  meaning: { type: String, required: true, trim: true, maxlength: 300 },
  language: { type: String, enum: ['Sheng', 'Kiswahili', 'Dialect', 'Other'], default: 'Sheng' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  suggestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

// One live entry per term: a term can be pending or approved once.
lingoTermSchema.index(
  { term: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'approved'] } } }
);

module.exports = mongoose.model('LingoTerm', lingoTermSchema);
