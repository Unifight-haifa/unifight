// Panel PRs: state from GitHub (cron and on demand), one Telegram channel message per PR, owner-only merge.
import { route, json, fail, isOwner } from './router.mjs';
import { gh, deleteBranch } from './github.mjs';
import { OPEN, previewUrl } from './content.mjs';
import { runState, tg, coachText } from './status.mjs';

// Workers Free allows 50 subrequests per invocation, shared with the Phase 5 sweep.
const PER_SWEEP = 6;
const OPENING_TTL = 300;
const DONE = ['live', 'live_failed', 'closed'];
const MERGED = ['merged', 'live', 'live_failed'];
const NUMBER = /^\d{1,6}$/;
const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);

const LINE = {
  checks: () => 'Идут проверки',
  failed: (s) => `Проверки не прошли: шаг «${s}»`,
  ready: () => 'Проверки пройдены, ждёт владельца',
  conflict: () => 'Конфликт с main, нужен владелец',
  merged: () => 'Принято, публикуется',
  live: () => 'На сайте',
  live_failed: (s) => `Принято, но сайт не собрался: шаг «${s}»`,
  closed: () => 'Закрыто без публикации',
};

const prUrl = (env, number) => `https://github.com/${env.REPO}/pull/${number}`;
const isOpen = (row) => !MERGED.includes(row.state) && row.state !== 'closed';

async function save(env, row, s) {
  const next = { ...row, step: null, ...s, updated: now() };
  await env.DB.prepare('UPDATE prs SET state = ?, step = ?, merge_sha = ?, updated = ? WHERE n = ?')
    .bind(next.state, next.step ?? null, next.merge_sha ?? null, next.updated, row.n).run();
  return next;
}

/** Re-read the PR and its deploy run, store and return the row with its new state. */
export async function refresh(env, row) {
  const pr = await gh(env, 'GET', `/pulls/${row.number}`);
  if (pr.merged_at) {
    const r = await runState(env, pr.merge_commit_sha);
    const state = r.state === 'live' ? 'live' : r.state === 'failed' ? 'live_failed' : 'merged';
    return save(env, row, { state, step: r.step, merge_sha: pr.merge_commit_sha });
  }
  if (pr.state !== 'open') return save(env, row, { state: 'closed' });
  const r = await runState(env, row.head_sha, 'pull_request');
  if (r.state === 'failed') return save(env, row, r);
  if (r.state === 'pending') return save(env, row, { state: 'checks' });
  return save(env, row, { state: pr.mergeable === false ? 'conflict' : 'ready' });
}

const text = (row) => `${row.who}: ${row.title}\n${(LINE[row.state] ?? LINE.checks)(row.step || 'build')}`;

function keyboard(env, row) {
  const preview = isOpen(row) && previewUrl(env, row.branch);
  const rows = [[...(preview ? [{ text: 'Предпросмотр', url: preview }] : []), { text: 'PR', url: prUrl(env, row.number) }]];
  if (row.state === 'ready') rows.push([{ text: 'Принять', callback_data: `merge:${row.number}` }]);
  return { inline_keyboard: rows };
}

/** Post the PR's channel message once, then edit it whenever the state moved. */
export async function announce(env, row) {
  if (!env.TG_NOTIFY_CHAT || !env.TG_BOT_TOKEN || !row.number) return;
  const msg = { chat_id: env.TG_NOTIFY_CHAT, text: text(row), reply_markup: keyboard(env, row) };
  if (row.tg_msg == null) {
    // Claim first: cron and a panel poll can reach a new row at the same moment.
    if ((await env.DB.prepare('UPDATE prs SET tg_msg = -1 WHERE n = ? AND tg_msg IS NULL').bind(row.n).run()).meta.changes !== 1) return;
    const id = (await tg(env, 'sendMessage', msg)).result?.message_id;
    await env.DB.prepare('UPDATE prs SET tg_msg = ?, tg_state = ? WHERE n = ?').bind(id ?? null, id ? row.state : null, row.n).run();
    return;
  }
  if (row.tg_msg === -1 || row.tg_state === row.state) return;
  if ((await tg(env, 'editMessageText', { ...msg, message_id: row.tg_msg })).ok) {
    await env.DB.prepare('UPDATE prs SET tg_state = ? WHERE n = ?').bind(row.state, row.n).run();
  }
}

// The editor hears about a failed build directly; owners already see it in the channel.
async function dmFailure(env, row) {
  if (!['failed', 'live_failed'].includes(row.state)) {
    // A new save put the PR back to checks: its next failure is news again.
    if (row.notified && row.state === 'checks') await env.DB.prepare('UPDATE prs SET notified = 0 WHERE n = ?').bind(row.n).run();
    return;
  }
  if (!env.TG_BOT_TOKEN) return;
  if ((await env.DB.prepare('UPDATE prs SET notified = 1 WHERE n = ? AND notified = 0').bind(row.n).run()).meta.changes !== 1) return;
  const { results } = await env.DB.prepare('SELECT telegram_id FROM tg_links WHERE email = ?').bind(row.email).all();
  for (const l of results) await tg(env, 'sendMessage', { chat_id: l.telegram_id, text: coachText(row.step || 'build') });
}

/** refresh + channel message + failure DM: the one path for cron, panel polls and merges. */
export async function track(env, row) {
  const next = await refresh(env, row);
  await announce(env, next);
  await dmFailure(env, next);
  return next;
}

// A Worker that died between POST /pulls and storing the number left the key blocked; adopt the PR or drop the row.
async function recoverOpening(env, row) {
  if (row.updated > now() - OPENING_TTL) return;
  const head = encodeURIComponent(`${env.REPO.split('/')[0]}:${row.branch}`);
  const [pr] = row.branch ? await gh(env, 'GET', `/pulls?head=${head}&state=all`) : [];
  if (!pr) {
    if (row.branch) await deleteBranch(env, row.branch);
    await env.DB.prepare('DELETE FROM prs WHERE n = ?').bind(row.n).run();
    return;
  }
  await env.DB.prepare("UPDATE prs SET number = ?, head_sha = ?, title = COALESCE(title, ?), state = 'checks', updated = ? WHERE n = ?")
    .bind(pr.number, pr.head.sha, pr.title, now(), row.n).run();
}

/** Cron: refresh the PRs not finished yet, oldest first, regardless of age. */
export async function sweepPrs(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM prs WHERE state NOT IN (${DONE.map(() => '?').join(',')}) ORDER BY updated LIMIT ?`).bind(...DONE, PER_SWEEP).all();
  for (const row of results) {
    try {
      await (row.number ? track(env, row) : recoverOpening(env, row));
    } catch (e) {
      console.error('sweepPrs', e?.status ?? e?.name);
    }
  }
}

/** Owner-only, shared by the panel and the Telegram button: merges only the green head it just checked. */
export async function mergePr(env, row) {
  row = await track(env, row);
  if (MERGED.includes(row.state)) return { row };
  if (row.state !== 'ready') return { error: 'not_ready', row };
  let merged;
  try {
    // sha pins the head: GitHub answers 409 if a save landed after the checks went green.
    merged = await gh(env, 'PUT', `/pulls/${row.number}/merge`, { sha: row.head_sha, merge_method: 'squash' });
  } catch (e) {
    if (e.status !== 405 && e.status !== 409) throw e;
    return { error: 'not_ready', row: await track(env, row) };
  }
  row = await save(env, row, { state: 'merged', merge_sha: merged?.sha ?? null });
  await announce(env, row);
  return { row };
}

const view = (env, r) => ({ number: r.number, key: r.key, title: r.title, who: r.who, state: r.state, step: r.step ?? null,
  preview: isOpen(r) ? previewUrl(env, r.branch) : null, url: prUrl(env, r.number), updated: r.updated });

async function visible(env, user, number) {
  if (!NUMBER.test(number)) return null;
  const row = await env.DB.prepare('SELECT * FROM prs WHERE number = ?').bind(Number(number)).first();
  return row && (user.role !== 'coach' || row.email === user.email) ? row : null;
}

const github = (fn) => async (c) => {
  try { return await fn(c); } catch (e) {
    if (e?.notConfigured) return fail(503, 'not_configured');
    if (e?.github) return fail(502, 'github');
    throw e;
  }
};

route('GET', '/prs', async ({ env, user }) => {
  const mine = user.role === 'coach' ? ' AND email = ?' : '';
  const own = mine ? [user.email] : [];
  const { results } = await env.DB.prepare(`SELECT * FROM prs WHERE number IS NOT NULL${mine} AND (${OPEN}
    OR n IN (SELECT n FROM prs WHERE number IS NOT NULL${mine} ORDER BY updated DESC LIMIT 20)) ORDER BY updated DESC`).bind(...own, ...own).all();
  return json({ prs: results.map((r) => view(env, r)) });
});

route('GET', '/prs/:number', github(async ({ env, user, params }) => {
  const row = await visible(env, user, params.number);
  return row ? json(view(env, await track(env, row))) : fail(404, 'not_found');
}));

route('POST', '/prs/:number/merge', github(async ({ env, user, params }) => {
  if (user.role !== 'owner') return fail(403, 'forbidden');
  const row = await visible(env, user, params.number);
  if (!row) return fail(404, 'not_found');
  const r = await mergePr(env, row);
  return r.error ? fail(409, r.error) : json(view(env, r.row));
}));

// HMAC both sides under a throwaway key, then compare digests without an early exit.
async function sameSecret(got, want) {
  if (!want || typeof got !== 'string') return false;
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [a, b] = await Promise.all([got, want].map(async (x) => new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(x)))));
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// Telegram retries anything but 200, so every update past the secret check gets 200. Nothing from the body is logged.
route('POST', '/telegram/webhook', async ({ req, env, body }) => {
  if (!(await sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), env.TG_WEBHOOK_SECRET))) return fail(401, 'unauthorized');
  const q = body.callback_query;
  const m = typeof q?.data === 'string' && /^merge:(\d{1,6})$/.exec(q.data);
  if (!m || q.from?.id == null) return json({ ok: true });
  const answer = (text, show_alert = false) => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text, show_alert });
  const email = await env.DB.prepare('SELECT email FROM tg_links WHERE telegram_id = ?').bind(String(q.from.id)).first('email');
  if (!email || !isOwner(env, email.toLowerCase())) {
    await answer('Принять может только владелец', true);
    return json({ ok: true });
  }
  const row = await env.DB.prepare('SELECT * FROM prs WHERE number = ?').bind(Number(m[1])).first();
  try {
    const r = row && (await mergePr(env, row));
    await answer(!r ? 'PR не найден' : r.error ? 'Нельзя принять: проверки не пройдены или PR изменился' : 'Принято', !r?.row || !!r.error);
  } catch (e) {
    console.error('telegram merge', e?.status ?? e?.name);
    await answer('Не получилось, попробуйте ещё раз', true);
  }
  return json({ ok: true });
}, { auth: false });
