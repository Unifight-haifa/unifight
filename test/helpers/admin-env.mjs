// Shared harness for admin-api tests: exports only, so `node --test` sees an empty file.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SignJWT } from 'jose';

const enc = new TextEncoder();

export function makeD1(schemaSql) {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  const stmt = (sql, args = []) => {
    const s = db.prepare(sql);
    return {
      bind: (...v) => stmt(sql, v),
      first: async (col) => { const r = s.get(...args) ?? null; return col && r ? r[col] : r; },
      all: async () => ({ results: s.all(...args) }),
      run: async () => ({ meta: { changes: Number(s.run(...args).changes) } }),
      _run: () => ({ results: [], meta: { changes: Number(s.run(...args).changes) } }),
    };
  };
  return {
    db,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      db.exec('BEGIN');
      try { const out = stmts.map((s) => s._run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

export function stubFetch(handlers) {
  const calls = [];
  const fetch = async (input, init) => {
    const req = new Request(input, init);
    calls.push({ method: req.method, url: req.url });
    for (const [method, re, fn] of handlers) {
      const m = req.method === method && req.url.match(re);
      if (!m) continue;
      const out = await fn(req, m);
      return out instanceof Response ? out : Response.json(out);
    }
    throw new Error(`unstubbed fetch ${req.method} ${req.url}`);
  };
  return { fetch, calls };
}

export async function googleKit(kid = 'test-kid') {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid, alg: 'RS256', use: 'sig' };
  const sign = (claims = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: 'https://accounts.google.com', aud: 'test-client.apps.googleusercontent.com', sub: 'sub-1',
      email: 'coach@example.com', email_verified: true, iat: now, exp: now + 3600, ...claims };
    return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid }).sign(privateKey);
  };
  return { jwks: { keys: [jwk] }, sign };
}

export async function tgInitData({ user, auth_date = Math.floor(Date.now() / 1000), start_param }, botToken) {
  const q = new URLSearchParams({ query_id: 'AAE-test', user: JSON.stringify(user), auth_date: String(auth_date) });
  if (start_param != null) q.set('start_param', start_param);
  const key = (raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', await key(enc.encode('WebAppData')), enc.encode(botToken));
  const dcs = [...q].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const mac = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(dcs));
  q.set('hash', Buffer.from(mac).toString('hex'));
  return q.toString();
}

export function makeEnv(over = {}) {
  const schema = readFileSync(new URL('../../integrations/admin-api/schema.sql', import.meta.url), 'utf8');
  return {
    DB: makeD1(schema),
    SESSION_KEY: 'test-session-key',
    OWNER_EMAILS: 'owner@example.com',
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    ALLOWED_ORIGINS: 'https://unifight-haifa.com',
    TG_BOT_TOKEN: '123:TEST',
    TG_BOT_USERNAME: 'test_panel_bot',
    REPO: 'Unifight-haifa/unifight',
    BRANCH: 'main',
    ...over,
  };
}
