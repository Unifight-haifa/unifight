import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const BAD = /\b(margin|padding|border)-(left|right)\b|(^|[\s;{])(left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:\s*(left|right)/m;
const src = new URL('../src/', import.meta.url);

test('no physical left/right CSS in src/', () => {
  const files = readdirSync(src, { recursive: true }).filter((f) => /\.(css|astro)$/.test(f));
  assert.ok(files.length > 0);
  const bad = files.filter((f) => BAD.test(readFileSync(new URL(f, src), 'utf8')));
  assert.deepEqual(bad, []);
});
