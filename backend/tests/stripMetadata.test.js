const test = require('node:test');
const assert = require('node:assert/strict');
const { stripImageMetadata } = require('../utils/stripMetadata');

function jpegSegment(marker, payload) {
  const body = Buffer.from(payload, 'latin1');
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

test('JPEG: EXIF/GPS, XMP and comments are removed, pixel data is untouched', () => {
  const exif = jpegSegment(0xe1, 'Exif\0\0GPSLatitude=-1.286389 Make=Samsung Serial=ABC123');
  const comment = jpegSegment(0xfe, 'taken by John Kamau');
  const jfif = jpegSegment(0xe0, 'JFIF\0');
  const table = jpegSegment(0xdb, 'quantisation');
  const scan = Buffer.concat([Buffer.from([0xff, 0xda, 0x00, 0x02]), Buffer.from('PIXELDATA'), Buffer.from([0xff, 0xd9])]);
  const original = Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, exif, comment, table, scan]);

  const cleaned = stripImageMetadata(original, 'image/jpeg');
  const text = cleaned.toString('latin1');
  assert.ok(!text.includes('GPSLatitude'));
  assert.ok(!text.includes('Samsung'));
  assert.ok(!text.includes('John Kamau'));
  assert.ok(text.includes('JFIF') && text.includes('quantisation') && text.includes('PIXELDATA'));
  assert.deepEqual([...cleaned.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...cleaned.subarray(-2)], [0xff, 0xd9]);
});

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

test('PNG: text and EXIF chunks are removed, image chunks are kept', () => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const original = Buffer.concat([
    signature,
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('tEXt', Buffer.from('Author\0Jane Wanjiru')),
    pngChunk('eXIf', Buffer.from('GPS -1.28 36.82')),
    pngChunk('IDAT', Buffer.from('PIXELS')),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
  const text = stripImageMetadata(original, 'image/png').toString('latin1');
  assert.ok(!text.includes('Jane Wanjiru') && !text.includes('GPS'));
  assert.ok(text.includes('IHDR') && text.includes('PIXELS') && text.includes('IEND'));
});

test('malformed or unsupported files are returned unchanged rather than damaged', () => {
  const junk = Buffer.from('not an image at all');
  assert.equal(stripImageMetadata(junk, 'image/jpeg'), junk);
  assert.equal(stripImageMetadata(junk, 'image/png'), junk);
  assert.equal(stripImageMetadata(junk, 'video/mp4'), junk);
});

const { storeEvidenceFile } = require('../utils/evidence');

test('a file whose contents do not match its declared type is refused before storage', async () => {
  const bucket = { openUploadStream() { throw new Error('must not be stored'); } };
  await assert.rejects(
    storeEvidenceFile(bucket, { originalname: 'x.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('<html>not a photo</html>') }),
    /do not match its declared type/
  );
});
