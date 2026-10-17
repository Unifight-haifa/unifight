import {continueRender, delayRender, staticFile} from 'remotion';

const FACES = [
  ['Oswald', 'Oswald.ttf', '200 700'],
  ['Rubik', 'Rubik.ttf', '300 900'],
  ['Secular One', 'SecularOne.ttf', '400'],
  ['Yuji Boku', 'YujiBoku.ttf', '400'],
];

const handle = delayRender('fonts');
Promise.all(
  FACES.map(([family, file, weight]) => {
    const face = new FontFace(family, `url(${staticFile('fonts/' + file)})`, {weight});
    document.fonts.add(face);
    return face.load();
  }),
).then(() => continueRender(handle));

export const C = {ink: '#0a0908', gold: '#d4a84b', red: '#c2232e', paper: '#f3ead8'};

export const fontsFor = (lang) =>
  lang === 'he'
    ? {display: '"Secular One", sans-serif', body: 'Rubik, sans-serif', upper: 'none'}
    : {display: 'Oswald, sans-serif', body: 'Rubik, sans-serif', upper: 'uppercase'};

export const KANJI = '"Yuji Boku", serif';
