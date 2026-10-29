const LANGS = ['he', 'ru', 'en'];
// "confirmed" already covers owner-provided facts (site.json confidence_legend); "owner" is the explicit form
export const PUBLISHED = ['confirmed', 'owner'];
const CONFIDENCE = [...PUBLISHED, 'likely', 'unverified'];
export const DISCIPLINES = ['judo', 'sumo'];
export const LEVELS = ['olympics', 'world', 'europe', 'israel'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const published = (items) => items.filter((i) => PUBLISHED.includes(i.confidence));

// The nivheret is the club's own squad; calling it Israel's national team is the one mistake we never ship.
export const BANNED = /сборн[а-яё]* израиля|israel(?:'s|i)? national (?:judo )?team|national team of israel|נבחרת ישראל/i;
export const NIVHERET = /нивхерет|nivheret|נבחרת המועדון|сборн[а-яё]* клуба|selected team/i;

const text = (o, at, f) => {
  for (const l of LANGS) if (typeof o?.[l] !== 'string' || !o[l].trim()) throw new Error(`${at}: ${f}.${l} is missing`);
};
const optText = (o, at, f) => o[f] === undefined || text(o[f], at, f);
const url = (u, at, f) => {
  if (!/^https:\/\/\S+$/.test(u ?? '')) throw new Error(`${at}: ${f} must be an https URL`);
};

function sourced(e, at) {
  if (!CONFIDENCE.includes(e.confidence)) throw new Error(`${at}: confidence must be one of ${CONFIDENCE.join(', ')}`);
  if (!Array.isArray(e.sources) || !e.sources.length) throw new Error(`${at}: sources are missing`);
  for (const s of e.sources) if (typeof s !== 'string' || !s.trim()) throw new Error(`${at}: empty source`);
}

// content/tournaments/<slug>.json is edited by hand; a typo must fail the build, not ship a broken page.
export function checkTournament(t, slug, { videoIds = [], photos = [] } = {}) {
  const at = `tournaments/${slug}.json`;
  if (!SLUG.test(slug)) throw new Error(`${at}: file name must be a lowercase slug`);
  if (!DISCIPLINES.includes(t.discipline)) throw new Error(`${at}: discipline must be one of ${DISCIPLINES.join(', ')}`);
  for (const f of ['date', 'end']) {
    if (f === 'end' && t.end === undefined) continue;
    if (!DATE.test(t[f] ?? '') || Number.isNaN(Date.parse(t[f]))) throw new Error(`${at}: ${f} must be YYYY-MM-DD`);
  }
  if (t.end && t.end < t.date) throw new Error(`${at}: end is before date`);
  text(t.name, at, 'name');
  text(t.venue, at, 'venue');
  text(t.summary, at, 'summary');
  for (const f of ['role', 'categories', 'weigh_in', 'address']) optText(t, at, f);
  for (const f of ['regulations', 'registration']) if (t[f] !== undefined) url(t[f], at, f);
  for (const [i, r] of (t.results ?? []).entries()) text(r, at, `results[${i}]`);
  for (const id of t.videos ?? []) if (!videoIds.includes(id)) throw new Error(`${at}: video ${id} is not in content/videos.json`);
  for (const p of t.photos ?? []) {
    if (!photos.includes(p.src)) throw new Error(`${at}: photo ${p.src} is not in src/assets/club/`);
    text(p.alt, at, 'photos.alt');
  }
  sourced(t, at);
}

export function checkEntries(list, name, required) {
  if (!Array.isArray(list)) throw new Error(`${name} must be an array`);
  for (const [i, e] of list.entries()) {
    const at = `${name}[${i}]`;
    for (const f of required) text(e[f], at, f);
    sourced(e, at);
  }
}

// Israel time decides the day, so an event stays "upcoming" until its last day is over there.
export function isUpcoming(end, now) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
  return end >= today;
}

export const lastDay = (t) => t.end ?? t.date;

export function splitEvents(events, now) {
  const up = events.filter((t) => isUpcoming(lastDay(t), now)).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((t) => !up.includes(t)).sort((a, b) => b.date.localeCompare(a.date));
  const years = [...new Set(past.map((t) => t.date.slice(0, 4)))].map((y) => [y, past.filter((t) => t.date.startsWith(y))]);
  return { upcoming: up, years };
}

// RFC 5545: escape text, CRLF lines folded at 75 octets
const icsText = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
    }
    cur += ch;
  }
  return [...out, cur].join('\r\n ');
}
const day = (d) => d.replaceAll('-', '');
const nextDay = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);

export function ics({ uid, name, date, end, location, url, stamp }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Unifight Haifa//Tournaments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;VALUE=DATE:${day(date)}`,
    // all-day DTEND is exclusive
    `DTEND;VALUE=DATE:${day(nextDay(end ?? date))}`,
    `SUMMARY:${icsText(name)}`,
    `LOCATION:${icsText(location)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

// Israel's DST rules as tzdata publishes them: from the Friday before the last Sunday of March to the last Sunday of October
const JERUSALEM = [
  'BEGIN:VTIMEZONE', 'TZID:Asia/Jerusalem',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0300', 'TZNAME:IDT', 'DTSTART:19700327T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=23,24,25,26,27,28,29;BYDAY=FR', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0200', 'TZNAME:IST', 'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Weekly classes in Israel time; each starts on its first weekday on or after `today` (YYYY-MM-DD). */
export function weeklyIcs({ name, events, location, url, today, stamp }) {
  const t0 = Date.parse(`${today}T00:00:00Z`);
  const first = (d) => day(new Date(t0 + ((d - new Date(t0).getUTCDay() + 7) % 7) * 864e5).toISOString().slice(0, 10));
  const at = (d, hm) => `${first(d)}T${hm.replace(':', '')}00`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Unifight Haifa//Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`, 'X-WR-TIMEZONE:Asia/Jerusalem', ...JERUSALEM,
    ...events.flatMap((e) => [
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
      `DTSTART;TZID=Asia/Jerusalem:${at(e.day, e.start)}`,
      `DTEND;TZID=Asia/Jerusalem:${at(e.day, e.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[e.day]}`,
      `SUMMARY:${icsText(e.summary)}`,
      `LOCATION:${icsText(location)}`,
      `URL:${url}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

// Hebrew pages: isolate numbers and Latin runs so bidi can't reorder them (same rule as scripts/landing/build.py)
const BIDI = /([A-Za-z][A-Za-z0-9'’-]*(?:[ .][A-Za-z0-9][A-Za-z0-9'’-]*)*)|((?<!\w)[-+~]?\d+(?:[.,:/]\d+)*(?:(?:\s?[–-]\s?|,\s)\d+(?:[.,:/]\d+)*)*\+?)/g;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function bidi(lang, s) {
  if (lang !== 'he') return esc(s);
  let out = '';
  let i = 0;
  for (const m of s.matchAll(BIDI)) {
    out += `${esc(s.slice(i, m.index))}<bdi dir="ltr">${esc(m[0])}</bdi>`;
    i = m.index + m[0].length;
  }
  return out + esc(s.slice(i));
}
