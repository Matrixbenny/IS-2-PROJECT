// A photo taken on a phone usually carries the GPS position, the time, and the
// device's make, model and serial number inside the file. For someone reporting
// corruption anonymously that is a fingerprint, so it is removed before storage.
// Pixels are never touched: only the metadata containers are dropped, so the
// image is exactly as the reporter took it.
//
// JPEG: drop APP1 (EXIF, XMP), APP2 (ICC is kept), APP13 (Photoshop/IPTC) and COM.
// PNG: drop eXIf, tEXt, zTXt, iTXt and tIME chunks.
// Other formats (video, audio, PDF) are passed through unchanged; see README "Limits".

function stripJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;
  const parts = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return buffer; // not a well-formed stream: leave it alone
    const marker = buffer[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xda || marker === 0xd9) { // start of scan / end of image: the rest is pixel data
      parts.push(buffer.subarray(offset));
      return Buffer.concat(parts);
    }
    if (marker >= 0xd0 && marker <= 0xd7) { parts.push(buffer.subarray(offset, offset + 2)); offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) return buffer;
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) parts.push(buffer.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  return buffer;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return buffer;
  const parts = [buffer.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buffer.length) return buffer;
    if (!PNG_DROP.has(type)) parts.push(buffer.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}

function stripImageMetadata(buffer, mimetype) {
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') return stripJpeg(buffer);
  if (mimetype === 'image/png') return stripPng(buffer);
  return buffer;
}

module.exports = { stripImageMetadata, stripJpeg, stripPng };
