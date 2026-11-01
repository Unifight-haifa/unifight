// Fake GitHub repo (refs, commits, pulls) and a signed-in Worker caller, shared by the admin-api tests. Exports only.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stubFetch, makeEnv } from './admin-env.mjs';
import { signSession } from '../../integrations/admin-api/src/auth.mjs';
import worker from '../../integrations/admin-api/src/index.mjs';

export const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64');
export const APP_KEY = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;

let installs = 0;
export const ghEnv = (handlers, over = {}) => {
  const s = stubFetch([
    ['POST', /\/app\/installations\/\w+\/access_tokens$/, () => ({ token: 'inst-token', expires_at: new Date(Date.now() + 3600e3).toISOString() })],
    ...handlers,
  ]);
  // A fresh installation id per env keeps the module token cache from leaking between tests.
  return { env: { REPO: 'o/r', BRANCH: 'main', GITHUB_APP_ID: '123', GITHUB_INSTALLATION_ID: `i${++installs}`, GITHUB_APP_KEY: APP_KEY, __fetch: s.fetch, ...over }, s };
};

// Every commit message, PR title and PR body any fake repo saw; the last admin-api test scans them.
export const messages = [];
export const sha1 = (t) => createHash('sha1').update(t).digest('hex');
export const disk = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
export const json = (p) => JSON.parse(disk(p));

export function fakeRepo({ failPulls = false } = {}) {
  const main = new Map();
  for (const d of ['content/coaches', 'content/schedule']) {
    for (const n of readdirSync(new URL(`../../${d}`, import.meta.url))) main.set(`${d}/${n}`, disk(`${d}/${n}`));
  }
  for (const f of ['content/venues.json', 'content/glossary.json', 'content/videos.json']) main.set(f, disk(f));
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  // Files as of each commit: a ref is just a name for one of these.
  const snaps = new Map([['h0', main]]);
  const refs = new Map([['main', { head: 'h0', files: main }]]);
  const pulls = [];
  let n = 0;
  const missing = () => new Response('{}', { status: 404 });
  const filesAt = (r) => refs.get(r)?.files ?? snaps.get(r);
  const repo = {
    failPulls, refs, pulls, commits,
    get files() { return refs.get('main').files; },
    file: (p, ref = 'main') => filesAt(ref)?.get(p),
    sha: (p, ref = 'main') => sha1(filesAt(ref).get(p)),
  };
  repo.handlers = [
    ['GET', /\/repos\/[^/]+\/[^/]+\/contents\/([^?]+)\?ref=([^&]+)/, (_, m) => {
      const p = decodeURIComponent(m[1]);
      const files = filesAt(decodeURIComponent(m[2]));
      if (!files) return missing();
      if (files.has(p)) return { sha: sha1(files.get(p)), content: Buffer.from(files.get(p)).toString('base64') };
      const kids = [...files.keys()].filter((k) => k.startsWith(`${p}/`) && !k.slice(p.length + 1).includes('/'));
      return kids.length ? kids.map((k) => ({ name: k.slice(p.length + 1), type: 'file' })) : missing();
    }],
    ['GET', /\/git\/ref\/heads\/([\w-]+)$/, (_, m) => (refs.has(m[1]) ? { object: { sha: refs.get(m[1]).head } } : missing())],
    ['GET', /\/git\/commits\/\w+$/, () => ({ tree: { sha: 'base' } })],
    ['POST', /\/git\/blobs$/, async (req) => { const b = await req.json(); blobs.set(`b${++n}`, b.content); return { sha: `b${n}` }; }],
    ['POST', /\/git\/trees$/, async (req) => { trees.set(`t${++n}`, (await req.json()).tree); return { sha: `t${n}` }; }],
    ['POST', /\/git\/commits$/, async (req) => {
      const c = await req.json();
      const files = new Map(snaps.get(c.parents[0]));
      for (const e of trees.get(c.tree)) e.sha ? files.set(e.path, blobs.get(e.sha)) : files.delete(e.path);
      commits.set(`c${++n}`, c);
      snaps.set(`c${n}`, files);
      messages.push(c.message);
      return { sha: `c${n}` };
    }],
    ['POST', /\/git\/refs$/, async (req) => {
      const { ref, sha } = await req.json();
      const b = ref.replace('refs/heads/', '');
      if (refs.has(b)) return new Response('{}', { status: 422 });
      refs.set(b, { head: sha, files: snaps.get(sha) });
      return { ref, object: { sha } };
    }],
    ['PATCH', /\/git\/refs\/heads\/([\w-]+)$/, async (req, m) => {
      const { sha } = await req.json();
      // force:false: GitHub refuses anything that isn't a fast-forward.
      if (!refs.has(m[1]) || commits.get(sha).parents[0] !== refs.get(m[1]).head) return new Response('{}', { status: 422 });
      refs.set(m[1], { head: sha, files: snaps.get(sha) });
      return { object: { sha } };
    }],
    ['DELETE', /\/git\/refs\/heads\/([\w-]+)$/, (_, m) => { refs.delete(m[1]); return new Response(null, { status: 204 }); }],
    ['POST', /\/pulls$/, async (req) => {
      if (repo.failPulls) return new Response('{}', { status: 502 });
      const { title, head, base, body } = await req.json();
      pulls.push({ title, head, base, body, state: 'open', merged_at: null });
      messages.push(title, body);
      return { number: pulls.length, html_url: `https://github.com/o/r/pull/${pulls.length}` };
    }],
    ['GET', /\/pulls\/(\d+)$/, (_, m) => {
      const p = pulls[m[1] - 1];
      return p ? { number: Number(m[1]), state: p.state, merged_at: p.merged_at, head: { sha: refs.get(p.head)?.head } } : missing();
    }],
  ];
  return repo;
}

export const COACH = 'coach@example.com';
export const EDITOR = 'editor@example.com';
export const OWNER = 'owner@example.com';

export function setup(over = {}, extra = [], repoOpts) {
  const repo = fakeRepo(repoOpts);
  const { env, s } = ghEnv([...extra, ...repo.handlers]);
  const e = makeEnv({ ...env, ...over });
  e.DB.db.exec(`INSERT INTO users (email, coach_id, role) VALUES ('${COACH}', 'natanel-zhurovel', 'coach'), ('${EDITOR}', NULL, 'editor')`);
  const call = async (method, path, body, email = COACH) => {
    const res = await worker.fetch(new Request(`https://api.test${path}`, {
      method, headers: { Authorization: `Bearer ${await signSession({ email }, e)}` }, ...(body && { body: JSON.stringify(body) }),
    }), e, {});
    return { status: res.status, body: await res.json() };
  };
  const writes = () => s.calls.filter((c) => c.method !== 'GET' && !c.url.includes('/access_tokens'));
  const repoCalls = () => s.calls.filter((c) => c.url.includes('/repos/'));
  return { repo, env: e, s, call, writes, repoCalls };
}

// ---- GitHub Actions runs for the /status tests ----
export const SHA_A = 'a'.repeat(40);
export const SHA_B = 'b'.repeat(40);
// runs: {sha: run}; jobs: {runId: jobs}; mainRuns: list for ?branch=main
export function actions(state) {
  return [
    ['GET', /\/actions\/runs\?head_sha=(\w+)&event=push$/, (_, m) => ({ workflow_runs: state.runs[m[1]] ? [state.runs[m[1]]] : [] })],
    ['GET', /\/actions\/runs\/(\d+)\/jobs$/, (_, m) => ({ jobs: state.jobs[m[1]] ?? [] })],
    ['GET', /\/actions\/runs\?branch=main&event=push$/, () => ({ workflow_runs: state.main ?? [] })],
  ];
}
export const run = (id, status, conclusion, created_at = '2026-11-01T10:00:00Z') => ({ id, name: 'Deploy to GitHub Pages', status, conclusion, created_at });
export const edit = (t, sha, email = COACH, created = Math.floor(Date.now() / 1000)) =>
  t.env.DB.db.prepare("INSERT INTO edits (sha, email, coach_id, op, created, status) VALUES (?, ?, 'natanel-zhurovel', 'coach.text', ?, 'pending')").run(sha, email, created);
export const FAILED_JOBS = [{ conclusion: 'success', steps: [] }, { conclusion: 'failure', steps: [{ name: 'Set up job', conclusion: 'success' }, { name: 'Run withastro/action@v6', conclusion: 'failure' }] }];
