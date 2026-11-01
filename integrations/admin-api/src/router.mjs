// Route table and helpers only, so handler modules can import it without a cycle through index.mjs.
import { readSession } from './auth.mjs';

export const json = (body, status = 200) => Response.json(body, { status });
export const fail = (status, error, detail) => json({ error, ...(detail && { detail }) }, status);

export const routes = [];
export function route(method, pattern, handler, { auth = true } = {}) {
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  routes.push({ method, re, handler, auth });
}

export const list = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
export const isOwner = (env, email) => list(env.OWNER_EMAILS).some((o) => o.toLowerCase() === email);

// Re-read on every request: the session only says who, D1 says what they may do.
export async function userByEmail(env, email) {
  const row = isOwner(env, email)
    ? { email, role: 'owner', coach_id: null }
    : await env.DB.prepare('SELECT email, role, coach_id FROM users WHERE email = ? AND active = 1').bind(email).first();
  if (!row) return null;
  const tg = await env.DB.prepare('SELECT 1 AS x FROM tg_links WHERE email = ?').bind(email).first();
  return { email: row.email, role: row.role, coach_id: row.coach_id ?? null, telegram: !!tg };
}

// null = no valid session (401); role null = signed but not allowed (403).
export async function currentUser(req, env) {
  const m = /^Bearer (\S+)$/.exec(req.headers.get('Authorization') ?? '');
  const s = m && (await readSession(m[1], env));
  if (!s) return null;
  return (await userByEmail(env, s.email)) ?? { email: s.email, role: null };
}

// Take the slot and read the count in one statement, so parallel requests can't all pass a stale check.
export const take = (env, key, day, kind) => env.DB.prepare(
  'INSERT INTO usage (email, day, kind, n) VALUES (?, ?, ?, 1) ON CONFLICT(email, day, kind) DO UPDATE SET n = n + 1 RETURNING n').bind(key, day, kind).first('n');
