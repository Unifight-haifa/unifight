import { base64url, createRemoteJWKSet, jwtVerify } from 'jose';

const enc = new TextEncoder();
const dec = new TextDecoder();
const hmacKey = (raw) => crypto.subtle.importKey('raw', typeof raw === 'string' ? enc.encode(raw) : raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
let google;

export async function googleUser(credential, env, jwks = (google ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')))) {
  const { payload: p } = await jwtVerify(String(credential), jwks, {
    audience: env.GOOGLE_CLIENT_ID,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    algorithms: ['RS256'],
  });
  if (p.email_verified !== true || typeof p.email !== 'string' || !p.sub) throw new Error('email not verified');
  return { email: p.email.trim().toLowerCase(), sub: String(p.sub) };
}

// The token carries no role: roles are re-read from D1 per request so a revoke bites at once.
export async function signSession({ email }, env, ttl = 12 * 3600) {
  const body = base64url.encode(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + ttl }));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_KEY), enc.encode(body));
  return `${body}.${base64url.encode(new Uint8Array(mac))}`;
}

export async function readSession(token, env) {
  try {
    const [body, mac, extra] = String(token).split('.');
    if (!body || !mac || extra !== undefined || !env.SESSION_KEY) return null;
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_KEY), base64url.decode(mac), enc.encode(body)))) return null;
    const { email, exp } = JSON.parse(dec.decode(base64url.decode(body)));
    if (typeof email !== 'string' || !(exp > Date.now() / 1000)) return null;
    return { email };
  } catch {
    return null;
  }
}

// core.telegram.org/bots/webapps "Validating data received via the Mini App"; never trust initDataUnsafe.
export async function tgUser(initData, botToken, maxAge = 86400) {
  const q = new URLSearchParams(String(initData));
  const hash = q.get('hash');
  if (!/^[0-9a-f]{64}$/.test(hash ?? '')) throw new Error('bad initData');
  q.delete('hash');
  const dcs = [...q].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await crypto.subtle.sign('HMAC', await hmacKey('WebAppData'), enc.encode(botToken));
  const mac = Uint8Array.from(hash.match(/../g), (h) => parseInt(h, 16));
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), mac, enc.encode(dcs)))) throw new Error('bad initData');
  if (!(Date.now() / 1000 - Number(q.get('auth_date')) <= maxAge)) throw new Error('stale initData');
  const id = JSON.parse(q.get('user') ?? 'null')?.id;
  if (!Number.isSafeInteger(id)) throw new Error('bad initData');
  return { id: String(id), startParam: q.get('start_param') };
}

export function newLinkCode() {
  const limit = 2 ** 32 - (2 ** 32 % 1e6); // rejection sampling keeps every code equally likely
  const v = new Uint32Array(1);
  do crypto.getRandomValues(v); while (v[0] >= limit);
  return String(v[0] % 1e6).padStart(6, '0');
}

export const sha256hex = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
