// Lightweight PDF authenticity screening for application documents.
// It is honest about its limits: these are *indicators* an Admin can act on,
// not proof. True verification means checking the issuing institution.
const crypto = require('crypto');

// Extract embedded text/metadata that a generated PDF would carry.
function extractPdfStrings(buffer) {
  const text = buffer.toString('latin1');
  return {
    // PDF producer/creator metadata
    producer: /\/Producer\s*\((.*?)\)/.exec(text)?.[1] || null,
    creator: /\/Creator\s*\((.*?)\)/.exec(text)?.[1] || null,
    title: /\/Title\s*\((.*?)\)/.exec(text)?.[1] || null,
    // CreationDate / ModDate (unencrypted PDFs store these in plain text)
    creationDate: /\/CreationDate\s*\((.*?)\)/.exec(text)?.[1] || null,
    modDate: /\/ModDate\s*\((.*?)\)/.exec(text)?.[1] || null,
    // page count via /Type /Page (rough)
    pageMarkers: (text.match(/\/Type\s*\/Page[^s]/g) || []).length,
    // images: an official scanned letter is normally an image-based PDF
    imageCount: (text.match(/\/Subtype\s*\/Image/g) || []).length,
    // digital signature presence (incremental update + byte range)
    digitalSignature: /\/Sig\b/.test(text) || /\/ByteRange/.test(text),
    // encryption flag
    encrypted: /\/Encrypt/.test(text),
    hasTextLayer: /\/Font/.test(text),
  };
}

// Flags a document that looks machine-generated rather than scanned.
// Official Kenyan institution letters are typically scanned or produced from a
// letterhead template, but a template still records the producing software.
function generationIndicators(meta) {
  const flags = [];
  const suspiciousProducers = [
    'microsoft word', 'libreoffice', 'google docs', 'docs',
    'canva', 'photoshop', 'gimp', 'canon ij', 'pdfforge', 'pdf24',
    'smallpdf', 'ilovepdf', 'sejda', 'adobe acrobat', 'wps',
  ];
  const benignProducers = [
    'scanner', 'epson', 'hp scan', 'brother', 'xerox', 'ricoh', 'canon',
    'fujitsu', 'kodak', 'camscanner', 'adobe scan', 'genius scan', 'scanner',
  ];

  const producer = (meta.producer || '').toLowerCase();
  if (producer && benignProducers.some((b) => producer.includes(b))) {
    flags.push({ level: 'ok', message: `Appears to be a scanned document (producer: ${meta.producer})` });
  } else if (producer && suspiciousProducers.some((s) => producer.includes(s))) {
    flags.push({ level: 'warn', message: `Produced by an editing tool, not a scanner: ${meta.producer}` });
  } else if (!producer) {
    flags.push({ level: 'warn', message: 'No producer metadata — origin cannot be established from the file.' });
  }

  if (meta.digitalSignature) {
    flags.push({ level: 'ok', message: 'Carries a digital signature or byte-range section.' });
  }
  if (meta.encrypted) {
    flags.push({ level: 'warn', message: 'Document is encrypted; content could not be fully inspected.' });
  }
  if (meta.imageCount > 0 && !meta.hasTextLayer) {
    flags.push({ level: 'ok', message: 'Image-only pages — consistent with a scanned paper document.' });
  }
  return flags;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { extractPdfStrings, generationIndicators, sha256 };
