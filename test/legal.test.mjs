import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const page = (l, p) => new URL(`../dist/${l}/${p}/index.html`, import.meta.url);
const on = (d) => ({ he: `עדכון אחרון: ${d} באוקטובר 2026`, ru: `Последнее обновление: ${d} октября 2026 г.`, en: `Last updated: ${d} October 2026` });
const updated = { privacy: on(17), accessibility: on(18) };

for (const p of ['privacy', 'accessibility']) {
  for (const [l, d] of [['he', 'rtl'], ['ru', 'ltr'], ['en', 'ltr']]) {
    test(`${l}/${p} exists with lang/dir, date and contact`, () => {
      assert.ok(existsSync(page(l, p)));
      const html = readFileSync(page(l, p), 'utf8');
      assert.ok(html.includes(`<html lang="${l}" dir="${d}"`));
      assert.ok(html.includes(updated[p][l]));
      assert.ok(html.includes('href="https://wa.me/972545664663" dir="ltr"'));
      assert.ok(!/TODO|placeholder/i.test(html));
    });
  }
}
