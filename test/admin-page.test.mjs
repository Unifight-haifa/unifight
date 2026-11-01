import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { T, CODES, LANGS } from '../src/admin/i18n.js';
import { fitSize, isWebpBlob, toBase64 } from '../src/admin/photo.js';
import { changeBody, sessionRef } from '../src/admin/schedule.js';
import { checkChanges } from '../src/lib/schedule-changes.mjs';

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
  for (const s of ['/session/google', '/session/telegram', '/status/', '/save', '/translate', '/access', '/telegram/link-code', 'schedule.sessions', 'change.create', 'change.delete', '/content/changes/']) assert.ok(js.includes(s), s);
  assert.ok(!js.includes('initDataUnsafe'));
  assert.ok(js.includes('sessionStorage'));
  assert.doesNotMatch(js, SECRETS);
});

test('photo: fitSize never upscales, isWebpBlob, chunked base64', () => {
  assert.deepEqual(fitSize(4032, 3024, 800, 1200), { w: 800, h: 600 });
  assert.deepEqual(fitSize(3024, 4032), { w: 800, h: 1067 });
  assert.deepEqual(fitSize(600, 400), { w: 600, h: 400 });
  assert.deepEqual(fitSize(1000, 3000), { w: 400, h: 1200 });
  assert.equal(isWebpBlob({ type: 'image/png' }), false);
  assert.equal(isWebpBlob({ type: 'image/webp' }), true);
  const big = Uint8Array.from({ length: 100_000 }, (_, i) => i * 7);
  assert.equal(toBase64(big), Buffer.from(big).toString('base64'));
});

test('the WebP encoder is vendored and loaded lazily, not bundled', () => {
  for (const f of ['encode.js', 'meta.js', 'utils.js', 'codec/enc/webp_enc.js', 'codec/enc/webp_enc.wasm', 'LICENSE']) {
    assert.ok(existsSync(new URL(`vendor/jsquash-webp/${f}`, dist)), f);
  }
  const enc = read('vendor/jsquash-webp/encode.js');
  assert.doesNotMatch(enc, /from '[^.]/, 'bare import would not resolve by URL');
  const js = pageJs(read('admin/index.html'));
  assert.ok(js.includes('coach.photo'));
  assert.ok(js.includes('vendor/jsquash-webp/encode.js'));
  assert.doesNotMatch(js, /AGFzbQ|\0asm/, 'wasm inlined into the page bundle');
});

const note = { he: 'ה', ru: 'р', en: 'e' };
const content = (p) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), 'utf8'));

test('changeBody maps each change type onto the contract', () => {
  assert.deepEqual(changeBody({ type: 'cancel', date: '2026-11-03', day: 2, start: '17:30', note }),
    { type: 'cancel', from: '2026-11-03', to: '2026-11-03', session: { day: 2, start: '17:30' }, note });
  assert.equal(changeBody({ type: 'cancel', date: '2026-11-01', to: '2026-11-07', day: 2, start: '17:30', note }).to, '2026-11-07');
  const nw = { date: '2026-11-05', start: '17:30', end: '18:30', venue: 'ironi-alef' };
  assert.deepEqual(changeBody({ type: 'move', date: '2026-11-03', to: '2026-11-09', day: 2, start: '17:30', new: nw, note }),
    { type: 'move', from: '2026-11-03', to: '2026-11-03', session: { day: 2, start: '17:30' }, new: nw, note });
  assert.deepEqual(changeBody({ type: 'extra', date: '', day: '', new: { ...nw, venue: '' }, note }),
    { type: 'extra', from: '2026-11-05', to: '2026-11-05', new: { date: '2026-11-05', start: '17:30', end: '18:30' }, note });
  assert.deepEqual(changeBody({ type: 'note', date: '2026-11-03', to: '', day: 2, start: '17:30', new: nw, note }),
    { type: 'note', from: '2026-11-03', to: '2026-11-03', note });
});

test('sessionRef adds group only where two classes share day and start, and checkChanges finds it', () => {
  const venues = content('venues.json');
  for (const id of ['natanel-zhurovel', 'ilana-kratysh']) {
    const sc = content(`schedule/${id}.json`);
    sc.sessions.forEach((s, i) => {
      const ref = sessionRef(s, sc.sessions);
      const twin = sc.sessions.filter((x) => x.day === s.day && x.start === s.start).length > 1;
      assert.equal('group' in ref, twin, `${id}#${i}`);
      const day = '2026-11-01'.replace('01', String(1 + s.day).padStart(2, '0'));
      const c = { id: 'x', schedule: id, author: id, created: '2026-11-01T00:00:00Z', ...changeBody({ type: 'cancel', date: day, ...ref, note }) };
      assert.equal(checkChanges([['x.json', c]], { [id]: sc }, venues)[0].ses, s, `${id}#${i}`);
    });
  }
});
