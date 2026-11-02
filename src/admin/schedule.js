// Weekly sessions and one-off changes of one schedule file. No DOM access at import time (tested in Node).
import { api } from './api.js';
import { LANGS, t, uiLang } from './i18n.js';
import { jerusalemToday } from '../lib/schedule-changes.mjs';

const $ = (s, root = document) => root.querySelector(s);
const enc = encodeURIComponent;
const NEEDS_DATE = ['cancel', 'move'];

/** {day, start} of a session, plus the group that tells it apart from a class at the same day and time. */
export function sessionRef(s, sessions) {
  const ref = { day: s.day, start: s.start };
  const same = sessions.filter((x) => x.day === s.day && x.start === s.start);
  if (same.length > 1) {
    // same rule as findSession in src/lib/schedule-changes.mjs
    const g = [s.kind, s.audience].find((g) => g && same.filter((x) => x.kind === g || x.audience === g).length === 1);
    if (g) ref.group = g;
  }
  return ref;
}

/** Form values -> change.create fields (contract: docs/bot-content-contracts.md). */
export function changeBody(f) {
  const ses = f.day !== undefined && f.day !== '' && f.start ? { day: Number(f.day), start: f.start, ...(f.group ? { group: f.group } : {}) } : undefined;
  const nw = f.new && Object.fromEntries(Object.entries(f.new).filter(([, v]) => v));
  const from = f.type === 'extra' ? nw?.date : f.date;
  const to = f.type === 'cancel' || f.type === 'note' ? f.to || from : from;
  return {
    type: f.type,
    from,
    to,
    ...(f.type !== 'note' && ses ? { session: ses } : {}),
    ...(f.type === 'move' || f.type === 'extra' ? { new: nw } : {}),
    note: f.note,
  };
}

const weekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const fallsOn = (from, to, day) => {
  for (let d = from, i = 0; d <= (to || from) && i < 7; i++, d = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10)) if (weekday(d) === day) return true;
  return false;
};

let C; // ctx from app.js: {id, watch, status, busy, fail, applyT}
let D; // {sc, sha, venues, changes}

const label = (o, fallback = '') => o?.[uiLang()] || o?.ru || fallback;
// keeps the chosen value, so a relabel on language change loses nothing
function opts(sel, pairs, blank) {
  const keep = sel.value;
  sel.replaceChildren(...(blank ? [new Option('—', '')] : []), ...pairs.map(([v, text]) => new Option(text, v)));
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
const days = () => D.sc.days[uiLang()] ?? D.sc.days.ru;
const kindText = (k) => label(D.sc.kinds?.[k], k === 'regular' ? t('kindRegular') : k);
const sesText = (s) => [`${days()[s.day] ?? s.day} ${s.start}`, label(D.venues[s.venue], s.venue), label(D.sc.kinds?.[s.kind]), label(D.sc.audiences?.[s.audience])].filter(Boolean).join(' · ');
const dayBox = (d) => $(`#ses-rows .day[data-day="${d}"]`);
const field = (row, n) => $(`[name="${n}"]`, row);

function rowOpts(row) {
  opts(field(row, 'day'), days().map((d, i) => [i, d]));
  opts(field(row, 'venue'), Object.keys(D.venues).map((k) => [k, label(D.venues[k], k)]));
  opts(field(row, 'kind'), Object.keys(D.sc.kinds ?? {}).map((k) => [k, kindText(k)]));
}

function rowSum(row) {
  const f = (n) => field(row, n).value;
  const grades = f('g0') && `${f('g0')}–${f('g1')}`.replace(/–$/, '+');
  const group = label(D.sc.kinds?.[f('kind')]) || label(D.sc.audiences?.[row.orig.audience]) || grades;
  $('summary', row).textContent = [`${f('start')}–${f('end')}`, label(D.venues[f('venue')], f('venue')), group].filter(Boolean).join(' · ');
}

function daySum(d) {
  const box = dayBox(d);
  $('summary', box).textContent = `${days()[d]} (${box.querySelectorAll('.ses').length})`;
}

// order = index in the file, so grouping by day never reorders the saved sessions
function addRow(s = {}, order = 1e9) {
  const row = $('#ses-row').content.firstElementChild.cloneNode(true);
  C.applyT(row);
  Object.assign(row, { orig: s, order });
  rowOpts(row);
  const set = (n, v) => (field(row, n).value = v ?? '');
  set('day', s.day ?? 0);
  for (const n of ['start', 'end', 'venue', 'kind']) if (s[n]) set(n, s[n]);
  set('g0', s.grades?.[0]);
  set('g1', s.grades?.[1]);
  rowSum(row);
  row.addEventListener('input', () => rowSum(row));
  field(row, 'day').addEventListener('change', (e) => {
    const from = row.closest('.day').dataset.day;
    $('.list', dayBox(e.target.value)).append(row);
    daySum(from);
    daySum(e.target.value);
  });
  $('.rm', row).addEventListener('click', () => {
    const d = row.closest('.day').dataset.day;
    row.remove();
    daySum(d);
  });
  $('.list', dayBox(s.day ?? 0)).append(row);
  return row;
}

function renderSessions() {
  // a reload after save keeps the days the coach had open
  const open = new Set([...$('#ses-rows').querySelectorAll('.day[open]')].map((x) => x.dataset.day));
  $('#ses-rows').replaceChildren(...days().map((_, d) => {
    const box = $('#ses-day').content.firstElementChild.cloneNode(true);
    C.applyT(box);
    box.dataset.day = d;
    box.open = open.has(String(d));
    $('.add', box).addEventListener('click', () => {
      addRow({ day: d }).open = true;
      daySum(d);
    });
    return box;
  }));
  (D.sc.sessions ?? []).forEach((s, i) => addRow(s, i));
  days().forEach((_, d) => daySum(d));
}

function collectSessions() {
  return [...$('#ses-rows').querySelectorAll('.ses')].sort((a, b) => a.order - b.order).map((row) => {
    const f = (n) => field(row, n).value;
    const num = (n) => (f(n) === '' ? null : Number(f(n)));
    // spread first keeps unknown keys (subgroup, audience, note) and the file's key order
    return { ...row.orig, day: Number(f('day')), venue: f('venue'), start: f('start'), end: f('end'), grades: num('g0') === null ? null : [num('g0'), num('g1')], kind: f('kind') };
  });
}

function changeRow({ data: c, sha }) {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.textContent = [t(`type.${c.type}`), c.from === c.to ? c.from : `${c.from} – ${c.to}`, label(c.note)].join(' · ');
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'rm', textContent: t('deleteChange') });
  b.addEventListener('click', () => {
    if (!confirm(t('deleteConfirm'))) return;
    C.busy(b, async () => {
      const r = await api('POST', '/save', { op: 'change.delete', id: C.id, base_sha: sha, fields: { change_id: c.id } });
      C.watch(r);
      await loadChanges();
    }).catch(C.fail);
  });
  li.append(span, b);
  return li;
}

async function loadChanges() {
  const today = jerusalemToday();
  D.changes = (await api('GET', `/content/changes/${enc(C.id)}`)).changes.filter((f) => f.data.to >= today).sort((a, b) => a.data.from.localeCompare(b.data.from));
  renderChanges();
}

function renderChanges() {
  $('#chg-list').replaceChildren(...D.changes.map(changeRow));
  $('#chg-none').hidden = D.changes.length > 0;
}

function syncType() {
  const form = $('#chg-form');
  const type = form.elements.type.value;
  for (const el of form.querySelectorAll('[data-for]')) el.hidden = !el.dataset.for.split(' ').includes(type);
  opts(form.elements.ses, D.sc.sessions.map((s, i) => [i, sesText(s)]), type === 'extra');
}

function readChange() {
  const e = $('#chg-form').elements;
  const s = e.ses.value === '' ? null : D.sc.sessions[Number(e.ses.value)];
  const type = e.type.value;
  return {
    s,
    form: {
      type,
      date: e.date.value,
      to: e.to.value,
      ...(s && type !== 'note' ? sessionRef(s, D.sc.sessions) : {}),
      new: { date: e.new_date.value, start: e.new_start.value, end: e.new_end.value, venue: e.new_venue.value },
      note: Object.fromEntries(LANGS.map((l) => [l, e[`note.${l}`].value.trim()])),
    },
  };
}

function bindOnce(root) {
  if (root.dataset.ready) return;
  root.dataset.ready = '1';
  const form = $('#chg-form');
  // a required field inside a collapsed row would block submit with no visible hint
  $('#ses-form').addEventListener('invalid', (e) => {
    for (let d = e.target.closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
  }, true);
  $('#ses-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    C.status(t('saving'));
    C.busy($('#ses-save'), async () => {
      const r = await api('POST', '/save', { op: 'schedule.sessions', id: C.id, base_sha: D.sha, fields: { sessions: collectSessions() } });
      C.watch(r);
      await load();
    }).catch(C.fail);
  });
  form.addEventListener('change', (ev) => {
    if (ev.target.name === 'type') syncType();
    // a move starts from the class's own time and place
    if (ev.target.name === 'ses' && ev.target.value !== '') {
      const s = D.sc.sessions[Number(ev.target.value)];
      form.elements.new_start.value = s.start;
      form.elements.new_end.value = s.end;
      form.elements.new_venue.value = s.venue;
    }
  });
  form.addEventListener('input', (e) => delete e.target.closest('label')?.dataset.proposed);
  $('#chg-translate').addEventListener('click', (ev) => {
    const els = Object.fromEntries(LANGS.map((l) => [l, form.elements[`note.${l}`]]));
    const src = [uiLang(), ...LANGS].find((l) => els[l].value.trim());
    if (!src) return C.status(t('noText'), 'bad');
    C.status(t('translating'));
    C.busy(ev.currentTarget, async () => {
      const r = await api('POST', '/translate', { source_lang: src, context: 'schedule-note', coach: C.id, fields: { note: els[src].value } });
      for (const l of LANGS) {
        if (l === src || typeof r[l]?.note !== 'string') continue;
        els[l].value = r[l].note;
        els[l].closest('label').dataset.proposed = t('proposed');
      }
      C.status('');
    }).catch(C.fail);
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const { s, form: f } = readChange();
    if (LANGS.some((l) => !f.note[l])) return C.status(t('needNote'), 'bad');
    if (NEEDS_DATE.includes(f.type) && s && f.date && !fallsOn(f.date, f.type === 'cancel' ? f.to : '', s.day))
      return C.status(t('wrongDay', { day: D.sc.days[uiLang()]?.[s.day] ?? s.day }), 'bad');
    C.status(t('saving'));
    C.busy($('#chg-save'), async () => {
      const r = await api('POST', '/save', { op: 'change.create', id: C.id, fields: changeBody(f) });
      C.watch(r);
      form.reset();
      syncType();
      for (const lab of form.querySelectorAll('label[data-proposed]')) delete lab.dataset.proposed;
      await loadChanges();
    }).catch(C.fail);
  });
}

async function load() {
  const r = await api('GET', `/content/schedule/${enc(C.id)}`);
  D = { sc: r.data, sha: r.sha, venues: r.venues ?? {}, changes: [] };
  renderSessions();
  opts($('#chg-form').elements.new_venue, Object.keys(D.venues).map((k) => [k, label(D.venues[k], k)]));
  syncType();
  await loadChanges();
}

/** Loads the coach's schedule into #schedule; a coach without a schedule file leaves it hidden. */
export async function mountSchedule(root, ctx) {
  C = ctx;
  root.hidden = true;
  bindOnce(root);
  try {
    await load();
    root.hidden = false;
  } catch (e) {
    if (e?.code !== 'not_found') C.fail(e);
  }
}

/** Re-labels day/venue/group texts after a panel language change, keeping unsaved edits. */
export function relabelSchedule() {
  if (!D) return;
  for (const row of $('#ses-rows').querySelectorAll('.ses')) {
    rowOpts(row);
    rowSum(row);
  }
  days().forEach((_, d) => daySum(d));
  opts($('#chg-form').elements.new_venue, Object.keys(D.venues).map((k) => [k, label(D.venues[k], k)]));
  syncType();
  renderChanges();
}
