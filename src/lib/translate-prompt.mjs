// Port of n8n/bot-translate.json "Prepare"; the glossary is passed in so callers read it live.
export const MAX_CHARS = 4000;

export const detectLang = (s) => (/[֐-׿]/.test(s) ? 'he' : /[Ѐ-ӿ]/.test(s) ? 'ru' : 'en');

const CONTEXTS = {
  'coach-bio': 'a coach bio on the club website',
  'schedule-note': 'a short schedule notice for parents',
};

export function buildPrompt({ glossary, source_lang, fields, context = 'coach-bio', coach }) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const keys = Object.keys(f).filter((k) => String(f[k] ?? '').trim());
  if (!keys.length) throw new Error('no text to translate');
  const all = keys.map((k) => String(f[k])).join(' ');
  if (all.length > MAX_CHARS) throw new Error('text too long');
  const src = ['he', 'ru', 'en'].includes(source_lang) ? source_lang : detectLang(all);
  const rules = [
    'Translate faithfully. Do not add, drop, soften or embellish facts.',
    "Copy exactly: people's names, places, club names, dates, times, all numbers, scores, ages, belt grades and weight categories. Never convert units, round or reformat numbers or times.",
    ...(glossary?.rules || []),
    'Never name children in descriptions of photos or videos.',
    'In the source language return each field exactly as given.',
  ];
  if (context === 'coach-bio') {
    rules.push(`The text is a bio of ${coach || 'one coach'}. Write only about this coach, never about other coaches or the club's other people.`);
  }
  rules.push('Club glossary: whenever one of these terms or names appears, use exactly its he/ru/en form and follow its rules.');
  const system = [
    'You translate short texts for Unifight Haifa, a judo club in Haifa, Israel. Languages: Hebrew (he), Russian (ru), English (en).',
    `Context: ${CONTEXTS[context] || context}. The input JSON gives source_lang and fields (name -> text).`,
    '', 'Rules:',
    ...rules.map((r, i) => `${i + 1}. ${r}`),
    `GLOSSARY: ${JSON.stringify({ rules: glossary?.rules || [], terms: glossary?.terms || {} })}`,
    '', 'Reply with one JSON object and nothing else: {"he": {<same field names>}, "ru": {...}, "en": {...}}',
  ].join('\n');
  const input = JSON.stringify({ source_lang: src, fields: Object.fromEntries(keys.map((k) => [k, String(f[k])])) });
  return { system, input, source_lang: src, keys };
}

// Glossary: the plural is «тренера»; only the nominative «тренеры» is wrong.
export const fixRu = (s) => String(s).replace(/(?<![А-Яа-яЁё])([Тт])ренеры(?![А-Яа-яЁё])/g, '$1ренера');
