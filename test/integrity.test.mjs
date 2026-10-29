import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { PUBLISHED } from '../src/lib/club-check.mjs';
import { checkConsent, checkFacts, checkTranslations, factLists, reviewRows } from '../src/lib/integrity.mjs';

const root = new URL('../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const contentFiles = readdirSync(new URL('content/', root), { recursive: true }).filter((f) => f.endsWith('.json'));
const tournaments = Object.fromEntries(readdirSync(new URL('content/tournaments/', root)).map((f) => [f.slice(0, -5), json(`content/tournaments/${f}`)]));
const site = json('content/site.json');
const lists = () => factLists({ site, history: json('content/history.json'), tournaments });

test('LANG-04: every content file has he, ru and en wherever one of them appears', () => {
  assert.ok(contentFiles.length > 20);
  for (const f of contentFiles) checkTranslations(json(`content/${f}`), f);
  const bad = (o, re) => assert.throws(() => checkTranslations(o, 'x'), re);
  bad({ title: { he: 'א', en: 'A' } }, /x\.title: ru missing/);
  bad({ items: [{ text: { he: 'א', ru: ' ', en: 'A' } }] }, /x\.items\[0\]\.text: ru missing/);
  bad({ days: { he: ['א'], ru: [], en: ['Sun'] } }, /ru missing/);
  // blank in every language, and open owner questions, are allowed
  assert.doesNotThrow(() => checkTranslations({ kind: { he: '', ru: '', en: '' }, q: { placeholder: true, he: '[?]' } }, 'x'));
});

test('INTG-01: every factual entry has sources and a confidence flag', () => {
  assert.doesNotThrow(() => checkFacts(lists()));
  const one = (e) => () => checkFacts([['t', [{ id: 'e', ...e }], false]]);
  assert.throws(one({ sources: ['https://x'] }), /confidence must be one of/);
  assert.throws(one({ confidence: 'confirmed', sources: [] }), /sources are missing/);
  assert.throws(one({ confidence: 'sure', sources: ['https://x'] }), /confidence/);
  assert.doesNotThrow(one({ confidence: 'likely', source: 'https://x' }));
});

test('INTG-02: the review lists exactly the unverified entries and flags the ones the landing shows', () => {
  const rows = reviewRows(lists());
  const expected = lists().flatMap(([, items]) => items.filter((e) => !PUBLISHED.includes(e.confidence)));
  assert.equal(rows.length, expected.length);
  assert.ok(rows.every((r) => !PUBLISHED.includes(r.confidence) && r.sources.length));
  assert.ok(rows.some((r) => r.at === 'tournaments/north-2019.json' && r.confidence === 'unverified' && !r.landing));
  assert.ok(rows.some((r) => r.at.startsWith('site.json') && r.landing));
  const report = execFileSync('node', [new URL('scripts/content-review.mjs', root).pathname], { encoding: 'utf8' });
  assert.match(report, new RegExp(`## Not verified \\(${rows.length}\\)`));
  assert.match(report, /## Consent ledger/);
});

test('INTG-03: the ledger names no child, and minors need a live consent of the right scope', () => {
  const ledger = json('content/consent.json');
  const minorEntries = site.achievements.highlights.filter((h) => 'minor' in h);
  assert.ok(minorEntries.length > 0);
  assert.doesNotThrow(() => checkConsent(ledger, { minorEntries }));
  const c = { id: 'c-2026-001', ref: 'form 1', given: '2026-10-29', scopes: ['site'] };
  const ok = (l, o) => assert.doesNotThrow(() => checkConsent(l, o));
  const bad = (l, re, o) => assert.throws(() => checkConsent(l, o), re);
  ok({ consents: [c], media: { 'a.jpg': { minors: true, consents: ['c-2026-001'] }, 'b.jpg': { minors: false } } });
  bad({ consents: [], media: { 'a.jpg': { minors: true } } }, /a\.jpg: shows minors without a live "site" consent/);
  bad({ consents: [{ ...c, revoked: '2026-11-01' }], media: { 'a.jpg': { minors: true, consents: ['c-2026-001'] } } }, /without a live/);
  bad({ consents: [{ ...c, scopes: ['youtube'] }], media: { 'a.jpg': { minors: true, consents: ['c-2026-001'] } } }, /without a live/);
  bad({ consents: [], media: { 'a.jpg': {} } }, /minors must be true or false/);
  bad({ consents: [{ ...c, id: 'Dana' }], media: {} }, /id must look like c-2026-001/);
  bad({ consents: [{ ...c, ref: '' }], media: {} }, /ref to the signed form/);
  bad({ consents: [c], media: {} }, /names a minor/, { minorEntries: [{ id: 'm', person: { en: 'X' }, consents: ['c-2026-001'] }] });
  ok({ consents: [{ ...c, scopes: ['full_name'] }], media: {} }, { minorEntries: [{ id: 'm', person: { en: 'X' }, consents: ['c-2026-001'] }] });
});

test('the build runs every Phase 2 gate', () => {
  const cfg = readFileSync(new URL('src/content.config.ts', root), 'utf8');
  for (const call of ['checkTranslations(o,', 'checkFacts(factLists(', 'checkConsent(consent,']) assert.ok(cfg.includes(call), call);
});
