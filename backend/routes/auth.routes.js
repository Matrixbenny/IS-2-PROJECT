const express = require('express');
const crypto = require('crypto');
const User = require('../user.model');
const { signToken } = require('../utils/jwt');
const { hashSecret, verifySecret } = require('../utils/tracking');
const { sendMail } = require('../utils/mailer');
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

// POST /api/auth/forgot-password - decision #22: single-use, time-limited reset link.
// Always responds the same way regardless of whether the email exists, so this endpoint
// can never be used to check who has an account.
router.post('/forgot-password', async (req, res) => {
  const genericResponse = { message: 'If this email is registered, a reset link has been sent.' };
  try {
    const { email } = req.body;
    if (!email) return res.json(genericResponse);

    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetPasswordTokenHash = await hashSecret(token);
      user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      const resetLink = `http://localhost:3000/reset-password?email=${encodeURIComponent(user.email)}&token=${token}`;
      // Also logged to console as a reliable fallback in case the sandbox mail send is slow/unavailable.
      console.log(`[password reset] ${user.email} -> ${resetLink}`);
      sendMail({
        to: user.email,
        subject: 'Reset your Kenya Watch password',
        text: `We received a request to reset your password. This link expires in 1 hour: ${resetLink}`
      }).catch((err) => console.error('[password reset] email send failed:', err.message));
    }
    return res.json(genericResponse);
  } catch (err) {
    return res.json(genericResponse);
  }
});

// POST /api/auth/reset-password - consumes the single-use token, then invalidates it.
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'Email, token and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    const tokenValid = user && user.resetPasswordExpiry && user.resetPasswordExpiry > new Date()
      ? await verifySecret(token, user.resetPasswordTokenHash)
      : false;
    if (!tokenValid) return res.status(400).json({ error: 'This reset link is invalid or has expired' });

    user.password = newPassword;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiry = null;
    await user.save();
    return res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
