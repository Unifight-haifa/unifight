import ilanaJson from '../../content/coaches/ilana-kratysh.json';
import natanelJson from '../../content/coaches/natanel-zhurovel.json';

// Each credential restates a fact from the coach file (bio or sources). Owner rule:
// a video speaks only about its own coach, so no other names appear on screen.
// focus = object-position of the photo; card = show whole photo framed (portrait or low-res).

export const COACHES = {
  ilana: {
    json: ilanaJson,
    open: [
      {src: 'ilana-bout', focus: '45% 40%'},
      {src: 'ilana-win', focus: '78% 35%'},
      {src: 'ilana-beach-flag', focus: '68% 40%'},
    ],
    hero: {src: 'ilana-bw', focus: '50% 25%'},
    beats: [
      {
        photos: [{src: 'ilana-baku', focus: '42% 30%'}],
        kanji: '銀',
        big: '4×',
        text: {
          ru: ['серебро чемпионатов Европы по борьбе', '2013–2016'],
          he: ['כסף באליפויות אירופה בהיאבקות', '2013–2016'],
          en: ['European wrestling silver medals', '2013–2016'],
        },
      },
      {
        photos: [{src: 'ilana-gold-2016', focus: '62% 40%', card: true}],
        kanji: '五輪',
        big: '2016',
        text: {
          ru: ['Олимпийские игры в Рио', 'первая женщина-борец из Израиля на Олимпиаде'],
          he: ['אולימפיאדת ריו', 'המתאבקת הישראלית הראשונה באולימפיאדה'],
          en: ['Rio Olympic Games', "Israel's first woman wrestler at the Olympics"],
        },
        caption: {
          ru: 'Золото олимпийского отбора, Монголия, 2016',
          he: 'זהב בטורניר הקוולפיקציה, מונגוליה 2016',
          en: 'Gold at the Olympic qualifier, Mongolia, 2016',
        },
      },
      {
        photos: [],
        kanji: '相撲',
        big: '2023',
        text: {
          ru: ['серебро чемпионата Европы по сумо', 'первая в истории медаль Израиля в этом виде'],
          he: ['כסף באליפות אירופה בסומו', 'המדליה הראשונה של ישראל בענף'],
          en: ['European Sumo Championships silver', "Israel's first-ever medal in the sport"],
        },
      },
      {
        photos: [{src: 'ilana-beach-flag', focus: '70% 35%'}],
        kanji: '金',
        big: '2026',
        text: {
          ru: ['золото Маккабиады', 'пляжная борьба'],
          he: ['זהב במכביה', 'היאבקות חופים'],
          en: ['Maccabiah gold', 'Beach wrestling'],
        },
      },
    ],
    today: {
      photo: {src: 'ilana-coach', focus: '50% 22%'},
      text: {
        ru: 'возглавляет клуб и тренирует дзюдо и борьбу',
        he: 'עומדת בראש המועדון ומאמנת ג׳ודו והיאבקות',
        en: 'Chairs the club and coaches judo and wrestling',
      },
    },
  },
  natanel: {
    json: natanelJson,
    open: [
      {src: 'natanel-throw', focus: '45% 40%'},
      {src: 'natanel-grip', focus: '64% 25%'},
      {src: 'natanel-sarajevo', focus: '61% 30%'},
    ],
    hero: {src: 'natanel-grip', focus: '100% 22%'},
    beats: [
      {
        photos: [{src: 'natanel-u23', focus: '50% 30%', card: true}],
        kanji: '金',
        big: '3×',
        text: {
          ru: ['чемпион Израиля до 23 лет', '2019 · 2021 · 2022'],
          he: ['אלוף ישראל עד גיל 23', '2019 · 2021 · 2022'],
          en: ['Israeli U23 champion', '2019 · 2021 · 2022'],
        },
      },
      {
        photos: [
          {src: 'natanel-sarajevo', focus: '61% 30%', label: {ru: 'Сараево', he: 'סרייבו', en: 'Sarajevo'}},
          {src: 'natanel-riga', focus: '50% 20%', label: {ru: 'Рига', he: 'ריגה', en: 'Riga'}},
        ],
        kanji: '銀',
        big: '2×',
        text: {
          ru: ['серебро Кубка Европы', '2022'],
          he: ['כסף בגביע אירופה', '2022'],
          en: ['European Cup silver', '2022'],
        },
      },
      {
        photos: [{src: 'natanel-throw', focus: '42% 45%'}],
        kanji: '技',
        big: 'GP',
        text: {
          ru: ['этапы Гран-при', '2023 · Линц · Загреб'],
          he: ['סבב הגרנד פרי', '2023 · לינץ · זאגרב'],
          en: ['Grand Prix circuit', '2023 · Linz · Zagreb'],
        },
      },
    ],
    today: {
      photo: {src: 'natanel-riga', focus: '50% 18%', card: true},
      text: {
        ru: 'воспитанник клуба\u00a0— теперь тренер Unifight Haifa',
        he: 'בוגר המועדון, והיום מאמן בו',
        en: 'Raised in the club, now a coach at Unifight Haifa',
      },
    },
  },
};

export const UI = {
  ru: {today: 'Сегодня', tagline: 'У нас дзюдо — это больше, чем кружок.'},
  he: {today: 'היום', tagline: 'אצלנו ג׳ודו זה הרבה יותר מחוג.'},
  en: {today: 'Today', tagline: 'Here, judo is much more than an after-school class.'},
};

export const SITE = 'unifight-haifa.com';
export const WHATSAPP = 'WhatsApp 054-566-4663';

// Cuts land on the music grid: 76 BPM, so one beat is ~23.7 frames at 30 fps.
export const FPS = 30;
export const BEAT = (60 / 76) * FPS;
export const at = (beats) => Math.round(beats * BEAT);
export const LEN = {open: 3, name: 8, beat: 7, today: 8, end: 9};

export const timeline = (coach) => {
  const c = COACHES[coach];
  let b = 0;
  const seg = (name, beats, extra = {}) => {
    const s = {name, from: at(b), dur: at(b + beats) - at(b), ...extra};
    b += beats;
    return s;
  };
  const parts = [seg('open', LEN.open), seg('name', LEN.name)];
  c.beats.forEach((beat, i) => parts.push(seg('beat', LEN.beat, {beat, i})));
  parts.push(seg('today', LEN.today), seg('end', LEN.end));
  return {parts, total: at(b)};
};
