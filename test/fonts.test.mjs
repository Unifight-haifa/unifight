import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const files = readdirSync(dist, { recursive: true }).filter((f) => /\.(html|css)$/.test(f));
const read = (f) => readFileSync(new URL(f, dist), 'utf8');
const pages = files.filter((f) => f.endsWith('.html'));
const styles = () => files.map((f) => (f.endsWith('.css') ? read(f) : (read(f).match(/<style>[\s\S]*?<\/style>/g) ?? []).join(''))).join('\n');

test('no page or stylesheet asks a font CDN for anything', () => {
  assert.ok(pages.length > 40);
  assert.deepEqual(files.filter((f) => /googleapis|gstatic/.test(read(f))), []);
});

test('every page self-hosts its fonts, swaps them in and preloads at most two', () => {
  for (const f of pages) {
    const html = read(f);
    const faces = html.match(/@font-face\{[^}]*\}/g) ?? [];
    assert.ok(faces.length > 0, f);
    for (const face of faces) assert.match(face, /font-display:swap/, `${f}: ${face.slice(0, 60)}`);
    const urls = [...html.matchAll(/_astro\/fonts\/[\w-]+\.woff2/g)].map((m) => m[0]);
    assert.ok(urls.length > 0, f);
    for (const u of urls) assert.ok(existsSync(new URL(u, dist)), `${f}: ${u}`);
    assert.ok((html.match(/<link rel="preload"[^>]*as="font"/g) ?? []).length <= 2, f);
  }
});

test('kanji are SVG glyphs with a recorded meaning, never text', () => {
  const words = JSON.parse(readFileSync(new URL('../content/kanji.json', import.meta.url), 'utf8'));
  for (const style of ['mincho', 'brush']) {
    for (const [w, meaning] of Object.entries(words[style])) assert.ok(meaning.trim(), w);
  }
  for (const f of pages) {
    const html = read(f);
    assert.equal(html.match(/[　-鿿]/u), null, f);
    for (const [, id] of html.matchAll(/<use href="#(k-[\w-]+)"/g)) assert.ok(html.includes(`id="${id}"`), `${f}: ${id}`);
  }
  assert.ok(read('he/index.html').includes('<use href="#k-'));
  assert.ok(read('he/achievements/index.html').includes('<use href="#k-'));
});

test('kanji and the logo are never mirrored on Hebrew pages', () => {
  const MIRROR = /scaleX\(\s*-|scale\(\s*-|scale:\s*-|rotateY\(\s*180|matrix\(\s*-/;
  const css = styles();
  let flips = 0;
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!MIRROR.test(body)) continue;
    flips++;
    assert.doesNotMatch(sel, /\bk[jg]\b|kanji|sumo-k|st-seal|st-mini|st-center|plate|brand|logo/, sel);
  }
  assert.ok(flips > 0, 'the RTL arrow flip should still be found, or this check reads nothing');
  // inline SVGs are bidi-neutral: a multi-glyph word outside an LTR isolate would read backwards
  for (const f of ['he/index.html', 'he/achievements/index.html']) {
    const html = read(f);
    const runs = [...html.matchAll(/(.{0,15})(?:<svg class="kg"[^>]*><use [^>]*><\/svg>(?:<br>)?){2,}/g)];
    assert.ok(runs.length > 0, f);
    for (const m of runs) assert.ok(m[1].endsWith('<bdi dir="ltr">'), `${f}: ${m[1]}`);
  }
});
