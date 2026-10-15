const { createHash } = require('crypto');

function hashRecordingToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

module.exports = { hashRecordingToken };
