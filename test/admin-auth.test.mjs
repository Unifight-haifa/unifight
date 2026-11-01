import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet } from 'jose';
import { googleUser, signSession, readSession, tgUser, newLinkCode, sha256hex } from '../integrations/admin-api/src/auth.mjs';
import { googleKit, tgInitData } from './helpers/admin-env.mjs';

const ENV = { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', SESSION_KEY: 'test-session-key' };
const BOT = '123:TEST';
const now = () => Math.floor(Date.now() / 1000);
const kit = await googleKit();
const jwks = createLocalJWKSet(kit.jwks);

test('googleUser accepts a valid token and lowercases the email', async () => {
  for (const iss of ['https://accounts.google.com', 'accounts.google.com']) {
    const u = await googleUser(await kit.sign({ iss, email: 'Coach@Example.com' }), ENV, jwks);
    assert.deepEqual(u, { email: 'coach@example.com', sub: 'sub-1' });
  }
});

test('googleUser rejects wrong aud, iss, expiry, unverified email and foreign key', async () => {
  const other = await googleKit();
  const bad = [
    await kit.sign({ aud: 'other-app.apps.googleusercontent.com' }),
    await kit.sign({ iss: 'https://evil.example' }),
    await kit.sign({ exp: now() - 600, iat: now() - 4000 }),
    await kit.sign({ email_verified: false }),
    await kit.sign({ email_verified: 'true' }),
    await kit.sign({ email_verified: undefined }),
    await other.sign(),
    'not-a-jwt',
  ];
  for (const t of bad) await assert.rejects(googleUser(t, ENV, jwks));
});

test('session round trip carries only email and exp', async () => {
  const t = await signSession({ email: 'coach@example.com', role: 'owner' }, ENV);
  assert.deepEqual(await readSession(t, ENV), { email: 'coach@example.com' });
  const body = JSON.parse(Buffer.from(t.split('.')[0], 'base64url'));
  assert.deepEqual(Object.keys(body).sort(), ['email', 'exp']);
});

test('session rejects tampering, expiry and a wrong key', async () => {
  const t = await signSession({ email: 'coach@example.com' }, ENV);
  const [b, m] = t.split('.');
  const flip = (s) => s.slice(0, 5) + (s[5] === 'A' ? 'B' : 'A') + s.slice(6);
  const forged = Buffer.from(JSON.stringify({ email: 'owner@example.com', exp: now() + 3600 })).toString('base64url');
  for (const x of [`${flip(b)}.${m}`, `${b}.${flip(m)}`, `${forged}.${m}`, `${b}`, `${b}.${m}.x`, '', null]) {
    assert.equal(await readSession(x, ENV), null);
  }
  assert.equal(await readSession(t, { SESSION_KEY: 'other-key' }), null);
  assert.equal(await readSession(await signSession({ email: 'coach@example.com' }, ENV, -1), ENV), null);
});

test('tgUser accepts valid initData and keeps big ids exact', async () => {
  const d = await tgInitData({ user: { id: 2 ** 52, first_name: 'T' }, start_param: '123456' }, BOT);
  assert.deepEqual(await tgUser(d, BOT), { id: '4503599627370496', startParam: '123456' });
  const plain = await tgInitData({ user: { id: 42 } }, BOT);
  assert.deepEqual(await tgUser(plain, BOT), { id: '42', startParam: null });
});

test('tgUser rejects changed fields, missing hash, wrong bot and stale data', async () => {
  const d = await tgInitData({ user: { id: 42 } }, BOT);
  const changed = new URLSearchParams(d); changed.set('user', JSON.stringify({ id: 43 }));
  const noHash = new URLSearchParams(d); noHash.delete('hash');
  const noDate = new URLSearchParams(d); noDate.delete('auth_date');
  await assert.rejects(tgUser(changed.toString(), BOT));
  await assert.rejects(tgUser(noHash.toString(), BOT));
  await assert.rejects(tgUser(noDate.toString(), BOT));
  await assert.rejects(tgUser(d, '456:OTHER'));
  await assert.rejects(tgUser(await tgInitData({ user: { id: 42 }, auth_date: now() - 25 * 3600 }, BOT), BOT));
  await assert.rejects(tgUser('', BOT));
});

test('newLinkCode gives 6 digits spread over the range; sha256hex is stable', async () => {
  const codes = Array.from({ length: 2000 }, newLinkCode);
  assert.ok(codes.every((c) => /^\d{6}$/.test(c)));
  assert.ok(new Set(codes).size > 1990);
  const firstDigits = new Set(codes.map((c) => c[0]));
  assert.equal(firstDigits.size, 10);
  assert.equal(await sha256hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

// Request-level: the Worker as deployed, with D1 on node:sqlite and a local Google key.
const { default: worker } = await import('../integrations/admin-api/src/index.mjs');
const { makeEnv } = await import('./helpers/admin-env.mjs');
const { mock } = await import('node:test');

const env0 = () => makeEnv({ __jwks: jwks });
async function call(env, method, path, { body, token, origin, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  if (body !== undefined || raw) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://panel.example.com${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }), env, {});
  const text = await res.text();
  return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null };
}
const login = async (env, claims) => call(env, 'POST', '/session/google', { body: { credential: await kit.sign(claims) } });
const ownerToken = async (env) => (await login(env, { email: 'owner@example.com', sub: 'owner-sub' })).data.token;
async function grant(env, email, role = 'coach', coach_id = 'test-coach') {
  const r = await call(env, 'POST', '/access', { token: await ownerToken(env), body: { email, role, coach_id } });
  assert.equal(r.status, 200);
}
const tg = (id, start_param) => tgInitData({ user: { id }, start_param }, '123:TEST');
async function linkCode(env, email, sub = 'sub-1') {
  const { token } = (await login(env, { email, sub })).data;
  return (await call(env, 'POST', '/telegram/link-code', { token })).data;
}

test('CORS: exact allowed origin only; OPTIONS is 204', async () => {
  const env = env0();
  const ok = await call(env, 'OPTIONS', '/me', { origin: 'https://unifight-haifa.com' });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://unifight-haifa.com');
  assert.equal(ok.headers.get('access-control-allow-headers'), 'Authorization, Content-Type');
  assert.equal(ok.headers.get('vary'), 'Origin');
  const evil = await call(env, 'OPTIONS', '/me', { origin: 'https://evil.example' });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const get = await call(env, 'GET', '/me', { origin: 'https://unifight-haifa.com' });
  assert.equal(get.status, 401);
  assert.equal(get.headers.get('access-control-allow-origin'), 'https://unifight-haifa.com');
});

test('Google login: allowlisted coach, unknown, revoked, sub pinning, owner', async () => {
  const env = makeEnv({ __jwks: jwks, OWNER_EMAILS: ' Other@example.com , OWNER@example.com' });
  await grant(env, 'coach@example.com');
  const ok = await login(env, { email: 'coach@example.com' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.me, { email: 'coach@example.com', role: 'coach', coach_id: 'test-coach', telegram: false });
  assert.equal((await login(env, { email: 'coach@example.com', sub: 'sub-other' })).status, 403);
  assert.equal((await login(env, { email: 'stranger@example.com' })).status, 403);
  assert.equal((await login(env, { email_verified: false })).status, 401);
  assert.equal((await call(env, 'POST', '/session/google', { body: {} })).status, 401);
  const owner = await login(env, { email: 'Owner@Example.com', sub: 'owner-sub' });
  assert.equal(owner.data.me.role, 'owner');
  assert.equal((await login(env, { email: 'owner@example.com', sub: 'owner-sub-2' })).status, 403);
  await call(env, 'DELETE', '/access/coach%40example.com', { token: owner.data.token });
  assert.equal((await login(env, { email: 'coach@example.com' })).status, 403);
});

test('/me reads the role from D1 each time; revoke bites on the next request', async () => {
  const env = env0();
  await grant(env, 'coach@example.com');
  const { token } = (await login(env, { email: 'coach@example.com' })).data;
  assert.equal((await call(env, 'GET', '/me', { token })).data.role, 'coach');
  await grant(env, 'coach@example.com', 'editor', null);
  assert.deepEqual((await call(env, 'GET', '/me', { token })).data, { email: 'coach@example.com', role: 'editor', coach_id: null, telegram: false });
  assert.deepEqual((await call(env, 'DELETE', '/access/coach@example.com', { token: await ownerToken(env) })).data, { ok: true });
  assert.equal((await call(env, 'GET', '/me', { token })).status, 403);
  assert.equal((await call(env, 'GET', '/me', { token: 'garbage' })).status, 401);
  assert.equal((await call(env, 'GET', '/nope', { token })).status, 404);
});

test('/access is owner-only and validates input', async () => {
  const env = env0();
  const owner = await ownerToken(env);
  await grant(env, 'coach@example.com');
  await grant(env, 'editor@example.com', 'editor', null);
  for (const email of ['coach@example.com', 'editor@example.com']) {
    const { token } = (await login(env, { email, sub: email })).data;
    assert.equal((await call(env, 'GET', '/access', { token })).status, 403);
    assert.equal((await call(env, 'POST', '/access', { token, body: { email: 'x@example.com', role: 'editor' } })).status, 403);
    assert.equal((await call(env, 'DELETE', '/access/coach@example.com', { token })).status, 403);
  }
  const bad = [
    { email: 'x@example.com', role: 'owner', coach_id: null },
    { email: 'not-an-email', role: 'coach', coach_id: 'test-coach' },
    { email: 'x@example.com', role: 'coach', coach_id: '../src' },
    { email: 'x@example.com', role: 'coach', coach_id: 'Test Coach' },
    { email: 'x@example.com', role: 'coach' },
    { email: 'owner@example.com', role: 'editor' },
  ];
  for (const body of bad) assert.equal((await call(env, 'POST', '/access', { token: owner, body })).data.error, 'invalid', JSON.stringify(body));
  assert.equal((await call(env, 'POST', '/access', { token: owner, raw: '{nope' })).status, 400);
  const { users } = (await call(env, 'GET', '/access', { token: owner })).data;
  assert.deepEqual(users, [
    { email: 'coach@example.com', role: 'coach', coach_id: 'test-coach', active: true, telegram: false },
    { email: 'editor@example.com', role: 'editor', coach_id: null, active: true, telegram: false },
  ]);
  assert.equal((await call(env, 'DELETE', '/access/ghost@example.com', { token: owner })).status, 404);
});

test('link code: 6 digits, bot url, only the hash stored', async () => {
  const env = env0();
  await grant(env, 'coach@example.com');
  const c = await linkCode(env, 'coach@example.com');
  assert.match(c.code, /^\d{6}$/);
  assert.equal(c.url, `https://t.me/test_panel_bot?startapp=${c.code}`);
  assert.ok(c.expires_at - Date.now() / 1000 > 590);
  const rows = env.DB.db.prepare('SELECT * FROM link_codes').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code_hash, await sha256hex(c.code));
  assert.ok(!JSON.stringify(rows).includes(`"${c.code}"`));
});

test('Telegram: start_param binds once, then the id signs in; manual code; expiry; revoke', async () => {
  const env = env0();
  await grant(env, 'coach@example.com');
  const c = await linkCode(env, 'coach@example.com');
  const s = await call(env, 'POST', '/session/telegram', { body: { initData: await tg(1001, c.code) } });
  assert.equal(s.status, 200);
  assert.deepEqual(s.data.me, { email: 'coach@example.com', role: 'coach', coach_id: 'test-coach', telegram: true });
  assert.equal((await call(env, 'GET', '/me', { token: s.data.token })).data.telegram, true);
  assert.equal((await call(env, 'POST', '/session/telegram', { body: { initData: await tg(2002, c.code) } })).data.error, 'bad_code');
  assert.equal((await call(env, 'POST', '/session/telegram', { body: { initData: await tg(1001) } })).status, 200);
  assert.equal((await call(env, 'POST', '/session/telegram', { body: { initData: await tg(3003) } })).data.error, 'not_linked');
  const c2 = await linkCode(env, 'coach@example.com');
  assert.equal((await call(env, 'POST', '/session/telegram', { body: { initData: await tg(3003), code: c2.code } })).status, 200);
  const c3 = await linkCode(env, 'coach@example.com');
  env.DB.db.prepare('UPDATE link_codes SET expires_at = ? WHERE code_hash = ?').run(Math.floor(Date.now() / 1000) - 1, await sha256hex(c3.code));
  assert.equal((await call(env, 'POST', '/session/telegram', { body: { initData: await tg(4004, c3.code) } })).data.error, 'bad_code');
  const forged = new URLSearchParams(await tg(1001)); forged.set('user', JSON.stringify({ id: 9 }));
  assert.equal((await call(env, 'POST', '/session/telegram', { body: { initData: forged.toString() } })).status, 401);
  await call(env, 'DELETE', '/access/coach@example.com', { token: await ownerToken(env) });
  assert.equal((await call(env, 'POST', '/session/telegram', { body: { initData: await tg(1001) } })).data.error, 'not_linked');
  assert.equal((await call(env, 'POST', '/session/telegram', { body: { initData: await tg(3003) } })).data.error, 'not_linked');
});

test('Telegram: two parallel redeems of one code, exactly one wins', async () => {
  const env = env0();
  await grant(env, 'coach@example.com');
  const c = await linkCode(env, 'coach@example.com');
  const [a, b] = await Promise.all([tg(5001, c.code), tg(5002, c.code)]);
  const rs = await Promise.all([a, b].map((initData) => call(env, 'POST', '/session/telegram', { body: { initData } })));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 400]);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) AS n FROM tg_links').get().n, 1);
});

test('Telegram: per-id daily limit and global hourly cap', async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T10:00:00Z') });
  const env = env0();
  await grant(env, 'coach@example.com');
  const redeem = async (id, code) => call(env, 'POST', '/session/telegram', { body: { initData: await tg(id), code } });
  for (let i = 0; i < 6; i++) assert.equal((await redeem(7000, '000000')).status, 400);
  assert.equal((await redeem(7000, '000000')).data.error, 'rate_limited');
  const good = await linkCode(env, 'coach@example.com');
  assert.equal((await redeem(7000, good.code)).status, 429);
  for (let id = 7001; id <= 7004; id++) for (let i = 0; i < 6; i++) await redeem(id, '000000');
  assert.equal(env.DB.db.prepare("SELECT n FROM usage WHERE email = '*'").get().n, 30);
  assert.equal((await redeem(8000, good.code)).data.error, 'rate_limited');
  assert.ok(!JSON.stringify(env.DB.db.prepare('SELECT * FROM usage').all()).includes('7000'));
  mock.timers.setTime(Date.parse('2026-11-01T11:00:01Z'));
  const fresh = await linkCode(env, 'coach@example.com');
  assert.equal((await redeem(8000, fresh.code)).status, 200);
});

test('Telegram: parallel code attempts never exceed the caps', async () => {
  const env = env0();
  await grant(env, 'coach@example.com');
  const attempt = async (id) => call(env, 'POST', '/session/telegram', { body: { initData: await tg(id), code: '000000' } });
  const one = await Promise.all(Array.from({ length: 20 }, () => attempt(9000)));
  assert.equal(one.filter((r) => r.status === 400).length, 6);
  assert.equal(one.filter((r) => r.status === 429).length, 14);
  const many = await Promise.all(Array.from({ length: 40 }, (_, i) => attempt(9100 + i)));
  assert.equal(many.filter((r) => r.status === 400).length, 24); // 30 global minus the 6 above
  assert.equal(many.filter((r) => r.status === 429).length, 16);
});
