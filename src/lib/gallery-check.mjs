import { existsSync } from 'node:fs';

const LANGS = ['he', 'ru', 'en'];
const ID = /^[a-z][a-z0-9-]*$/;

const text = (o, at) => {
  for (const l of LANGS) if (typeof o?.[l] !== 'string' || !o[l].trim()) throw new Error(`${at}.${l} is missing`);
};

// content/gallery.json is edited by hand; a typo must fail the build rather than ship a broken photo.
export function checkGallery(albums, dir) {
  if (!Array.isArray(albums) || !albums.length) throw new Error('gallery.json must be a non-empty array');
  const ids = new Set();
  const files = new Set();
  for (const [i, a] of albums.entries()) {
    const at = `gallery.json[${i}]`;
    if (!ID.test(a.id ?? '')) throw new Error(`${at}: id "${a.id}" must be lowercase letters, digits and dashes`);
    if (ids.has(a.id)) throw new Error(`${at}: album ${a.id} is listed twice`);
    ids.add(a.id);
    text(a.title, `${at}: title`);
    if (a.description !== undefined) text(a.description, `${at}: description`);
    if (!Array.isArray(a.photos) || !a.photos.length) throw new Error(`${at}: photos must be a non-empty array`);
    for (const [j, p] of a.photos.entries()) {
      const pat = `${at}.photos[${j}]`;
      if (!new RegExp(`^${a.id}/[\\w.-]+\\.jpe?g$`, 'i').test(p.file ?? '')) throw new Error(`${pat}: file must be ${a.id}/<name>.jpg`);
      if (files.has(p.file)) throw new Error(`${pat}: ${p.file} is listed twice`);
      files.add(p.file);
      if (!existsSync(new URL(p.file, dir))) throw new Error(`${pat}: src/assets/gallery/${p.file} not found`);
      text(p.alt, `${pat}: alt`);
      if (p.caption !== undefined) text(p.caption, `${pat}: caption`);
      if (p.year !== undefined && !(Number.isInteger(p.year) && p.year > 1950 && p.year < 2100)) throw new Error(`${pat}: year must be a four-digit year`);
      if (p.featured !== undefined && typeof p.featured !== 'boolean') throw new Error(`${pat}: featured must be true or false`);
    }
  }
  if (!albums.some((a) => a.photos.some((p) => p.featured))) throw new Error('gallery.json: mark at least one photo featured (it becomes the share image)');
}
