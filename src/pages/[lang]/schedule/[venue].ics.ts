import type { APIRoute } from 'astro';
import { getRelativeLocaleUrl } from 'astro:i18n';
import { LANGS, t, type Lang } from '../../../i18n/ui';
import { TODAY, schedules, venues } from '../../../lib/changes';
import { weeklyIcs } from '../../../lib/club-check.mjs';
import { gradeLabel } from '../../../lib/schedule-changes.mjs';

type V = keyof typeof venues;
const coaches = import.meta.glob<{ name: Record<Lang, string> }>('../../../../content/coaches/*.json', { eager: true, import: 'default' });
const sessions = Object.entries(schedules).flatMap(([id, sd]) => sd.sessions.map((s: any, i: number) => ({ id, i, sd, s })));

// one calendar per venue with its weekly classes, linked from the venue cards on the landing
export function getStaticPaths() {
  const used = [...new Set(sessions.map((x) => x.s.venue as V))];
  return LANGS.flatMap((lang) => used.map((venue) => ({ params: { lang, venue } })));
}

export const GET: APIRoute = ({ params, site }) => {
  const lang = params.lang as Lang, id = params.venue as V, v = venues[id];
  const events = sessions.filter((x) => x.s.venue === id).map(({ id: cid, i, sd, s }) => {
    const who = s.audience === 'adults' ? sd.audiences.adults[lang] : s.grades ? gradeLabel(s.grades, sd.grade_letters_he, lang) : '';
    const kind = sd.kinds[s.kind][lang];
    const coach = coaches[`../../../../content/coaches/${cid}.json`].name[lang];
    return { uid: `${cid}-${i}@unifight-haifa`, day: s.day, start: s.start, end: s.end, summary: [t(lang, 'siteName'), who, kind, coach].filter(Boolean).join(' · ') };
  });
  const body = weeklyIcs({
    name: `${t(lang, 'siteName')} · ${v[lang]}`,
    events,
    location: `${v[lang]}, ${v.address[lang]}`,
    url: new URL(`${getRelativeLocaleUrl(lang)}#v-${id}`, site).href,
    today: TODAY,
    stamp: new Date(),
  });
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
