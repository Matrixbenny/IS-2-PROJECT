const express = require('express');
const User = require('../user.model');
const Report = require('../report.model');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const PUBLIC_USER_FIELDS = 'name email role emailNotificationsOptIn createdAt';

// GET /api/users - Admin-only directory of all accounts (decision #15).
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find().select(PUBLIC_USER_FIELDS).sort({ createdAt: -1 });
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/users - Admin provisions Reviewer/Admin accounts internally; no public sign-up path to these roles.
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are required' });
    }
    if (!['reviewer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be reviewer or admin' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const cleanName = String(name).normalize('NFC').trim();
    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanName || cleanName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid name and email address' });
    }
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({ name: cleanName, email: cleanEmail, password, role });
    await user.save();
    return res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/users/:id - Admin edits account details without changing credentials.
router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, emailNotificationsOptIn } = req.body || {};
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string') return res.status(400).json({ error: 'Name must be text' });
      const cleanName = name.normalize('NFC').trim();
      if (!cleanName || cleanName.length > 120) return res.status(400).json({ error: 'Name must be between 1 and 120 characters' });
      updates.name = cleanName;
    }
    if (email !== undefined) {
      if (typeof email !== 'string') return res.status(400).json({ error: 'Email must be text' });
      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
      updates.email = cleanEmail;
    }
    if (emailNotificationsOptIn !== undefined) {
      if (typeof emailNotificationsOptIn !== 'boolean') {
        return res.status(400).json({ error: 'Email notification preference must be true or false' });
      }
      updates.emailNotificationsOptIn = emailNotificationsOptIn;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Provide at least one account field to update' });

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, {
      returnDocument: 'after',
      runValidators: true,
      select: PUBLIC_USER_FIELDS
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/users/:id/role - Admin can reassign a role (e.g. promote/demote reviewer <-> admin).
router.patch('/:id/role', requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['user', 'reviewer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) return res.status(409).json({ error: 'The last Admin account cannot be demoted' });
    }
    user.role = role;
    await user.save();
    return res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/users/:id - removes the account and anonymizes its retained report references.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(409).json({ error: 'You cannot delete the Admin account you are currently using' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin' && await User.countDocuments({ role: 'admin' }) <= 1) {
      return res.status(409).json({ error: 'The last Admin account cannot be deleted' });
    }

    const userId = user._id;
    await Report.updateMany({ user: userId }, { $set: { user: null } });
    await Report.updateMany({ claimedBy: userId }, { $set: { claimedBy: null } });
    await Report.updateMany({ archivedBy: userId }, { $set: { archivedBy: null } });
    await Report.updateMany(
      { 'statusHistory.changedBy': userId },
      { $set: { 'statusHistory.$[history].changedBy': null } },
      { arrayFilters: [{ 'history.changedBy': userId }] }
    );
    await Report.updateMany(
      { 'comments.author': userId },
      { $set: { 'comments.$[comment].author': null } },
      { arrayFilters: [{ 'comment.author': userId }] }
    );
    await User.deleteOne({ _id: userId });
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: 'Could not delete the user and anonymize its report references.' });
  }
});

module.exports = router;
