export const LANGS = ['he', 'ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const dir = (l: Lang) => (l === 'he' ? 'rtl' : 'ltr');

export const NAMES: Record<Lang, string> = { he: 'עברית', ru: 'Русский', en: 'English' };

export const ui = {
  he: {
    siteName: 'יוניפייט חיפה',
    homeTitle: 'יוניפייט חיפה',
    homeLead: 'מועדון ג׳ודו בחיפה. האתר בבנייה.',
    langLabel: 'שפה',
    notFoundTitle: 'הדף לא נמצא',
    notFoundHome: 'לדף הבית',
  },
  ru: {
    siteName: 'Юнифайт Хайфа',
    homeTitle: 'Юнифайт Хайфа',
    homeLead: 'Клуб дзюдо в Хайфе. Сайт в разработке.',
    langLabel: 'Язык',
    notFoundTitle: 'Страница не найдена',
    notFoundHome: 'На главную',
  },
  en: {
    siteName: 'Unifight Haifa',
    homeTitle: 'Unifight Haifa',
    homeLead: 'A judo club in Haifa. The site is under construction.',
    langLabel: 'Language',
    notFoundTitle: 'Page not found',
    notFoundHome: 'Go to home page',
  },
};

export const t = (l: Lang, k: keyof typeof ui.he) => ui[l][k];
