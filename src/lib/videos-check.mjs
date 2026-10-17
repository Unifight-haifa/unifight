import { existsSync } from 'node:fs';

const LANGS = ['he', 'ru', 'en'];
const KINDS = ['video', 'short'];
export const PLAYLISTS = ['promo', 'competitions', 'camps', 'training', 'events'];
const ID = /^[A-Za-z0-9_-]{11}$/;

// content/videos.json is edited by hand; a typo must fail the build rather than ship a broken card.
export function checkVideos(videos, thumbDir) {
  if (!Array.isArray(videos)) throw new Error('videos.json must be an array');
  const ids = new Set();
  for (const [i, v] of videos.entries()) {
    const at = `videos.json[${i}]`;
    if (!ID.test(v.id ?? '')) throw new Error(`${at}: id "${v.id}" is not a YouTube video id`);
    if (ids.has(v.id)) throw new Error(`${at}: id ${v.id} is listed twice`);
    ids.add(v.id);
    if (!KINDS.includes(v.kind)) throw new Error(`${at}: kind must be one of ${KINDS.join(', ')}`);
    if (!PLAYLISTS.includes(v.playlist)) throw new Error(`${at}: playlist must be one of ${PLAYLISTS.join(', ')}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date ?? '') || Number.isNaN(Date.parse(v.date))) throw new Error(`${at}: date must be YYYY-MM-DD`);
    if (v.duration !== undefined && !(Number.isInteger(v.duration) && v.duration > 0)) throw new Error(`${at}: duration must be whole seconds`);
    for (const f of ['title', 'description']) {
      for (const l of LANGS) {
        if (typeof v[f]?.[l] !== 'string' || !v[f][l].trim()) throw new Error(`${at}: ${f}.${l} is missing`);
      }
    }
    if (!/^[\w.-]+\.(jpe?g|png|webp)$/i.test(v.thumb ?? '')) throw new Error(`${at}: thumb must be a file name in public/videos/`);
    if (!existsSync(new URL(v.thumb, thumbDir))) throw new Error(`${at}: public/videos/${v.thumb} not found`);
  }
}
