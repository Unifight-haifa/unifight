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
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Rubik',
      cssVariable: '--font-body',
      weights: ['300 900'],
      styles: ['normal'],
      subsets: ['hebrew', 'cyrillic', 'latin'],
    },
  ],
});
