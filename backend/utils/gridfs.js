const mongoose = require('mongoose');

let bucket = null;

// Lazily creates (and reuses) a single GridFSBucket bound to the active mongoose connection,
// using the 'evidence' bucket name so collections are evidence.files / evidence.chunks.
function getBucket() {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'evidence' });
  }
  return bucket;
}

module.exports = { getBucket };
