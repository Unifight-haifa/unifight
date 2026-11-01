// Shared by the media test and the admin Worker, so plain ESM on Uint8Array with no Node built-ins.

export const MAX_BYTES = 1.5 * 1024 * 1024;

const str = (b, s, e) => String.fromCharCode(...b.subarray(s, e));
const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

// true when a TIFF block (EXIF payload) has a GPS IFD pointer, tag 0x8825, in IFD0
export function tiffHasGps(b) {
  if (b.length < 8) return false;
  const le = str(b, 0, 2) === 'II';
  const v = view(b);
  const u16 = (o) => v.getUint16(o, le);
  const ifd = v.getUint32(4, le);
  if (ifd + 2 > b.length) return false;
  for (let i = 0, n = u16(ifd); i < n && ifd + 14 + i * 12 <= b.length; i++) if (u16(ifd + 2 + i * 12) === 0x8825) return true;
  return false;
}

const isWebp = (b) => b.length >= 12 && str(b, 0, 4) === 'RIFF' && str(b, 8, 12) === 'WEBP';

// RIFF chunks after the 12-byte header; payloads are padded to even length
function* webpChunks(b) {
  const v = view(b);
  for (let o = 12; o + 8 <= b.length; ) {
    const len = v.getUint32(o + 4, true);
    yield [str(b, o, o + 4), b.subarray(o + 8, Math.min(o + 8 + len, b.length))];
    o += 8 + len + (len & 1);
  }
}

export function hasGps(b) {
  const v = view(b);
  if (b[0] === 0xff && b[1] === 0xd8) {
    // walk the JPEG markers up to the image data; EXIF sits in an APP1 segment
    for (let o = 2; o + 4 <= b.length && b[o] === 0xff; ) {
      const marker = b[o + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const len = v.getUint16(o + 2);
      if (marker === 0xe1 && str(b, o + 4, o + 10) === 'Exif\0\0' && tiffHasGps(b.subarray(o + 10, o + 2 + len))) return true;
      o += 2 + len;
    }
    return false;
  }
  if (str(b, 1, 4) === 'PNG') {
    for (let o = 8; o + 8 <= b.length; ) {
      const len = v.getUint32(o);
      if (str(b, o + 4, o + 8) === 'eXIf' && tiffHasGps(b.subarray(o + 8, o + 8 + len))) return true;
      o += 12 + len;
    }
    return false;
  }
  if (isWebp(b)) {
    for (const [cc, p] of webpChunks(b)) {
      if (cc === 'EXIF' && tiffHasGps(str(p, 0, 6) === 'Exif\0\0' ? p.subarray(6) : p)) return true;
    }
  }
  return false;
}

export function webpInfo(b) {
  if (!isWebp(b)) return null;
  let width, height, exif = false;
  for (const [cc, p] of webpChunks(b)) {
    const v = view(p);
    if (cc === 'VP8X' && p.length >= 10) {
      exif ||= (p[0] & 0x08) !== 0;
      width = 1 + (p[4] | (p[5] << 8) | (p[6] << 16));
      height = 1 + (p[7] | (p[8] << 8) | (p[9] << 16));
    } else if (cc === 'VP8 ' && p.length >= 10 && width === undefined) {
      width = v.getUint16(6, true) & 0x3fff;
      height = v.getUint16(8, true) & 0x3fff;
    } else if (cc === 'VP8L' && p.length >= 5 && p[0] === 0x2f && width === undefined) {
      const bits = v.getUint32(1, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (cc === 'EXIF') exif = true;
  }
  return { width, height, exif };
}

export function checkCoachWebp(b, { maxW = 800, maxH = 1200 } = {}) {
  const info = webpInfo(b);
  if (!info || info.width === undefined) throw new Error('photo is not a WebP image');
  if (b.length > MAX_BYTES) throw new Error('photo is larger than 1.5 MB');
  if (info.width > maxW || info.height > maxH) throw new Error(`photo is larger than ${maxW}×${maxH}`);
  if (info.exif) throw new Error('photo still carries EXIF metadata');
  return { width: info.width, height: info.height };
}
