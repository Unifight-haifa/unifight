import { existsSync, readdirSync, readFileSync } from 'node:fs';

const LANGS = ['he', 'ru', 'en'];
const RAW_HTML = /<[a-z!/?]/i;
// link/image targets: web links, site paths, anchors, or an image file in the post folder
const LINK = /\]\(\s*<?([^)\s>]*)|^\s*\[[^\]]+\]:\s*<?(\S*?)>?\s*$/gim;
const SAFE_TARGET = /^(https?:\/\/|\/(?!\/)|#|(\.\/)?[\w.-]+\.(jpe?g|png|webp|gif)$)/i;
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
      const text = readFileSync(md, 'utf8');
      // Markdown renders raw HTML and any link scheme as-is; posts arrive from outside, so check the source strictly.
      if (RAW_HTML.test(text)) throw new Error(`news/${d.name}/index.${l}.md: raw HTML is not allowed`);
      for (const m of text.matchAll(LINK)) {
        const target = m[1] ?? m[2];
        if (target && !SAFE_TARGET.test(target)) throw new Error(`news/${d.name}/index.${l}.md: link target "${target}" is not allowed`);
      }
      const cover = text.match(/^cover:\s*["']?(.+?)["']?\s*$/m)?.[1];
      if (!cover) throw new Error(`news/${d.name}/index.${l}.md: cover is missing`);
      if (!existsSync(new URL(`${d.name}/${cover}`, root))) throw new Error(`news/${d.name}: cover ${cover} not found`);
    }
  }
}
