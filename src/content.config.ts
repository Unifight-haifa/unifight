import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import consent from '../content/consent.json';
import gallery from '../content/gallery.json';
import history from '../content/history.json';
import site from '../content/site.json';
import techniques from '../content/techniques.json';
import videos from '../content/videos.json';
import { checkGallery } from './lib/gallery-check.mjs';
import { checkConsent, checkFacts, checkTranslations, factLists } from './lib/integrity.mjs';
import { checkNews } from './lib/news-check.mjs';
import { checkTechniques } from './lib/techniques-check.mjs';
import { checkVideos } from './lib/videos-check.mjs';

checkNews(new URL('./content/news/', import.meta.url));
checkVideos(videos, new URL('../public/videos/', import.meta.url));
checkGallery(gallery, new URL('./assets/gallery/', import.meta.url));
checkTechniques(techniques);
const content = import.meta.glob<unknown>('../content/**/*.json', { eager: true, import: 'default' });
for (const [p, o] of Object.entries(content)) checkTranslations(o, p.slice(3));
const tournaments = Object.fromEntries(Object.entries(content).filter(([p]) => p.includes('/tournaments/')).map(([p, t]) => [p.split('/').pop()!.slice(0, -5), t]));
checkFacts(factLists({ site, history, tournaments }));
checkConsent(consent, { minorEntries: site.achievements.highlights.filter((h) => 'minor' in h) });

const news = defineCollection({
  loader: glob({
    pattern: '*/index.{he,ru,en}.md',
    base: './src/content/news',
    // 2026-10-17-new-website/index.he.md -> new-website/he
    generateId: ({ entry }) => entry.replace(/^\d{4}-\d{2}-\d{2}-([^/]+)\/index\.(\w+)\.md$/, '$1/$2'),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      summary: z.string().min(1).max(160),
      date: z.coerce.date(),
      author: z.string(),
      cover: image(),
      cover_alt: z.string().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { news };
