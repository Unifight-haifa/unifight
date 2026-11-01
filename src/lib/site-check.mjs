// Site-wide content (content/site/*.json) edits from the panel. Plain ESM without imports so the Worker bundles it.
export const SITE_FILES = ['contact', 'hero', 'footer', 'ui', 'pages'];
// Max [width, height] per images.json slot.
export const IMAGE_SLOTS = { hero: [2000, 1400], schedule_bg: [2000, 1400], contact_bg: [2000, 1400], contact_pic: [1200, 1200], logo: [512, 512] };
// Kana and CJK ideographs: build.py fails on any kanji word missing from content/kanji.json.
export const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;

const LANGS = ['he', 'ru', 'en'];
// Provenance and identity, not text: the panel never changes them.
const LOCKED = new Set(['source', 'confidence', 'placeholder', 'note', 'legal_source', 'id']);
const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isObj = (v) => kind(v) === 'object';

/** Values from input where the path and JSON type match cur; the shape of cur never changes. */
export function mergeSite(cur, input, at) {
  if (input === undefined) return structuredClone(cur);
  if (kind(input) !== kind(cur)) throw new Error(`${at}: must be ${kind(cur)}`);
  if (Array.isArray(cur)) {
    if (input.length !== cur.length) throw new Error(`${at}: must have ${cur.length} items`);
    return cur.map((v, i) => mergeSite(v, input[i], `${at}[${i}]`));
  }
  if (!isObj(cur)) return input;
  for (const k of Object.keys(input)) if (!Object.hasOwn(cur, k)) throw new Error(`${at}.${k}: unknown field`);
  return Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, LOCKED.has(k) ? structuredClone(v) : mergeSite(v, input[k], `${at}.${k}`)]));
}

function walk(m, cur, at) {
  if (typeof m === 'string') {
    if (CJK.test(m)) throw new Error(`${at}: Japanese or Chinese characters are not allowed`);
    return;
  }
  if (!m || typeof m !== 'object') return;
  if (!Array.isArray(m) && LANGS.some((l) => l in m)) {
    for (const l of LANGS) {
      if (typeof m[l] !== 'string') throw new Error(`${at}.${l}: must be text`);
      if (!m[l].trim() && cur?.[l]?.trim()) throw new Error(`${at}.${l}: is empty, write it in every language`);
    }
  }
  for (const [k, v] of Object.entries(m)) walk(v, cur?.[k], Array.isArray(m) ? `${at}[${k}]` : `${at}.${k}`);
}

const URL_OK = /^https:\/\/[^\s"'<>]+$/;
const TEL = /^\+972[2-9]\d{7,8}$/;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;
const ANCHOR = /^#[a-z0-9-]+$/;
const need = (ok, at, what) => { if (!ok) throw new Error(`${at}: ${what}`); };

// Mirrors what build.py and src/lib/site.ts assume, so a bad edit fails here and not in the PR build.
const RULES = {
  contact(m, _, at) {
    m.phones.forEach((p, i) => {
      const a = `${at}.phones[${i}]`;
      need(TEL.test(p.tel), `${a}.tel`, 'must look like +972541234567');
      need(/^[\d -]+$/.test(p.phone), `${a}.phone`, 'must be digits, spaces and dashes');
      need(p.phone.replace(/\D/g, '') === `0${p.tel.slice(4)}`, a, 'phone and tel must be the same number');
    });
    need(EMAIL.test(m.email.value), `${at}.email.value`, 'must be an email address');
    m.social.forEach((s, i) => { if ('url' in s) need(URL_OK.test(s.url), `${at}.social[${i}].url`, 'must be an https:// link'); });
    need(m.lead_endpoint === '' || URL_OK.test(m.lead_endpoint), `${at}.lead_endpoint`, 'must be empty or an https:// link');
  },
  hero(m, _, at) {
    for (const l of LANGS) need(m.headline[l].includes('. '), `${at}.headline.${l}`, 'must contain ". " (the second sentence is highlighted)');
    for (const [k, v] of Object.entries(m)) {
      if (isObj(v) && 'href' in v) need(ANCHOR.test(v.href) || URL_OK.test(v.href), `${at}.${k}.href`, 'must be #section or an https:// link');
    }
  },
  ui(m, cur, at) {
    for (const k of ['tpl', 'after']) {
      for (const l of LANGS) {
        for (const ph of cur.lead[k][l].match(/\{[a-z_]+\}/g) ?? []) need(m.lead[k][l].includes(ph), `${at}.lead.${k}.${l}`, `keep ${ph}`);
      }
    }
  },
  pages(m, _, at) {
    for (const f of ['title', 'desc']) {
      for (const l of LANGS) {
        const seen = new Set();
        for (const p of Object.values(m)) {
          const v = p[f]?.[l]?.trim();
          if (!v) continue;
          need(!seen.has(v), at, `two pages share the ${l} ${f}`);
          seen.add(v);
        }
      }
    }
  },
};

/** Throws a path-prefixed Error on the first rule the merged file breaks. */
export function checkSite(id, m, cur) {
  const at = `content/site/${id}.json`;
  if (!SITE_FILES.includes(id)) throw new Error(`${at}: unknown file`);
  walk(m, cur, at);
  RULES[id]?.(m, cur, at);
}
