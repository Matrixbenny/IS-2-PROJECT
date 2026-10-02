const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'reviewer'], default: 'user' },
  emailNotificationsOptIn: { type: Boolean, default: false },
  resetPasswordTokenHash: { type: String, default: null },
  resetPasswordExpiry: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 11);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);