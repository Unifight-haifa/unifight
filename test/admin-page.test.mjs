import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { T, CODES, LANGS } from '../src/admin/i18n.js';

const dist = new URL('../dist/', import.meta.url);
const read = (p) => readFileSync(new URL(p, dist), 'utf8');
const SECRETS = /SESSION_KEY|GITHUB_APP_KEY|BEGIN (RSA )?PRIVATE KEY|sk-ant-|TG_BOT_TOKEN|@gmail\.com/;

test('/admin/ is built, noindex, out of the sitemap and the language trees', () => {
  const html = read('admin/index.html');
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(!read('sitemap.xml').includes('/admin/'));
  for (const l of LANGS) assert.ok(!existsSync(new URL(`${l}/admin/`, dist)), l);
  assert.match(html, /<textarea[^>]*name="bio\.he"[^>]*dir="rtl"/);
  assert.doesNotMatch(html, SECRETS);
});

test('UI strings: same keys in he/ru/en, every API error code, «тренера» only', () => {
  const keys = Object.keys(T.ru).sort();
  for (const l of LANGS) assert.deepEqual(Object.keys(T[l]).sort(), keys, l);
  for (const c of CODES) for (const l of LANGS) assert.ok(T[l][`err.${c}`], `${l} err.${c}`);
  for (const s of ['pending', 'live', 'failed']) assert.ok(T.ru[`st.${s}`], s);
  for (const s of Object.values(T.ru)) assert.doesNotMatch(s, /тренеры/i, s);
});

// Astro inlines small scripts and bundles larger ones into _astro/; read both.
const pageJs = (html) => [
  ...[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]),
  ...[...html.matchAll(/<script[^>]+src="[^"]*\/(_astro\/[^"]+\.js)"/g)].map((m) => read(m[1])),
].join('\n');

test('the panel script wires sign-in and deploy status, never the unsigned Telegram data', () => {
  const js = pageJs(read('admin/index.html'));
  for (const s of ['/session/google', '/session/telegram', '/status/', '/save', '/translate', '/access', '/telegram/link-code']) assert.ok(js.includes(s), s);
  assert.ok(!js.includes('initDataUnsafe'));
  assert.ok(js.includes('sessionStorage'));
  assert.doesNotMatch(js, SECRETS);
});
