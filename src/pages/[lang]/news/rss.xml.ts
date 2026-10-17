import type { APIRoute } from 'astro';
import { i18n } from 'astro:config/client';
import { getRelativeLocaleUrl } from 'astro:i18n';
import { t, type Lang } from '../../../i18n/ui';
import { getPosts, postPath } from '../../../lib/news';

export function getStaticPaths() {
  return i18n!.locales.map((lang) => ({ params: { lang } }));
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Lang;
  const abs = (path: string) => new URL(path, site).href;
  const items = (await getPosts()).map((p) => {
    const d = p.lang[lang].data;
    const url = abs(postPath(lang, p.slug));
    return `<item><title>${esc(d.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${d.date.toUTCString()}</pubDate><description>${esc(d.summary)}</description></item>`;
  });
  const title = `${t(lang, 'newsTitle')} · ${t(lang, 'siteName')}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(title)}</title><link>${abs(getRelativeLocaleUrl(lang, 'news/'))}</link><description>${esc(title)}</description><language>${lang}</language>${items.join('')}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
