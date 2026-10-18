// Club promo: on-screen copy, shot lists and the music edit for each format.
// Music: "Hero Suite A" by some-weirdo, CC0, opengameart.org/content/hero-suite-a, ~95.7 BPM.
// Shots start and end on beats of the track, counted from its first downbeat.

export const PFPS = 30;
const BEAT0 = 0.21;
const BEAT = 60 / 95.7;
const TRACK_END = 245.05;
const track = (n) => BEAT0 + n * BEAT;

// Each piece of the track lands at `at` seconds of the video.
const edit = (cuts) => {
  let at = 0;
  return cuts.map(([a, b]) => {
    // beat 0 starts at the file's head so the opening hit keeps its lead-in
    const seg = {at, from: a === 0 ? 0 : track(a), to: b === 'end' ? TRACK_END : track(b)};
    at += seg.to - seg.from;
    return seg;
  });
};

const clock = (segs) => (n) => {
  const t = track(n);
  const s = segs.find((x) => t >= x.from - 1e-6 && t <= x.to + 1e-6);
  if (!s) throw new Error(`beat ${n} is cut out of the music`);
  return s.at + t - s.from;
};

// Line keys -> copy. Hebrew and English are adaptations, not word-for-word.
export const COPY = {
  first: {
    ru: 'Каждый чемпион когда-то впервые вышел на татами.',
    he: 'כל אלוף עלה פעם ראשונה על המזרן.',
    en: 'Every champion once stepped onto the mat for the first time.',
  },
  easy: {ru: 'Здесь не обещают лёгкого пути.', he: 'כאן לא מבטיחים דרך קלה.', en: 'No one here promises an easy road.'},
  forge: {ru: 'Здесь закаляют характер.', he: 'כאן בונים אופי.', en: 'Here, character is forged.'},
  sweat: {ru: 'Каждая капля пота — шаг к победе.', he: 'כל טיפת זיעה — עוד צעד לניצחון.', en: 'Every drop of sweat is a step toward victory.'},
  fail: {ru: 'Не получилось с первого раза?', he: 'לא הצלחת בפעם הראשונה?', en: "Didn't work out the first time?"},
  up: {ru: 'Вставай. И иди дальше.', he: 'קום. וממשיכים הלאה.', en: 'Get up. And keep going.'},
  rival: {ru: 'Главный соперник — ты сам.', he: 'היריב הכי קשה — אתה עצמך.', en: 'Your toughest opponent is you.'},
  win: {
    ru: 'И однажды твой пот превращается в победу.',
    he: 'ויום אחד, הזיעה הופכת לניצחון.',
    en: 'And one day, your sweat turns into victory.',
  },
  coaches: {
    ru: 'Рядом — тренера, которые сами прошли этот путь.',
    he: 'לצידך — מאמנים שעברו את הדרך הזאת בעצמם.',
    en: "Beside you: coaches who've walked this road themselves.",
  },
  team: {ru: 'И команда, которая верит в тебя.', he: 'וקבוצה שמאמינה בך.', en: 'And a team that believes in you.'},
  dream: {
    ru: 'Не останавливайся. Только вперёд — к своей мечте.',
    he: 'אל תעצור. רק קדימה — אל החלום שלך.',
    en: "Don't stop. Only forward, toward your dream.",
  },
  start: {ru: 'Юнифайт Хайфа. Начни свой путь.', he: 'יוניפייט חיפה. הדרך שלך מתחילה כאן.', en: 'Unifight Haifa. Start your journey.'},
  ages: {ru: 'Дети с 5 лет · подростки · взрослые', he: 'ילדים מגיל 5 · נוער · מבוגרים', en: 'Kids from 5 · Teens · Adults'},
  where: {
    ru: 'Хайфа · Крайот · Нешер · более 30 лет',
    he: 'חיפה · קריות · נשר · יותר מ־30 שנה',
    en: 'Haifa · Krayot · Nesher · 30+ years',
  },
};

export const CLUB = {ru: 'Клуб дзюдо «Юнифайт Хайфа»', he: 'מועדון הג׳ודו יוניפייט חיפה', en: 'Unifight Haifa judo club'};

// v = video clip (public/promo/clips), p = photo (public/promo/photos).
// at = seconds into the clip, rate = playback speed, focus = object-position,
// panel = low-res source shown framed over a blurred copy, card = whole photo on a paper frame.
const V = (src, at = 0, more = {}) => ({kind: 'v', src, at, ...more});
const P = (src, more = {}) => ({kind: 'p', src, ...more});

const build = ({cuts, shots, lines, marks, end}) => {
  const segs = edit(cuts);
  const B = clock(segs);
  const T = (x) => (typeof x === 'number' ? B(x) : x.s);
  const last = segs[segs.length - 1];
  return {
    music: segs,
    total: last.at + last.to - last.from,
    shots: shots.map(([a, b, shot]) => ({...shot, from: T(a), to: T(b)})),
    lines: lines.map(([a, b, key, more]) => ({key, from: T(a) + 0.1, to: T(b) - 0.12, ...more})),
    drop: B(225),
    end: B(end),
    marks: marks.map(([a, b, k]) => ({k, from: T(a), to: T(b)})),
  };
};

const sec = (x) => ({s: x});

export const CUTS = {
  // quiet open, training build, the breakdown for the struggle, drop on the throw (b225),
  // the softer bars for the dream, then the track's own ending under the logo
  '16x9': build({
    end: 377,
    cuts: [[0, 8], [176, 208], [216, 257], [321, 329], [367, 'end']],
    shots: [
      [sec(0), 3, V('open', 0.2, {rate: 0.75, zoom: 1.0, y: 10, lb: true, fadeIn: 24})],
      [3, 8, P('toddler', {focus: '45% 50%', lb: true})],
      [176, 179, V('sprint', 4.2, {focus: '50% 45%'})],
      [179, 182, V('randC', 0.3)],
      [182, 184, P('rope-climb', {card: true})],
      [184, 186, V('randB', 0.0, {zoom: 1.15, focus: '30% 55%'})],
      [186, 188, V('sprint', 0.4, {focus: '50% 45%', flash: true})],
      [188, 191, P('beach-grips', {focus: '50% 40%'})],
      [191, 193, V('randA', 2.6, {zoom: 1.15, focus: '40% 50%'})],
      [193, 196, V('roll', 1.5, {flash: true})],
      [196, 199, P('groundwork', {focus: '50% 50%', lb: true})],
      [199, 202, V('ground', 2.5, {rate: 0.8, panel: true, lb: true})],
      [202, 204, V('down', 1.0, {rate: 0.7, panel: true, lb: true})],
      [204, 208, V('fall', 7.6, {rate: 0.9, focus: '40% 0%', zoom: 1.12})],
      [216, 219, P('dummy', {focus: '45% 60%', lb: true})],
      [219, 222, V('open', 2.4, {rate: 0.8, zoom: 1.0, y: 10, lb: true})],
      [222, 225, V('throw', 1.12, {panel: true})],
      [225, 228, V('throw', 3.0, {rate: 0.35, panel: true, punch: true})],
      [228, 231, P('winner', {focus: '60% 35%'})],
      [231, 234, V('medal', 0.6, {rate: 0.9, focus: '45% 40%'})],
      [234, 237, V('medal', 2.6, {rate: 0.7, focus: '45% 40%'})],
      [237, 239, P('podium-cadet', {focus: '50% 40%', flash: true})],
      [239, 241, P('podium-riga', {focus: '50% 45%'})],
      [241, 243, P('podium-israel', {focus: '50% 55%'})],
      [243, 245, P('flag-jump-kids', {focus: '50% 40%'})],
      [245, 248, P('coaches-lineup', {focus: '50% 30%'})],
      [248, 251, P('coaches-pair', {focus: '50% 20%'})],
      [251, 253, P('beach-team', {focus: '50% 55%'})],
      [253, 255, P('team-hug', {card: true, inset: '24% 14% 6%'})],
      [255, 257, P('beach-throw', {focus: '50% 40%'})],
      [321, 325, P('beach-jump', {focus: '70% 35%'})],
      [325, 327, V('sprint', 4.6, {focus: '50% 40%'})],
      [327, 329, P('beach-workout', {focus: '50% 50%'})],
      [367, 377, P('club-banner', {focus: '50% 40%', dim: 0.55})],
    ],
    lines: [
      [sec(0.6), 8, 'first', {zone: 'low'}],
      [176, 182, 'easy', {zone: 'low'}],
      [182, 188, 'forge', {zone: 'low'}],
      [188, 196, 'sweat', {zone: 'low'}],
      [196, 202, 'fail', {zone: 'low'}],
      [202, 208, 'up', {zone: 'low'}],
      [216, 225, 'rival', {zone: 'low'}],
      [225, 232, 'win', {zone: 'low', big: true}],
      [245, 251, 'coaches', {zone: 'low'}],
      [251, 255, 'team', {zone: 'top'}],
      [321, 329, 'dream', {zone: 'low'}],
      [367, 377, 'start', {zone: 'cta', row: 0}],
      [369, 377, 'ages', {zone: 'cta', row: 1}],
      [371, 377, 'where', {zone: 'cta', row: 2}],
    ],
    // brush kanji per chapter: path, sweat, heart, victory, bond, dream
    marks: [[sec(0), 8, '道'], [176, 196, '汗'], [196, 225, '心'], [225, 245, '勝'], [245, 257, '絆'], [321, 329, '夢']],
  }),
  '9x16': build({
    end: 379,
    cuts: [[0, 8], [192, 196], [216, 237], [321, 329], [371, 'end']],
    shots: [
      [sec(0), 3, V('open', 0.2, {rate: 0.75, focus: '50% 30%', fadeIn: 18})],
      [3, 8, P('toddler', {focus: '68% 40%'})],
      [192, 194, P('beach-grips', {focus: '45% 40%'})],
      [194, 196, V('sprint', 4.2)],
      [216, 219, P('groundwork', {focus: '45% 50%'})],
      [219, 222, V('fall', 8.6, {rate: 0.9, focus: '40% 40%'})],
      [222, 225, V('throw', 1.12, {panel: true})],
      [225, 228, V('throw', 3.0, {rate: 0.35, panel: true, punch: true})],
      [228, 231, V('medal', 0.6, {rate: 0.9, focus: '42% 40%'})],
      [231, 234, V('medal', 2.6, {rate: 0.7, focus: '50% 40%'})],
      [234, 237, P('flag-jump-kids', {focus: '50% 40%', flash: true})],
      [321, 325, P('beach-jump', {focus: '70% 35%'})],
      [325, 329, V('sprint', 4.6)],
      [371, 379, P('club-banner', {focus: '50% 40%', dim: 0.55})],
    ],
    lines: [
      [sec(0.5), 8, 'first', {zone: 'low'}],
      [192, 196, 'sweat', {zone: 'low'}],
      [216, 220, 'fail', {zone: 'low'}],
      [220, 225, 'up', {zone: 'low'}],
      [225, 232, 'win', {zone: 'low', big: true}],
      [321, 329, 'dream', {zone: 'low'}],
      [371, 379, 'start', {zone: 'cta', row: 0}],
      [373, 379, 'ages', {zone: 'cta', row: 1}],
      [375, 379, 'where', {zone: 'cta', row: 2}],
    ],
    marks: [[sec(0), 8, '道'], [216, 225, '心'], [225, 237, '勝'], [321, 329, '夢']],
  }),
};
