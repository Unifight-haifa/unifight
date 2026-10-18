const LANGS = ['he', 'ru', 'en'];
export const FAMILIES = ['nage', 'katame'];
export const GOKYO = ['1', '2', '3', '4', '5', 'habukareta', 'shinmeisho'];
export const TAGS = ['brown', 'dan1', 'banned'];
const ID = /^[A-Za-z0-9_-]{11}$/;

const named = (o, f, at) => {
  for (const l of LANGS) if (typeof o[f]?.[l] !== 'string' || !o[f][l].trim()) throw new Error(`${at}: ${f}.${l} is missing`);
};

// one folding for the build-time index and the in-page search (inlined there via toString):
// case, accents, niqqud, ё/й/э and punctuation drop out; kanji become uXXXX so no CJK text ships in the HTML
export function norm(s) {
  return s
    .replace(new RegExp('[\\u3000-\\u9fff]', 'g'), function (c) { return 'u' + c.charCodeAt(0).toString(16); })
    .normalize('NFKD')
    .toLowerCase()
    .replace(new RegExp('[\\u0300-\\u036f\\u0591-\\u05c7]', 'g'), '')
    .replace(/э/g, 'е')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const V = { a: 'а', i: 'и', u: 'у', e: 'э', o: 'о' };
const C = { k: 'к', g: 'г', s: 'с', z: 'дз', t: 'т', d: 'д', n: 'н', h: 'х', b: 'б', p: 'п', m: 'м', r: 'р', w: 'в', f: 'ф' };
const Y = { a: 'я', u: 'ю', o: 'ё', e: 'е', i: 'и' };

/** Hepburn romaji to Russian Polivanov spelling: seoi-nage -> сэой-нагэ */
export function polivanov(romaji) {
  return romaji.toLowerCase().replace(/(sh|ch|ts|j|y|[kgsztdnhbpmrwf])?([aiueo])|./g, (m, c, v, at, str) => {
    if (!v) return C[m] ?? m;
    if (!c) return v === 'i' && /[aeo]/.test(str[at - 1] ?? '') ? 'й' : V[v];
    if (c === 'sh' || c === 'ch' || c === 'j') return { sh: 'с', ch: 'т', j: 'дз' }[c] + Y[v];
    if (c === 'y') return Y[v];
    if (c === 'ts') return 'ц' + V[v];
    return C[c] + V[v];
  });
}

// content/techniques.json is hand-maintained; a typo must fail the build, not ship a dead card
export function checkTechniques(t) {
  const groups = new Map();
  for (const [i, g] of (t.groups ?? []).entries()) {
    const at = `techniques.json groups[${i}]`;
    if (!FAMILIES.includes(g.family)) throw new Error(`${at}: family must be one of ${FAMILIES.join(', ')}`);
    if (!ID.test(g.video ?? '')) throw new Error(`${at}: video "${g.video}" is not a YouTube video id`);
    named(g, 'name', at);
    groups.set(g.id, g);
  }
  if (!ID.test(t.trailer ?? '')) throw new Error('techniques.json: trailer is not a YouTube video id');
  if (!Array.isArray(t.items) || !t.items.length) throw new Error('techniques.json: items must be a non-empty array');
  const ids = new Set();
  for (const [i, x] of t.items.entries()) {
    const at = `techniques.json items[${i}] ${x.id}`;
    if (!/^[a-z]+(-[a-z]+)*$/.test(x.id ?? '')) throw new Error(`${at}: id must be the lower-case romaji`);
    if (ids.has(x.id)) throw new Error(`${at}: listed twice`);
    ids.add(x.id);
    if (!groups.has(x.group)) throw new Error(`${at}: unknown group ${x.group}`);
    if (x.gokyo !== undefined && (!GOKYO.includes(x.gokyo) || groups.get(x.group).family !== 'nage')) throw new Error(`${at}: gokyo ${x.gokyo} is not a throwing group`);
    for (const v of [x.video, ...(x.escape ? [x.escape] : [])]) if (!ID.test(v ?? '')) throw new Error(`${at}: video "${v}" is not a YouTube video id`);
    for (const tag of x.tags ?? []) if (!TAGS.includes(tag)) throw new Error(`${at}: unknown tag ${tag}`);
    if (!x.kanji || !x.romaji || !x.he_read) throw new Error(`${at}: kanji, romaji and he_read are required`);
    named(x, 'name', at);
    named(x, 'desc', at);
  }
}
