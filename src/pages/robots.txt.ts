import type { APIRoute } from 'astro';

// crawlers only read /robots.txt at the host root, so this counts once the site has its own domain
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL(`${import.meta.env.BASE_URL}sitemap.xml`, site).href}\n`);
