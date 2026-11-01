import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtVerify } from 'jose';
import { installationToken, readJson, listDir, commitFiles, openPull, deleteBranch } from '../integrations/admin-api/src/github.mjs';
import { ghEnv, publicKey, setup, messages, sha1, json, COACH, EDITOR, OWNER, actions, run, edit, FAILED_JOBS, SHA_A, SHA_B } from './helpers/admin-repo.mjs';

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
  const heads = { main: 'c0', 'panel-3': 'p0' };
  let n = 0;
  const handlers = [
    ['GET', /\/git\/ref\/heads\/([\w-]+)$/, (_, m) => ({ object: { sha: heads[m[1]] } })],
    ['GET', /\/git\/commits\/(\w+)$/, (_, m) => ({ tree: { sha: `t-${m[1]}` } })],
    ['POST', /\/git\/blobs$/, async (req) => ({ sha: `b${++n}`, _: log.push(['blob', await req.json()]) })],
    ['POST', /\/git\/trees$/, async (req) => ({ sha: `t${++n}`, _: log.push(['tree', await req.json()]) })],
    ['POST', /\/git\/commits$/, async (req) => ({ sha: `c${++n}`, _: log.push(['commit', await req.json()]) })],
    ['PATCH', /\/git\/refs\/heads\/([\w-]+)$/, async (req, m) => {
      log.push(['patch', await req.json()]);
      if (moves-- > 0) { heads[m[1]] = `moved${moves}`; return new Response('{}', { status: 422 }); }
      return { object: { sha: 'ok' } };
    }],
    ['POST', /\/git\/refs$/, async (req) => ({ _: log.push(['ref', await req.json()]) })],
    ['POST', /\/pulls$/, async (req) => ({ number: 5, html_url: 'https://github.com/o/r/pull/5', _: log.push(['pull', await req.json()]) })],
    ['DELETE', /\/git\/refs\/heads\/gone-(\d+)$/, (_, m) => new Response('{}', { status: Number(m[1]) })],
    ['DELETE', /\/git\/refs\/heads\/[\w-]+$/, () => new Response(null, { status: 204 })],
  ];
  return { handlers, log };
}
const gitCalls = (s) => s.calls.filter((c) => /\/(git|pulls)/.test(c.url)).map((c) => `${c.method} ${new URL(c.url).pathname.replace('/repos/o/r', '')}`);

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

test('commitFiles create: parent is main head, the branch is created after the commit, no PATCH', async () => {
  const g = gitStub();
  const { env, s } = ghEnv(g.handlers);
  const sha = await commitFiles(env, async (h) => [{ path: 'a', content: h }], 'm', { branch: 'panel-3', create: true });
  assert.deepEqual(gitCalls(s), ['GET /git/ref/heads/main', 'GET /git/commits/c0', 'POST /git/blobs', 'POST /git/trees', 'POST /git/commits', 'POST /git/refs']);
  assert.deepEqual(g.log.find(([k]) => k === 'commit')[1].parents, ['c0']);
  assert.deepEqual(g.log.at(-1), ['ref', { ref: 'refs/heads/panel-3', sha }]);
});

test('commitFiles on a branch: reads and fast-forwards that branch, retries on 422, names it when giving up', async () => {
  const g = gitStub(1);
  const { env, s } = ghEnv(g.handlers);
  const heads = [];
  await commitFiles(env, async (h) => { heads.push(h); return [{ path: 'a', content: h }]; }, 'm', { branch: 'panel-3' });
  assert.deepEqual(heads, ['p0', 'moved0']);
  assert.ok(gitCalls(s).every((c) => !c.includes('/main')));
  assert.deepEqual(gitCalls(s).filter((c) => c.startsWith('PATCH')), ['PATCH /git/refs/heads/panel-3', 'PATCH /git/refs/heads/panel-3']);
  assert.deepEqual(g.log.at(-1)[1].force, false);

  const g4 = gitStub(4);
  await assert.rejects(commitFiles(ghEnv(g4.handlers).env, async () => [{ path: 'a', content: 'x' }], 'm', { branch: 'panel-3' }), /github: panel-3 kept moving/);
  await assert.rejects(commitFiles(ghEnv(gitStub().handlers).env, async () => [], 'm', { branch: '../main' }), /bad branch/);
});

test('openPull targets the base branch; deleteBranch ignores 404 and 422 only', async () => {
  const g = gitStub();
  const { env } = ghEnv(g.handlers);
  assert.deepEqual(await openPull(env, { title: 'T', head: 'panel-3', body: 'B' }), { number: 5, html_url: 'https://github.com/o/r/pull/5' });
  assert.deepEqual(g.log.at(-1), ['pull', { title: 'T', head: 'panel-3', base: 'main', body: 'B' }]);
  await deleteBranch(env, 'panel-3');
  await deleteBranch(env, 'gone-404');
  await deleteBranch(env, 'gone-422');
  await assert.rejects(deleteBranch(env, 'gone-500'), (e) => e.status === 500);
  await assert.rejects(deleteBranch(env, 'a/b'), /bad branch/);
});

// ---- content routes and saves, against a stubbed GitHub serving the real repo files ----
const { readdirSync } = await import('node:fs');
const { makeEnv } = await import('./helpers/admin-env.mjs');
const { serialize, SAVE_OPS, OPEN } = await import('../integrations/admin-api/src/content.mjs');
const { default: worker } = await import('../integrations/admin-api/src/index.mjs');

const NAT = 'content/coaches/natanel-zhurovel.json';
const NAT_S = 'content/schedule/natanel-zhurovel.json';
// The branch the next save for op+id stacks onto ('main' when no PR is open).
const at = (t, op, id) => t.env.DB.db.prepare(`SELECT branch FROM prs WHERE key = ? AND number IS NOT NULL AND ${OPEN}`).get(SAVE_OPS[op].key(id))?.branch ?? 'main';
const save = (t, op, id, fields, extra = {}) => ({ op, id, base_sha: t.repo.sha(op === 'shared.section' ? 'content/coaches/_section.json' : op.startsWith('schedule') ? `content/schedule/${id}.json` : `content/coaches/${id}.json`, at(t, op, id)), fields, ...extra });
const prRow = (t, key) => ({ ...t.env.DB.db.prepare('SELECT * FROM prs WHERE key = ? ORDER BY n DESC').get(key) });
const toMain = (t) => t.s.calls.filter((c) => c.method !== 'GET' && c.url.includes('/git/refs/heads/main'));
const bio = (o = {}) => ({ he: 'ביו חדש', ru: 'Новое био', en: 'New bio', ...o });

test('coach saves own bio: a branch and a PR, main untouched, repo-style message, edit logged', async () => {
  const t = setup({ PREVIEW_HOST: 'preview.example' });
  const before = json(NAT);
  const r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio() }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { sha: r.body.sha, pr: 1, branch: 'panel-1', preview: 'https://panel-1.preview.example/', state: 'checks' });
  assert.deepEqual(t.writes().filter((c) => !/blobs|trees|commits$/.test(c.url)).map((c) => `${c.method} ${new URL(c.url).pathname}`),
    ['POST /repos/o/r/git/refs', 'POST /repos/o/r/pulls']);
  assert.deepEqual(toMain(t), []);
  assert.deepEqual(JSON.parse(t.repo.file(NAT)), before);
  assert.deepEqual(JSON.parse(t.repo.file(NAT, 'panel-1')), { ...before, bio: bio() });
  const c = t.repo.commits.get(r.body.sha);
  assert.equal(c.message, 'Coaches: Natanel Zhurovel, bio\n\nFrom the coach panel (natanel-zhurovel).');
  assert.ok(!('author' in c) && !('committer' in c));
  assert.deepEqual(t.repo.pulls[0], { title: 'Coaches: Natanel Zhurovel, bio', head: 'panel-1', base: 'main', state: 'open', merged_at: null,
    body: 'From the coach panel (natanel-zhurovel).\n\nPreview: https://panel-1.preview.example/' });
  const pr = prRow(t, 'coach:natanel-zhurovel');
  assert.deepEqual([pr.number, pr.branch, pr.state, pr.head_sha, pr.who, pr.email, pr.saves, pr.title],
    [1, 'panel-1', 'checks', r.body.sha, 'natanel-zhurovel', COACH, 1, 'Coaches: Natanel Zhurovel, bio']);
  const row = t.env.DB.db.prepare('SELECT * FROM edits').get();
  assert.deepEqual({ ...row }, { sha: r.body.sha, email: COACH, coach_id: 'natanel-zhurovel', op: 'coach.text', created: row.created, status: 'pr', conclusion: null, notified: 0 });
});

test('a second save for the same key reads and stacks onto the open branch; another key gets its own PR', async () => {
  const t = setup();
  const r1 = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio() }));
  assert.equal(r1.body.preview, null);
  const g = await t.call('GET', '/content/coach/natanel-zhurovel');
  assert.deepEqual(g.body, { data: JSON.parse(t.repo.file(NAT, 'panel-1')), sha: t.repo.sha(NAT, 'panel-1') });
  assert.equal((await t.call('POST', '/save', { op: 'coach.text', id: 'natanel-zhurovel', base_sha: t.repo.sha(NAT), fields: { bio: bio() } })).status, 409, 'main sha is stale now');
  const r2 = await t.call('POST', '/save', { op: 'coach.meta', id: 'natanel-zhurovel', base_sha: g.body.sha, fields: { order: 3 } }, EDITOR);
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.deepEqual([r2.body.pr, r2.body.branch], [1, 'panel-1']);
  assert.equal(t.repo.pulls.length, 1);
  assert.ok(t.s.calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/git/refs/heads/panel-1')));
  const after = JSON.parse(t.repo.file(NAT, 'panel-1'));
  assert.deepEqual([after.bio, after.order], [bio(), 3]);
  let pr = prRow(t, 'coach:natanel-zhurovel');
  assert.deepEqual([pr.saves, pr.head_sha, pr.state, pr.who], [2, r2.body.sha, 'checks', 'natanel-zhurovel']);

  const sessions = structuredClone(json(NAT_S).sessions);
  sessions[0].start = '12:05';
  const r3 = await t.call('POST', '/save', save(t, 'schedule.sessions', 'natanel-zhurovel', { sessions }));
  assert.deepEqual([r3.status, r3.body.pr, r3.body.branch], [200, 2, 'panel-2']);
  assert.equal(JSON.parse(t.repo.file(NAT_S, 'panel-2')).sessions[0].start, '12:05');
  assert.equal(t.repo.file(NAT_S, 'panel-1'), t.repo.file(NAT_S), 'keys touch disjoint branches');
  assert.equal((await t.call('GET', '/content/schedule/natanel-zhurovel')).body.sha, t.repo.sha(NAT_S, 'panel-2'));

  // PR 1 closed on GitHub: the next save marks it and opens a fresh one from main.
  t.repo.pulls[0].state = 'closed';
  t.repo.pulls[0].merged_at = '2026-11-02T10:00:00Z';
  const r4 = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio({ en: 'Again' }) }, { base_sha: t.repo.sha(NAT) }));
  assert.deepEqual([r4.status, r4.body.pr, r4.body.branch], [200, 3, 'panel-3']);
  assert.equal(t.env.DB.db.prepare('SELECT state FROM prs WHERE n = 1').get().state, 'merged');
  pr = prRow(t, 'coach:natanel-zhurovel');
  assert.deepEqual([pr.n, pr.number, pr.saves], [3, 3, 1]);
  assert.deepEqual(toMain(t), []);

  // Branch deleted on merge before the sweep caught up: reads fall back to main.
  t.repo.refs.delete('panel-3');
  assert.equal((await t.call('GET', '/content/coach/natanel-zhurovel')).body.sha, t.repo.sha(NAT));
});

test('a first save in flight, a failed PR or a refused edit leave no branch and no blocked key', async () => {
  const t = setup();
  t.env.DB.db.exec("INSERT INTO prs (key, created) VALUES ('coach:natanel-zhurovel', 0)");
  let r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio() }));
  assert.deepEqual([r.status, r.body.error], [409, 'stale']);
  assert.equal(t.writes().length, 0);
  t.env.DB.db.exec('DELETE FROM prs');

  r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio({ en: 'Judo 柔道' }) }));
  assert.deepEqual([r.status, r.body.error], [400, 'invalid']);
  assert.equal(t.writes().length, 0);
  assert.equal(t.env.DB.db.prepare('SELECT count(*) AS n FROM prs').get().n, 0);

  t.repo.failPulls = true;
  r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio() }));
  assert.deepEqual([r.status, r.body.error], [502, 'github']);
  assert.ok(t.s.calls.some((c) => c.method === 'DELETE' && /\/git\/refs\/heads\/panel-\d+$/.test(c.url)));
  assert.deepEqual([...t.repo.refs.keys()], ['main']);
  assert.equal(t.env.DB.db.prepare('SELECT count(*) AS n FROM prs').get().n, 0);
  assert.equal(t.env.DB.db.prepare('SELECT count(*) AS n FROM edits').get().n, 0);

  t.repo.failPulls = false;
  r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio() }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.pr, 1);
  assert.deepEqual(toMain(t), []);
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
  assert.equal(JSON.parse(t.repo.file(NAT, 'panel-1')).order, 7);
  assert.match(t.repo.commits.get(r.body.sha).message, /\(editor\)\.$/);
  r = await t.call('POST', '/save', save(t, 'coach.text', 'natanel-zhurovel', { bio: bio(), order: 0, color: '#000' }));
  assert.equal(r.status, 200);
  const after = JSON.parse(t.repo.file(NAT, 'panel-1'));
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
  assert.deepEqual(JSON.parse(t.repo.file(NAT_S, r.body.branch)), { ...json(NAT_S), sessions });
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
  assert.deepEqual(JSON.parse(t.repo.file(SEC, 'panel-1')), { ...json(SEC), title });
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

// ---- photos and one-off changes ----
const riffChunk = (cc, p) => {
  const c = Buffer.alloc(8 + p.length + (p.length & 1));
  c.write(cc, 0, 'latin1');
  c.writeUInt32LE(p.length, 4);
  p.copy(c, 8);
  return c;
};
const webp = (w, h, flags = 0, pad = 0) => {
  const p = Buffer.alloc(10);
  p[0] = flags;
  p.writeUIntLE(w - 1, 4, 3);
  p.writeUIntLE(h - 1, 7, 3);
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), riffChunk('VP8X', p), ...(pad ? [riffChunk('VP8 ', Buffer.alloc(pad))] : [])]);
  const hd = Buffer.from('RIFF\0\0\0\0', 'latin1');
  hd.writeUInt32LE(body.length, 4);
  return Buffer.concat([hd, body]).toString('base64');
};
const photo = (t, id, fields, extra) => ({ op: 'coach.photo', id, base_sha: t.repo.sha(`content/coaches/${id}.json`, at(t, 'coach.photo', id)), fields, ...extra });

test('coach.photo: webp and coach JSON land in one commit; alt kept', async () => {
  const t = setup();
  const before = json(NAT);
  const b64 = webp(800, 1200);
  const r = await t.call('POST', '/save', photo(t, 'natanel-zhurovel', { webp: b64, face: [0.4, 0.25] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(t.s.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/git/commits')).length, 1);
  assert.equal(t.repo.file('public/coaches/natanel-zhurovel.webp', 'panel-1'), b64);
  const ph = JSON.parse(t.repo.file(NAT, 'panel-1')).photo;
  assert.deepEqual(ph, { ...before.photo, src: 'coaches/natanel-zhurovel.webp', face: [0.4, 0.25], w: 800, h: 1200, source: `panel ${new Date().toISOString().slice(0, 10)}` });
  assert.equal(t.repo.commits.get(r.body.sha).message.split('\n')[0], 'Coaches: Natanel Zhurovel, photo');

  const r2 = await t.call('POST', '/save', photo(t, 'natanel-zhurovel', { webp: webp(100, 100), face: [2, 0] }), EDITOR);
  assert.equal(r2.status, 200);
  assert.deepEqual(JSON.parse(t.repo.file(NAT, 'panel-1')).photo.face, [0.5, 0.3]);
});

test('coach.photo refuses bad images, other coaches and a missing base_sha without writing', async () => {
  const t = setup();
  const png = Buffer.from('\x89PNG\r\n\x1a\n\0\0\0\0', 'latin1').toString('base64');
  for (const [b64, re] of [[png, /not a WebP/], [webp(800, 1200, 0x08), /EXIF/], [webp(801, 1200), /800/],
    [webp(100, 100, 0, 1.5 * 1024 * 1024), /1\.5 MB/], ['A'.repeat(2.2 * 1024 * 1024), /1\.5 MB/], ['@@@@', /base64/], [undefined, /missing/]]) {
    const r = await t.call('POST', '/save', photo(t, 'natanel-zhurovel', { webp: b64 }));
    assert.deepEqual([r.status, r.body.error], [400, 'invalid']);
    assert.match(r.body.detail, re);
  }
  assert.equal((await t.call('POST', '/save', photo(t, 'ilana-kratysh', { webp: webp(800, 1200) }))).status, 403);
  const before = t.repoCalls().length;
  for (const op of ['coach.photo', 'change.delete']) {
    const r = await t.call('POST', '/save', { op, id: 'natanel-zhurovel', fields: { webp: webp(10, 10), change_id: 'x' } });
    assert.deepEqual([r.status, r.body.detail], [400, 'base_sha is required']);
  }
  assert.equal(t.repoCalls().length, before);
  assert.equal(t.writes().length, 0);
});

const cancel = (o = {}) => ({ type: 'cancel', from: '2026-11-03', to: '2026-11-03', session: { day: 2, start: '17:30', junk: '<b>' },
  note: { he: 'האימון בוטל', ru: 'Тренировка отменена', en: 'Class cancelled' }, ...o });
const CH = 'content/schedule-changes/2026-11-03-natanel-zhurovel-cancel.json';

test('change.create writes a checkChanges-valid file with the coach as author; a repeat gets -2', async () => {
  const { checkChanges } = await import('../src/lib/schedule-changes.mjs');
  const t = setup();
  const r = await t.call('POST', '/save', { op: 'change.create', id: 'natanel-zhurovel', fields: cancel() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.change_id, '2026-11-03-natanel-zhurovel-cancel');
  const f = JSON.parse(t.repo.file(CH, 'panel-1'));
  assert.deepEqual(f.session, { day: 2, start: '17:30' });
  assert.equal(f.author, 'natanel-zhurovel');
  assert.ok(!Number.isNaN(Date.parse(f.created)));
  const schedules = { 'natanel-zhurovel': json(NAT_S), 'ilana-kratysh': json('content/schedule/ilana-kratysh.json') };
  assert.equal(checkChanges([[`${f.id}.json`, f]], schedules, json('content/venues.json')).length, 1);
  assert.equal(t.repo.commits.get(r.body.sha).message.split('\n')[0], 'Schedule: Natanel Zhurovel, cancel 2026-11-03');
  const row = t.env.DB.db.prepare('SELECT coach_id, op FROM edits WHERE sha = ?').get(r.body.sha);
  assert.deepEqual({ ...row }, { coach_id: 'natanel-zhurovel', op: 'change.create' });

  const r2 = await t.call('POST', '/save', { op: 'change.create', id: 'natanel-zhurovel', fields: cancel() }, OWNER);
  assert.equal(r2.body.change_id, '2026-11-03-natanel-zhurovel-cancel-2');
  assert.equal(JSON.parse(t.repo.file(`${CH.slice(0, -5)}-2.json`, 'panel-1')).author, 'owner');
});

test('change.create refuses other schedules, bad sessions and bad dates', async () => {
  const t = setup();
  assert.equal((await t.call('POST', '/save', { op: 'change.create', id: 'ilana-kratysh', fields: cancel() })).status, 403);
  let r = await t.call('POST', '/save', { op: 'change.create', id: 'natanel-zhurovel', fields: cancel({ session: { day: 2, start: '09:00' } }) });
  assert.deepEqual([r.status, r.body.error], [400, 'invalid']);
  assert.match(r.body.detail, /no session matches day 2 09:00/);
  const before = t.repoCalls().length;
  for (const bad of [{ from: '2026-13-01' }, { to: '2026-02-30' }, { type: 'x' }, { from: 20261103 }]) {
    r = await t.call('POST', '/save', { op: 'change.create', id: 'natanel-zhurovel', fields: cancel(bad) });
    assert.deepEqual([r.status, r.body.error], [400, 'invalid'], JSON.stringify(bad));
  }
  assert.equal(t.repoCalls().length, before);
  assert.equal(t.writes().length, 0);
});

test('change.delete trusts the file schedule, not the id the coach sends', async () => {
  const t = setup();
  const other = { id: '2026-11-04-ilana-kratysh-note', schedule: 'ilana-kratysh', type: 'note', from: '2026-11-04', to: '2026-11-04' };
  t.repo.files.set(`content/schedule-changes/${other.id}.json`, serialize(other));
  const p = `content/schedule-changes/${other.id}.json`;
  let r = await t.call('POST', '/save', { op: 'change.delete', id: 'natanel-zhurovel', base_sha: t.repo.sha(p), fields: { change_id: other.id } });
  assert.equal(r.status, 403);
  assert.equal((await t.call('POST', '/save', { op: 'change.delete', id: 'natanel-zhurovel', base_sha: 'x', fields: { change_id: '../x' } })).status, 400);
  assert.equal(t.writes().length, 0);

  r = await t.call('POST', '/save', { op: 'change.create', id: 'natanel-zhurovel', fields: cancel() });
  const { branch } = r.body;
  r = await t.call('POST', '/save', { op: 'change.delete', id: 'natanel-zhurovel', base_sha: t.repo.sha(CH, branch), fields: { change_id: r.body.change_id } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(t.repo.file(CH, branch), undefined);
  const last = [...t.repo.commits.values()].at(-1);
  assert.equal(last.message.split('\n')[0], 'Schedule: Natanel Zhurovel, removed cancel 2026-11-03');
});

// ---- translate, deploy status, failure notices ----
function anthropic(reply = { he: { bio: 'ביו' }, ru: { bio: 'Тренеры клуба' }, en: { bio: 'Bio' } }) {
  const seen = [];
  return { seen, handler: ['POST', /api\.anthropic\.com\/v1\/messages$/, async (req) => { seen.push(await req.json()); return { content: [{ text: JSON.stringify(reply) }] }; }] };
}

test('/translate: glossary from main, coach name in the prompt, daily cap, size and key checks', async () => {
  const a = anthropic();
  const t = setup({ ANTHROPIC_KEY: 'k' }, [a.handler]);
  const r = await t.call('POST', '/translate', { source_lang: 'en', context: 'coach-bio', coach: 'natanel-zhurovel', fields: { bio: 'Coaches kids' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { he: { bio: 'ביו' }, ru: { bio: 'Тренера клуба' }, en: { bio: 'Coaches kids' } });
  const { system } = a.seen[0];
  assert.match(system, /bio of Natanel Zhurovel\./);
  assert.ok(json('content/glossary.json').rules.every((x) => system.includes(x)));
  assert.ok(t.repoCalls().some((c) => c.url.includes('/contents/content/glossary.json?ref=main')));

  await t.call('POST', '/translate', { context: 'coach-bio', coach: 'natanel-zhurovel', fields: { bio: 'Тренирует детей' } });
  assert.match(a.seen[1].system, /bio of Натанель Журовель\./);

  assert.equal((await t.call('POST', '/translate', { context: 'coach-bio', coach: 'ilana-kratysh', fields: { bio: 'x' } })).status, 403);
  let x = await t.call('POST', '/translate', { context: 'schedule-note', fields: { note: 'a'.repeat(4001) } });
  assert.deepEqual([x.status, x.body.error], [400, 'invalid']);
  t.env.DB.db.prepare("INSERT INTO usage (email, day, kind, n) VALUES (?, ?, 'translate', 60) ON CONFLICT DO UPDATE SET n = 60").run(COACH, new Date().toISOString().slice(0, 10));
  x = await t.call('POST', '/translate', { context: 'schedule-note', fields: { note: 'Class moved' } });
  assert.deepEqual([x.status, x.body.error], [429, 'rate_limited']);
  assert.equal(a.seen.length, 2);

  const u = setup({}, [a.handler]);
  assert.deepEqual((await u.call('POST', '/translate', { context: 'schedule-note', fields: { note: 'x' } })).body, { error: 'not_configured' });
});

test('/status maps runs to pending, live and failed with the failed step, and stores it', async () => {
  const st = { runs: {}, jobs: {} };
  const t = setup({}, actions(st));
  edit(t, SHA_A);
  const status = async (who) => (await t.call('GET', `/status/${SHA_A}`, null, who)).body;
  const row = () => ({ ...t.env.DB.db.prepare('SELECT status, conclusion FROM edits WHERE sha = ?').get(SHA_A) });
  assert.deepEqual(await status(), { state: 'pending' });
  st.runs[SHA_A] = run(7, 'in_progress', null);
  assert.deepEqual(await status(), { state: 'pending' });
  st.runs[SHA_A] = run(7, 'completed', 'failure');
  st.jobs[7] = FAILED_JOBS;
  assert.deepEqual(await status(), { state: 'failed', step: 'Run withastro/action@v6' });
  assert.deepEqual(row(), { status: 'failed', conclusion: 'Run withastro/action@v6' });
  assert.deepEqual(await status(EDITOR), { state: 'failed', step: 'Run withastro/action@v6' });

  edit(t, SHA_B, OWNER);
  st.runs[SHA_B] = run(8, 'completed', 'success');
  assert.equal((await t.call('GET', `/status/${SHA_B}`)).status, 404, 'coach reads only their own edits');
  assert.deepEqual((await t.call('GET', `/status/${SHA_B}`, null, OWNER)).body, { state: 'live' });
  assert.equal({ ...t.env.DB.db.prepare('SELECT status FROM edits WHERE sha = ?').get(SHA_B) }.status, 'live');
  assert.equal((await t.call('GET', `/status/${'c'.repeat(40)}`, null, OWNER)).status, 404);
  assert.equal((await t.call('GET', '/status/not-a-sha', null, OWNER)).status, 404);
});

test('cancelled run: live after a later green push run, else pending; no notice either way', async () => {
  const { sweep } = await import('../integrations/admin-api/src/status.mjs');
  const { runState } = await import('../integrations/admin-api/src/status.mjs');
  const tg = [];
  const st = { runs: { [SHA_A]: run(9, 'completed', 'cancelled') }, jobs: {}, main: [run(10, 'completed', 'failure', '2026-11-01T10:05:00Z'), run(9, 'completed', 'cancelled')] };
  const t = setup({}, [...actions(st), ['POST', /api\.telegram\.org/, async (req) => { tg.push(await req.json()); return { ok: true }; }]]);
  assert.deepEqual(await runState(t.env, SHA_A), { state: 'pending' });
  st.main.unshift(run(11, 'completed', 'success', '2026-11-01T10:09:00Z'));
  assert.deepEqual(await runState(t.env, SHA_A), { state: 'live' });
  st.main = [run(1, 'completed', 'success', '2026-11-01T09:00:00Z')];
  edit(t, SHA_A);
  t.env.DB.db.exec(`INSERT INTO tg_links (telegram_id, email) VALUES ('5550001', '${COACH}')`);
  await sweep(t.env);
  assert.equal(tg.length, 0);
  assert.equal({ ...t.env.DB.db.prepare('SELECT status FROM edits').get() }.status, 'pending');
});

test('sweep: one notice per failed edit to the coach and owners, never twice, no email; no token = statuses only', async () => {
  const { sweep } = await import('../integrations/admin-api/src/status.mjs');
  const tg = [];
  const st = { runs: { [SHA_A]: run(7, 'completed', 'failure'), [SHA_B]: run(8, 'completed', 'success') }, jobs: { 7: FAILED_JOBS } };
  const telegram = ['POST', /api\.telegram\.org\/bot123:TEST\/sendMessage$/, async (req) => { tg.push(await req.json()); return { ok: true }; }];
  const t = setup({}, [...actions(st), telegram]);
  edit(t, SHA_A);
  edit(t, SHA_B);
  edit(t, 'd'.repeat(40), COACH, Math.floor(Date.now() / 1000) - 3 * 3600);
  t.env.DB.db.exec(`INSERT INTO tg_links (telegram_id, email) VALUES ('5550001', '${COACH}'), ('5550002', '${OWNER}'), ('5550003', '${EDITOR}')`);
  await sweep(t.env);
  assert.deepEqual(tg.map((m) => m.chat_id).sort(), ['5550001', '5550002']);
  assert.match(tg.find((m) => m.chat_id === '5550001').text, /^Сайт не собрался на шаге «Run withastro\/action@v6»\. Ваше изменение не опубликовано, владелец знает\./);
  assert.ok(tg.every((m) => ![COACH, OWNER, 'example.com'].some((e) => m.text.includes(e))));
  const rows = Object.fromEntries(t.env.DB.db.prepare('SELECT sha, status, notified FROM edits').all().map((r) => [r.sha[0], [r.status, r.notified]]));
  assert.deepEqual(rows, { a: ['failed', 1], b: ['live', 0], d: ['pending', 0] });
  assert.ok(!t.s.calls.some((c) => c.url.includes(`head_sha=${'d'.repeat(40)}`)), 'old edits are left alone');
  await sweep(t.env);
  assert.equal(tg.length, 2);

  const u = setup({ TG_BOT_TOKEN: undefined }, [...actions(st), telegram]);
  edit(u, SHA_A);
  u.env.DB.db.exec(`INSERT INTO tg_links (telegram_id, email) VALUES ('5550001', '${COACH}')`);
  await sweep(u.env);
  assert.equal(tg.length, 2);
  assert.deepEqual({ ...u.env.DB.db.prepare('SELECT status, notified FROM edits').get() }, { status: 'failed', notified: 0 });
});

test('scheduled() hands the sweep to waitUntil', async () => {
  const t = setup();
  const waits = [];
  await worker.scheduled({}, t.env, { waitUntil: (p) => waits.push(p) });
  assert.equal(waits.length, 1);
  await waits[0];
});

// ---- field shapes: build.py renders plain strings and attribute values raw ----
test('every real coach and section file passes the shape checks unchanged', async () => {
  const t = setup();
  for (const n of readdirSync(new URL('../content/coaches', import.meta.url))) {
    const id = n.slice(0, -5);
    const ops = id === '_section' ? [['shared.section', null]] : [['coach.text', id], ['coach.meta', id]];
    for (const [op, x] of ops) {
      t.env.DB.db.exec('DELETE FROM usage');
      const r = await t.call('POST', '/save', save(t, op, x, {}), EDITOR);
      assert.equal(r.status, 200, `${op} ${id}: ${JSON.stringify(r.body)}`);
    }
  }
});

test('text, meta, section and venue values of the wrong shape are refused', async () => {
  const t = setup();
  const cases = [
    ['coach.text', { bio: '<script>alert(1)</script>' }, /bio: must be he, ru and en text/],
    ['coach.text', { bio: bio({ onclick: 'x' }) }, /bio: must be/],
    ['coach.text', { bio: bio({ placeholder: 'yes' }) }, /bio: must be/],
    ['coach.text', { about: 'x' }, /about: must be a list/],
    ['coach.text', { approach: ['<b>x</b>'] }, /approach: must be a list/],
    ['coach.text', { dan_rank: { he: 1, ru: 'x', en: 'x' } }, /dan_rank: /],
    ['coach.text', { alt: '<img>' }, /alt: must be/],
    ['coach.text', { approach_own: 'yes' }, /approach_own: must be true or false/],
    ['coach.meta', { color: 'red;"><script>' }, /color: must be a #hex colour/],
    ['coach.meta', { order: 1.5 }, /order: must be a whole number/],
    ['coach.meta', { group: '"><x' }, /group: must be one of main, lead, club, young/],
    ['coach.meta', { youtube: 'nope' }, /youtube: must be a video id/],
    ['coach.meta', { name: 'Natanel' }, /name: must be/],
    ['coach.meta', { role: { he: 'x' } }, /role: /], ['coach.meta', { role: 'x' }, /role: must be/],
    ['shared.section', { title: '<h1>' }, /title: must be/],
  ];
  for (const [op, fields, re] of cases) {
    const r = await t.call('POST', '/save', save(t, op, op === 'shared.section' ? null : 'natanel-zhurovel', fields), EDITOR);
    assert.deepEqual([r.status, r.body.error], [400, 'invalid'], `${op} ${JSON.stringify(fields)}`);
    assert.match(r.body.detail, re);
  }
  const sessions = structuredClone(json(NAT_S).sessions);
  sessions[0].venue = '"><script>';
  const r = await t.call('POST', '/save', save(t, 'schedule.sessions', 'natanel-zhurovel', { sessions }));
  assert.match(r.body.detail, /sessions\[0\]: unknown venue/);
  assert.equal(t.writes().length, 0);
});

test('/translate takes only known field names, a bounded count, and counts keys in the size cap', async () => {
  const a = anthropic();
  const t = setup({ ANTHROPIC_KEY: 'k' }, [a.handler]);
  const tr = (context, fields) => t.call('POST', '/translate', { source_lang: 'en', context, fields });
  for (const [ctx, fields, re] of [
    ['coach-bio', { evil: 'x' }, /"evil" cannot be translated/],
    ['coach-bio', { 'about.123': 'x' }, /cannot be translated/],
    ['schedule-note', { bio: 'x' }, /cannot be translated/],
    ['coach-bio', { bio: 5 }, /cannot be translated/],
    ['coach-bio', Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`about.${i}`, 'x'])), /too many fields/],
    ['coach-bio', { bio: 'x'.repeat(3998), 'about.0': 'x' }, /text too long/],
  ]) {
    const r = await tr(ctx, fields);
    assert.deepEqual([r.status, r.body.error], [400, 'invalid'], JSON.stringify(Object.keys(fields)));
    assert.match(r.body.detail, re);
  }
  assert.equal((await tr('nope', { bio: 'x' })).status, 400);
  assert.equal(a.seen.length, 0);
  assert.equal((await tr('coach-bio', { bio: 'x', 'about.0': 'y', 'approach.3': 'z', dan_rank: 'w', alt: 'v' })).status, 502, 'reply lacks those keys');
  assert.equal(a.seen.length, 1);
  assert.equal(t.env.DB.db.prepare("SELECT n FROM usage WHERE kind = 'translate'").get().n, 1, 'refused calls cost no slot');
});

test('no commit message carries an email or a Telegram id', () => {
  assert.ok(messages.length >= 5);
  for (const m of messages) assert.ok(!m.includes('@') && !/\d{6,}/.test(m), m);
});
