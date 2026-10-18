import type { ImageMetadata } from 'astro';
import { getRelativeLocaleUrl } from 'astro:i18n';
import site from '../../content/site.json';
import achievementsData from '../../content/achievements.json';
import historyData from '../../content/history.json';
import nivheret from '../../content/nivheret.json';
import schedule from '../../content/schedule/natanel-zhurovel.json';
import videos from '../../content/videos.json';
import type { Lang } from '../i18n/ui';
import { BANNED, LEVELS, checkEntries, checkTournament, published } from './club-check.mjs';

export type T = Record<Lang, string>;
type Sourced = { sources: string[]; confidence: string };
export type Tournament = Sourced & {
  slug: string;
  discipline: 'judo' | 'sumo';
  date: string;
  end?: string;
  name: T;
  venue: T;
  summary: T;
  role?: T;
  address?: T;
  categories?: T;
  weigh_in?: T;
  participants?: string;
  regulations?: string;
  registration?: string;
  results?: T[];
  photos?: { src: string; alt: T }[];
  videos?: string[];
};

const imgs = import.meta.glob<ImageMetadata>('../assets/club/*.jpg', { eager: true, import: 'default' });
export const photo = (name: string) => {
  const m = imgs[`../assets/club/${name}`];
  if (!m) throw new Error(`club: src/assets/club/${name} not found`);
  return m;
};
const photoNames = Object.keys(imgs).map((k) => k.split('/').pop()!);

const files = import.meta.glob<Omit<Tournament, 'slug'>>('../../content/tournaments/*.json', { eager: true, import: 'default' });
const all: Tournament[] = Object.entries(files).map(([p, t]) => {
  const slug = p.split('/').pop()!.replace(/\.json$/, '');
  checkTournament(t, slug, { videoIds: videos.map((v) => v.id), photos: photoNames });
  return { ...t, slug };
});
export const tournaments = published(all) as Tournament[];

type Card = Sourced & { id: string; level: string; years: number[]; year: string; title: T; detail?: T; photo?: string; alt?: T; photo_source?: string };
const known = new Map<string, Record<string, unknown>>(
  [...site.achievements.highlights, ...site.achievements.more_results.map((m) => ({ ...m, title: m.text }))].map((h) => [h.id, h]),
);
const cards = achievementsData.items.map((a) => ({ ...known.get(a.id), ...a }) as unknown as Card);
checkEntries(cards, 'achievements', ['title']);
for (const c of cards) {
  if (!LEVELS.includes(c.level)) throw new Error(`achievements ${c.id}: level must be one of ${LEVELS.join(', ')}`);
  if (!c.years?.length || !c.years.every(Number.isInteger)) throw new Error(`achievements ${c.id}: years must be whole years`);
  // a named card with someone else's photo misleads, so every photo states why it matches
  if (!c.photo) continue;
  if (!c.photo_source?.trim()) throw new Error(`achievements ${c.id}: photo needs a photo_source saying why it shows this athlete or event`);
  checkEntries([{ ...c }], `achievements ${c.id}`, ['alt']);
  photo(c.photo);
}
export const achievements = (published(cards) as Card[]).sort((a, b) => Math.max(...b.years) - Math.max(...a.years));

type Item = Sourced & { year?: string; sort?: string; when?: T; title: T; text: T };
// site.json history items carry a single `source`; normalise to `sources`
const siteItems = site.history.items.map((i) => ({ ...i, sources: 'sources' in i ? i.sources : [i.source] })) as Item[];
const items = [...siteItems, ...(historyData.items as Item[])];
checkEntries(items, 'history', ['title', 'text']);
export const history = (published(items) as Item[]).sort((a, b) => (a.sort ?? a.year!).localeCompare(b.sort ?? b.year!));

type Fact = Sourced & { label: T; value: T | string; href?: string };
checkEntries(historyData.about.facts, 'history.about', ['label']);
export const about = { ...historyData.about, facts: published(historyData.about.facts) as Fact[] };

if (BANNED.test(JSON.stringify(nivheret))) throw new Error('nivheret.json: the nivheret is the club team, not a national team');
export const nivheretSlots = schedule.sessions.filter((s) => s.kind === 'nivheret');
export { nivheret, schedule };

export const tournamentPath = (lang: Lang, slug: string) => getRelativeLocaleUrl(lang, `tournaments/${slug}/`);
export const tr = (o: T | string, lang: Lang) => (typeof o === 'string' ? o : o[lang]);
