const crypto = require('crypto');

function requestFingerprint(req) {
  const source = [
    req.ip || req.socket?.remoteAddress || '',
    req.get('user-agent') || ''
  ].join('|');
  const secret = process.env.REQUEST_HASH_SECRET || process.env.JWT_SECRET || 'kenya-watch-development-only';
  return crypto.createHmac('sha256', secret).update(source).digest('hex');
}

function auditContext(req) {
  return {
    ipHash: requestFingerprint(req),
    userAgent: String(req.get('user-agent') || '').slice(0, 500) || null
  };
}

module.exports = { requestFingerprint, auditContext };