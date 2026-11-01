import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hasGps, webpInfo, checkCoachWebp, MAX_BYTES as MAX } from '../src/lib/image-check.mjs';
const ROOTS = ['public/', 'src/assets/'].map((d) => new URL(`../${d}`, import.meta.url));
const files = ROOTS.flatMap((r) => readdirSync(r, { recursive: true }).map((f) => new URL(f, r)).filter((u) => statSync(u).isFile()));

test(`no file under public/ or src/assets/ is over ${MAX / 1024 / 1024} MB`, () => {
  assert.ok(files.length > 50);
  const big = files.filter((u) => statSync(u).size > MAX).map((u) => `${u.pathname}: ${statSync(u).size}`);
  assert.deepEqual(big, []);
});

test('no committed JPEG, PNG or WebP carries GPS EXIF', () => {
  const imgs = files.filter((u) => /\.(jpe?g|png|webp)$/i.test(u.pathname));
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
  assert.equal(hasGps(webp(tiff(0x8825))), true);
  assert.equal(hasGps(webp(Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff(0x8825)]))), true);
  assert.equal(hasGps(webp(tiff(0x0112))), false);
});

const riffChunk = (cc, p) => {
  const c = Buffer.alloc(8 + p.length + (p.length & 1));
  c.write(cc, 0, 'latin1');
  c.writeUInt32LE(p.length, 4);
  p.copy(c, 8);
  return c;
};
const riff = (...chunks) => {
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...chunks]);
  const h = Buffer.from('RIFF\0\0\0\0', 'latin1');
  h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
};
const vp8x = (w, h, flags = 0) => {
  const p = Buffer.alloc(10);
  p[0] = flags;
  p.writeUIntLE(w - 1, 4, 3);
  p.writeUIntLE(h - 1, 7, 3);
  return riffChunk('VP8X', p);
};
function webp(exifPayload) {
  return riff(vp8x(10, 10, 0x08), riffChunk('EXIF', exifPayload));
}

test('webpInfo and checkCoachWebp read dims and reject bad coach photos', () => {
  assert.deepEqual(webpInfo(riff(vp8x(800, 1200))), { width: 800, height: 1200, exif: false });
  assert.deepEqual(checkCoachWebp(riff(vp8x(800, 1200))), { width: 800, height: 1200 });
  assert.throws(() => checkCoachWebp(riff(vp8x(800, 1200, 0x08))), /EXIF/);
  assert.throws(() => checkCoachWebp(Buffer.from('\x89PNG\r\n\x1a\n\0\0\0\0', 'latin1')), /not a WebP/);
  assert.throws(() => checkCoachWebp(riff(vp8x(801, 1200))), /800/);
  const big = new Uint8Array(MAX + 1);
  big.set(riff(vp8x(100, 100)));
  assert.throws(() => checkCoachWebp(big), /1\.5 MB/);
  assert.equal(webpInfo(Buffer.from('RIFF\0\0\0\0WAVE', 'latin1')), null);
});

test('webpInfo reads Pillow lossy (VP8) and lossless (VP8L) output', (t) => {
  let out;
  try {
    const py = "import io,sys,base64;from PIL import Image;im=Image.new('RGB',(10,20),'red');r=[]\nfor l in (False,True):\n b=io.BytesIO();im.save(b,'WEBP',lossless=l);r.append(base64.b64encode(b.getvalue()).decode())\nprint(' '.join(r))";
    out = execFileSync('python3', ['-c', py], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    t.skip('Pillow not installed');
    return;
  }
  const [lossy, lossless] = out.trim().split(' ').map((s) => Buffer.from(s, 'base64'));
  assert.equal(lossy.toString('latin1', 12, 16), 'VP8 ');
  assert.equal(lossless.toString('latin1', 12, 16), 'VP8L');
  for (const b of [lossy, lossless]) assert.deepEqual(webpInfo(b), { width: 10, height: 20, exif: false });
});
