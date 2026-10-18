import meanings from '../../content/kanji.json';
import glyphs from '../generated/kanji-glyphs.json';

type Style = 'mincho' | 'brush';

/** A kanji word as SVG glyphs, the same markup scripts/landing/build.py emits; needs kanjiDefs() on the page */
export function kanji(word: string, style: Style = 'mincho') {
  if (!(word in meanings[style])) throw new Error(`${word}: add it with its meaning to content/kanji.json (${style})`);
  const svgs = [...word]
    .map((c) => `<svg class="kg" viewBox="${glyphs[style].viewBox}" aria-hidden="true"><use href="#k-${style}-${c.codePointAt(0)!.toString(16)}"/></svg>`)
    .join('');
  // inline SVGs are bidi-neutral, so on RTL pages a word would read backwards
  return word.length > 1 ? `<bdi dir="ltr">${svgs}</bdi>` : svgs;
}

/** The outlines behind every kanji() on the page */
export function kanjiDefs(words: string[], style: Style = 'mincho') {
  const g: Record<string, string> = glyphs[style].glyphs;
  const paths = [...new Set(words.join(''))]
    .map((c) => `<path id="k-${style}-${c.codePointAt(0)!.toString(16)}" d="${g[c]}" vector-effect="non-scaling-stroke"/>`)
    .join('');
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${paths}</defs></svg>`;
}
