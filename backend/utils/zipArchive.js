// Minimal, dependency-free ZIP writer used for the Admin reviewer file pack.
//
// Entries are STORED (no DEFLATE). That is deliberate: "exact format" means the
// file inside the archive is the same bytes the reviewer uploaded, and an
// uncompressed entry can be checked with any unzip tool or `sha256sum` without
// depending on a compressor's version.
//
// CRC-32 is computed with the standard IEEE table. Filenames are UTF-8 with the
// language-encoding flag set, so Kiswahili or accented filenames survive.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, day };
}

class UncompressedZipWriter {
  constructor() {
    this.entries = [];
  }

  addFile(name, buffer) {
    const safeName = String(name || "file")
      .replace(/[\\/]+/g, "-")
      .slice(0, 200);
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
    this.entries.push({ name: safeName, data });
    return this;
  }

  finish() {
    const { time, day } = dosDateTime();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of this.entries) {
      const nameBuffer = Buffer.from(entry.name, "utf8");
      const checksum = crc32(entry.data);
      const size = entry.data.length;

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4); // version needed
      localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
      localHeader.writeUInt16LE(0, 8); // stored, no compression
      localHeader.writeUInt16LE(time, 10);
      localHeader.writeUInt16LE(day, 12);
      localHeader.writeUInt32LE(checksum, 14);
      localHeader.writeUInt32LE(size, 18); // compressed size
      localHeader.writeUInt32LE(size, 22); // uncompressed size
      localHeader.writeUInt16LE(nameBuffer.length, 26);
      localHeader.writeUInt16LE(0, 28); // extra field length
      localParts.push(localHeader, nameBuffer, entry.data);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4); // version made by
      centralHeader.writeUInt16LE(20, 6); // version needed
      centralHeader.writeUInt16LE(0x0800, 8);
      centralHeader.writeUInt16LE(0, 10);
      centralHeader.writeUInt16LE(time, 12);
      centralHeader.writeUInt16LE(day, 14);
      centralHeader.writeUInt32LE(checksum, 16);
      centralHeader.writeUInt32LE(size, 20);
      centralHeader.writeUInt32LE(size, 24);
      centralHeader.writeUInt16LE(nameBuffer.length, 28);
      centralHeader.writeUInt16LE(0, 30); // extra
      centralHeader.writeUInt16LE(0, 32); // comment
      centralHeader.writeUInt16LE(0, 34); // disk number
      centralHeader.writeUInt16LE(0, 36); // internal attributes
      centralHeader.writeUInt32LE(0, 38); // external attributes
      centralHeader.writeUInt32LE(offset, 42);
      centralParts.push(centralHeader, nameBuffer);

      offset += localHeader.length + nameBuffer.length + entry.data.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirectory, end]);
  }
}

module.exports = { UncompressedZipWriter, crc32 };
