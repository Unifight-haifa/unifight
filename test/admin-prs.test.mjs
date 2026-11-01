import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../integrations/admin-api/src/index.mjs';
import { refresh, announce, sweepPrs } from '../integrations/admin-api/src/prs.mjs';
import { setup, edit, run, FAILED_JOBS, COACH, EDITOR, OWNER, SHA_A, SHA_B } from './helpers/admin-repo.mjs';

const CHAT = '-1005550000';
const now = () => Math.floor(Date.now() / 1000);

// GitHub pulls + Actions runs keyed by `${sha}:${event}`, and a Telegram stub that records every call.
function world(over = {}, extra = []) {
  const st = { pulls: {}, runs: {}, jobs: {}, tg: [], tgReply: {}, puts: [] };
  let msg = 900;
  const handlers = [
    ...extra,
    ['GET', /\/pulls\/(\d+)$/, (_, m) => st.pulls[m[1]] ?? new Response('{}', { status: 404 })],
    ['PUT', /\/pulls\/(\d+)\/merge$/, async (req, m) => {
      st.puts.push({ number: Number(m[1]), ...(await req.json()) });
      if (st.mergeStatus) return new Response('{}', { status: st.mergeStatus });
      st.pulls[m[1]] = { ...st.pulls[m[1]], state: 'closed', merged_at: '2026-11-02T10:00:00Z', merge_commit_sha: SHA_B };
      return { sha: SHA_B, merged: true };
    }],
    ['GET', /\/actions\/runs\?head_sha=(\w+)&event=(\w+)$/, (_, m) => ({ workflow_runs: st.runs[`${m[1]}:${m[2]}`] ? [st.runs[`${m[1]}:${m[2]}`]] : [] })],
    ['GET', /\/actions\/runs\/(\d+)\/jobs$/, (_, m) => ({ jobs: st.jobs[m[1]] ?? [] })],
    ['GET', /\/actions\/runs\?branch=main&event=push$/, () => ({ workflow_runs: [] })],
    ['POST', /api\.telegram\.org\/bot123:TEST\/(\w+)$/, async (req, m) => {
      const body = await req.json();
      st.tg.push({ method: m[1], ...body });
      const r = st.tgReply[m[1]]?.(body);
      if (r) return r;
      return m[1] === 'sendMessage' ? { ok: true, result: { message_id: ++msg } } : { ok: true, result: true };
    }],
  ];
  const t = setup({ TG_NOTIFY_CHAT: CHAT, PREVIEW_HOST: 'preview.test', ...over }, handlers);
  return { t, st };
}

const open = (sha, extra = {}) => ({ state: 'open', merged_at: null, merge_commit_sha: null, mergeable: true, head: { sha }, ...extra });

function addPr(t, { number = 1, state = 'checks', head_sha = SHA_A, email = COACH, updated = now(), ...rest } = {}) {
  const cols = { key: `coach:k${number}`, number, branch: `panel-${number}`, title: 'Coaches: Natanel, bio', email, who: 'natanel-zhurovel',
    created: updated, updated, state, head_sha, ...rest };
  const k = Object.keys(cols);
  t.env.DB.db.prepare(`INSERT INTO prs (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...Object.values(cols));
  return row(t, number);
}
const row = (t, number) => ({ ...t.env.DB.db.prepare('SELECT * FROM prs WHERE number = ?').get(number) });

test('refresh maps GitHub to PR states and persists them', async () => {
  const { t, st } = world();
  let r = addPr(t);
  const at = async () => { r = await refresh(t.env, row(t, 1)); return [r.state, r.step ?? null]; };

  st.pulls[1] = open(SHA_A);
  assert.deepEqual(await at(), ['checks', null], 'no run yet');
  st.runs[`${SHA_A}:pull_request`] = run(7, 'in_progress', null);
  assert.deepEqual(await at(), ['checks', null]);
  st.runs[`${SHA_A}:pull_request`] = run(7, 'completed', 'cancelled');
  assert.deepEqual(await at(), ['checks', null], 'cancelled = superseded by a newer save');
  st.runs[`${SHA_A}:pull_request`] = run(7, 'completed', 'failure');
  st.jobs[7] = FAILED_JOBS;
  assert.deepEqual(await at(), ['failed', 'Run withastro/action@v6']);
  assert.deepEqual([row(t, 1).state, row(t, 1).step], ['failed', 'Run withastro/action@v6']);
  st.runs[`${SHA_A}:pull_request`] = run(7, 'completed', 'success');
  assert.deepEqual(await at(), ['ready', null]);
  st.pulls[1] = open(SHA_A, { mergeable: null });
  assert.deepEqual(await at(), ['ready', null], 'mergeable not computed yet is not a conflict');
  st.pulls[1] = open(SHA_A, { mergeable: false });
  assert.deepEqual(await at(), ['conflict', null]);

  st.pulls[1] = { ...open(SHA_A), state: 'closed', merged_at: '2026-11-02T10:00:00Z', merge_commit_sha: SHA_B };
  assert.deepEqual(await at(), ['merged', null]);
  assert.equal(row(t, 1).merge_sha, SHA_B);
  st.runs[`${SHA_B}:push`] = run(8, 'completed', 'failure');
  st.jobs[8] = FAILED_JOBS;
  assert.deepEqual(await at(), ['live_failed', 'Run withastro/action@v6']);
  st.runs[`${SHA_B}:push`] = run(8, 'completed', 'success');
  assert.deepEqual(await at(), ['live', null]);

  addPr(t, { number: 2, key: 'coach:x' });
  st.pulls[2] = { ...open(SHA_A), state: 'closed' };
  assert.equal((await refresh(t.env, row(t, 2))).state, 'closed');
  assert.equal(row(t, 2).state, 'closed');
});

test('announce: one channel message per PR, edited on state change, plain text, no ids or emails', async () => {
  const { t, st } = world();
  addPr(t);
  const msgs = () => st.tg.filter((m) => m.method !== 'sendMessage' || m.chat_id === CHAT);

  // Cron and a panel poll can announce the same new row at once.
  await Promise.all([announce(t.env, row(t, 1)), announce(t.env, row(t, 1))]);
  assert.equal(st.tg.length, 1);
  const [sent] = st.tg;
  assert.equal(sent.method, 'sendMessage');
  assert.equal(sent.chat_id, CHAT);
  assert.equal(sent.parse_mode, undefined);
  assert.equal(sent.text, 'natanel-zhurovel: Coaches: Natanel, bio\nИдут проверки');
  assert.deepEqual(sent.reply_markup.inline_keyboard, [[
    { text: 'Предпросмотр', url: 'https://panel-1.preview.test/' }, { text: 'PR', url: 'https://github.com/o/r/pull/1' }]]);
  assert.deepEqual([row(t, 1).tg_msg, row(t, 1).tg_state], [901, 'checks']);

  await announce(t.env, row(t, 1));
  assert.equal(st.tg.length, 1, 'same state: no call');

  t.env.DB.db.exec("UPDATE prs SET state = 'ready'");
  await announce(t.env, row(t, 1));
  const ed = st.tg[1];
  assert.deepEqual([ed.method, ed.chat_id, ed.message_id], ['editMessageText', CHAT, 901]);
  assert.equal(ed.text, 'natanel-zhurovel: Coaches: Natanel, bio\nПроверки пройдены, ждёт владельца');
  assert.deepEqual(ed.reply_markup.inline_keyboard[1], [{ text: 'Принять', callback_data: 'merge:1' }]);

  // Telegram 400 "message is not modified" counts as done.
  st.tgReply.editMessageText = () => new Response(JSON.stringify({ ok: false, description: 'Bad Request: message is not modified' }), { status: 400 });
  t.env.DB.db.exec("UPDATE prs SET state = 'merged'");
  await announce(t.env, row(t, 1));
  assert.equal(row(t, 1).tg_state, 'merged');
  assert.deepEqual(st.tg[2].reply_markup.inline_keyboard, [[{ text: 'PR', url: 'https://github.com/o/r/pull/1' }]], 'no preview, no merge once merged');
  delete st.tgReply.editMessageText;

  const lines = { failed: 'Проверки не прошли: шаг «build»', conflict: 'Конфликт с main, нужен владелец', live: 'На сайте',
    live_failed: 'Принято, но сайт не собрался: шаг «build»', closed: 'Закрыто без публикации' };
  for (const [state, line] of Object.entries(lines)) {
    t.env.DB.db.prepare('UPDATE prs SET state = ?').run(state);
    await announce(t.env, row(t, 1));
    assert.equal(st.tg.at(-1).text.split('\n')[1], line);
  }
  assert.ok(msgs().every((m) => ![COACH, CHAT, '5550', 'example.com'].some((x) => (m.text ?? '').includes(x))));
});

test('announce: failed send is retried later; a claimed row (-1) is never edited; no channel = no call', async () => {
  const { t, st } = world();
  addPr(t);
  st.tgReply.sendMessage = () => new Response('{"ok":false}', { status: 500 });
  await announce(t.env, row(t, 1));
  assert.equal(row(t, 1).tg_msg, null);
  delete st.tgReply.sendMessage;
  await announce(t.env, row(t, 1));
  assert.equal(row(t, 1).tg_msg, 901);

  addPr(t, { number: 2, key: 'coach:x', tg_msg: -1, tg_state: null });
  await announce(t.env, row(t, 2));
  assert.equal(st.tg.length, 2);

  const u = world({ TG_NOTIFY_CHAT: undefined });
  addPr(u.t);
  await announce(u.t.env, row(u.t, 1));
  assert.equal(u.st.tg.length, 0);
});

test('sweepPrs: DMs the editor once on failure, at most 6 rows oldest first, done rows skipped, errors skipped', async () => {
  const { t, st } = world();
  t.env.DB.db.exec(`INSERT INTO tg_links (telegram_id, email) VALUES ('5550001', '${COACH}'), ('5550002', '${OWNER}')`);
  addPr(t, { number: 1, updated: now() - 30 * 86400 });
  st.pulls[1] = open(SHA_A);
  st.runs[`${SHA_A}:pull_request`] = run(7, 'completed', 'failure');
  st.jobs[7] = FAILED_JOBS;
  await sweepPrs(t.env);
  assert.equal(row(t, 1).state, 'failed', 'week-old PRs are still swept');
  const dms = st.tg.filter((m) => m.method === 'sendMessage' && m.chat_id !== CHAT);
  assert.deepEqual(dms.map((m) => m.chat_id), ['5550001']);
  assert.match(dms[0].text, /^Сайт не собрался на шаге «Run withastro\/action@v6»/);
  await sweepPrs(t.env);
  assert.equal(st.tg.filter((m) => m.chat_id === '5550001').length, 1, 'never twice');

  const u = world();
  const seeded = {};
  for (let i = 1; i <= 9; i++) {
    seeded[i] = addPr(u.t, { number: i, key: `coach:${i}`, updated: now() - 1000 + i, ...(i === 9 && { state: 'live' }), ...(i === 8 && { state: 'closed' }) });
    u.st.pulls[i] = open(SHA_A);
  }
  delete u.st.pulls[2];
  await sweepPrs(u.t.env);
  const pulled = u.t.s.calls.filter((c) => /\/pulls\/\d+$/.test(c.url)).map((c) => Number(c.url.split('/').pop()));
  assert.deepEqual(pulled, [1, 2, 3, 4, 5, 6]);
  assert.equal(row(u.t, 3).state, 'checks');
  assert.ok(row(u.t, 3).updated > now() - 10, 'swept rows move to the back of the queue');
  assert.equal(row(u.t, 2).updated, seeded[2].updated, 'a GitHub error leaves the row for the next run');
});

test('sweepPrs: an opening row older than 5 min is adopted by its branch PR or dropped', async () => {
  const found = { 'panel-41': [{ number: 77, title: 'Coaches: X, bio', head: { sha: SHA_B } }] };
  const { t, st } = world({}, [['GET', /\/pulls\?head=o%3A([\w-]+)&state=all$/, (_, m) => found[m[1]] ?? []]]);
  const old = now() - 600;
  const ins = (n, updated) => t.env.DB.db.prepare("INSERT INTO prs (n, key, branch, email, who, created, updated) VALUES (?, ?, ?, ?, 'editor', ?, ?)")
    .run(n, `coach:o${n}`, `panel-${n}`, EDITOR, updated, updated);
  ins(41, old);
  ins(42, old);
  ins(43, now());
  st.pulls[77] = open(SHA_B);
  await sweepPrs(t.env);
  const by = (n) => ({ ...t.env.DB.db.prepare('SELECT * FROM prs WHERE n = ?').get(n) });
  assert.deepEqual([by(41).number, by(41).head_sha, by(41).state, by(41).title], [77, SHA_B, 'checks', 'Coaches: X, bio']);
  assert.equal(by(42).n, undefined, 'no PR: row dropped so the key is free again');
  assert.ok(t.s.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/git/refs/heads/panel-42')));
  assert.equal(by(43).state, 'opening', 'a fresh opening row may still be mid-save');
  assert.ok(!t.s.calls.some((c) => c.url.includes('panel-43')));
});

test('scheduled() runs the PR sweep, then the Phase 5 sweep, in one waitUntil', async () => {
  const { t, st } = world();
  addPr(t);
  st.pulls[1] = new Response('{}', { status: 500 });
  edit(t, SHA_B);
  st.runs[`${SHA_B}:push`] = run(8, 'completed', 'success');
  const waits = [];
  await worker.scheduled({}, t.env, { waitUntil: (p) => waits.push(p) });
  assert.equal(waits.length, 1);
  await waits[0];
  const i = t.s.calls.findIndex((c) => c.url.endsWith('/pulls/1'));
  const j = t.s.calls.findIndex((c) => c.url.includes(`head_sha=${SHA_B}`));
  assert.ok(i >= 0 && j > i, 'PRs get the subrequest budget first');
  assert.equal({ ...t.env.DB.db.prepare('SELECT status FROM edits').get() }.status, 'live');
});

test('/status/:sha answers branch commits from the prs row, no push-run lookup', async () => {
  const { t } = world();
  addPr(t, { state: 'ready' });
  t.env.DB.db.prepare("INSERT INTO edits (sha, email, coach_id, op, created, status) VALUES (?, ?, 'natanel-zhurovel', 'coach.text', ?, 'pr')").run(SHA_A, COACH, now());
  const status = async () => (await t.call('GET', `/status/${SHA_A}`)).body;
  t.s.calls.length = 0;
  assert.deepEqual(await status(), { state: 'pending' });
  t.env.DB.db.exec("UPDATE prs SET state = 'failed', step = 'Run withastro/action@v6'");
  assert.deepEqual(await status(), { state: 'failed', step: 'Run withastro/action@v6' });
  t.env.DB.db.exec("UPDATE prs SET state = 'live', step = NULL");
  assert.deepEqual(await status(), { state: 'live' });
  assert.ok(!t.s.calls.some((c) => c.url.includes('/actions/')));
  assert.equal({ ...t.env.DB.db.prepare('SELECT status FROM edits').get() }.status, 'pr', 'the row stays out of the Phase 5 sweep');
});

// ---- Task 2: panel routes and owner-only merge ----
const VIEW_KEYS = ['key', 'number', 'preview', 'state', 'step', 'title', 'updated', 'url', 'who'];

test('GET /prs: open plus the last 20, coaches see their own, no emails', async () => {
  const { t } = world();
  addPr(t, { number: 1, updated: now() - 9000 });
  addPr(t, { number: 2, key: 'coach:e', email: EDITOR, updated: now() - 8000 });
  for (let i = 3; i <= 24; i++) addPr(t, { number: i, key: `coach:${i}`, email: EDITOR, state: 'closed', updated: now() - 100 + i });
  const owner = (await t.call('GET', '/prs', null, OWNER)).body.prs;
  assert.equal(owner.length, 22);
  assert.deepEqual(owner.map((p) => p.number).slice(0, 3), [24, 23, 22]);
  assert.ok(owner.some((p) => p.number === 1) && owner.some((p) => p.number === 2));
  assert.deepEqual(Object.keys(owner[0]).sort(), VIEW_KEYS);
  assert.equal(owner[0].preview, null, 'closed PRs have no preview');
  const one = owner.find((p) => p.number === 1);
  assert.deepEqual([one.preview, one.url], ['https://panel-1.preview.test/', 'https://github.com/o/r/pull/1']);
  assert.ok(!JSON.stringify(owner).includes('example.com'));
  assert.equal((await t.call('GET', '/prs', null, EDITOR)).body.prs.length, 22);
  assert.deepEqual((await t.call('GET', '/prs')).body.prs.map((p) => p.number), [1]);
});

test('GET /prs/:number refreshes and announces; others\' rows, unknown and junk are 404', async () => {
  const { t, st } = world();
  addPr(t);
  addPr(t, { number: 2, key: 'coach:e', email: EDITOR });
  st.pulls[1] = open(SHA_A);
  st.runs[`${SHA_A}:pull_request`] = run(7, 'completed', 'success');
  const r = await t.call('GET', '/prs/1');
  assert.deepEqual([r.status, r.body.state], [200, 'ready']);
  assert.equal(st.tg.filter((m) => m.method === 'sendMessage').length, 1);
  assert.equal((await t.call('GET', '/prs/2')).status, 404);
  assert.equal((await t.call('GET', '/prs/99', null, OWNER)).status, 404);
  assert.equal((await t.call('GET', '/prs/1x', null, OWNER)).status, 404);
  st.pulls[1] = new Response('{}', { status: 500 });
  assert.equal((await t.call('GET', '/prs/1', null, OWNER)).status, 502);
});

test('POST /prs/:number/merge: owner only, ready only, squash with the checked head sha, idempotent', async () => {
  const { t, st } = world();
  addPr(t);
  st.pulls[1] = open(SHA_A);
  const repoCalls = () => t.s.calls.filter((c) => c.url.includes('/repos/')).length;
  const before = repoCalls();
  for (const who of [COACH, EDITOR]) assert.equal((await t.call('POST', '/prs/1/merge', {}, who)).status, 403);
  assert.equal(repoCalls(), before, 'no GitHub call for non-owners');

  let r = await t.call('POST', '/prs/1/merge', {}, OWNER);
  assert.deepEqual([r.status, r.body.error], [409, 'not_ready']);
  assert.equal(st.puts.length, 0, 'checks still running: no merge');

  st.runs[`${SHA_A}:pull_request`] = run(7, 'completed', 'success');
  st.mergeStatus = 409;
  r = await t.call('POST', '/prs/1/merge', {}, OWNER);
  assert.deepEqual([r.status, r.body.error], [409, 'not_ready'], 'head moved after green');
  delete st.mergeStatus;

  r = await t.call('POST', '/prs/1/merge', {}, OWNER);
  assert.deepEqual([r.status, r.body.state], [200, 'merged']);
  assert.deepEqual(st.puts.at(-1), { number: 1, sha: SHA_A, merge_method: 'squash' });
  assert.deepEqual([row(t, 1).state, row(t, 1).merge_sha], ['merged', SHA_B]);
  const last = st.tg.at(-1);
  assert.equal(last.method, 'editMessageText');
  assert.ok(!JSON.stringify(last.reply_markup).includes('merge:'), 'merge button gone');

  const puts = st.puts.length;
  r = await t.call('POST', '/prs/1/merge', {}, OWNER);
  assert.equal(r.status, 200);
  assert.equal(st.puts.length, puts, 'already merged: no second PUT');
  assert.equal((await t.call('POST', '/prs/9/merge', {}, OWNER)).status, 404);
});

test('POST /telegram/webhook: secret header, merge callbacks only, owner-linked Telegram id only', async () => {
  const SECRET = 'test-webhook-secret-0123456789abcdef';
  const { t, st } = world({ TG_WEBHOOK_SECRET: SECRET });
  t.env.DB.db.exec(`INSERT INTO tg_links (telegram_id, email) VALUES ('5550001', '${COACH}'), ('5550002', '${OWNER}')`);
  addPr(t);
  st.pulls[1] = open(SHA_A);
  st.runs[`${SHA_A}:pull_request`] = run(7, 'completed', 'success');
  const hook = async (body, secret = SECRET, env = t.env) => {
    const res = await worker.fetch(new Request('https://api.test/telegram/webhook', {
      method: 'POST', headers: { ...(secret != null && { 'X-Telegram-Bot-Api-Secret-Token': secret }) }, body: JSON.stringify(body) }), env, {});
    return res.status;
  };
  const press = (id, data = 'merge:1') => ({ update_id: 1, callback_query: { id: 'cq1', from: { id }, data } });
  const repoCalls = () => t.s.calls.filter((c) => c.url.includes('/repos/')).length;

  assert.equal(await hook(press(5550002), null), 401);
  assert.equal(await hook(press(5550002), 'wrong'), 401);
  assert.equal(await hook(press(5550002), `${SECRET}x`), 401);
  assert.equal(await hook(press(5550002), SECRET, { ...t.env, TG_WEBHOOK_SECRET: undefined }), 401);
  const before = repoCalls();
  assert.equal(await hook({ update_id: 2, message: { text: 'hi' } }), 200);
  assert.equal(await hook(press(5550002, 'merge:1; drop')), 200);
  assert.equal(await hook(press(5550002, 'merge:1234567')), 200);
  assert.equal(st.tg.length, 0);

  for (const id of [5550001, 5550009]) {
    assert.equal(await hook(press(id)), 200);
    assert.deepEqual(st.tg.at(-1), { method: 'answerCallbackQuery', callback_query_id: 'cq1', text: 'Принять может только владелец', show_alert: true });
  }
  assert.equal(repoCalls(), before, 'no GitHub call for non-owners');
  assert.equal(st.puts.length, 0);

  assert.equal(await hook(press(5550002)), 200);
  assert.deepEqual(st.puts, [{ number: 1, sha: SHA_A, merge_method: 'squash' }]);
  assert.equal(row(t, 1).state, 'merged');
  const ans = st.tg.filter((m) => m.method === 'answerCallbackQuery').at(-1);
  assert.equal(ans.text, 'Принято');
  assert.equal(await hook(press(5550002)), 200, 'a repeated press is fine');
  assert.equal(st.puts.length, 1);
});
