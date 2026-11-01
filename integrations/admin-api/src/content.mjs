// Content reads and saves. The client sends an op, an id and field values; paths come only from validated ids.
import { route, json, fail, take } from './router.mjs';
import { installationToken, readJson, listDir, commitFiles } from './github.mjs';
import { can, mergeFields } from '../../../src/lib/admin-perms.mjs';
import { checkTranslations } from '../../../src/lib/integrity.mjs';
import { checkSchedule } from '../../../src/lib/schedule-check.mjs';

const SAVES_PER_DAY = 30;
// Kana and CJK ideographs: build.py fails on any kanji word missing from content/kanji.json.
const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
const LANGS = ['he', 'ru', 'en'];

const coachPath = (id) => `content/coaches/${id}.json`;
const schedulePath = (id) => `content/schedule/${id}.json`;
const SECTION = 'content/coaches/_section.json';
export const serialize = (obj) => `${JSON.stringify(obj, null, 1)}\n`;

const invalid = (detail) => fail(400, 'invalid', detail);

/** Live coach ids on main (file names in content/coaches/ minus _section); pass as `known` to can(). */
export async function loadContext(env, ref) {
  const known = (await listDir(env, 'content/coaches', ref))
    .filter((f) => f.type === 'file' && f.name.endsWith('.json') && f.name !== '_section.json')
    .map((f) => f.name.slice(0, -5));
  return { known };
}

function noCJK(o, at) {
  if (typeof o === 'string') { if (CJK.test(o)) throw new Error(`${at}: Japanese or Chinese characters are not allowed`); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) noCJK(v, `${at}.${k}`);
}

const coachName = async (env, id, head) => (await readJson(env, coachPath(id), head))?.data?.name?.en ?? id;

/**
 * Each op: target(id) for can(), path(id), edits (needs base_sha), optional validate(merged, ctx),
 * subject(merged, ctx) for the commit message. 05-07 adds photo and change ops here.
 */
export const SAVE_OPS = {
  'coach.text': { edits: true, target: (id) => ({ coach: id }), coach: (id) => id, path: coachPath,
    subject: (m, { id }) => `Coaches: ${m.name?.en ?? id}, bio` },
  'coach.meta': { edits: true, target: (id) => ({ coach: id }), coach: (id) => id, path: coachPath,
    subject: (m, { id }) => `Coaches: ${m.name?.en ?? id}, name and card details` },
  'schedule.sessions': { edits: true, target: (id) => ({ schedule: id }), coach: (id) => id, path: schedulePath,
    validate: async (m, { env, head, path }) => checkSchedule(m, (await readJson(env, 'content/venues.json', head))?.data ?? {}, path),
    subject: async (_, { env, id, head }) => `Schedule: ${await coachName(env, id, head)}, weekly sessions` },
  'shared.section': { edits: true, target: () => ({}), coach: () => null, path: () => SECTION,
    subject: () => 'Coaches: section text' },
};

// Handlers throw Responses for early exits from inside the commit build; GitHub failures map to 502/503.
const guard = (h) => async (c) => {
  try {
    return await h(c);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e?.notConfigured) return fail(503, 'not_configured');
    if (e?.github) return fail(502, 'github');
    throw e;
  }
};

const allowed = async (env, user, op, target) => {
  if (!can(user, op, target)) return false;
  const { known } = await loadContext(env);
  return can(user, op, { ...target, known });
};

route('GET', '/health', async ({ env }) => {
  const d1 = await env.DB.prepare('SELECT 1 AS x').first('x').then((x) => x === 1, () => false);
  const github = await installationToken(env).then(() => true, () => false);
  return json({ ok: true, d1, github });
}, { auth: false });

route('GET', '/coaches', guard(async ({ env, user }) => {
  const { known } = await loadContext(env);
  const ids = user.role === 'coach' ? known.filter((id) => id === user.coach_id) : known;
  const schedules = new Set((await listDir(env, 'content/schedule')).map((f) => f.name.replace(/\.json$/, '')));
  const coaches = await Promise.all(ids.map(async (id) => {
    const name = (await readJson(env, coachPath(id)))?.data?.name ?? {};
    return { id, name: Object.fromEntries(LANGS.map((l) => [l, name[l] ?? ''])), schedule: schedules.has(id) };
  }));
  return json({ coaches });
}));

route('GET', '/content/coach/:id', guard(async ({ env, user, params: { id } }) => {
  if (!(await allowed(env, user, 'coach.text', { coach: id }))) return fail(403, 'forbidden');
  const f = await readJson(env, coachPath(id));
  return f ? json(f) : fail(404, 'not_found');
}));

route('GET', '/content/schedule/:id', guard(async ({ env, user, params: { id } }) => {
  if (!(await allowed(env, user, 'schedule.sessions', { schedule: id }))) return fail(403, 'forbidden');
  const f = await readJson(env, schedulePath(id));
  if (!f) return fail(404, 'not_found');
  const all = (await readJson(env, 'content/venues.json'))?.data ?? {};
  // Names only: addresses and their sources stay out of the panel.
  const venues = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, Object.fromEntries(LANGS.map((l) => [l, v[l]]))]));
  return json({ ...f, venues });
}));

route('GET', '/content/changes/:id', guard(async ({ env, user, params: { id } }) => {
  if (!(await allowed(env, user, 'change.create', { schedule: id }))) return fail(403, 'forbidden');
  const names = (await listDir(env, 'content/schedule-changes')).filter((f) => f.type === 'file' && f.name.endsWith('.json'));
  const files = await Promise.all(names.map((f) => readJson(env, `content/schedule-changes/${f.name}`)));
  return json({ changes: files.filter((f) => f?.data?.schedule === id) });
}));

route('GET', '/content/section', guard(async ({ env, user }) => {
  if (!can(user, 'shared.section', {})) return fail(403, 'forbidden');
  return json(await readJson(env, SECTION));
}));

route('POST', '/save', guard(async ({ env, user, body }) => {
  const { op, id, base_sha, fields } = body;
  const spec = Object.hasOwn(SAVE_OPS, op) ? SAVE_OPS[op] : null;
  if (!spec) return invalid('unknown op');
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return invalid('fields must be an object');
  if (spec.edits && !(typeof base_sha === 'string' && base_sha)) return invalid('base_sha is required');
  if (!(await allowed(env, user, op, spec.target(id)))) return fail(403, 'forbidden');
  if ((await take(env, user.email, new Date().toISOString().slice(0, 10), 'save')) > SAVES_PER_DAY) return fail(429, 'rate_limited');

  const path = spec.path(id);
  let merged;
  const sha = await commitFiles(env, async (head) => {
    const cur = await readJson(env, path, head);
    if (!cur) throw fail(404, 'not_found');
    if (spec.edits && cur.sha !== base_sha) throw fail(409, 'stale');
    merged = mergeFields(op, cur.data, fields);
    try {
      checkTranslations(merged, path);
      noCJK(merged, path);
      await spec.validate?.(merged, { env, head, path, id });
    } catch (e) {
      if (e?.github) throw e;
      throw invalid(e.message);
    }
    return [{ path, content: serialize(merged) }];
  }, async (head) => `${await spec.subject(merged, { env, head, id })}\n\nFrom the coach panel (${user.coach_id ?? user.role}).`);

  await env.DB.prepare("INSERT INTO edits (sha, email, coach_id, op, created, status) VALUES (?, ?, ?, ?, ?, 'pending')")
    .bind(sha, user.email, spec.coach(id), op, Math.floor(Date.now() / 1000)).run();
  return json({ sha });
}));
