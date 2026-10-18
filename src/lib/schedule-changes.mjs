// One-off schedule changes (content/schedule-changes/<id>.json, written by the n8n bot).
// Plain ESM so node --test can exercise it without Astro; contract: docs/bot-content-contracts.md
const LANGS = ['he', 'ru', 'en'];
const TYPES = ['cancel', 'move', 'extra', 'note'];
const ID = /^[a-z0-9][a-z0-9-]*$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// cancel/move show up this many days before `from`, as an announcement
export const ANNOUNCE_DAYS = 3;

const is = (x, re) => typeof x === 'string' && re.test(x);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const jerusalemToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);

// Runs in the browser before the schedule script, so a page built days ago still reverts on time.
export const GATE_JS = `(()=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(new Date());document.querySelectorAll('[data-from][data-to]').forEach(e=>{e.hidden=!(e.dataset.from<=d&&d<=e.dataset.to)})})();`;

function findSession(sc, s, at) {
  if (!Number.isInteger(s?.day) || s.day < 0 || s.day > 6 || !is(s.start, TIME) || (s.group !== undefined && typeof s.group !== 'string')) throw new Error(`${at}: session needs day (0-6) and start (HH:MM)`);
  const hits = sc.sessions.filter((x) => x.day === s.day && x.start === s.start && (!s.group || x.kind === s.group));
  if (hits.length !== 1) throw new Error(`${at}: ${hits.length ? 'several sessions match' : 'no session matches'} day ${s.day} ${s.start}${s.group ? ` group ${JSON.stringify(s.group)}` : ''}`);
  return hits[0];
}

/** entries: [fileName, parsed JSON][]; schedules: {id: schedule json}; venues: content/venues.json. Throws on the first bad file. */
export function checkChanges(entries, schedules, venues) {
  const out = [];
  for (const [file, c] of entries) {
    const at = `schedule-changes/${file}`;
    if (!is(c?.id, ID) || file !== `${c.id}.json`) throw new Error(`${at}: id must be lowercase letters, digits and dashes and match the file name`);
    if (typeof c.schedule !== 'string' || !Object.hasOwn(schedules, c.schedule)) throw new Error(`${at}: unknown schedule ${JSON.stringify(c.schedule)} (expected a file in content/schedule/)`);
    const sc = schedules[c.schedule];
    if (!TYPES.includes(c.type)) throw new Error(`${at}: type must be one of ${TYPES.join(', ')}`);
    if (!isDate(c.from) || !isDate(c.to)) throw new Error(`${at}: from and to must be YYYY-MM-DD dates`);
    if (c.to < c.from) throw new Error(`${at}: to (${c.to}) is before from (${c.from})`);
    for (const l of LANGS) if (typeof c.note?.[l] !== 'string' || !c.note[l].trim()) throw new Error(`${at}: note.${l} is missing`);
    if (typeof c.author !== 'string' || !c.author.trim()) throw new Error(`${at}: author is missing`);
    if (typeof c.created !== 'string' || isNaN(Date.parse(c.created))) throw new Error(`${at}: created must be an ISO timestamp`);
    const needs = { cancel: ['session'], move: ['session', 'new'], extra: ['new'], note: [] }[c.type];
    for (const k of ['session', 'new']) {
      const allowed = needs.includes(k) || (c.type === 'extra' && k === 'session');
      if (c[k] !== undefined && !allowed) throw new Error(`${at}: a ${c.type} change takes no ${k}`);
      if (c[k] === undefined && needs.includes(k)) throw new Error(`${at}: a ${c.type} change needs ${k}`);
    }
    // only validated fields go on: the file is bot input and ends up in HTML
    const r = { id: c.id, schedule: c.schedule, type: c.type, from: c.from, to: c.to, note: Object.fromEntries(LANGS.map((l) => [l, c.note[l]])), author: c.author, created: c.created };
    if (c.session !== undefined) {
      r.ses = findSession(sc, c.session, at);
      r.session = { day: c.session.day, start: c.session.start, ...(c.session.group ? { group: r.ses.kind } : {}) };
      const span = Math.min(6, (Date.parse(c.to) - Date.parse(c.from)) / 864e5);
      if (c.type !== 'extra' && !Array.from({ length: span + 1 }, (_, i) => weekday(addDays(c.from, i))).includes(c.session.day))
        throw new Error(`${at}: no day between ${c.from} and ${c.to} falls on weekday ${c.session.day}`);
    }
    if (c.new !== undefined) {
      const d = { venue: r.ses?.venue, start: r.ses?.start, end: r.ses?.end };
      const n = { date: c.new?.date, venue: c.new?.venue ?? d.venue, start: c.new?.start ?? d.start, end: c.new?.end ?? d.end };
      if (!isDate(n.date)) throw new Error(`${at}: new.date must be a YYYY-MM-DD date`);
      if (weekday(n.date) === 6) throw new Error(`${at}: new.date ${n.date} is a Saturday, the schedule has no Saturday classes`);
      if (!is(n.start, TIME) || !is(n.end, TIME) || n.end <= n.start) throw new Error(`${at}: new.start and new.end must be HH:MM with end after start`);
      if (typeof n.venue !== 'string' || !Object.hasOwn(venues, n.venue)) throw new Error(`${at}: unknown venue ${JSON.stringify(n.venue)} (expected a key of content/venues.json)`);
      r.new = n;
    }
    out.push(r);
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id));
}

/** Non-expired changes with their display window [show, to]; show is earlier than from for announcements. */
export const activeChanges = (changes, today) =>
  changes.filter((c) => c.to >= today).map((c) => ({ ...c, show: c.type === 'cancel' || c.type === 'move' ? addDays(c.from, -ANNOUNCE_DAYS) : c.from }));

const UI = {
  title: { he: 'שינויים בלוח האימונים', ru: 'Изменения в расписании', en: 'Schedule changes' },
  cancel: { he: 'בוטל', ru: 'Отменено', en: 'Cancelled' },
  move: { he: 'הועבר', ru: 'Перенесено', en: 'Moved' },
  extra: { he: 'אימון נוסף', ru: 'Дополнительная тренировка', en: 'Extra class' },
  note: { he: 'לתשומת לבכם', ru: 'Обратите внимание', en: 'Note' },
};
const LOCALE = { he: 'he-IL', ru: 'ru-RU', en: 'en-GB' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ltr = (s) => `<bdi dir="ltr">${esc(s)}</bdi>`;
const fmtDay = (d, lang) => new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const range = (c, lang) => (c.from === c.to ? fmtDay(c.from, lang) : `${fmtDay(c.from, lang)} – ${fmtDay(c.to, lang)}`);
const gate = (c, today) => `data-from="${esc(c.show)}" data-to="${esc(c.to)}"${c.show <= today ? '' : ' hidden'}`;

// mirrors grade_label() in scripts/landing/build.py
function gradeLabel([a, b], letters, lang) {
  if (a === 0 && b === 0) return { he: 'גן', ru: 'Детский сад', en: 'Kindergarten' }[lang];
  if (b === null) return { he: `כיתות ${letters[a]} ומעלה`, ru: `${a} класс и старше`, en: `Grade ${a}+` }[lang];
  return { he: `כיתות ${letters[a]}–${letters[b]}`, ru: `${a}–${b} класс`, en: `Grades ${a}–${b}` }[lang];
}

/** One-line summary for the notice, the news rail and schedule-changes.json; t wraps times, e escapes text. */
export function summary(c, lang, venues, t = (x) => x, e = (x) => x) {
  const v = (id) => e(venues[id][lang]), d = (x) => e(fmtDay(x, lang));
  if (c.type === 'cancel') return `${UI.cancel[lang]}: ${e(range(c, lang))}, ${t(c.ses.start)} · ${v(c.ses.venue)}`;
  if (c.type === 'move') return `${UI.move[lang]}: ${d(c.from)} ${t(c.ses.start)} → ${d(c.new.date)} ${t(`${c.new.start}–${c.new.end}`)} · ${v(c.new.venue)}`;
  if (c.type === 'extra') return `${UI.extra[lang]}: ${d(c.new.date)} ${t(`${c.new.start}–${c.new.end}`)} · ${v(c.new.venue)}`;
  return `${UI.note[lang]}: ${e(range(c, lang))}`;
}

export const summaryHtml = (c, lang, venues) => summary(c, lang, venues, ltr, esc);

/**
 * HTML for the landing schedule: a notice list, badges inside the affected regular sessions
 * (keyed "<day>-<start>", the <!--SES …--> markers build.py writes) and extra cards per weekday.
 */
export function renderSchedule(changes, lang, today, schedules, venues, venueColor) {
  const sessions = {}, extras = {};
  const add = (o, k, h) => (o[k] = (o[k] ?? '') + h);
  const items = changes.map((c) => {
    const note = esc(c.note[lang]);
    if (c.ses && c.type !== 'extra') {
      const label = c.type === 'cancel' ? `${UI.cancel[lang]} · ${esc(range(c, lang))}` : `${UI.move[lang]} → ${esc(fmtDay(c.new.date, lang))} ${ltr(c.new.start)}`;
      add(sessions, `${c.ses.day}-${c.ses.start}`, `<span class="ses-chg chg-${esc(c.type)}" ${gate(c, today)}><b>${label}</b> ${note}</span>`);
    }
    if (c.new) {
      const s = c.ses, sc = schedules[c.schedule], [lo, hi] = s ? s.grades : [0, null];
      const badge = `${UI[c.type][lang]} · ${esc(fmtDay(c.new.date, lang))}`;
      add(extras, weekday(c.new.date),
        `<li class="ses ses-x" data-v="${esc(c.new.venue)}" data-g="${esc(`${lo}-${hi ?? 99}`)}" style="--vc:${esc(venueColor[c.new.venue] ?? 'var(--gold)')}" ${gate(c, today)}>` +
          `<span class="ses-time">${ltr(`${c.new.start}–${c.new.end}`)}</span><span class="ses-chg chg-new"><b>${badge}</b> ${note}</span>` +
          (s ? `<span class="ses-grade">${esc(gradeLabel(s.grades, sc.grade_letters_he, lang))}</span>` : '') +
          `<span class="ses-venue"><i aria-hidden="true"></i>${esc(venues[c.new.venue][lang])}</span></li>`);
    }
    return `<li id="chg-${esc(c.id)}" class="chg chg-${esc(c.type)}" ${gate(c, today)}><b>${summaryHtml(c, lang, venues)}</b> ${note}</li>`;
  });
  const notice = items.length ? `<section class="sc-chg" aria-labelledby="sc-chg-h"><h3 class="h4" id="sc-chg-h">${UI.title[lang]}</h3><ul>${items.join('')}</ul></section>` : '';
  return { notice, sessions, extras };
}

/** Puts renderSchedule() output into the markers; replacer functions so `$&` in bot text stays literal. */
export const fillSchedule = (body, { notice, sessions, extras }) =>
  body
    .replace('<!--SCHED_CHANGES-->', () => notice)
    .replace(/<!--SES_X (\d)-->/g, (_, d) => extras[d] ?? '')
    .replace(/<!--SES (\d-[\d:]+)-->/g, (_, k) => sessions[k] ?? '');
