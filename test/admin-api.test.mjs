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

// ---- content routes and saves, against a stubbed GitHub serving the real repo files ----
const { readFileSync, readdirSync } = await import('node:fs');
const { createHash } = await import('node:crypto');
const { makeEnv } = await import('./helpers/admin-env.mjs');
const { signSession } = await import('../integrations/admin-api/src/auth.mjs');
const { default: worker } = await import('../integrations/admin-api/src/index.mjs');

const messages = [];
const sha1 = (t) => createHash('sha1').update(t).digest('hex');
const disk = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(disk(p));

function fakeRepo() {
  const files = new Map();
  for (const d of ['content/coaches', 'content/schedule']) {
    for (const n of readdirSync(new URL(`../${d}`, import.meta.url))) files.set(`${d}/${n}`, disk(`${d}/${n}`));
  }
  files.set('content/venues.json', disk('content/venues.json'));
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  let head = 'h0';
  let n = 0;
  const handlers = [
    ['GET', /\/repos\/[^/]+\/[^/]+\/contents\/([^?]+)\?ref=/, (_, m) => {
      const p = decodeURIComponent(m[1]);
      if (files.has(p)) return { sha: sha1(files.get(p)), content: Buffer.from(files.get(p)).toString('base64') };
      const kids = [...files.keys()].filter((k) => k.startsWith(`${p}/`) && !k.slice(p.length + 1).includes('/'));
      return kids.length ? kids.map((k) => ({ name: k.slice(p.length + 1), type: 'file' })) : new Response('{}', { status: 404 });
    }],
    ['GET', /\/git\/ref\/heads\/main$/, () => ({ object: { sha: head } })],
    ['GET', /\/git\/commits\/\w+$/, () => ({ tree: { sha: 'base' } })],
    ['POST', /\/git\/blobs$/, async (req) => { const b = await req.json(); blobs.set(`b${++n}`, b.content); return { sha: `b${n}` }; }],
    ['POST', /\/git\/trees$/, async (req) => { trees.set(`t${++n}`, (await req.json()).tree); return { sha: `t${n}` }; }],
    ['POST', /\/git\/commits$/, async (req) => { const c = await req.json(); commits.set(`c${++n}`, c); messages.push(c.message); return { sha: `c${n}` }; }],
    ['PATCH', /\/git\/refs\/heads\/main$/, async (req) => {
      const { sha } = await req.json();
      for (const e of trees.get(commits.get(sha).tree)) e.sha ? files.set(e.path, blobs.get(e.sha)) : files.delete(e.path);
      head = sha;
      return { object: { sha } };
    }],
  ];
  return { handlers, files, commits, sha: (p) => sha1(files.get(p)) };
}

const COACH = 'coach@example.com';
const EDITOR = 'editor@example.com';
const OWNER = 'owner@example.com';

function setup(over = {}) {
  const repo = fakeRepo();
  const { env, s } = ghEnv(repo.handlers);
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

const NAT = 'content/coaches/natanel-zhurovel.json';
const NAT_S = 'content/schedule/natanel-zhurovel.json';
const save = (t, op, id, fields, extra = {}) => ({ op, id, base_sha: t.repo.sha(op === 'shared.section' ? 'content/coaches/_section.json' : op.startsWith('schedule') ? `content/schedule/${id}.json` : `content/coaches/${id}.json`), fields, ...extra });
const bio = (o = {}) => ({ he: 'ביו חדש', ru: 'Новое био', en: 'New bio', ...o });

test('coach saves own bio: one commit, only bio changed, repo-style message, edit logged', async () => {
  const t = setup();
  const before = json(NAT);
  const r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio() }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(t.writes().filter((c) => c.method === 'PATCH').length, 1);
  assert.deepEqual(JSON.parse(t.repo.files.get(NAT)), { ...before, bio: bio() });
  const c = t.repo.commits.get(r.body.sha);
  assert.equal(c.message, 'Coaches: Natanel Zhurovel, bio\n\nFrom the coach panel (natanel-zhurovel).');
  assert.ok(!('author' in c) && !('committer' in c));
  const row = t.env.DB.db.prepare('SELECT * FROM edits').get();
  assert.deepEqual({ ...row }, { sha: r.body.sha, email: COACH, coach_id: 'natanel-zhurovel', op: 'coach.text', created: row.created, status: 'pending', conclusion: null, notified: 0 });
});

test('coach is refused on another coach, meta, section and odd ids, with no GitHub write', async () => {
  const t = setup();
  for (const [op, id, fields, who] of [
    ['coach.text', 'ilana-kratysh', { bio: bio() }],
    ['coach.meta', 'natanel-zhurovel', { order: 0 }],
    ['shared.section', null, { title: bio() }],
    ['schedule.sessions', 'ilana-kratysh', { sessions: [] }],
    ['coach.text', 'nobody-here', { bio: bio() }, EDITOR],
  ]) {
    const r = await t.call('POST', '/save', { op, id, base_sha: 'x', fields }, who);
    assert.equal(r.status, 403, `${op} ${id}`);
  }
  const before = t.repoCalls().length;
  for (const id of ['../x', 'a/b', '_section', 'Natanel']) {
    assert.equal((await t.call('POST', '/save', { op: 'coach.text', id, base_sha: 'x', fields: { bio: bio() } }, EDITOR)).status, 403, id);
  }
  assert.equal((await t.call('GET', '/content/coach/..%2Fx', null, EDITOR)).status, 403);
  assert.equal(t.repoCalls().length, before, 'bad ids never reach GitHub');
  assert.ok(t.repoCalls().every((c) => !/contents\/content\/coaches\/(ilana|nobody)/.test(c.url)));
  assert.equal(t.writes().length, 0);
});

test('editor may change meta; a coach payload cannot change order or color', async () => {
  const t = setup();
  let r = await t.call('POST', '/save', save(t, 'coach.meta', 'natanel-zhurovel', { order: 7 }), EDITOR);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(JSON.parse(t.repo.files.get(NAT)).order, 7);
  assert.match(t.repo.commits.get(r.body.sha).message, /\(editor\)\.$/);
  r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio(), order: 0, color: '#000' }));
  assert.equal(r.status, 200);
  const after = JSON.parse(t.repo.files.get(NAT));
  assert.deepEqual([after.order, after.color, after.bio], [7, json(NAT).color, bio()]);
});

test('empty language, CJK text, stale base and missing base_sha are refused before any write', async () => {
  const t = setup();
  let r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio({ ru: '' }) }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid');
  assert.match(r.body.detail, /bio: ru missing/);
  r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio({ en: 'Judo 柔道' }) }));
  assert.deepEqual([r.status, r.body.error], [400, 'invalid']);
  r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio() }, { base_sha: 'f'.repeat(40) }));
  assert.deepEqual([r.status, r.body.error], [409, 'stale']);
  assert.equal(t.writes().length, 0);

  const before = t.repoCalls().length;
  for (const [op, id] of [['coach.text', 'natanel-zhurovel'], ['coach.meta', 'natanel-zhurovel'], ['schedule.sessions', 'natanel-zhurovel'], ['shared.section', null]]) {
    for (const base_sha of [undefined, '', 5]) {
      r = await t.call('POST', '/save', { op, id, base_sha, fields: {} }, OWNER);
      assert.deepEqual([r.status, r.body.error], [400, 'invalid'], `${op} ${base_sha}`);
    }
  }
  assert.equal((await t.call('POST', '/save', { op: 'news.post', id: 'x', base_sha: 'x', fields: {} }, OWNER)).status, 400);
  assert.equal(t.repoCalls().length, before);
});

test('schedule: venue names for the select, Saturday refused, valid save touches only sessions', async () => {
  const t = setup();
  const r0 = await t.call('GET', '/content/schedule/natanel-zhurovel');
  assert.equal(r0.status, 200);
  assert.equal(r0.body.sha, t.repo.sha(NAT_S));
  const venues = json('content/venues.json');
  assert.deepEqual(Object.keys(r0.body.venues), Object.keys(venues));
  for (const [k, v] of Object.entries(r0.body.venues)) assert.deepEqual(v, { he: venues[k].he, ru: venues[k].ru, en: venues[k].en });
  assert.equal((await t.call('GET', '/content/schedule/ilana-kratysh')).status, 403);
  assert.equal((await t.call('GET', '/content/schedule/victor-nikitin', null, EDITOR)).status, 404);

  const sessions = structuredClone(r0.body.data.sessions);
  sessions[2].day = 6;
  let r = await t.call('POST', '/save', save(t, 'schedule.sessions', 'natanel-zhurovel', { sessions }));
  assert.equal(r.status, 400);
  assert.match(r.body.detail, /sessions\[2\]/);
  sessions[2].day = 1;
  sessions[2].start = '12:05';
  r = await t.call('POST', '/save', save(t, 'schedule.sessions', 'natanel-zhurovel', { sessions, kinds: {} }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(JSON.parse(t.repo.files.get(NAT_S)), { ...json(NAT_S), sessions });
  assert.equal(t.repo.commits.get(r.body.sha).message.split('\n')[0], 'Schedule: Natanel Zhurovel, weekly sessions');
});

test('shared section: editor changes the title only; coach gets 403', async () => {
  const t = setup();
  const SEC = 'content/coaches/_section.json';
  assert.equal((await t.call('GET', '/content/section')).status, 403);
  assert.equal((await t.call('GET', '/content/section', null, EDITOR)).body.sha, t.repo.sha(SEC));
  const title = { he: 'המאמנים', ru: 'Тренера', en: 'Coaches' };
  const r = await t.call('POST', '/save', save(t, 'shared.section', null, { title, team_count: 99 }), EDITOR);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(JSON.parse(t.repo.files.get(SEC)), { ...json(SEC), title });
  assert.equal(t.repo.commits.get(r.body.sha).message.split('\n')[0], 'Coaches: section text');
});

test('31st save of the day is rate limited', async () => {
  const t = setup();
  t.env.DB.db.prepare("INSERT INTO usage (email, day, kind, n) VALUES (?, ?, 'save', 30)").run(COACH, new Date().toISOString().slice(0, 10));
  const r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio() }));
  assert.deepEqual([r.status, r.body.error], [429, 'rate_limited']);
  assert.equal(t.writes().length, 0);
});

test('GET /coaches, /content/coach, /content/changes and /health', async () => {
  const t = setup();
  let r = await t.call('GET', '/coaches');
  assert.deepEqual(r.body.coaches, [{ id: 'natanel-zhurovel', name: json(NAT).name, schedule: true }]);
  r = await t.call('GET', '/coaches', null, EDITOR);
  const ids = readdirSync(new URL('../content/coaches', import.meta.url)).map((f) => f.slice(0, -5)).filter((x) => x !== '_section');
  assert.equal(r.body.coaches.length, 20);
  assert.deepEqual(r.body.coaches.map((c) => c.id).sort(), ids.sort());
  assert.equal(r.body.coaches.filter((c) => c.schedule).length, 2);

  r = await t.call('GET', '/content/coach/natanel-zhurovel');
  assert.deepEqual(r.body, { data: json(NAT), sha: t.repo.sha(NAT) });
  assert.equal((await t.call('GET', '/content/coach/ilana-kratysh')).status, 403);

  assert.deepEqual((await t.call('GET', '/content/changes/natanel-zhurovel')).body, { changes: [] });
  const ch = { id: '2026-11-03-natanel-cancel', schedule: 'natanel-zhurovel' };
  t.repo.files.set(`content/schedule-changes/${ch.id}.json`, JSON.stringify(ch));
  t.repo.files.set('content/schedule-changes/other.json', JSON.stringify({ id: 'other', schedule: 'ilana-kratysh' }));
  assert.deepEqual((await t.call('GET', '/content/changes/natanel-zhurovel')).body.changes, [{ data: ch, sha: sha1(JSON.stringify(ch)) }]);
  assert.equal((await t.call('GET', '/content/changes/ilana-kratysh')).status, 403);

  const h = await worker.fetch(new Request('https://api.test/health'), makeEnv(), {});
  assert.deepEqual(await h.json(), { ok: true, d1: true, github: false });
});

test('no commit message carries an email or a Telegram id', () => {
  assert.ok(messages.length >= 5);
  for (const m of messages) assert.ok(!m.includes('@') && !/\d{6,}/.test(m), m);
});
