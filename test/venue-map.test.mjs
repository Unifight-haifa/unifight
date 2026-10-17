import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
const page = (l) => readFileSync(new URL(`../dist/${l}/map/index.html`, import.meta.url), 'utf8');

test('map page is noindex and loads nothing third-party at rest', () => {
  for (const l of ['he', 'ru', 'en']) {
    const html = page(l);
    assert.ok(html.includes('<meta name="robots" content="noindex">'), l);
    const rest = html.replace(/<script>[\s\S]*?<\/script>/g, '');
    assert.ok(!/tile\.openstreetmap|leaflet\.(js|css)/.test(rest), l);
    assert.ok(!/<(script|img|iframe)\b[^>]*\bsrc="(https?:)?\/\//.test(rest), l);
    assert.ok(!/<link\b[^>]*href="(https?:)?\/\//.test(rest), l);
  }
});

test('Leaflet and tiles are requested only after the click', () => {
  const js = [...page('he').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('data-venue-map'));
  assert.ok(js, 'map script present');
  const added = [];
  let onClick;
  const button = { addEventListener: (type, fn) => type === 'click' && (onClick = fn) };
  const box = { dataset: { base }, querySelector: () => button };
  vm.runInNewContext(js, {
    document: {
      querySelectorAll: () => [box],
      createElement: (tag) => ({ tag }),
      head: { appendChild: (el) => added.push(el) },
    },
  });
  assert.deepEqual(added, []);
  onClick();
  assert.deepEqual(
    added.map((el) => el.src || el.href),
    [`${base}vendor/leaflet/leaflet.css`, `${base}vendor/leaflet/leaflet.js`],
  );
});

test('popups carry Google Maps, Waze and transit links for every venue', () => {
  const html = page('en');
  const popups = html.match(/<template data-popup=/g) || [];
  assert.equal(popups.length, 4);
  for (const host of ['www.google.com/maps/search/', 'waze.com/ul', 'travelmode=transit']) {
    assert.equal(html.split(host).length - 1, 4, host);
  }
});
