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

async function deleteGridFsFile(fileId) {
  const db = mongoose.connection.db;
  await Promise.all([
    db.collection('evidence.files').deleteOne({ _id: fileId }),
    db.collection('evidence.chunks').deleteMany({ files_id: fileId })
  ]);
}

module.exports = { getBucket, deleteGridFsFile };
