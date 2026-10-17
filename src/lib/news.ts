import { getImage } from 'astro:assets';
import { getCollection, type CollectionEntry } from 'astro:content';
import { getRelativeLocaleUrl } from 'astro:i18n';
import { LANGS, type Lang } from '../i18n/ui';

type Entry = CollectionEntry<'news'>;
export type Post = { slug: string; date: Date; author: string; lang: Record<Lang, Entry> };

const coaches = import.meta.glob<{ name: Record<Lang, string> }>('../../content/coaches/*.json', {
  eager: true,
  import: 'default',
});

export function authorName(id: string, lang: Lang) {
  const c = coaches[`../../content/coaches/${id}.json`];
  if (!c) throw new Error(`news: unknown author "${id}", expected content/coaches/${id}.json`);
  return c.name[lang];
}

// drafts never ship; SHOW_DRAFTS=1 previews them in dev only
const showDrafts = import.meta.env.DEV && process.env.SHOW_DRAFTS === '1';

export async function getPosts(): Promise<Post[]> {
  const bySlug = new Map<string, Partial<Record<Lang, Entry>>>();
  for (const e of await getCollection('news')) {
    const [slug, l] = e.id.split('/') as [string, Lang];
    bySlug.set(slug, { ...bySlug.get(slug), [l]: e });
  }
  return [...bySlug]
    .map(([slug, lang]) => ({ slug, lang: lang as Record<Lang, Entry> }))
    .filter((p) => showDrafts || !LANGS.some((l) => p.lang[l].data.draft))
    .map((p) => ({ ...p, date: p.lang.he.data.date, author: p.lang.he.data.author }))
    .sort((a, b) => b.date.getTime() - a.date.getTime() || a.slug.localeCompare(b.slug));
}

// one rendition for og:image and news.json; capped at source width since the encoder never
// upscales and og:image:width must match the file
export const ogCover = ({ data: { cover } }: Entry) =>
  getImage({ src: cover, width: Math.min(1200, cover.width), format: 'jpeg', quality: 80 });

export const postPath = (lang: Lang, slug: string) => getRelativeLocaleUrl(lang, `news/${slug}/`);

const LOCALE = { he: 'he-IL', ru: 'ru-RU', en: 'en-GB' };
export const fmtDate = (d: Date, lang: Lang) =>
  new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'long', timeZone: 'UTC' }).format(d);
