const mongoose = require('mongoose');

const BUCKET_NAME = 'reviewerApplications';

function getBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

function validatePdf(file) {
  return file
    && file.mimetype === 'application/pdf'
    && file.originalname.toLowerCase().endsWith('.pdf')
    && file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function cleanFilename(filename) {
  return filename
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .slice(0, 180);
}

async function storeDocument(file, kind) {
  const id = new mongoose.Types.ObjectId();
  const filename = cleanFilename(file.originalname);
  await new Promise((resolve, reject) => {
    const stream = getBucket().openUploadStreamWithId(id, filename, {
      contentType: 'application/pdf',
      metadata: { kind, contentType: 'application/pdf' }
    });
    stream.once('error', reject);
    stream.once('finish', resolve);
    stream.end(file.buffer);
  });
  return {
    kind,
    gridFsId: id,
    filename,
    size: file.size,
    uploadedAt: new Date()
  };
}

async function deleteDocuments(documents) {
  const bucket = getBucket();
  for (const document of documents) {
    try {
      await bucket.delete(document.gridFsId);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = { getBucket, validatePdf, storeDocument, deleteDocuments };
