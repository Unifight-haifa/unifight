import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
const dist = new URL('../dist/', import.meta.url);
const root = () => readFileSync(new URL('index.html', dist), 'utf8');

function run({ stored = null, languages, search = '', hash = '', storageThrows = false }) {
  const scripts = [...root().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  let target;
  vm.runInNewContext(scripts[0], {
    localStorage: {
      getItem: () => {
        if (storageThrows) throw new Error('storage blocked');
        return stored;
      },
    },
    navigator: { languages, language: languages?.[0] },
    location: { pathname: base, search, hash, replace: (u) => (target = u) },
  });
  return target;
}

test('stored choice wins over browser', () => assert.equal(run({ stored: 'ru', languages: ['en-US'] }), `${base}ru/`));
test('first supported browser language', () => assert.equal(run({ languages: ['en-GB', 'he'] }), `${base}en/`));
test('legacy iw maps to he', () => assert.equal(run({ languages: ['iw-IL'] }), `${base}he/`));
test('unsupported browser language falls back to he', () => assert.equal(run({ languages: ['fr-FR'] }), `${base}he/`));
test('junk stored value is ignored', () => assert.equal(run({ stored: 'xx', languages: ['ru-RU'] }), `${base}ru/`));
test('blocked storage still uses browser language', () =>
  assert.equal(run({ storageThrows: true, languages: ['ru-RU'] }), `${base}ru/`));
test('query and hash are preserved', () =>
  assert.equal(run({ languages: [], search: '?utm_source=fb', hash: '#x' }), `${base}he/?utm_source=fb#x`));

test('deep pages never redirect', () => {
  for (const l of ['he', 'ru', 'en']) {
    for (const f of readdirSync(new URL(`${l}/`, dist), { recursive: true }).filter((f) => f.endsWith('.html'))) {
      assert.ok(!readFileSync(new URL(`${l}/${f}`, dist), 'utf8').includes('location.replace'), `${l}/${f}`);
    }
  }
});

test('root works without JS via plain links and has no meta refresh', () => {
  const html = root();
  for (const l of ['he', 'ru', 'en']) assert.ok(html.includes(`<a href="${base}${l}/"`), l);
  assert.ok(!/http-equiv="?refresh/i.test(html));
});
