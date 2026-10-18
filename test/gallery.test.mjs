import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { checkGallery } from '../src/lib/gallery-check.mjs';

const gallery = JSON.parse(readFileSync(new URL('../content/gallery.json', import.meta.url), 'utf8'));
const dir = new URL('../src/assets/gallery/', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
const page = (l) => readFileSync(new URL(`${l}/gallery/index.html`, dist), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const photos = gallery.flatMap((a) => a.photos.map((p) => ({ ...p, album: a.id })));
// a 1600 px photo encodes well under this; anything bigger means a source or quality setting slipped
const BUDGET = 500 * 1024;

test('every photo renders on all three language pages with its alt text', () => {
  assert.ok(photos.length > 0);
  for (const l of ['he', 'ru', 'en']) {
    const html = page(l);
    assert.equal(html.match(/<a href="[^"]+" data-gal-item/g).length, photos.length, l);
    for (const p of photos) assert.ok(html.includes(`alt="${esc(p.alt[l])}"`), `${l} ${p.file}`);
    for (const a of gallery) assert.ok(html.includes(`data-filter="${a.id}"`) && html.includes(`id="album-${a.id}"`), `${l} ${a.id}`);
  }
});

test('every img has a non-empty alt, explicit size and a modern format', () => {
  for (const l of ['he', 'ru', 'en']) {
    const imgs = page(l).match(/<img\b[^>]*>/g);
    assert.equal(imgs.length, photos.length, l);
    for (const tag of imgs) {
      assert.match(tag, /\balt="[^"]+"/, tag.slice(0, 120));
      assert.match(tag, /\bwidth="\d+" height="\d+"/, tag.slice(0, 120));
      assert.match(tag, /\bloading="lazy"/, tag.slice(0, 120));
    }
    assert.equal(page(l).match(/<source [^>]*type="image\/avif"/g).length, photos.length, l);
  }
});

test('no gallery image goes over its budget', () => {
  const urls = new Set([...page('en').matchAll(/(?:src|srcset|href)="([^"]+)"/g)].flatMap((m) => m[1].split(', ').map((s) => s.split(' ')[0])));
  const files = [...urls].filter((u) => /\/_astro\/.+\.(avif|webp|jpg)$/.test(u));
  assert.ok(files.length >= photos.length * 3);
  for (const u of files) {
    const size = statSync(new URL(u.slice(base.length), dist)).size;
    assert.ok(size <= BUDGET, `${u}: ${size} bytes`);
  }
});

test('without JS each photo links to its large version; the lightbox is a native dialog', () => {
  for (const l of ['he', 'ru', 'en']) {
    const html = page(l);
    for (const [, href] of html.matchAll(/<a href="([^"]+)" data-gal-item/g)) assert.match(href, /\/_astro\/[^"]+\.webp$/);
    assert.match(html, /<dialog class="lb" aria-label="[^"]+" data-lb>/, l);
    for (const b of ['data-lb-close', 'data-lb-step="-1"', 'data-lb-step="1"']) assert.match(html, new RegExp(`<button type="button" class="lb-btn[^"]*" ${b} aria-label="[^"]+"`), `${l} ${b}`);
    assert.match(html, /<figcaption class="lb-cap">/, l);
    assert.match(html, /data-ga="gallery_open" data-ga-album="[a-z-]+"/, l);
  }
});

test('head has a share image from the gallery and an ImageGallery JSON-LD', () => {
  for (const l of ['he', 'ru', 'en']) {
    const html = page(l);
    assert.match(html, /<meta property="og:image" content="https?:\/\/[^"]+\/_astro\/[^"]+\.jpg">/, l);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.equal(ld['@type'], 'ImageGallery');
    assert.equal(ld.image.length, photos.length);
  }
});

test('sitemap lists the gallery and the landing nav links to it', () => {
  const xml = readFileSync(new URL('sitemap.xml', dist), 'utf8');
  for (const l of ['he', 'ru', 'en']) {
    assert.match(xml, new RegExp(`<loc>[^<]*/${l}/gallery/</loc>`), l);
    assert.ok(readFileSync(new URL(`${l}/index.html`, dist), 'utf8').includes('href="gallery/"'), l);
  }
});

test('the gallery.json check accepts the real file and rejects bad entries', () => {
  checkGallery(gallery, dir);
  const [a] = gallery;
  const p = a.photos[0];
  const one = (photo, album = {}) => [{ ...a, ...album, photos: [{ ...photo, featured: true }] }];
  assert.throws(() => checkGallery(one({ ...p, alt: { ...p.alt, ru: ' ' } }), dir), /alt\.ru is missing/);
  assert.throws(() => checkGallery(one({ ...p, file: `${a.id}/nope.jpg` }), dir), /not found/);
  assert.throws(() => checkGallery(one({ ...p, file: `other/${p.file}` }), dir), /file must be/);
  assert.throws(() => checkGallery(one({ ...p, caption: { he: 'x' } }), dir), /caption\.ru is missing/);
  assert.throws(() => checkGallery(one(p, { title: { he: 'x', ru: 'y' } }), dir), /title\.en is missing/);
  assert.throws(() => checkGallery([...one(p), ...one(p)], dir), /listed twice/);
  assert.throws(() => checkGallery([{ ...a, photos: [p, p] }], dir), /listed twice/);
  assert.throws(() => checkGallery([{ ...a, photos: [{ ...p, featured: false }] }], dir), /featured/);
});
