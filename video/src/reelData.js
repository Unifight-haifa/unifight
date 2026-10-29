// Three club reels: shot lists in beats of each track, captions, music cue.
// Music, Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0
// http://creativecommons.org/licenses/by/4.0/ : Volatile Reaction (sumo), Hitman (sukkot), Five Armies (camps).
// Tempo and first beat measured from the files (spectral flux grid search).

const T = (he, ru, en) => ({he, ru, en});

const TEXT = {
  sumo: T('סומו באימון · 2023', 'Сумо на тренировке · 2023', 'Sumo practice · 2023'),
  ring: T('העיקר — להישאר בתוך העיגול.', 'Главное — удержаться в круге.', 'The goal: stay inside the ring.'),
  lower: T('נמוך יותר. מהר יותר. חזק יותר.', 'Ниже. Быстрее. Сильнее.', 'Lower. Faster. Stronger.'),
  sukkot: T('מחנה אימונים סוכות · 2023', 'Сборы на Суккот · 2023', 'Sukkot training camp · 2023'),
  randori: T('רנדורי · קרבות אימון', 'Рандори · тренировочные схватки', 'Randori · practice bouts'),
  lesson: T('כל קרב הוא שיעור.', 'Каждая схватка — урок.', 'Every bout is a lesson.'),
  camps: T('מחנות אימונים וטיולים · 2022–2024', 'Сборы и выезды · 2022–2024', 'Camps & trips · 2022–2024'),
  georgia: T('מחנה אימונים בגאורגיה · 2024', 'Сборы в Грузии · 2024', 'Training camp in Georgia · 2024'),
  germany: T('גרמניה · 2023', 'Германия · 2023', 'Germany · 2023'),
  kinneret: T('כנרת · 2022', 'Кинерет · 2022', 'Kinneret · 2022'),
  season: T('עונת התחרויות · 2023', 'Сезон турниров · 2023', 'Tournament season · 2023'),
  start: T('יוניפייט חיפה. הדרך שלך מתחילה כאן.', 'Юнифайт Хайфа. Начни свой путь.', 'Unifight Haifa. Start your journey.'),
};

// Portrait sources; shown upright over a blurred copy of themselves.
export const TALL = new Set(['sumo', 'g-snow', 'g-city', 'g-run', 'g-rope', 'g-rope2', 'd-slide', 'd-zip', 'k-flip', 't-north', 't-huddle']);

// shots: [beats, clip, start s in clip, extras]; lines: [from beat, to beat, text key, extras].
// hit = track second the end card lands on; the music is cued so the footage ends exactly there.
const REELS = {
  sumo: {
    music: 'volatile-reaction', bpm: 155, beat0: 0.016, hit: 159.5, endBeats: 15,
    shots: [
      [16, 'sumo', 0, {vol: 0.35}],
      [40, 'sumo', 6.2, {vol: 0.35}],
      [16, 'sumo', 20.0, {rate: 0.5, flash: true}],
      [16, 'sumo', 30.0, {vol: 0.35}],
      [12, 'sumo', 42.0, {vol: 0.35}],
      [16, 'sumo', 43.0, {rate: 0.5, flash: true}],
      [16, 'sumo', 52.3, {vol: 0.35}],
      [16, 'sumo', 58.3, {vol: 0.35}],
      [16, 'sumo', 60.0, {rate: 0.5, flash: true}],
    ],
    lines: [[0.5, 15, 'sumo', {big: true}], [56, 70, 'ring'], [116, 130, 'lower'], [146, 160, 'start']],
  },
  sukkot: {
    // no masking: only footage with no readable name patch (wide clip, one reframed window, checked photos)
    music: 'hitman', bpm: 150, beat0: 0.317, hit: 93.917, endBeats: 12, fade: true,
    shots: [
      // a back patch turns readable from 2.0 s of suk-wide; slowed so 0.2-1.8 s fills the shot
      [8, 'suk-wide', 0.2, {rate: 0.5, vol: 0.3}],
      [12, 'sp-kids', 0],
      [4, 'suk-rf', 0, {rate: 0.8, vol: 0.3, flash: true}],
      [12, 'sp-throw', 0],
      [12, 'sp-ground', 0],
      [12, 'sp-mat', 0],
      [12, 'sp-young', 0, {flash: true}],
      [12, 'sp-team', 0],
      [12, 'sp-all', 0],
    ],
    lines: [[0.5, 14, 'sukkot', {big: true}], [20, 32, 'randori'], [56, 68, 'lesson'], [84, 96, 'start']],
  },
  camps: {
    music: 'five-armies', bpm: 114, beat0: 0.022, hit: 147.91, endBeats: 12,
    shots: [
      [16, 'g-snow', 0, {rate: 0.6}],
      [12, 'g-run', 0],
      [20, 'g-rope', 0.4],
      [4, 'g-rope2', 0.3],
      [8, 'g-rope', 7.6, {rate: 0.5, flash: true}],
      [4, 'g-city', 3.9],
      [12, 'd-slide', 1.4, {flash: true}],
      [12, 'd-slide', 7.8],
      [16, 'd-zip', 1.6],
      [16, 'k-flip', 0.3, {rate: 0.8, lift: 1.2}],
      [4, 'k-carry', 0, {rate: 0.8, lift: 1.2}],
      [8, 't-north', 1.6, {flash: true}],
      [4, 't-huddle', 0, {rate: 0.8}],
      [4, 't-cheer', 0.2],
      [28, 't-medal', 0.2, {rate: 0.68, flash: true}],
    ],
    lines: [
      [0.5, 16, 'camps', {big: true}], [16, 28, 'georgia'], [64, 76, 'germany'], [104, 116, 'kinneret'],
      [124, 136, 'season'], [152, 168, 'start'],
    ],
  },
};

const FPS = 30;

// Seconds for every shot, line and the music cue; frames are rounded once, at the edges.
const build = ({music, bpm, beat0, hit, endBeats, fade, shots, lines}) => {
  const beat = 60 / bpm;
  const foot = shots.reduce((n, s) => n + s[0], 0);
  let b = 0;
  return {
    music, fade, beat,
    from: hit - foot * beat, // track second at frame 0
    total: (foot + endBeats) * beat,
    end: foot * beat,
    shots: shots.map(([n, src, at, more]) => {
      const s = {src, at, from: b * beat, to: (b + n) * beat, ...more};
      b += n;
      return s;
    }),
    lines: lines.map(([a, z, key, more]) => ({text: TEXT[key], from: a * beat, to: z * beat - 0.12, zone: 'low', ...more})),
  };
};

// Thumbnails: frame from a prepped clip + headline (white line, red-bar line) and a he/ru/year row.
export const THUMBS = {
  sumo: {clip: 'sumo', at: 11.0, top: 'Sumo', bar: 'Practice', sub: ['סומו באימון', 'Сумо на тренировке'], year: '2023'},
  sukkot: {clip: 'sp-throw', at: 0, top: 'Sukkot', bar: 'Camp', sub: ['מחנה אימונים סוכות', 'Сборы на Суккот'], year: '2023'},
  camps: {clip: 'g-run', at: 4.2, top: 'Camps', bar: '& Trips', sub: ['מחנות וטיולים', 'Сборы и выезды'], year: '2022–2024'},
  // a 1 s clip of the medal photo, made by ffmpeg -loop 1 into public/reel/
  maribor: {clip: 'maribor-medal', at: 0, top: 'Maribor', bar: 'Silver', sub: ['גביע אירופה', 'Кубок Европы'], year: '2026'},
};

export const REEL = Object.fromEntries(Object.entries(REELS).map(([k, r]) => [k, build(r)]));
export const reelLength = (name) => Math.round(REEL[name].total * FPS);

