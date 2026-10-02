const express = require('express');
const User = require('../user.model');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - Admin-only directory of all accounts (decision #15).
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/users - Admin provisions Reviewer/Admin accounts internally; no public sign-up path to these roles.
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are required' });
    }
    if (!['reviewer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be reviewer or admin' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({ name, email, password, role });
    await user.save();
    return res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/users/:id/role - Admin can reassign a role (e.g. promote/demote reviewer <-> admin).
router.patch('/:id/role', requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'reviewer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.role = role;
    await user.save();
    return res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
