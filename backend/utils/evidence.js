const { Readable } = require('stream');
const { scanBuffer } = require('./malwareScan');

function mimeToType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

// Streams the original, scanned bytes into GridFS without re-encoding the upload.
// Throws if the file fails the malware scan (decision #18) - it is never written to GridFS in that case.
async function storeEvidenceFile(bucket, file) {
  const scanResult = await scanBuffer(file.buffer);
  if (!scanResult.clean) {
    throw new Error(`Evidence file "${file.originalname}" was rejected: ${scanResult.reason}`);
  }

  const type = mimeToType(file.mimetype);

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(file.originalname, {
      contentType: file.mimetype,
      metadata: { type, contentType: file.mimetype }
    });
    bufferToStream(file.buffer)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => {
        resolve({ gridFsId: uploadStream.id, filename: file.originalname, type });
      });
  });
}

module.exports = { storeEvidenceFile, mimeToType };
