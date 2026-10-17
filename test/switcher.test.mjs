import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
const dist = new URL('../dist/', import.meta.url);
const LANGS = ['he', 'ru', 'en'];

test('switcher links point to the same slug in the other two languages', () => {
  for (const l of LANGS) {
    const files = readdirSync(new URL(`${l}/`, dist), { recursive: true }).filter(
      (f) => f === 'index.html' || f.endsWith('/index.html'),
    );
    assert.ok(files.length > 0);
    for (const f of files) {
      const slug = f.slice(0, -'index.html'.length);
      const html = readFileSync(new URL(`${l}/${f}`, dist), 'utf8');
      const hrefs = [...html.matchAll(/<a\b[^>]*\bdata-set-lang\b[^>]*>/g)].map(
        (m) => m[0].match(/href="([^"]*)"/)[1],
      );
      const want = LANGS.filter((o) => o !== l).map((o) => `${base}${o}/${slug}`);
      assert.deepEqual(hrefs.sort(), want.sort(), `${l}/${f}`);
    }
  }
});

function clickHandler() {
  const html = readFileSync(new URL('he/index.html', dist), 'utf8');
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((s) => s.includes('data-set-lang'));
  assert.ok(js, 'inline switcher script present');
  const store = {};
  let handler;
  vm.runInNewContext(js, {
    document: { addEventListener: (type, fn) => type === 'click' && (handler = fn) },
    localStorage: { setItem: (k, v) => (store[k] = v) },
  });
  return { handler, store };
}

test('clicking a switcher link stores the target language', () => {
  const { handler, store } = clickHandler();
  handler({ target: { closest: (s) => (s === '[data-set-lang]' ? { dataset: { setLang: 'ru' } } : null) } });
  assert.deepEqual(store, { lang: 'ru' });
});

test('clicking elsewhere stores nothing', () => {
  const { handler, store } = clickHandler();
  handler({ target: { closest: () => null } });
  assert.deepEqual(store, {});
});
