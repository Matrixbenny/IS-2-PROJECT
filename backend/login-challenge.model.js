const mongoose = require('mongoose');

// A pending second-factor check: the password was right, the emailed code has not
// been entered yet. Only a hash of the code is stored, and the record deletes itself.
const loginChallengeSchema = new mongoose.Schema({
  challengeId: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
});

loginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginChallenge', loginChallengeSchema);
