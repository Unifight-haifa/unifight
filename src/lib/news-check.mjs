import { existsSync, readdirSync, readFileSync } from 'node:fs';

const LANGS = ['he', 'ru', 'en'];
const DIR = /^\d{4}-\d{2}-\d{2}-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

// Posts are written by an automated workflow; a half-written post must fail the build, not ship.
export function checkNews(root) {
  if (!existsSync(root)) return;
  const slugs = new Set();
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const slug = DIR.exec(d.name)?.[1];
    if (!slug) throw new Error(`news/${d.name}: folder must be named YYYY-MM-DD-slug`);
    if (slugs.has(slug)) throw new Error(`news/${d.name}: slug "${slug}" is already used`);
    slugs.add(slug);
    for (const l of LANGS) {
      const md = new URL(`${d.name}/index.${l}.md`, root);
      if (!existsSync(md)) throw new Error(`news/${d.name}: index.${l}.md is missing`);
      const cover = readFileSync(md, 'utf8').match(/^cover:\s*["']?(.+?)["']?\s*$/m)?.[1];
      if (!cover) throw new Error(`news/${d.name}/index.${l}.md: cover is missing`);
      if (!existsSync(new URL(`${d.name}/${cover}`, root))) throw new Error(`news/${d.name}: cover ${cover} not found`);
    }
  }
}
