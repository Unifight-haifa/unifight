import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const pages = (l) =>
  readdirSync(new URL(`${l}/`, dist), { recursive: true })
    .filter((f) => f === 'index.html' || f.endsWith('/index.html'))
    .sort();

test('he, ru and en have the same non-empty set of pages', () => {
  const he = pages('he');
  assert.ok(he.length > 0);
  assert.deepEqual(pages('ru'), he);
  assert.deepEqual(pages('en'), he);
});

for (const [l, d] of [['he', 'rtl'], ['ru', 'ltr'], ['en', 'ltr']]) {
  test(`${l} pages carry lang="${l}" dir="${d}"`, () => {
    for (const p of pages(l)) {
      const html = readFileSync(new URL(`${l}/${p}`, dist), 'utf8');
      assert.ok(html.includes(`<html lang="${l}" dir="${d}"`), `${l}/${p}`);
    }
  });
}
