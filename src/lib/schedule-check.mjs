// Weekly sessions of content/schedule/<id>.json, checked before the admin Worker commits them.
// Plain ESM without imports so the Worker bundles it; rules match what scripts/landing/build.py reads.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const KEYS = ['day', 'venue', 'start', 'end', 'grades', 'kind', 'subgroup', 'audience', 'note'];
const MAX = 80;

const has = (o, k) => !!o && typeof o === 'object' && typeof k === 'string' && Object.hasOwn(o, k);
const grade = (g) => Number.isInteger(g) && g >= 0 && g <= 12;

/** Throws `${at}.sessions[i]: reason` on the first bad session. */
export function checkSchedule(sc, venues, at = 'schedule') {
  const ss = sc?.sessions;
  if (!Array.isArray(ss) || !ss.length) throw new Error(`${at}.sessions: needs at least one session`);
  if (ss.length > MAX) throw new Error(`${at}.sessions: ${ss.length} sessions, more than ${MAX}`);
  ss.forEach((s, i) => {
    const bad = (why) => { throw new Error(`${at}.sessions[${i}]: ${why}`); };
    if (!s || typeof s !== 'object' || Array.isArray(s)) bad('must be an object');
    const extra = Object.keys(s).find((k) => !KEYS.includes(k));
    if (extra) bad(`unknown field ${JSON.stringify(extra)}`);
    // 6 is Saturday: the site has no Saturday classes
    if (!Number.isInteger(s.day) || s.day < 0 || s.day > 5) bad('day must be 0-5 (Sunday-Friday)');
    if (typeof s.start !== 'string' || !TIME.test(s.start)) bad('start must be HH:MM');
    if (typeof s.end !== 'string' || !TIME.test(s.end) || s.end <= s.start) bad('end must be HH:MM after start');
    if (!has(venues, s.venue)) bad(`unknown venue ${JSON.stringify(s.venue)}`);
    if (!has(sc.kinds, s.kind)) bad(`unknown kind ${JSON.stringify(s.kind)}`);
    if (s.audience !== undefined && !has(sc.audiences, s.audience)) bad(`unknown audience ${JSON.stringify(s.audience)}`);
    // null grades: adults and the Olympic class; [a, null] reads "grade a and up"
    const g = s.grades;
    if (g !== null && !(Array.isArray(g) && g.length === 2 && grade(g[0]) && (g[1] === null || (grade(g[1]) && g[0] <= g[1]))))
      bad('grades must be null or [from, to] with grades 0-12, to null or not below from');
    if (s.subgroup !== undefined && !(Number.isInteger(s.subgroup) && s.subgroup > 0)) bad('subgroup must be a positive integer');
    if (s.note !== undefined && !['he', 'ru', 'en'].every((l) => typeof s.note?.[l] === 'string')) bad('note needs he, ru and en text');
  });
}
