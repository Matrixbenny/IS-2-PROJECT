const { verifyToken } = require('../utils/jwt');
const User = require('../user.model');
const { isConfiguredAdminEmail } = require('../utils/adminIdentity');

// Populates req.user if a valid auth cookie is present; never rejects the request.
async function attachUser(req, res, next) {
  try {
    const token = req.cookies && req.cookies.kw_token;
    if (!token) return next();
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).select('-password');
    const validAgencyAccount = user?.role !== 'agency' || (
      user.agencySlug && user.agencyVerificationReference && user.agencyVerifiedAt
    );
    if (user && user.isActive !== false && validAgencyAccount &&
      (user.role !== 'admin' || isConfiguredAdminEmail(user.email))) {
      req.user = user;
    }
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
