import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const page = (l) => new URL(`../dist/${l}/bidi/index.html`, import.meta.url);

test('Hebrew fixture isolates every mixed-direction token', () => {
  const html = readFileSync(page('he'), 'utf8');
  for (const token of [
    '<bdi dir="ltr">−60 kg</bdi>',
    '<bdi dir="ltr">17:30–19:00</bdi>',
    '<bdi dir="ltr">17.10.2026</bdi>',
    '<bdi dir="ltr">10–0</bdi>',
    '<bdi>David Cohen</bdi>',
    '<a href="tel:+97241234567" dir="ltr">',
  ]) {
    assert.ok(html.includes(token), token);
  }
});

test('no Hebrew word is glued to an isolated token', () => {
  const html = readFileSync(page('he'), 'utf8');
  assert.equal(html.match(/[֐-׿]<bdi|<\/bdi>[֐-׿]/), null);
});

test('fixture exists in every locale and is noindex', () => {
  for (const l of ['he', 'ru', 'en']) {
    assert.ok(existsSync(page(l)), l);
    assert.ok(readFileSync(page(l), 'utf8').includes('<meta name="robots" content="noindex">'), l);
  }
});
