const { verifyToken } = require('../utils/jwt');
const User = require('../user.model');

// Populates req.user if a valid auth cookie is present; never rejects the request.
async function attachUser(req, res, next) {
  try {
    const token = req.cookies && req.cookies.kw_token;
    if (!token) return next();
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).select('-password');
    if (user) req.user = user;
    return next();
  } catch (err) {
    return next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    return next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
