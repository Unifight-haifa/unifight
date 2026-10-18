import type { Lang } from '../i18n/ui';
import { isUpcoming } from './club-check.mjs';

export const TS = {
  he: {
    title: 'תחרויות',
    desc: 'תחרויות ג׳ודו וסומו של יוניפייט חיפה: תחרויות קרובות וארכיון לפי שנים.',
    upcoming: 'תחרויות קרובות',
    none: 'אין כרגע תחרות קרובה שפורסמה. הודעות על תחרויות חדשות יופיעו כאן.',
    archive: 'ארכיון',
    all: 'כל התחרויות',
    judo: 'ג׳ודו',
    sumo: 'סומו',
    date: 'תאריך',
    venue: 'מקום',
    role: 'המועדון',
    participants: 'משתתפים',
    categories: 'קטגוריות',
    weigh_in: 'שקילה',
    regulations: 'תקנון התחרות (PDF)',
    registration: 'הרשמה',
    ics: 'הוספה ליומן',
    results: 'תוצאות',
    photos: 'תמונות',
    videos: 'וידאו',
    sources: 'מקורות',
  },
  ru: {
    title: 'Турниры',
    desc: 'Турниры по дзюдо и сумо «Юнифайт Хайфа»: ближайшие соревнования и архив по годам.',
    upcoming: 'Ближайшие турниры',
    none: 'Сейчас нет объявленных турниров. Анонсы новых соревнований появятся здесь.',
    archive: 'Архив',
    all: 'Все турниры',
    judo: 'Дзюдо',
    sumo: 'Сумо',
    date: 'Дата',
    venue: 'Место',
    role: 'Клуб',
    participants: 'Участников',
    categories: 'Категории',
    weigh_in: 'Взвешивание',
    regulations: 'Положение о турнире (PDF)',
    registration: 'Регистрация',
    ics: 'Добавить в календарь',
    results: 'Результаты',
    photos: 'Фото',
    videos: 'Видео',
    sources: 'Источники',
  },
  en: {
    title: 'Tournaments',
    desc: 'Unifight Haifa judo and sumo tournaments: upcoming events and an archive by year.',
    upcoming: 'Upcoming tournaments',
    none: 'No tournament is announced right now. New announcements will appear here.',
    archive: 'Archive',
    all: 'All tournaments',
    judo: 'Judo',
    sumo: 'Sumo',
    date: 'Date',
    venue: 'Venue',
    role: 'The club',
    participants: 'Participants',
    categories: 'Categories',
    weigh_in: 'Weigh-in',
    regulations: 'Tournament regulations (PDF)',
    registration: 'Registration',
    ics: 'Add to calendar',
    results: 'Results',
    photos: 'Photos',
    videos: 'Video',
    sources: 'Sources',
  },
} satisfies Record<Lang, Record<string, string>>;

// TOUR-03: the browser re-decides upcoming vs past from today's date, so a page built months ago stays right.
// Elements carry data-end (last day) and data-when ("up" | "past", the build-time guess).
export const classifyScript = `(function (isUpcoming) {
  var now = new Date();
  document.querySelectorAll('[data-when]').forEach(function (el) {
    el.hidden = (el.dataset.when === 'up') !== isUpcoming(el.dataset.end, now);
  });
  document.querySelectorAll('[data-sec]').forEach(function (sec) {
    var any = sec.querySelector('[data-when]:not([hidden])');
    if (sec.dataset.sec === 'up') sec.querySelector('[data-none]').hidden = !!any;
    else sec.hidden = !any;
  });
})(${isUpcoming.toString()});`;
