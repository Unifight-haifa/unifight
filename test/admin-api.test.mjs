import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtVerify } from 'jose';
import { installationToken, readJson, listDir, commitFiles } from '../integrations/admin-api/src/github.mjs';
import { stubFetch } from './helpers/admin-env.mjs';

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64');
const APP_KEY = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;

let installs = 0;
const ghEnv = (handlers, over = {}) => {
  const s = stubFetch([
    ['POST', /\/app\/installations\/\w+\/access_tokens$/, () => ({ token: 'inst-token', expires_at: new Date(Date.now() + 3600e3).toISOString() })],
    ...handlers,
  ]);
  // A fresh installation id per env keeps the module token cache from leaking between tests.
  return { env: { REPO: 'o/r', BRANCH: 'main', GITHUB_APP_ID: '123', GITHUB_INSTALLATION_ID: `i${++installs}`, GITHUB_APP_KEY: APP_KEY, __fetch: s.fetch, ...over }, s };
};

test('installationToken signs an RS256 app JWT and caches the token', async () => {
  let auth;
  const { env, s } = ghEnv([]);
  s.calls.length = 0;
  const orig = env.__fetch;
  env.__fetch = (u, init) => { auth = new Request(u, init).headers.get('authorization'); return orig(u, init); };
  assert.equal(await installationToken(env), 'inst-token');
  const { payload } = await jwtVerify(auth.replace('Bearer ', ''), publicKey, { algorithms: ['RS256'] });
  assert.equal(payload.iss, '123');
  assert.ok(payload.exp - payload.iat <= 600);
  assert.equal(await installationToken(env), 'inst-token');
  assert.equal(s.calls.filter((c) => c.method === 'POST').length, 1);
});

test('readJson decodes content and blob sha; 404 is null; listDir lists', async () => {
  const text = JSON.stringify({ name: { ru: 'Натанель' } });
  const seen = [];
  const { env } = ghEnv([
    ['GET', /\/contents\/content\/x\.json\?ref=main$/, (req) => { seen.push(req.headers); return { sha: 'blob1', content: Buffer.from(text).toString('base64').replace(/(.{20})/g, '$1\n') }; }],
    ['GET', /\/contents\/content\/dir\?ref=main$/, () => [{ name: 'a.json', type: 'file', sha: 'x' }]],
    ['GET', /\/contents\//, () => new Response('{}', { status: 404 })],
  ]);
  assert.deepEqual(await readJson(env, 'content/x.json'), { data: { name: { ru: 'Натанель' } }, sha: 'blob1' });
  assert.equal(await readJson(env, 'content/none.json'), null);
  assert.deepEqual(await listDir(env, 'content/dir'), [{ name: 'a.json', type: 'file' }]);
  assert.deepEqual(await listDir(env, 'content/nodir'), []);
  for (const h of seen) {
    assert.equal(h.get('user-agent'), 'unifight-panel');
    assert.equal(h.get('x-github-api-version'), '2022-11-28');
    assert.equal(h.get('authorization'), 'Bearer inst-token');
  }
});

// Minimal Git Data API: refusing the first `moves` ref updates as a moved head.
function gitStub(moves = 0) {
  const log = [];
  let head = 'c0';
  let n = 0;
  const handlers = [
    ['GET', /\/git\/ref\/heads\/main$/, () => ({ object: { sha: head } })],
    ['GET', /\/git\/commits\/(\w+)$/, (_, m) => ({ tree: { sha: `t-${m[1]}` } })],
    ['POST', /\/git\/blobs$/, async (req) => ({ sha: `b${++n}`, _: log.push(['blob', await req.json()]) })],
    ['POST', /\/git\/trees$/, async (req) => ({ sha: `t${++n}`, _: log.push(['tree', await req.json()]) })],
    ['POST', /\/git\/commits$/, async (req) => ({ sha: `c${++n}`, _: log.push(['commit', await req.json()]) })],
    ['PATCH', /\/git\/refs\/heads\/main$/, async (req) => {
      log.push(['patch', await req.json()]);
      if (moves-- > 0) { head = `moved${moves}`; return new Response('{}', { status: 422 }); }
      return { object: { sha: 'ok' } };
    }],
  ];
  return { handlers, log };
}

test('commitFiles: six calls in order, no author, force false', async () => {
  const g = gitStub();
  const { env, s } = ghEnv(g.handlers);
  const sha = await commitFiles(env, async () => [
    { path: 'content/a.json', content: '{}\n' }, { path: 'public/a.webp', base64: 'UklGRg==' }, { path: 'content/old.json', delete: true }], 'Coaches: X, bio');
  const git = s.calls.filter((c) => c.url.includes('/git/')).map((c) => `${c.method} ${new URL(c.url).pathname.replace('/repos/o/r', '')}`);
  assert.deepEqual(git, ['GET /git/ref/heads/main', 'GET /git/commits/c0', 'POST /git/blobs', 'POST /git/blobs', 'POST /git/trees', 'POST /git/commits', 'PATCH /git/refs/heads/main']);
  const [b1, b2, tree, commit, patch] = g.log.map((x) => x[1]);
  assert.deepEqual([b1.encoding, b2.encoding], ['utf-8', 'base64']);
  assert.equal(tree.base_tree, 't-c0');
  assert.deepEqual(tree.tree.map((e) => [e.mode, e.type, e.sha]), [['100644', 'blob', 'b1'], ['100644', 'blob', 'b2'], ['100644', 'blob', null]]);
  assert.deepEqual(Object.keys(commit).sort(), ['message', 'parents', 'tree']);
  assert.deepEqual(commit.parents, ['c0']);
  assert.deepEqual(patch, { sha: 'c4', force: false });
  assert.equal(sha, 'c4');
  assert.ok(s.calls.every((c) => c.url.startsWith('https://api.github.com/')));
});

test('commitFiles rebuilds from the new head after a 422 and gives up after four', async () => {
  const g = gitStub(1);
  const { env } = ghEnv(g.handlers);
  const heads = [];
  await commitFiles(env, async (h) => { heads.push(h); return [{ path: 'a', content: h }]; }, 'm');
  assert.deepEqual(heads, ['c0', 'moved0']);
  assert.equal(g.log.filter(([k]) => k === 'blob').at(-1)[1].content, 'moved0');

  const g4 = gitStub(4);
  const e4 = ghEnv(g4.handlers);
  await assert.rejects(commitFiles(e4.env, async () => [{ path: 'a', content: 'x' }], 'm'), /github: main kept moving/);
  assert.equal(g4.log.filter(([k]) => k === 'patch').length, 4);
});
