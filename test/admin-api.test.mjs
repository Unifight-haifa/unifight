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
const { serialize } = await import('../integrations/admin-api/src/content.mjs');
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
  for (const f of ['content/venues.json', 'content/glossary.json', 'content/videos.json']) files.set(f, disk(f));
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

function setup(over = {}, extra = []) {
  const repo = fakeRepo();
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
const photo = (t, id, fields, extra) => ({ op: 'coach.photo', id, base_sha: t.repo.sha(`content/coaches/${id}.json`), fields, ...extra });

test('coach.photo: webp and coach JSON land in one commit; alt kept', async () => {
  const t = setup();
  const before = json(NAT);
  const b64 = webp(800, 1200);
  const r = await t.call('POST', '/save', photo(t, 'natanel-zhurovel', { webp: b64, face: [0.4, 0.25] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(t.writes().filter((c) => c.method === 'PATCH').length, 1);
  assert.equal(t.repo.files.get('public/coaches/natanel-zhurovel.webp'), b64);
  const ph = JSON.parse(t.repo.files.get(NAT)).photo;
  assert.deepEqual(ph, { ...before.photo, src: 'coaches/natanel-zhurovel.webp', face: [0.4, 0.25], w: 800, h: 1200, source: `panel ${new Date().toISOString().slice(0, 10)}` });
  assert.equal(t.repo.commits.get(r.body.sha).message.split('\n')[0], 'Coaches: Natanel Zhurovel, photo');

  const r2 = await t.call('POST', '/save', photo(t, 'natanel-zhurovel', { webp: webp(100, 100), face: [2, 0] }), EDITOR);
  assert.equal(r2.status, 200);
  assert.deepEqual(JSON.parse(t.repo.files.get(NAT)).photo.face, [0.5, 0.3]);
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
  const f = JSON.parse(t.repo.files.get(CH));
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
  assert.equal(JSON.parse(t.repo.files.get(`${CH.slice(0, -5)}-2.json`)).author, 'owner');
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
  r = await t.call('POST', '/save', { op: 'change.delete', id: 'natanel-zhurovel', base_sha: t.repo.sha(CH), fields: { change_id: r.body.change_id } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!t.repo.files.has(CH));
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

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
// runs: {sha: run}; jobs: {runId: jobs}; mainRuns: list for ?branch=main
function actions(state) {
  return [
    ['GET', /\/actions\/runs\?head_sha=(\w+)&event=push$/, (_, m) => ({ workflow_runs: state.runs[m[1]] ? [state.runs[m[1]]] : [] })],
    ['GET', /\/actions\/runs\/(\d+)\/jobs$/, (_, m) => ({ jobs: state.jobs[m[1]] ?? [] })],
    ['GET', /\/actions\/runs\?branch=main&event=push$/, () => ({ workflow_runs: state.main ?? [] })],
  ];
}
const run = (id, status, conclusion, created_at = '2026-11-01T10:00:00Z') => ({ id, name: 'Deploy to GitHub Pages', status, conclusion, created_at });
const edit = (t, sha, email = COACH, created = Math.floor(Date.now() / 1000)) =>
  t.env.DB.db.prepare("INSERT INTO edits (sha, email, coach_id, op, created, status) VALUES (?, ?, 'natanel-zhurovel', 'coach.text', ?, 'pending')").run(sha, email, created);
const FAILED_JOBS = [{ conclusion: 'success', steps: [] }, { conclusion: 'failure', steps: [{ name: 'Set up job', conclusion: 'success' }, { name: 'Run withastro/action@v6', conclusion: 'failure' }] }];

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
