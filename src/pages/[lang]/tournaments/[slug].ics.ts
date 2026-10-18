import type { APIRoute } from 'astro';
import { LANGS, type Lang } from '../../../i18n/ui';
import { tournamentPath, tournaments, type Tournament } from '../../../lib/club';
import { ics, isUpcoming, lastDay } from '../../../lib/club-check.mjs';

// TOUR-04: only events still ahead at build time get a calendar file
export function getStaticPaths() {
  const now = new Date();
  return LANGS.flatMap((lang) =>
    tournaments.filter((ev) => isUpcoming(lastDay(ev), now)).map((ev) => ({ params: { lang, slug: ev.slug }, props: { ev } })),
  );
}

export const GET: APIRoute = ({ params, props, site }) => {
  const lang = params.lang as Lang;
  const { ev } = props as { ev: Tournament };
  const body = ics({
    uid: `${ev.slug}@unifight-haifa`,
    name: ev.name[lang],
    date: ev.date,
    end: ev.end,
    location: ev.address ? `${ev.venue[lang]}, ${ev.address[lang]}` : ev.venue[lang],
    url: new URL(tournamentPath(lang, ev.slug), site).href,
    stamp: new Date(),
  });
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
