const express = require('express');
const User = require('../user.model');
const { signToken } = require('../utils/jwt');
const { attachUser, requireAuth } = require('../middleware/auth');

const router = express.Router();

const COOKIE_NAME = 'kw_token';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000
});

// Public self-registration always creates a 'user' role account (decision #15).
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, emailNotificationsOptIn } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({ name, email, password, emailNotificationsOptIn: !!emailNotificationsOptIn });
    await user.save();

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    const valid = user ? await user.comparePassword(password) : false;
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  return res.json({ message: 'Logged out' });
});

router.get('/me', attachUser, requireAuth, (req, res) => {
  const { _id, name, email, role, emailNotificationsOptIn } = req.user;
  return res.json({ user: { id: _id, name, email, role, emailNotificationsOptIn } });
});

module.exports = router;
