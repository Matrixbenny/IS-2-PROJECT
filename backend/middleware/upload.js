const multer = require('multer');

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB per file
const MAX_FILES_PER_REPORT = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_REPORT },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    return cb(null, true);
  }
});

module.exports = { upload, MAX_FILE_SIZE_BYTES, MAX_FILES_PER_REPORT };
