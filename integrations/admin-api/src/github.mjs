// GitHub App client: installation token, contents reads and one atomic Git Data API commit per save.
import { importPKCS8, SignJWT } from 'jose';

const API = 'https://api.github.com';
let cached = null; // {id, token, until}

// env.__fetch is a test seam; unset in production.
const http = (env, url, init) => (env.__fetch ?? fetch)(url, init);
const headers = (token) => ({ authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28', 'user-agent': 'unifight-panel' });

const ghError = (msg, status) => Object.assign(new Error(msg), { status, github: true });

export async function installationToken(env) {
  if (!env.GITHUB_APP_KEY || !env.GITHUB_APP_ID || !env.GITHUB_INSTALLATION_ID) throw Object.assign(new Error('github: not configured'), { notConfigured: true });
  const now = Math.floor(Date.now() / 1000);
  if (cached?.id === env.GITHUB_INSTALLATION_ID && cached.until > now) return cached.token;
  const key = await importPKCS8(env.GITHUB_APP_KEY, 'RS256');
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: 'RS256' }).setIssuer(String(env.GITHUB_APP_ID))
    .setIssuedAt(now - 60).setExpirationTime(now + 540).sign(key);
  const r = await http(env, `${API}/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`, { method: 'POST', headers: headers(jwt) });
  if (!r.ok) throw ghError(`github token: ${r.status}`, r.status);
  const { token, expires_at } = await r.json();
  // Refresh 5 min early so a token never expires mid-commit.
  cached = { id: env.GITHUB_INSTALLATION_ID, token, until: Math.floor(Date.parse(expires_at) / 1000) - 300 };
  return token;
}

/** path is relative to the repo (`/git/...`, `/contents/...`); throws with .status on non-2xx. */
export async function gh(env, method, path, body) {
  const r = await http(env, `${API}/repos/${env.REPO}${path}`, {
    method, headers: { ...headers(await installationToken(env)), ...(body && { 'content-type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  if (!r.ok) throw ghError(`github ${method} ${path.split('?')[0]}: ${r.status}`, r.status);
  return r.status === 204 ? null : r.json();
}

const contents = async (env, path, ref) => {
  try {
    return await gh(env, 'GET', `/contents/${path}?ref=${encodeURIComponent(ref ?? env.BRANCH)}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
};

const utf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

/** -> {data, sha} or null when the file doesn't exist at ref (default: the branch). */
export async function readJson(env, path, ref) {
  const f = await contents(env, path, ref);
  return f && { data: JSON.parse(utf8(f.content)), sha: f.sha };
}

/** -> [{name, type}], [] when the folder doesn't exist. */
export async function listDir(env, dir, ref) {
  const r = await contents(env, dir, ref);
  return Array.isArray(r) ? r.map(({ name, type }) => ({ name, type })) : [];
}

/**
 * build(head) -> [{path, content} | {path, base64} | {path, delete: true}] runs on every attempt,
 * so a retry after a moved head recomputes the files from the new head instead of reusing old blobs.
 */
export async function commitFiles(env, build, message, { retries = 3 } = {}) {
  const ref = `/git/refs/heads/${env.BRANCH}`;
  for (let i = 0; i <= retries; i++) {
    const head = (await gh(env, 'GET', `/git/ref/heads/${env.BRANCH}`)).object.sha;
    const baseTree = (await gh(env, 'GET', `/git/commits/${head}`)).tree.sha;
    const files = await build(head);
    const msg = typeof message === 'function' ? await message(head) : message;
    const tree = [];
    for (const f of files) {
      const sha = f.delete ? null : (await gh(env, 'POST', '/git/blobs',
        f.base64 != null ? { content: f.base64, encoding: 'base64' } : { content: f.content, encoding: 'utf-8' })).sha;
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha });
    }
    const t = await gh(env, 'POST', '/git/trees', { base_tree: baseTree, tree });
    // No author/committer: GitHub then signs the commit as the App bot.
    const c = await gh(env, 'POST', '/git/commits', { message: msg, tree: t.sha, parents: [head] });
    try {
      await gh(env, 'PATCH', ref, { sha: c.sha, force: false });
      return c.sha;
    } catch (e) {
      if (e.status !== 422) throw e;
    }
  }
  throw ghError('github: main kept moving', 422);
}
