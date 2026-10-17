import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
const LANGS = ['he', 'ru', 'en'];
const meta = (html, prop) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];

for (const l of LANGS) {
  const html = () => readFileSync(new URL(`${l}/index.html`, dist), 'utf8');

  test(`${l} index has og:title, og:description and description`, () => {
    for (const p of ['og:title', 'og:description', 'description']) assert.ok(meta(html(), p), p);
    assert.equal(meta(html(), 'twitter:card'), 'summary_large_image');
  });

  test(`${l} og:image is absolute, exists in dist and is under 600 KB`, () => {
    const url = new URL(meta(html(), 'og:image'));
    assert.ok(url.pathname.startsWith(base), url.href);
    const file = new URL(url.pathname.slice(base.length), dist);
    assert.ok(existsSync(file), url.pathname);
    assert.ok(statSync(file).size < 600_000);
  });

  test(`${l} hreflang set is complete and canonical is self`, () => {
    const alt = Object.fromEntries([...html().matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    assert.deepEqual(Object.keys(alt).sort(), [...LANGS, 'x-default'].sort());
    for (const x of LANGS) assert.equal(new URL(alt[x]).pathname, `${base}${x}/`);
    assert.equal(new URL(alt['x-default']).pathname, base);
    assert.equal(html().match(/<link rel="canonical" href="([^"]+)"/)?.[1], alt[l]);
  });
}
