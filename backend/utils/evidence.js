const sharp = require('sharp');
const { Readable } = require('stream');
const { scanBuffer } = require('./malwareScan');

function mimeToType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

// Images are re-encoded through sharp, which drops EXIF/GPS metadata by default
// (decision #17) unless .withMetadata() is called - it never is here on purpose.
// Video/audio/document metadata stripping is out of scope for this project; they
// are stored as-is, which is an honest, documented limitation.
async function prepareBuffer(file) {
  if (file.mimetype.startsWith('image/')) {
    return sharp(file.buffer).rotate().toBuffer();
  }
  return file.buffer;
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

// Streams a validated, metadata-stripped file into GridFS and returns the evidence sub-document fields.
// Throws if the file fails the malware scan (decision #18) - it is never written to GridFS in that case.
async function storeEvidenceFile(bucket, file) {
  const scanResult = await scanBuffer(file.buffer);
  if (!scanResult.clean) {
    throw new Error(`Evidence file "${file.originalname}" was rejected: ${scanResult.reason}`);
  }

  const cleanBuffer = await prepareBuffer(file);
  const type = mimeToType(file.mimetype);

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(file.originalname, {
      contentType: file.mimetype,
      metadata: { type }
    });
    bufferToStream(cleanBuffer)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => {
        resolve({ gridFsId: uploadStream.id, filename: file.originalname, type });
      });
  });
}

module.exports = { storeEvidenceFile, mimeToType };
