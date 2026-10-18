import type { APIRoute } from 'astro';
import gallery from '../../content/gallery.json';

// polled by the bot until its upload's "source" (the incoming file name without extension) shows up
export const GET: APIRoute = () =>
  Response.json(gallery.flatMap((a) => a.photos.map((p) => ({ album: a.id, file: p.file, source: (p as { source?: string }).source ?? null }))));
