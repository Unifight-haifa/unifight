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
