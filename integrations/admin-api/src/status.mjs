// Deploy status of a panel commit, and the cron that tells Telegram users about a failed build.
import { route, json, fail, list } from './router.mjs';
import { gh } from './github.mjs';

const WORKFLOW = 'Deploy to GitHub Pages';
const SWEEP_WINDOW = 2 * 3600;
const FAILED = ['failure', 'timed_out', 'startup_failure'];
const SHA = /^[0-9a-f]{7,40}$/;

/** -> {state: 'pending'|'live'|'failed', step?} for the push deploy run of `sha`. */
export async function runState(env, sha) {
  const runs = (await gh(env, 'GET', `/actions/runs?head_sha=${sha}&event=push`)).workflow_runs ?? [];
  const run = runs.find((r) => r.name === WORKFLOW);
  if (!run || run.status !== 'completed') return { state: 'pending' };
  if (run.conclusion === 'success') return { state: 'live' };
  if (FAILED.includes(run.conclusion)) {
    const { jobs = [] } = await gh(env, 'GET', `/actions/runs/${run.id}/jobs`);
    const step = jobs.find((j) => j.conclusion === 'failure')?.steps?.find((s) => s.conclusion === 'failure')?.name;
    return { state: 'failed', ...(step && { step }) };
  }
  // The `pages` concurrency group cancels superseded runs; a later green deploy carries this commit too.
  const later = (await gh(env, 'GET', `/actions/runs?branch=${encodeURIComponent(env.BRANCH)}&event=push`)).workflow_runs ?? [];
  const live = later.some((r) => r.name === WORKFLOW && r.conclusion === 'success' && r.created_at > run.created_at);
  return { state: live ? 'live' : 'pending' };
}

const save = (env, sha, { state, step }) =>
  env.DB.prepare('UPDATE edits SET status = ?, conclusion = ? WHERE sha = ?').bind(state, step ?? null, sha).run();

route('GET', '/status/:sha', async ({ env, user, params: { sha } }) => {
  if (!SHA.test(sha)) return fail(404, 'not_found');
  const row = await env.DB.prepare('SELECT email, status, conclusion FROM edits WHERE sha = ?').bind(sha).first();
  if (!row || (user.role === 'coach' && row.email !== user.email)) return fail(404, 'not_found');
  if (row.status === 'live' || row.status === 'failed') return json({ state: row.status, ...(row.conclusion && { step: row.conclusion }) });
  let s;
  try { s = await runState(env, sha); } catch (e) {
    if (e?.notConfigured) return fail(503, 'not_configured');
    if (e?.github) return fail(502, 'github');
    throw e;
  }
  await save(env, sha, s);
  return json(s);
});

const coachText = (step) => [
  `Сайт не собрался на шаге «${step}». Ваше изменение не опубликовано, владелец знает.`,
  `האתר לא נבנה בשלב «${step}». השינוי שלך לא פורסם, הבעלים יודע.`,
  `The site build failed at step "${step}". Your change is not live yet; the owner knows.`,
].join('\n\n');
const ownerText = (step, who) => `Сайт не собрался на шаге «${step}» после правки из панели (${who}). Деплой стоит, пока в main не придёт исправление.`;

async function tell(env, chat_id, text) {
  try {
    const r = await (env.__fetch ?? fetch)(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id, text }),
    });
    if (!r.ok) console.error('sweep: telegram', r.status);
  } catch (e) {
    console.error('sweep: telegram', e?.name); // never the URL: it holds the bot token
  }
}

/** Cron: refresh recent pending edits, then send each failed one to Telegram once. */
export async function sweep(env) {
  const since = Math.floor(Date.now() / 1000) - SWEEP_WINDOW;
  const { results } = await env.DB.prepare(
    "SELECT sha, email, coach_id, op, status, conclusion FROM edits WHERE created > ? AND (status = 'pending' OR (status = 'failed' AND notified = 0))").bind(since).all();
  for (const e of results) {
    if (e.status === 'pending') {
      try {
        const s = await runState(env, e.sha);
        await save(env, e.sha, s);
        Object.assign(e, { status: s.state, conclusion: s.step ?? null });
      } catch (err) {
        console.error('sweep: run lookup', err?.status ?? err?.message);
        continue;
      }
    }
    if (e.status !== 'failed' || !env.TG_BOT_TOKEN) continue;
    // Claim first, so overlapping sweeps can't both send.
    if ((await env.DB.prepare('UPDATE edits SET notified = 1 WHERE sha = ? AND notified = 0').bind(e.sha).run()).meta.changes !== 1) continue;
    const step = e.conclusion || 'build';
    const owners = list(env.OWNER_EMAILS).map((o) => o.toLowerCase());
    const { results: links } = await env.DB.prepare(
      `SELECT telegram_id, email FROM tg_links WHERE email = ? OR email IN (${owners.map(() => '?').join(',') || 'NULL'})`).bind(e.email, ...owners).all();
    const sent = new Set();
    for (const l of links) {
      if (sent.has(l.telegram_id)) continue;
      sent.add(l.telegram_id);
      await tell(env, l.telegram_id, l.email === e.email ? coachText(step) : ownerText(step, e.coach_id ?? e.op));
    }
  }
}
