import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { checkNews } from './lib/news-check.mjs';

checkNews(new URL('./content/news/', import.meta.url));

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
