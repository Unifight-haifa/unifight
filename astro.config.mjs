import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://OWNER.github.io',
  // unset Actions variables expand to '', so any falsy value must fall back
  base: process.env.BASE_PATH || '/unifight',
  trailingSlash: 'always',
  // Astro 7 default 'jsx' drops spaces between multi-line inline elements
  compressHTML: true,
  i18n: {
    locales: ['he', 'ru', 'en'],
    defaultLocale: 'he',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  // fallbacks: [] drops Astro's metric-matched Arial: it has no unicode-range, so it would draw what a
  // family lacks (Hebrew in Oswald, arrows in Rubik) before the next font in the tokens.css stacks
  fonts: [
    ['Rubik', '--font-body', ['300 900'], ['hebrew', 'cyrillic', 'latin', 'latin-ext']],
    ['Oswald', '--font-oswald', ['500 700'], ['cyrillic', 'latin', 'latin-ext']],
    ['Secular One', '--font-secular', [400], ['hebrew', 'latin']],
    ['Playfair Display', '--font-playfair', ['600 800'], ['cyrillic', 'latin']],
    ['Frank Ruhl Libre', '--font-frank', ['500 900'], ['hebrew']],
  ].map(([name, cssVariable, weights, subsets]) => ({
    provider: fontProviders.fontsource(),
    name,
    cssVariable,
    weights,
    styles: ['normal'],
    subsets,
    fallbacks: [],
  })),
});
