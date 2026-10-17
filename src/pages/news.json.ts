import type { APIRoute } from 'astro';
import { LANGS, type Lang } from '../i18n/ui';
import { getPosts, ogCover, postPath } from '../lib/news';

// polled by the publishing workflow to confirm a post is live before announcing it
export const GET: APIRoute = async ({ site }) => {
  const abs = (path: string) => new URL(path, site).href;
  const by = <T>(f: (l: Lang) => T) => Object.fromEntries(LANGS.map((l) => [l, f(l)]));
  const posts = await Promise.all(
    (await getPosts()).map(async (p) => ({
      slug: p.slug,
      date: p.date.toISOString().slice(0, 10),
      author: p.author,
      url: by((l) => abs(postPath(l, p.slug))),
      title: by((l) => p.lang[l].data.title),
      summary: by((l) => p.lang[l].data.summary),
      cover: abs((await ogCover(p.lang.he)).src),
    })),
  );
  return Response.json(posts);
};
