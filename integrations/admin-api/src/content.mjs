// Content reads and saves. The client sends an op, an id and field values; paths come only from validated ids.
import { route, json, fail, take } from './router.mjs';
import { installationToken, readJson, listDir, commitFiles } from './github.mjs';
import { can, mergeFields } from '../../../src/lib/admin-perms.mjs';
import { checkTranslations } from '../../../src/lib/integrity.mjs';
import { checkSchedule } from '../../../src/lib/schedule-check.mjs';
import { checkChanges } from '../../../src/lib/schedule-changes.mjs';
import { checkCoachWebp } from '../../../src/lib/image-check.mjs';

const SAVES_PER_DAY = 30;
// Kana and CJK ideographs: build.py fails on any kanji word missing from content/kanji.json.
const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
const LANGS = ['he', 'ru', 'en'];

const coachPath = (id) => `content/coaches/${id}.json`;
const schedulePath = (id) => `content/schedule/${id}.json`;
const changePath = (id) => `content/schedule-changes/${id}.json`;
const CHANGE_ID = /^[a-z0-9][a-z0-9-]*$/;
const CHANGE_TYPES = ['cancel', 'move', 'extra', 'note'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => typeof s === 'string' && DATE.test(s) && !isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
// base64 of a 1.5 MB file is 2 MB; refuse anything larger before decoding it.
const MAX_B64 = 2.1 * 1024 * 1024;
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

// Validator errors become 400 invalid; GitHub errors and early-exit Responses pass through.
async function vet(fn) {
  try {
    await fn();
  } catch (e) {
    if (e?.github || e?.notConfigured || e instanceof Response) throw e;
    throw invalid(e.message);
  }
}

async function readBase(env, path, head, base_sha) {
  const cur = await readJson(env, path, head);
  if (!cur) throw fail(404, 'not_found');
  if (cur.sha !== base_sha) throw fail(409, 'stale');
  return cur;
}

// Single-file read, stale check, merge, validate: the text and schedule ops.
async function mergeBuild(head, c) {
  const { env, spec, op, id, fields } = c;
  const path = spec.path(id);
  const cur = await readBase(env, path, head, c.base_sha);
  c.merged = mergeFields(op, cur.data, fields);
  await vet(async () => {
    checkTranslations(c.merged, path);
    noCJK(c.merged, path);
    await spec.validate?.(c.merged, { env, head, path, id });
  });
  return [{ path, content: serialize(c.merged) }];
}

function decodePhoto(fields) {
  const s = typeof fields.webp === 'string' ? fields.webp.replace(/\s/g, '') : '';
  if (!s) throw new Error('photo is missing');
  if (s.length > MAX_B64) throw new Error('photo is larger than 1.5 MB');
  let bytes;
  try { bytes = Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0)); } catch { throw new Error('photo is not valid base64'); }
  const f = fields.face;
  const face = Array.isArray(f) && f.length === 2 && f.every((x) => typeof x === 'number' && x >= 0 && x <= 1) ? f : [0.5, 0.3];
  return { b64: s, face, ...checkCoachWebp(bytes) };
}

// Copies only known keys: the file ends up in HTML via build.py.
function changeCandidate(fields) {
  const { type, from, to, session, note } = fields;
  if (!CHANGE_TYPES.includes(type)) throw new Error(`type must be one of ${CHANGE_TYPES.join(', ')}`);
  if (!isDate(from) || !isDate(to)) throw new Error('from and to must be YYYY-MM-DD dates');
  const pick = (o, keys) => (o && typeof o === 'object' ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : o);
  return {
    type, from, to,
    ...(session !== undefined && { session: pick(session, ['day', 'start', 'group']) }),
    ...(fields.new !== undefined && { new: pick(fields.new, ['date', 'start', 'end', 'venue']) }),
    note: pick(note, LANGS),
  };
}

async function loadSchedules(env, head) {
  const names = (await listDir(env, 'content/schedule', head)).filter((f) => f.type === 'file' && f.name.endsWith('.json'));
  const files = await Promise.all(names.map(async (f) => [f.name.slice(0, -5), (await readJson(env, `content/schedule/${f.name}`, head))?.data]));
  return Object.fromEntries(files);
}

/**
 * Each op: target(id) for can(), coach(id) for the edits log, edits (needs base_sha), optional check(fields)
 * before any GitHub call, build(head, ctx) -> files (default mergeBuild), subject(merged, ctx).
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
  'coach.photo': { edits: true, target: (id) => ({ coach: id }), coach: (id) => id,
    check: decodePhoto,
    build: async (head, c) => {
      const path = coachPath(c.id);
      const cur = await readBase(c.env, path, head, c.base_sha);
      const { b64, width: w, height: h, face } = c.pre;
      // Old JPEG stays in public/: removing it is a separate cleanup.
      c.merged = { ...cur.data, photo: { ...cur.data.photo, src: `coaches/${c.id}.webp`, face, w, h, source: `panel ${new Date().toISOString().slice(0, 10)}` } };
      return [{ path: `public/coaches/${c.id}.webp`, base64: b64 }, { path, content: serialize(c.merged) }];
    },
    subject: (m, { id }) => `Coaches: ${m.name?.en ?? id}, photo` },
  'change.create': { edits: false, target: (id) => ({ schedule: id }), coach: (id) => id,
    check: changeCandidate,
    build: async (head, c) => {
      const { env, id, user } = c;
      const schedules = await loadSchedules(env, head);
      const venues = (await readJson(env, 'content/venues.json', head))?.data ?? {};
      const taken = new Set((await listDir(env, 'content/schedule-changes', head)).map((f) => f.name));
      const base = `${c.pre.from}-${id}-${c.pre.type}`;
      let cid = base;
      for (let n = 2; taken.has(`${cid}.json`); n++) cid = `${base}-${n}`;
      const { type, from, to, session, note } = c.pre;
      const obj = { id: cid, schedule: id, type, from, to, ...(session && { session }), ...(c.pre.new && { new: c.pre.new }), note,
        author: user.coach_id ?? user.role, created: new Date().toISOString() };
      await vet(() => { checkChanges([[`${cid}.json`, obj]], schedules, venues); noCJK(obj, changePath(cid)); });
      c.merged = obj;
      c.out = { change_id: cid };
      return [{ path: changePath(cid), content: serialize(obj) }];
    },
    subject: async (m, { env, id, head }) => `Schedule: ${await coachName(env, id, head)}, ${m.type} ${m.from}` },
  'change.delete': { edits: true, target: (id) => ({ schedule: id }), coach: (id) => id,
    check: (f) => { if (!(typeof f.change_id === 'string' && CHANGE_ID.test(f.change_id))) throw new Error('change_id is invalid'); },
    build: async (head, c) => {
      const path = changePath(c.fields.change_id);
      const cur = await readBase(c.env, path, head, c.base_sha);
      // The permission check passed for `id`; the file itself decides whose change it is.
      if (cur.data?.schedule !== c.id) throw fail(403, 'forbidden');
      c.merged = cur.data;
      return [{ path, delete: true }];
    },
    subject: async (m, { env, id, head }) => `Schedule: ${await coachName(env, id, head)}, removed ${m.type} ${m.from}` },
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
  let pre;
  try { pre = spec.check?.(fields); } catch (e) { return invalid(e.message); }
  if (!(await allowed(env, user, op, spec.target(id)))) return fail(403, 'forbidden');
  if ((await take(env, user.email, new Date().toISOString().slice(0, 10), 'save')) > SAVES_PER_DAY) return fail(429, 'rate_limited');

  const c = { env, user, spec, op, id, base_sha, fields, pre, out: {} };
  const sha = await commitFiles(env, (head) => (spec.build ?? mergeBuild)(head, c),
    async (head) => `${await spec.subject(c.merged, { env, head, id })}\n\nFrom the coach panel (${user.coach_id ?? user.role}).`);

  await env.DB.prepare("INSERT INTO edits (sha, email, coach_id, op, created, status) VALUES (?, ?, ?, ?, ?, 'pending')")
    .bind(sha, user.email, spec.coach(id), op, Math.floor(Date.now() / 1000)).run();
  return json({ sha, ...c.out });
}));
