// Phase 2 gates: translations (LANG-04), the verified flag and review report (INTG-01/02), the consent ledger (INTG-03).
import { PUBLISHED } from './club-check.mjs';

const LANGS = ['he', 'ru', 'en'];
const CONFIDENCE = [...PUBLISHED, 'likely', 'unverified'];

/** LANG-04: any object with a he/ru/en key needs all three filled; placeholders are owner questions and never render. */
export function checkTranslations(o, at) {
  if (Array.isArray(o)) return o.forEach((v, i) => checkTranslations(v, `${at}[${i}]`));
  if (!o || typeof o !== 'object') return;
  if (LANGS.some((l) => l in o) && !o.placeholder) {
    const vals = LANGS.map((l) => o[l]);
    const empty = vals.map((v) => (typeof v === 'string' ? !v.trim() : Array.isArray(v) ? !v.length : true));
    // all three "" is deliberate: a label that is blank in every language
    if (empty.some(Boolean) && !vals.every((v) => v === '')) throw new Error(`${at}: ${LANGS.filter((_, i) => empty[i]).join(', ')} missing`);
  }
  for (const [k, v] of Object.entries(o)) checkTranslations(v, `${at}.${k}`);
}

/**
 * Every factual list with its verified flag (`confidence`, PUBLISHED = verified). `landing` marks lists that
 * scripts/landing/build.py renders as they are, without the PUBLISHED filter the club pages apply.
 */
export function factLists({ site, history, tournaments }) {
  return [
    ['site.json history.items', site.history.items, true],
    ['site.json achievements.stats', site.achievements.stats, true],
    ['site.json achievements.highlights', site.achievements.highlights, true],
    ['site.json achievements.more_results', site.achievements.more_results, true],
    ['site.json tournaments.organized', site.tournaments.organized, true],
    ['site.json camps.recent', site.camps.recent, true],
    ['site.json camps.history', site.camps.history, true],
    ['history.json items', history.items, false],
    ['history.json about.facts', history.about.facts, false],
    ...Object.entries(tournaments).map(([slug, t]) => [`tournaments/${slug}.json`, [{ ...t, id: slug }], false]),
  ];
}

const sourcesOf = (e) => e.sources ?? (e.source ? [e.source] : []);
const label = (e) => e.id ?? e.title?.en ?? e.label?.en ?? e.name?.en ?? e.place?.en ?? '?';

/** INTG-01: every entry carries sources and a known confidence. */
export function checkFacts(lists) {
  for (const [at, items] of lists) {
    for (const [i, e] of items.entries()) {
      if (!CONFIDENCE.includes(e.confidence)) throw new Error(`${at}[${i}] ${label(e)}: confidence must be one of ${CONFIDENCE.join(', ')}`);
      if (!sourcesOf(e).some((s) => typeof s === 'string' && s.trim())) throw new Error(`${at}[${i}] ${label(e)}: sources are missing`);
    }
  }
}

/** INTG-02: the entries still waiting for verification, and whether the landing shows them anyway. */
export const reviewRows = (lists) =>
  lists.flatMap(([at, items, landing]) =>
    items.filter((e) => !PUBLISHED.includes(e.confidence)).map((e) => ({ at, id: label(e), confidence: e.confidence, landing, sources: sourcesOf(e), note: e.note ?? '' })),
  );

const SCOPES = ['site', 'youtube', 'social', 'first_name', 'full_name', 'results'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * INTG-03: a consent entry names no child (ref points to the signed form kept off the repo); media showing
 * minors need a live consent with the "site" scope, and a named minor needs "full_name".
 */
export function checkConsent(ledger, { minorEntries = [] } = {}) {
  const ids = new Map();
  for (const [i, c] of ledger.consents.entries()) {
    const at = `consent.json consents[${i}]`;
    if (!/^c-\d{4}-\d{3}$/.test(c.id ?? '')) throw new Error(`${at}: id must look like c-2026-001`);
    if (ids.has(c.id)) throw new Error(`${at}: duplicate id ${c.id}`);
    if (!c.ref?.trim()) throw new Error(`${at}: ref to the signed form is missing`);
    if (!DATE.test(c.given ?? '')) throw new Error(`${at}: given must be YYYY-MM-DD`);
    if (c.revoked !== undefined && !DATE.test(c.revoked)) throw new Error(`${at}: revoked must be YYYY-MM-DD`);
    if (!c.scopes?.length || !c.scopes.every((s) => SCOPES.includes(s))) throw new Error(`${at}: scopes must be from ${SCOPES.join(', ')}`);
    ids.set(c.id, c);
  }
  const live = (id, scope) => ids.get(id) && !ids.get(id).revoked && ids.get(id).scopes.includes(scope);
  for (const [file, m] of Object.entries(ledger.media)) {
    if (typeof m.minors !== 'boolean') throw new Error(`consent.json media ${file}: minors must be true or false`);
    if (m.minors && !(m.consents?.length && m.consents.every((id) => live(id, 'site')))) throw new Error(`consent.json media ${file}: shows minors without a live "site" consent`);
  }
  for (const e of minorEntries) {
    if (e.person && !(e.consents?.length && e.consents.every((id) => live(id, 'full_name')))) throw new Error(`${e.id}: names a minor without a live "full_name" consent`);
  }
}
