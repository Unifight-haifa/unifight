import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const MAX = 1.5 * 1024 * 1024;
const ROOTS = ['public/', 'src/assets/'].map((d) => new URL(`../${d}`, import.meta.url));
const files = ROOTS.flatMap((r) => readdirSync(r, { recursive: true }).map((f) => new URL(f, r)).filter((u) => statSync(u).isFile()));

// true when a TIFF block (EXIF payload) has a GPS IFD pointer, tag 0x8825, in IFD0
function tiffHasGps(b) {
  const le = b.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const ifd = le ? b.readUInt32LE(4) : b.readUInt32BE(4);
  if (ifd + 2 > b.length) return false;
  for (let i = 0, n = u16(ifd); i < n && ifd + 14 + i * 12 <= b.length; i++) if (u16(ifd + 2 + i * 12) === 0x8825) return true;
  return false;
}

function hasGps(b) {
  if (b[0] === 0xff && b[1] === 0xd8) {
    // walk the JPEG markers up to the image data; EXIF sits in an APP1 segment
    for (let o = 2; o + 4 <= b.length && b[o] === 0xff; ) {
      const marker = b[o + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const len = b.readUInt16BE(o + 2);
      if (marker === 0xe1 && b.toString('latin1', o + 4, o + 10) === 'Exif\0\0' && tiffHasGps(b.subarray(o + 10, o + 2 + len))) return true;
      o += 2 + len;
    }
    return false;
  }
  if (b.toString('latin1', 1, 4) === 'PNG') {
    for (let o = 8; o + 8 <= b.length; ) {
      const len = b.readUInt32BE(o);
      if (b.toString('latin1', o + 4, o + 8) === 'eXIf' && tiffHasGps(b.subarray(o + 8, o + 8 + len))) return true;
      o += 12 + len;
    }
  }
  return false;
}

test(`no file under public/ or src/assets/ is over ${MAX / 1024 / 1024} MB`, () => {
  assert.ok(files.length > 50);
  const big = files.filter((u) => statSync(u).size > MAX).map((u) => `${u.pathname}: ${statSync(u).size}`);
  assert.deepEqual(big, []);
});

test('no committed JPEG or PNG carries GPS EXIF', () => {
  const imgs = files.filter((u) => /\.(jpe?g|png)$/i.test(u.pathname));
  assert.ok(imgs.length > 50);
  assert.deepEqual(imgs.filter((u) => hasGps(readFileSync(u))).map((u) => u.pathname), []);
});

test('the GPS check finds a GPS IFD pointer and ignores EXIF without one', () => {
  const tiff = (tag, le = true) => {
    const t = Buffer.alloc(26);
    const [w16, w32] = le ? ['writeUInt16LE', 'writeUInt32LE'] : ['writeUInt16BE', 'writeUInt32BE'];
    t.write(le ? 'II*\0' : 'MM\0*', 0, 'latin1');
    t[w32](8, 4);
    t[w16](1, 8);
    t[w16](tag, 10);
    t[w16](4, 12);
    t[w32](1, 14);
    return t;
  };
  const jpeg = (t) => {
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), Buffer.from('Exif\0\0', 'latin1'), t]);
    app1.writeUInt16BE(app1.length - 2, 2);
    return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xd9])]);
  };
  assert.equal(hasGps(jpeg(tiff(0x8825))), true);
  assert.equal(hasGps(jpeg(tiff(0x8825, false))), true);
  assert.equal(hasGps(jpeg(tiff(0x0112))), false);
  const png = (t) => {
    const chunk = Buffer.alloc(12 + t.length);
    chunk.writeUInt32BE(t.length, 0);
    chunk.write('eXIf', 4, 'latin1');
    t.copy(chunk, 8);
    return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), chunk]);
  };
  assert.equal(hasGps(png(tiff(0x8825))), true);
  assert.equal(hasGps(png(tiff(0x0112))), false);
});
