import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { BANNED, NIVHERET, checkTournament, ics, isUpcoming, published, splitEvents } from '../src/lib/club-check.mjs';

const LANGS = [['he', 'rtl'], ['ru', 'ltr'], ['en', 'ltr']];
const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const dist = (p) => new URL(`../dist/${p}`, import.meta.url);
const read = (p) => readFileSync(dist(p), 'utf8');
const tourDir = new URL('../content/tournaments/', import.meta.url);
const tours = readdirSync(tourDir).map((f) => ({ slug: f.replace(/\.json$/, ''), ...json(`../content/tournaments/${f}`) }));
const fixture = json('./fixtures/tournament-unverified.json');
const PAGES = ['history/', 'achievements/', 'tournaments/', 'nivheret/', ...published(tours).map((t) => `tournaments/${t.slug}/`)];

test('the new pages exist in he, ru and en with the right lang and dir', () => {
  assert.ok(PAGES.length > 4);
  for (const [l, d] of LANGS) {
    for (const p of PAGES) assert.ok(read(`${l}/${p}index.html`).includes(`<html lang="${l}" dir="${d}"`), `${l}/${p}`);
  }
});

test('tournament files pass the schema check; bad ones are rejected', () => {
  for (const { slug, ...t } of tours) checkTournament(t, slug);
  checkTournament(fixture, 'fixture');
  const bad = (patch, re) => assert.throws(() => checkTournament({ ...fixture, ...patch }, 'x'), re);
  bad({ discipline: 'karate' }, /discipline/);
  bad({ date: '01.05.2030' }, /date must be YYYY-MM-DD/);
  bad({ end: '2030-04-01' }, /end is before date/);
  bad({ name: { he: 'x', en: 'x' } }, /name\.ru is missing/);
  bad({ confidence: 'sure' }, /confidence/);
  bad({ sources: [] }, /sources are missing/);
  bad({ regulations: 'http://example.com/a.pdf' }, /regulations must be an https URL/);
  bad({ videos: ['nope'] }, /not in content\/videos\.json/);
  assert.throws(() => checkTournament(fixture, 'Bad Slug'), /lowercase slug/);
});

test('an unverified entry never renders', () => {
  assert.deepEqual(published([fixture, { ...fixture, confidence: 'confirmed' }, { ...fixture, confidence: 'owner' }]).map((t) => t.confidence), ['confirmed', 'owner']);
  const hidden = tours.filter((t) => !published([t]).length);
  assert.ok(hidden.length > 0, 'expected at least one unverified tournament in content/');
  for (const [l] of LANGS) {
    const index = read(`${l}/tournaments/index.html`);
    for (const t of hidden) {
      assert.ok(!existsSync(dist(`${l}/tournaments/${t.slug}/`)), `${l}/${t.slug} was built`);
      assert.ok(!index.includes(`tournaments/${t.slug}/`), `${l} index links ${t.slug}`);
    }
    // site.json "likely" history items and achievements stay off the new pages
    const site = json('../content/site.json');
    const hist = read(`${l}/history/index.html`);
    for (const i of site.history.items.filter((x) => x.confidence !== 'confirmed')) assert.ok(!hist.includes(i.title[l]), `${l} history: ${i.title[l]}`);
    const ach = read(`${l}/achievements/index.html`);
    for (const m of site.achievements.more_results.filter((x) => x.confidence !== 'confirmed')) assert.ok(!ach.includes(m.text[l].slice(0, 30)), `${l} achievements: ${m.id}`);
    for (const f of json('../content/history.json').about.facts.filter((x) => x.confidence !== 'confirmed')) assert.ok(!hist.includes(`<dt>${f.label[l]}</dt>`), `${l} about: ${f.label.en}`);
  }
});

test('upcoming vs past is decided by the date in Israel', () => {
  const ev = (date, end) => ({ ...fixture, date, end });
  // 22:30 UTC on 14 Mar is already 15 Mar in Israel
  const now = new Date('2026-03-14T22:30:00Z');
  assert.equal(isUpcoming('2026-03-14', now), false);
  assert.equal(isUpcoming('2026-03-15', now), true);
  assert.equal(isUpcoming('2026-03-14', new Date('2026-03-14T20:00:00Z')), true);
  const a = ev('2026-01-10'), b = ev('2026-03-13', '2026-03-15'), c = ev('2026-06-01'), d = ev('2025-11-01'), e = ev('2026-04-01');
  const { upcoming, years } = splitEvents([a, c, d, b, e], now);
  assert.deepEqual(upcoming, [b, e, c]);
  assert.deepEqual(years, [['2026', [a]], ['2025', [d]]]);
});

test('the .ics file is a valid all-day VEVENT', () => {
  const body = ics({ uid: 'x@unifight-haifa', name: 'Северный турнир, дети; взрослые', date: '2030-05-01', end: '2030-05-02', location: 'Nesher', url: 'https://example.com/he/tournaments/x/', stamp: new Date('2030-01-01T10:00:00Z') });
  assert.match(body, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(body, /\r\nBEGIN:VEVENT\r\n[\s\S]*\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n$/);
  assert.match(body, /\r\nDTSTART;VALUE=DATE:20300501\r\n/);
  assert.match(body, /\r\nDTEND;VALUE=DATE:20300503\r\n/);
  assert.match(body, /\r\nDTSTAMP:20300101T100000Z\r\n/);
  assert.ok(body.includes('SUMMARY:Северный турнир\\, дети\\; взрослые'));
  for (const line of body.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  // any calendar file the build produced must be well-formed too
  for (const f of readdirSync(dist(''), { recursive: true }).filter((x) => x.endsWith('.ics'))) {
    const out = read(f);
    assert.match(out, /^BEGIN:VCALENDAR\r\n[\s\S]*DTSTART;VALUE=DATE:\d{8}\r\n[\s\S]*END:VCALENDAR\r\n$/, f);
  }
});

test('nivheret is never called the Israel national team', () => {
  // real national-team roles of a person stay allowed, but only these exact phrasings
  const ALLOW = [/מאמן נבחרת ישראל לנוער/, /юниорской сборной Израиля/, /בגד היאבקות של נבחרת ישראל/, /трико сборной Израиля/];
  const pages = readdirSync(dist(''), { recursive: true }).filter((f) => f.endsWith('.html'));
  let nivSegments = 0;
  for (const f of pages) {
    const html = read(f);
    for (const seg of html.split(/<(?:\/?(?:p|li|h\d|dd|dt|div|section|span)\b[^>]*)>/)) {
      if (NIVHERET.test(seg)) nivSegments++;
      if (!BANNED.test(seg)) continue;
      assert.ok(!NIVHERET.test(seg), `${f}: nivheret next to national-team wording: ${seg.slice(0, 120)}`);
      assert.ok(ALLOW.some((a) => a.test(seg)), `${f}: national-team wording outside the allowlist: ${seg.slice(0, 120)}`);
    }
    if (f.includes('nivheret/')) assert.ok(!BANNED.test(html), f);
  }
  assert.ok(nivSegments > 0);
  for (const s of ['сборная Израиля', 'Israel national team', 'נבחרת ישראל']) assert.ok(BANNED.test(`x ${s} y`), s);
});

test('JSON-LD: SportsEvent per tournament, ItemList on the indexes', () => {
  const ld = (p) => [...read(p).matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  for (const t of published(tours)) {
    const [e] = ld(`en/tournaments/${t.slug}/index.html`);
    assert.equal(e['@type'], 'SportsEvent');
    assert.equal(e.startDate, t.date);
    assert.ok(e.name && e.location.name && e.url.endsWith(`/en/tournaments/${t.slug}/`));
  }
  for (const p of ['achievements', 'tournaments']) assert.equal(ld(`he/${p}/index.html`)[0]['@type'], 'ItemList', p);
});

test('sitemap, landing nav and "more" links reach the new pages', () => {
  const xml = read('sitemap.xml');
  for (const [l] of LANGS) for (const p of PAGES) assert.match(xml, new RegExp(`<loc>[^<]*/${l}/${p}</loc>`), `${l}/${p}`);
  const landing = read('he/index.html');
  for (const p of ['history/', 'achievements/', 'tournaments/', 'nivheret/']) assert.ok(landing.includes(`href="${p}"`), p);
  assert.equal(landing.match(/class="more-link"/g).length, 3);
});

test('achievement cards show a photo only when its photo_source says why it matches', () => {
  const items = json('../content/achievements.json').items;
  for (const it of items) if (it.photo) assert.ok(it.photo_source?.trim(), it.id);
  const html = read('en/achievements/index.html');
  const cards = html.match(/<li class="club-card[\s\S]*?<\/li>/g);
  const typed = cards.filter((c) => c.includes('club-card-type'));
  assert.ok(typed.length > 0);
  for (const c of typed) assert.ok(!/<img\b/.test(c), c.slice(0, 120));
  assert.equal(cards.length - typed.length, items.filter((i) => i.photo).length);
});

test('achievement filters are progressive: without JS every card shows', () => {
  for (const [l] of LANGS) {
    const html = read(`${l}/achievements/index.html`);
    assert.match(html, /data-filters hidden/);
    assert.ok(!/<li class="club-card[^"]*"[^>]* hidden/.test(html), l);
    assert.ok(html.match(/<li class="club-card/g).length >= 10, l);
  }
});
