import type { APIRoute } from 'astro';
import { getRelativeLocaleUrl } from 'astro:i18n';
import { LANGS } from '../i18n/ui';
import { getPosts } from '../lib/news';

// indexable pages only; test/seo.test.mjs fails if a built page is missing or a noindex one sneaks in
export const GET: APIRoute = async ({ site }) => {
  const abs = (path: string) => new URL(path, site).href;
  const paths = ['', 'news/', 'video/', 'privacy/', 'accessibility/', ...(await getPosts()).map((p) => `news/${p.slug}/`)];
  const urls = paths.flatMap((path) => {
    const alts = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${abs(getRelativeLocaleUrl(l, path))}"/>`);
    if (!path) alts.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${abs(import.meta.env.BASE_URL)}"/>`);
    return LANGS.map((l) => `<url><loc>${abs(getRelativeLocaleUrl(l, path))}</loc>${alts.join('')}</url>`);
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
