import type { APIRoute } from 'astro';
import social from '../../content/social.json';
import { LANGS, t } from '../i18n/ui';
import { authorName, getPosts, ogCover, postPath } from '../lib/news';
import { socialTexts } from '../lib/social.mjs';

// JSON Feed 1.1, one item per post and language; _unifight carries what n8n needs to share a post
export const GET: APIRoute = async ({ site }) => {
  const abs = (path: string) => new URL(path, site).href;
  const items = [];
  for (const p of await getPosts()) {
    const image = abs((await ogCover(p.lang.he)).src);
    for (const l of LANGS) {
      const e = p.lang[l];
      const url = abs(postPath(l, p.slug));
      const share = socialTexts({ title: e.data.title, body: e.body ?? '', url, hashtags: social.hashtags[l], linkInBio: social.link_in_bio[l] });
      items.push({
        id: url,
        url,
        title: e.data.title,
        summary: e.data.summary,
        content_text: e.data.summary,
        image,
        date_published: p.date.toISOString(),
        language: l,
        authors: [{ name: authorName(p.author, l) }],
        _unifight: { slug: p.slug, coach: p.author, share_text: share.whatsapp },
      });
    }
  }
  return Response.json({
    version: 'https://jsonfeed.org/version/1.1',
    title: t('en', 'siteName'),
    home_page_url: abs(import.meta.env.BASE_URL),
    feed_url: abs(`${import.meta.env.BASE_URL}feed.json`),
    items,
  });
};
