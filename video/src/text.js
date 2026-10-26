import ilanaJson from '../../content/coaches/ilana-kratysh.json';
import natanelJson from '../../content/coaches/natanel-zhurovel.json';

// Every line restates a fact from content/coaches/*.json (bio or sources) or a quoted article
// in .planning/research/PHOTOS-2026-10-18.md. A coach's video names only that coach.

export const SITE = 'unifight-haifa.com';
export const WHATSAPP = 'WhatsApp 054-566-4663';
export const TAGLINE = {
  ru: 'У нас дзюдо — это больше, чем кружок.',
  he: 'אצלנו ג׳ודו זה הרבה יותר מחוג.',
  en: 'Here, judo is much more than an after-school class.',
};

export const ILANA = {
  json: ilanaJson,
  disciplines: {
    ru: ['ДЗЮДО', 'БОРЬБА', 'СУМО'],
    he: ['ג׳ודו', 'היאבקות', 'סומו'],
    en: ['JUDO', 'WRESTLING', 'SUMO'],
  },
  today: {ru: 'СЕГОДНЯ', he: 'היום', en: 'TODAY'},
  todayLine: {
    ru: 'возглавляет клуб и тренирует дзюдо и борьбу',
    he: 'עומדת בראש המועדון ומאמנת ג׳ודו והיאבקות',
    en: 'chairs the club and coaches judo and wrestling',
  },
  // lon/lat of each venue; year = counter value (null keeps the label instead).
  stations: [
    {
      lon: 35.0, lat: 32.8, year: null, kanji: '柔道',
      place: {ru: 'ХАЙФА', he: 'חיפה', en: 'HAIFA'},
      big: {ru: '5 ЛЕТ', he: 'גיל 5', en: 'AGE 5'},
      line: {ru: 'первое татами — дзюдо в нашем клубе', he: 'המזרן הראשון: ג׳ודו במועדון שלנו', en: 'first mat: judo at our club'},
      cards: [{src: 'ilana-judo', w: 0.34, x: 0.6, y: 0.1, rot: -3}],
    },
    {
      lon: 49.9, lat: 40.4, year: 2015, kanji: '銀',
      place: {ru: 'БАКУ', he: 'באקו', en: 'BAKU'},
      big: {ru: '4×', he: '4×', en: '4×'},
      line: {ru: 'серебро чемпионатов Европы по борьбе', he: 'כסף באליפויות אירופה בהיאבקות', en: 'European wrestling silver medals'},
      sub: {ru: '2013–2016', he: '2013–2016', en: '2013–2016'},
      cards: [
        {src: 'press-2014', w: 0.4, x: 0.56, y: 0.5, rot: 4, press: true},
        {src: 'ilana-baku', w: 0.38, x: 0.52, y: 0.08, rot: -3},
      ],
    },
    {
      lon: 106.9, lat: 47.9, year: 2016, kanji: '金',
      place: {ru: 'МОНГОЛИЯ', he: 'מונגוליה', en: 'MONGOLIA'},
      big: {ru: 'ЗОЛОТО', he: 'זהב', en: 'GOLD'},
      line: {ru: 'олимпийский квалификационный турнир', he: 'טורניר הקוולפיקציה לאולימפיאדה', en: 'Olympic qualifying tournament'},
      cards: [{src: 'ilana-gold-2016', w: 0.33, x: 0.6, y: 0.12, rot: 3}],
    },
    {
      lon: -43.2, lat: -22.9, year: 2016, kanji: '五輪',
      place: {ru: 'РИО', he: 'ריו', en: 'RIO'},
      big: {ru: 'РИО 2016', he: 'ריו 2016', en: 'RIO 2016'},
      line: {ru: 'Олимпийские игры', he: 'המשחקים האולימפיים', en: 'Olympic Games'},
      sub: {
        ru: 'первая женщина-борец из Израиля на Олимпиаде',
        he: 'המתאבקת הישראלית הראשונה באולימפיאדה',
        en: "Israel's first woman wrestler at the Olympics",
      },
      cards: [
        {src: 'press-first', w: 0.26, x: 0.74, y: 0.42, rot: 5, press: true},
        {src: 'press-rio', w: 0.27, x: 0.55, y: 0.06, rot: -4, press: true},
      ],
    },
    {
      lon: 17.4, lat: 51.7, year: 2023, kanji: '相撲',
      place: {ru: 'КРОТОШИН', he: 'קרוטושין', en: 'KROTOSZYN'},
      big: {ru: 'СУМО', he: 'סומו', en: 'SUMO'},
      line: {ru: 'серебро чемпионата Европы', he: 'כסף באליפות אירופה', en: 'European Championships silver'},
      sub: {
        ru: 'первая в истории медаль Израиля в этом виде',
        he: 'המדליה הראשונה אי פעם של ישראל בענף',
        en: "Israel's first-ever medal in the sport",
      },
      cards: [
        {src: 'press-sumo-photo', w: 0.4, x: 0.53, y: 0.56, rot: -2, press: true},
        {src: 'press-sumo', w: 0.3, x: 0.62, y: 0.06, rot: 3, press: true},
      ],
    },
    {
      lon: 34.8, lat: 32.1, year: 2026, kanji: '金',
      place: {ru: 'ИЗРАИЛЬ', he: 'ישראל', en: 'ISRAEL'},
      big: {ru: 'ЗОЛОТО', he: 'זהב', en: 'GOLD'},
      line: {ru: 'Маккабиада · пляжная борьба', he: 'מכביה · היאבקות חופים', en: 'Maccabiah · beach wrestling'},
      cards: [{src: 'ilana-beach-flag', w: 0.42, x: 0.53, y: 0.14, rot: -2}],
    },
  ],
};

export const NATANEL = {
  json: natanelJson,
  patch: 'ZHUROVEL',
  raised: {ru: 'ВОСПИТАННИК КЛУБА', he: 'בוגר המועדון', en: 'RAISED IN THE CLUB'},
  teen: {
    ru: ['Ещё подростком', 'выделялся в нашей команде на командных чемпионатах Израиля'],
    he: ['כבר כנער', 'היה מהבולטים בקבוצה שלנו באליפויות ישראל לקבוצות'],
    en: ['As a teenager', "he was already one of our standouts at Israel's team championships"],
  },
  u23: {
    ru: 'чемпион Израиля до 23 лет',
    he: 'אלוף ישראל עד גיל 23',
    en: 'Israeli U23 champion',
  },
  years: [2019, 2021, 2022],
  ec: {
    ru: ['Кубок Европы', 'два серебра · 2022'],
    he: ['גביע אירופה', 'פעמיים כסף · 2022'],
    en: ['European Cup', 'two silver medals · 2022'],
  },
  sarajevo: {ru: 'САРАЕВО', he: 'סרייבו', en: 'SARAJEVO'},
  riga: {ru: 'РИГА', he: 'ריגה', en: 'RIGA'},
  gp: {ru: 'дальше — этапы Гран-при', he: 'ומשם לסבב הגרנד פרי', en: 'then the Grand Prix circuit'},
  today: {ru: 'Сегодня — тренер клуба', he: 'היום — מאמן במועדון', en: 'Today — a club coach'},
  next: {ru: 'для следующего поколения', he: 'לדור הבא', en: 'for the next generation'},
};
