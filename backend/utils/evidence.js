const { Readable } = require('stream');
const crypto = require('crypto');
const path = require('path');
const { scanBuffer } = require('./malwareScan');
const { stripImageMetadata } = require('./stripMetadata');

const MAGIC = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'application/pdf': Buffer.from('%PDF')
};

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

// Streams the scanned bytes into GridFS without re-encoding the image (only metadata is removed).
// Throws if the file fails the malware scan (decision #18) - it is never written to GridFS in that case.
async function storeEvidenceFile(bucket, file) {
  const scanResult = await scanBuffer(file.buffer);
  if (!scanResult.clean) {
    throw new Error(`Evidence file "${file.originalname}" was rejected: ${scanResult.reason}`);
  }

  // The declared type comes from the uploader. A file that says it is a photo or PDF
  // but is not one is refused instead of being stored and served under that label.
  const signature = MAGIC[file.mimetype];
  if (signature && !file.buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error(`Evidence file "${file.originalname}" was rejected: its contents do not match its declared type`);
  }

  const type = mimeToType(file.mimetype);
  // Photos lose their GPS/device metadata, and the uploader's own filename (which can
  // carry a name or a place) is replaced by a neutral one. The scan ran on the original.
  const buffer = stripImageMetadata(file.buffer, file.mimetype);
  const storedName = `evidence-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname || '').toLowerCase().slice(0, 8)}`;

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(storedName, {
      contentType: file.mimetype,
      metadata: { type, contentType: file.mimetype }
    });
    bufferToStream(buffer)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => {
        resolve({ gridFsId: uploadStream.id, filename: storedName, type });
      });
  });
}

module.exports = { storeEvidenceFile, mimeToType };
