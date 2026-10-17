import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
const page = () => readFileSync(new URL('../dist/404.html', import.meta.url), 'utf8');

function shown(pathname, { stored = null, languages = [] } = {}) {
  const js = [...page().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('data-404'));
  assert.ok(js, '404 pick script present');
  const els = ['he', 'ru', 'en'].map((l) => ({ l, hidden: false, getAttribute: () => l }));
  const doc = {};
  vm.runInNewContext(js, {
    location: { pathname, search: '', hash: '', replace: () => assert.fail('404 must not redirect') },
    localStorage: { getItem: () => stored },
    navigator: { languages, language: languages[0] },
    document: { querySelectorAll: () => els, documentElement: doc },
  });
  return [els.filter((e) => !e.hidden).map((e) => e.l).join(), doc.lang, doc.dir].join('|');
}

test('path locale wins over stored', () => assert.equal(shown(`${base}ru/nope/`, { stored: 'en' }), 'ru|ru|ltr'));
test('stored beats browser', () => assert.equal(shown(`${base}zz/`, { stored: 'en', languages: ['ru'] }), 'en|en|ltr'));
test('unsupported browser falls back to he', () => assert.equal(shown(`${base}x`, { languages: ['fr'] }), 'he|he|rtl'));
test('legacy iw maps to he', () => assert.equal(shown(`${base}nope/`, { languages: ['iw'] }), 'he|he|rtl'));

test('three blocks with own lang/dir and base-absolute home links', () => {
  const html = page();
  for (const [l, d] of [['he', 'rtl'], ['ru', 'ltr'], ['en', 'ltr']]) {
    const m = html.match(new RegExp(`<section[^>]*data-404="${l}"[^>]*>[\\s\\S]*?</section>`));
    assert.ok(m, l);
    assert.ok(m[0].includes(`lang="${l}"`) && m[0].includes(`dir="${d}"`), l);
    assert.ok(m[0].includes(`href="${base}${l}/"`), l);
  }
});

test('404 is noindex and never redirects', () => {
  const html = page();
  assert.ok(html.includes('noindex'));
  assert.ok(!html.includes('location.replace'));
});
