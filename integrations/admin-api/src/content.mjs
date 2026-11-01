// Content reads and saves. The client sends an op, an id and field values; paths come only from validated ids.
import { route, json, fail, take } from './router.mjs';
import { installationToken, gh, readJson, listDir, commitFiles, openPull, deleteBranch } from './github.mjs';
import { can, mergeFields } from '../../../src/lib/admin-perms.mjs';
import { checkTranslations } from '../../../src/lib/integrity.mjs';
import { checkSchedule } from '../../../src/lib/schedule-check.mjs';
import { checkChanges } from '../../../src/lib/schedule-changes.mjs';
import { checkCoachWebp } from '../../../src/lib/image-check.mjs';
import { buildPrompt, detectLang, MAX_CHARS } from '../../../src/lib/translate-prompt.mjs';
import { translate } from './translate.mjs';

const SAVES_PER_DAY = 30;
const TRANSLATES_PER_DAY = 60;
const TRANSLATE_KEYS = { 'coach-bio': /^(bio|dan_rank|alt|(about|approach)\.\d{1,2})$/, 'schedule-note': /^note$/ };
const MAX_TRANSLATE_FIELDS = 24;
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

// prs rows in these states still own their key (matches the prs_open_key index).
export const OPEN = "state NOT IN ('merged','live','live_failed','closed')";
export const previewUrl = (env, branch) => (env.PREVIEW_HOST ? `https://${branch}.${env.PREVIEW_HOST}/` : null);

/** Branch of the open PR for key, else undefined (= main). */
export async function pendingRef(env, key) {
  const branch = await env.DB.prepare(`SELECT branch FROM prs WHERE key = ? AND number IS NOT NULL AND ${OPEN}`).bind(key).first('branch');
  if (!branch) return undefined;
  // A merged PR's branch is deleted before the sweep marks its row; main has the text by then.
  return gh(env, 'GET', `/git/ref/heads/${branch}`).then(() => branch, (e) => { if (e.status === 404) return undefined; throw e; });
}

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

// build.py renders a plain string raw, so every text must be a {he, ru, en} object.
const TEXT_EXTRA = { placeholder: 'boolean', source: 'string' };
const isText = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && LANGS.every((l) => typeof v[l] === 'string')
  && Object.entries(v).every(([k, x]) => LANGS.includes(k) || typeof x === TEXT_EXTRA[k]);
const isTexts = (v) => Array.isArray(v) && v.every(isText);

function shape(m, at, rules) {
  for (const [k, [ok, what, required]] of Object.entries(rules)) {
    const v = k === 'alt' ? m.photo?.alt : m[k];
    if (v === undefined ? required : !ok(v)) throw new Error(`${at}.${k}: must be ${what}`);
  }
}
const TEXT = [isText, 'he, ru and en text'];
const checkText = (m, { path }) => shape(m, path, {
  bio: TEXT, dan_rank: TEXT, alt: TEXT, about: [isTexts, 'a list of he, ru and en paragraphs'],
  approach: [isTexts, 'a list of he, ru and en paragraphs'], approach_own: [(v) => typeof v === 'boolean', 'true or false'],
});
async function checkMeta(m, { env, head, path }) {
  const section = (await readJson(env, SECTION, head))?.data ?? {};
  const groups = ['main', 'lead', ...(section.roster ?? []).map((r) => r.group)];
  const videos = new Set(((await readJson(env, 'content/videos.json', head))?.data ?? []).map((v) => v.id));
  shape(m, path, {
    name: [...TEXT, true], role: TEXT,
    order: [Number.isInteger, 'a whole number', true],
    group: [(v) => groups.includes(v), `one of ${groups.join(', ')}`, true],
    color: [(v) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v), 'a #hex colour'],
    youtube: [(v) => videos.has(v), 'a video id from content/videos.json'],
  });
}
const checkSection = (m, { path }) => shape(m, path, { title: [...TEXT, true], intro: [...TEXT, true], more_coaches: TEXT, founded_note: TEXT });

const coachKey = (id) => `coach:${id}`;
const scheduleKey = (id) => `schedule:${id}`;

/**
 * Each op: target(id) for can(), coach(id) for the edits log, key(id) = the open PR it stacks onto, edits (needs base_sha),
 * optional check(fields) before any GitHub call, build(head, ctx) -> files (default mergeBuild), subject(merged, ctx).
 */
export const SAVE_OPS = {
  'coach.text': { edits: true, target: (id) => ({ coach: id }), coach: (id) => id, key: coachKey, path: coachPath, validate: checkText,
    subject: (m, { id }) => `Coaches: ${m.name?.en ?? id}, bio` },
  'coach.meta': { edits: true, target: (id) => ({ coach: id }), coach: (id) => id, key: coachKey, path: coachPath, validate: checkMeta,
    subject: (m, { id }) => `Coaches: ${m.name?.en ?? id}, name and card details` },
  'schedule.sessions': { edits: true, target: (id) => ({ schedule: id }), coach: (id) => id, key: scheduleKey, path: schedulePath,
    validate: async (m, { env, head, path }) => checkSchedule(m, (await readJson(env, 'content/venues.json', head))?.data ?? {}, path),
    subject: async (_, { env, id, head }) => `Schedule: ${await coachName(env, id, head)}, weekly sessions` },
  'shared.section': { edits: true, target: () => ({}), coach: () => null, key: () => 'section', path: () => SECTION, validate: checkSection,
    subject: () => 'Coaches: section text' },
  'coach.photo': { edits: true, target: (id) => ({ coach: id }), coach: (id) => id, key: coachKey,
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
  'change.create': { edits: false, target: (id) => ({ schedule: id }), coach: (id) => id, key: scheduleKey,
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
  'change.delete': { edits: true, target: (id) => ({ schedule: id }), coach: (id) => id, key: scheduleKey,
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
  const f = await readJson(env, coachPath(id), await pendingRef(env, coachKey(id)));
  return f ? json(f) : fail(404, 'not_found');
}));

route('GET', '/content/schedule/:id', guard(async ({ env, user, params: { id } }) => {
  if (!(await allowed(env, user, 'schedule.sessions', { schedule: id }))) return fail(403, 'forbidden');
  const f = await readJson(env, schedulePath(id), await pendingRef(env, scheduleKey(id)));
  if (!f) return fail(404, 'not_found');
  const all = (await readJson(env, 'content/venues.json'))?.data ?? {};
  // Names only: addresses and their sources stay out of the panel.
  const venues = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, Object.fromEntries(LANGS.map((l) => [l, v[l]]))]));
  return json({ ...f, venues });
}));

route('GET', '/content/changes/:id', guard(async ({ env, user, params: { id } }) => {
  if (!(await allowed(env, user, 'change.create', { schedule: id }))) return fail(403, 'forbidden');
  const ref = await pendingRef(env, scheduleKey(id));
  const names = (await listDir(env, 'content/schedule-changes', ref)).filter((f) => f.type === 'file' && f.name.endsWith('.json'));
  const files = await Promise.all(names.map((f) => readJson(env, `content/schedule-changes/${f.name}`, ref)));
  return json({ changes: files.filter((f) => f?.data?.schedule === id) });
}));

route('GET', '/content/section', guard(async ({ env, user }) => {
  if (!can(user, 'shared.section', {})) return fail(403, 'forbidden');
  return json(await readJson(env, SECTION, await pendingRef(env, 'section')));
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
  const key = spec.key(id);
  const who = user.coach_id ?? user.role;
  const now = Math.floor(Date.now() / 1000);
  let row = await env.DB.prepare(`SELECT * FROM prs WHERE key = ? AND ${OPEN}`).bind(key).first();
  // No number yet: another first save for this key is still opening its PR.
  if (row && !row.number) return fail(409, 'stale');
  if (row) {
    const pr = await gh(env, 'GET', `/pulls/${row.number}`);
    if (pr.state !== 'open' || pr.merged_at) {
      await env.DB.prepare('UPDATE prs SET state = ?, updated = ? WHERE n = ?').bind(pr.merged_at ? 'merged' : 'closed', now, row.n).run();
      row = null;
    }
  }
  if (!row) {
    let n;
    try {
      n = await env.DB.prepare('INSERT INTO prs (key, email, who, created, updated) VALUES (?, ?, ?, ?, ?) RETURNING n')
        .bind(key, user.email, who, now, now).first('n');
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return fail(409, 'stale');
      throw e;
    }
    row = { n, branch: `panel-${n}`, number: null };
    await env.DB.prepare('UPDATE prs SET branch = ? WHERE n = ?').bind(row.branch, n).run();
  }

  const { branch } = row;
  const fresh = !row.number;
  const preview = previewUrl(env, branch);
  let subject;
  let number = row.number;
  let sha;
  try {
    sha = await commitFiles(env, (head) => (spec.build ?? mergeBuild)(head, c), async (head) => {
      subject = await spec.subject(c.merged, { env, head, id });
      return `${subject}\n\nFrom the coach panel (${who}).`;
    }, { branch, create: fresh });
    if (fresh) {
      const body = `From the coach panel (${who}).${preview ? `\n\nPreview: ${preview}` : ''}`;
      try {
        ({ number } = await openPull(env, { title: subject, head: branch, body }));
      } catch (e) {
        await deleteBranch(env, branch);
        throw e;
      }
    }
  } finally {
    // A first save that didn't get its PR must not keep the key blocked.
    if (!number) await env.DB.prepare('DELETE FROM prs WHERE n = ?').bind(row.n).run();
  }

  await env.DB.prepare(`UPDATE prs SET number = ?, head_sha = ?, state = 'checks', step = NULL, updated = ?,
    saves = saves + ?, title = COALESCE(title, ?) WHERE n = ?`).bind(number, sha, now, fresh ? 0 : 1, subject, row.n).run();
  // status 'pr': the Phase 5 sweep polls push runs on main only for 'pending' rows.
  await env.DB.prepare("INSERT INTO edits (sha, email, coach_id, op, created, status) VALUES (?, ?, ?, ?, ?, 'pr')")
    .bind(sha, user.email, spec.coach(id), op, now).run();
  return json({ sha, pr: number, branch, preview, state: 'checks', ...c.out });
}));

route('POST', '/translate', guard(async ({ env, user, body }) => {
  if (!env.ANTHROPIC_KEY) return fail(503, 'not_configured');
  const { source_lang, context = 'coach-bio', coach, fields } = body;
  if (!['coach-bio', 'schedule-note'].includes(context)) return invalid('unknown context');
  // Keys reach the prompt too: allowlist them, cap their number and count them in the size limit.
  const keys = fields && typeof fields === 'object' && !Array.isArray(fields) ? Object.keys(fields) : [];
  if (keys.length > MAX_TRANSLATE_FIELDS) return invalid('too many fields');
  const bad = keys.find((k) => !TRANSLATE_KEYS[context].test(k) || typeof fields[k] !== 'string');
  if (bad !== undefined) return invalid(`field ${JSON.stringify(bad.slice(0, 40))} cannot be translated`);
  if (keys.reduce((n, k) => n + k.length + fields[k].length, 0) > MAX_CHARS) return invalid('text too long');
  try { buildPrompt({ fields, context }); } catch (e) { return invalid(e.message); }
  if (coach !== undefined && !(await allowed(env, user, 'coach.text', { coach }))) return fail(403, 'forbidden');
  if ((await take(env, user.email, new Date().toISOString().slice(0, 10), 'translate')) > TRANSLATES_PER_DAY) return fail(429, 'rate_limited');
  const src = LANGS.includes(source_lang) ? source_lang : detectLang(Object.values(fields).join(' '));
  // The prompt names the coach so the model writes about them; the slug would read as a word.
  const name = coach === undefined ? undefined : (await readJson(env, coachPath(coach)))?.data?.name;
  const glossary = (await readJson(env, 'content/glossary.json'))?.data ?? {};
  try {
    return json(await translate(env, { glossary, source_lang: src, fields, context, coach: name?.[src] || name?.en }, env.__fetch ?? fetch));
  } catch (e) {
    if (e.message === 'not_configured') return fail(503, 'not_configured');
    return fail(502, 'translate', e.message === 'translation incomplete' ? e.message : undefined);
  }
}));
