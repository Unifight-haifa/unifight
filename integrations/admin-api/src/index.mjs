import { routes, route, json, fail, list, isOwner, userByEmail, currentUser } from './router.mjs';
import { googleUser, signSession, tgUser, newLinkCode, sha256hex } from './auth.mjs';

const now = () => Math.floor(Date.now() / 1000);
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CODE_TTL = 600;
const TG_TRY_PER_ID = 6; // code attempts per Telegram id per UTC day
const TG_TRY_ALL = 30; // across all ids per UTC hour: many accounts could otherwise share the guessing

const session = async (env, email) => ({ token: await signSession({ email }, env), me: await userByEmail(env, email) });

// First login pins Google sub; a recycled gmail with a new sub is refused after that.
async function pinSub(env, table, email, sub) {
  if (table === 'owners') {
    await env.DB.prepare('INSERT INTO owners (email, google_sub) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').bind(email, sub).run();
    return (await env.DB.prepare('SELECT google_sub FROM owners WHERE email = ?').bind(email).first('google_sub')) === sub;
  }
  await env.DB.prepare('UPDATE users SET google_sub = ? WHERE email = ? AND active = 1 AND google_sub IS NULL').bind(sub, email).run();
  return (await env.DB.prepare('SELECT google_sub FROM users WHERE email = ? AND active = 1').bind(email).first('google_sub')) === sub;
}

route('POST', '/session/google', async ({ env, body }) => {
  let g;
  // env.__jwks is a test seam (local key set); unset in production, so Google's JWKS is used.
  try { g = await googleUser(body.credential, env, env.__jwks); } catch { return fail(401, 'unauthorized'); }
  if (!(await pinSub(env, isOwner(env, g.email) ? 'owners' : 'users', g.email, g.sub))) return fail(403, 'forbidden');
  return json(await session(env, g.email));
}, { auth: false });

// Take the slot and read the count in one statement, so parallel requests can't all pass a stale check.
const take = (env, key, day, kind) => env.DB.prepare(
  'INSERT INTO usage (email, day, kind, n) VALUES (?, ?, ?, 1) ON CONFLICT(email, day, kind) DO UPDATE SET n = n + 1 RETURNING n').bind(key, day, kind).first('n');

route('POST', '/session/telegram', async ({ env, body }) => {
  if (!env.TG_BOT_TOKEN) return fail(503, 'not_configured');
  let t;
  try { t = await tgUser(body.initData, env.TG_BOT_TOKEN); } catch { return fail(401, 'unauthorized'); }
  const code = body.code ?? t.startParam;
  if (code != null) {
    const iso = new Date().toISOString();
    const [day, hour] = [iso.slice(0, 10), iso.slice(0, 13)];
    const idKey = await sha256hex(`tg:${t.id}`);
    // Per-id slot first: a single id hammering 429s must not drain the global budget.
    if ((await take(env, idKey, day, 'tg_code_try')) > TG_TRY_PER_ID
      || (await take(env, '*', hour, 'tg_code_try_all')) > TG_TRY_ALL) return fail(429, 'rate_limited');
    const hash = await sha256hex(String(code));
    const won = /^\d{6}$/.test(String(code)) && (await env.DB.prepare(
      'UPDATE link_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?').bind(now(), hash, now()).run()).meta.changes === 1;
    const email = won && (await env.DB.prepare('SELECT email FROM link_codes WHERE code_hash = ?').bind(hash).first('email'));
    if (!email || !(await userByEmail(env, email))) return fail(400, 'bad_code');
    await env.DB.prepare('INSERT OR REPLACE INTO tg_links (telegram_id, email, linked_at) VALUES (?, ?, ?)').bind(t.id, email, iso).run();
    return json(await session(env, email));
  }
  const email = await env.DB.prepare('SELECT email FROM tg_links WHERE telegram_id = ?').bind(t.id).first('email');
  if (!email) return fail(404, 'not_linked');
  if (!(await userByEmail(env, email))) return fail(403, 'forbidden');
  return json(await session(env, email));
}, { auth: false });

route('GET', '/me', ({ user }) => json(user));

route('POST', '/telegram/link-code', async ({ env, user }) => {
  if (!env.TG_BOT_USERNAME) return fail(503, 'not_configured');
  const expires_at = now() + CODE_TTL;
  // Reuse a code_hash row only when it is dead, so a live code is never handed to someone else.
  for (let i = 0; i < 5; i++) {
    const code = newLinkCode();
    const r = await env.DB.prepare(`INSERT INTO link_codes (code_hash, email, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(code_hash) DO UPDATE SET email = excluded.email, expires_at = excluded.expires_at, used_at = NULL
      WHERE used_at IS NOT NULL OR expires_at <= ?`).bind(await sha256hex(code), user.email, expires_at, now()).run();
    if (r.meta.changes === 1) return json({ code, url: `https://t.me/${env.TG_BOT_USERNAME}?startapp=${code}`, expires_at });
  }
  throw new Error('link code collision');
});

const ownerOnly = (h) => (c) => (c.user.role === 'owner' ? h(c) : fail(403, 'forbidden'));

route('GET', '/access', ownerOnly(async ({ env }) => {
  const { results } = await env.DB.prepare(`SELECT email, role, coach_id, active,
    EXISTS (SELECT 1 FROM tg_links t WHERE t.email = u.email) AS telegram FROM users u ORDER BY email`).all();
  return json({ users: results.map((r) => ({ email: r.email, role: r.role, coach_id: r.coach_id ?? null, active: !!r.active, telegram: !!r.telegram })) });
}));

route('POST', '/access', ownerOnly(async ({ env, user, body }) => {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const { role } = body;
  const coach_id = body.coach_id ?? null;
  if (!EMAIL.test(email) || isOwner(env, email) || !['coach', 'editor'].includes(role)
    || (coach_id !== null && !(typeof coach_id === 'string' && SLUG.test(coach_id)))
    || (role === 'coach' && coach_id === null)) return fail(400, 'invalid');
  await env.DB.prepare(`INSERT INTO users (email, coach_id, role, active, added_by, added_at) VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(email) DO UPDATE SET coach_id = excluded.coach_id, role = excluded.role, active = 1`)
    .bind(email, coach_id, role, user.email, new Date().toISOString()).run();
  return json({ ok: true });
}));

route('DELETE', '/access/:email', ownerOnly(async ({ env, params }) => {
  const email = params.email.trim().toLowerCase();
  const [r] = await env.DB.batch([
    env.DB.prepare('UPDATE users SET active = 0 WHERE email = ?').bind(email),
    env.DB.prepare('DELETE FROM tg_links WHERE email = ?').bind(email),
    env.DB.prepare('DELETE FROM link_codes WHERE email = ? AND used_at IS NULL').bind(email),
  ]);
  return r.meta.changes ? json({ ok: true }) : fail(404, 'not_found');
}));

async function dispatch(req, env, ctx) {
  const { pathname } = new URL(req.url);
  const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
  if (!r) return fail(404, 'not_found');
  let params;
  try {
    params = Object.fromEntries(Object.entries(r.re.exec(pathname).groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
  } catch { return fail(400, 'invalid'); }
  let user = null;
  if (r.auth) {
    user = await currentUser(req, env);
    if (!user) return fail(401, 'unauthorized');
    if (!user.role) return fail(403, 'forbidden');
  }
  let body = {};
  if (req.method === 'POST') {
    try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { return fail(400, 'invalid'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'invalid');
  }
  return r.handler({ req, env, ctx, user, params, body });
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin');
    const cors = { Vary: 'Origin', ...(origin && list(env.ALLOWED_ORIGINS).includes(origin) && { 'Access-Control-Allow-Origin': origin }) };
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    let res;
    try {
      res = await dispatch(req, env, ctx);
    } catch (err) {
      console.error('admin-api:', err?.message); // message only: never the request, token or email
      res = fail(500, 'internal');
    }
    res = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};
