import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { BANNED, NIVHERET, checkTournament, ics, isUpcoming, published, splitEvents } from '../src/lib/club-check.mjs';
import { checkTechniques, norm, polivanov } from '../src/lib/techniques-check.mjs';

const LANGS = [['he', 'rtl'], ['ru', 'ltr'], ['en', 'ltr']];
const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const dist = (p) => new URL(`../dist/${p}`, import.meta.url);
const read = (p) => readFileSync(dist(p), 'utf8');
const tourDir = new URL('../content/tournaments/', import.meta.url);
const tours = readdirSync(tourDir).map((f) => ({ slug: f.replace(/\.json$/, ''), ...json(`../content/tournaments/${f}`) }));
const fixture = json('./fixtures/tournament-unverified.json');
const PAGES = ['history/', 'achievements/', 'tournaments/', 'nivheret/', 'contact/', 'belts/', 'techniques/', ...published(tours).map((t) => `tournaments/${t.slug}/`)];

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
  const ALLOW = [/מאמן נבחרת ישראל לנוער/, /юниорской сборной Израиля/, /בגד היאבקות של נבחרת ישראל/, /трико сборной Израиля/,
    /היה חבר בנבחרת ישראל/, /за сборную Израиля/, /членом сборной Израиля по дзюдо/, /Israel national team member/, /the Israeli national judo team/];
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
  for (const p of ['history/', 'achievements/', 'tournaments/', 'nivheret/', 'contact/', 'belts/', 'techniques/']) assert.ok(landing.includes(`href="${p}"`), p);
  assert.equal(landing.match(/class="more-link"/g).length, 4);
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

test('first-training block: after the schedule, prefilled WhatsApp, open owner questions hidden', () => {
  const fc = json('../content/site.json').kids.first_class;
  assert.ok(fc.price.placeholder && fc.judogi.placeholder, 'price/judogi: update this test once the owner confirms them');
  for (const [l] of LANGS) {
    const html = read(`${l}/index.html`);
    assert.equal(html.match(/id="first-class"/g).length, 1, l);
    assert.ok(html.indexOf('id="schedule"') < html.indexOf('id="first-class"'), l);
    const block = html.slice(html.indexOf('id="first-class"'), html.indexOf('id="branches"'));
    assert.equal(block.match(/class="fs"/g).length, fc.steps.length, l);
    const href = block.match(/href="(https:\/\/wa\.me\/972545664663\?text=[^"]+)"[^>]*data-ga="whatsapp_click" data-ga-placement="first_class"/)?.[1];
    assert.equal(new URL(href).searchParams.get('text'), fc.cta.message[l], l);
    for (const q of [fc.price, fc.judogi, ...fc.open_questions]) assert.ok(!html.includes(q[l]), `${l}: ${q.en}`);
  }
});

test('contact page: WhatsApp, email, socials, venues with map, link to the first training', () => {
  const site = json('../content/site.json');
  const venues = json('../content/venues.json');
  const geo = json('../content/venues-geo.json');
  for (const [l] of LANGS) {
    const html = read(`${l}/contact/index.html`);
    assert.match(html, /href="https:\/\/wa\.me\/972545664663\?text=[^"]+"[^>]*data-ga="whatsapp_click" data-ga-placement="contact_page"/);
    assert.ok(html.includes(`mailto:${site.contact.email.value}`), l);
    assert.ok(html.includes('https://www.facebook.com/unifightjudoclub/'), l);
    for (const s of site.contact.social.filter((x) => x.placeholder)) assert.ok(!html.includes(s[l]), `${l}: ${s.en}`);
    for (const v of Object.values(venues)) assert.ok(html.includes(v[l]), `${l}: ${v.en}`);
    // one transit link per venue in the list, one more in each map popup (geocoded venues only)
    assert.equal(html.match(/data-ga-provider="transit"/g).length, Object.keys(venues).length + Object.keys(geo).length, l);
    assert.ok(html.includes('data-venue-map'), l);
    assert.match(html, new RegExp(`href="[^"]*/${l}/#first-class"`), l);
    const [ld] = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    assert.equal(ld['@type'], 'ContactPage');
    assert.equal(ld.mainEntity.contactPoint.telephone, '+972-54-566-4663');
  }
});

test('Russian landing, contact and belts pages say «тренера», never «тренеры»', () => {
  for (const p of ['ru/index.html', 'ru/contact/index.html', 'ru/belts/index.html']) assert.ok(!/тренеры/i.test(read(p)), p);
});

test('belts page: every belt labelled in he/ru/en, drawn in a known colour, cited, and linked from both footers', () => {
  const b = json('../content/belts.json');
  const ids = new Set(b.sources.map((s) => s.id));
  for (const x of b.ladder.steps) {
    for (const [l] of LANGS) assert.ok(x.name[l]?.trim(), `${x.id}.${l}`);
    for (const c of x.colours) assert.match(b.colours[c] ?? '', /^#[0-9a-f]{6}$/, `${x.id}: ${c}`);
    assert.ok(x.sources.length && x.sources.every((s) => ids.has(s)), x.id);
    assert.ok(Number.isInteger(x.kyu ?? x.dan), x.id);
  }
  // the six official kyu belts must cite the association's regulations, not club or wiki pages
  const official = b.ladder.steps.filter((x) => x.official && x.kyu);
  assert.deepEqual(official.map((x) => x.kyu), [6, 5, 4, 3, 2, 1]);
  assert.ok(official.every((x) => x.sources.includes('S1')));
  for (const [l] of LANGS) {
    const html = read(`${l}/belts/index.html`);
    assert.equal(html.match(/<li class="bl-step/g).length, b.ladder.steps.length, l);
    for (const x of b.ladder.steps) assert.ok(html.includes(x.name[l]), `${l}: ${x.id}`);
    assert.equal(html.match(/<details class="bl-card"/g).length, b.exams.cards.length, l);
    for (const s of b.sources) assert.ok(html.includes(`href="${s.url.replaceAll('&', '&amp;')}"`), `${l}: ${s.id}`);
    assert.ok(html.includes(b.disclaimer[l].replaceAll("'", '&#39;')), l);
    assert.match(html, new RegExp(`<footer class="site-footer">[\\s\\S]*href="[^"]*/${l}/belts/"`), l);
    assert.match(read(`${l}/index.html`), new RegExp(`href="[^"]*/${l}/belts/"`), l);
  }
});

test('techniques: the 100 Kodokan techniques, each named and described in he/ru/en, one card and player link each', () => {
  const tq = json('../content/techniques.json');
  checkTechniques(tq);
  assert.equal(tq.items.length, 100);
  const per = (f) => tq.items.filter((x) => tq.groups.find((g) => g.id === x.group).family === f).length;
  assert.deepEqual([per('nage'), per('katame')], [68, 32]);
  assert.equal(tq.items.filter((x) => x.gokyo && /^\d$/.test(x.gokyo)).length, 40);
  const bad = (patch, re) => assert.throws(() => checkTechniques({ ...tq, items: [{ ...tq.items[0], ...patch }] }), re);
  bad({ video: 'nope' }, /not a YouTube video id/);
  bad({ group: 'kicks' }, /unknown group/);
  bad({ tags: ['black'] }, /unknown tag/);
  bad({ desc: { he: 'x', ru: 'x' } }, /desc\.en is missing/);
  assert.throws(() => checkTechniques({ ...tq, items: [tq.items[0], tq.items[0]] }), /listed twice/);
  for (const [l] of LANGS) {
    const html = read(`${l}/techniques/index.html`);
    assert.equal(html.match(/<li class="tq-card/g).length, 100, l);
    for (const x of tq.items) {
      assert.match(html, new RegExp(`<a class="btn btn-ghost" href="https://youtu.be/${x.video}" data-video="${x.video}"`), `${l}: ${x.id}`);
      assert.ok(html.includes(x.name[l].replaceAll('"', '&quot;')), `${l}: ${x.id} name`);
    }
    assert.match(html, new RegExp(`<footer class="site-footer">[\\s\\S]*href="[^"]*/${l}/techniques/"`), l);
    assert.match(read(`${l}/index.html`), new RegExp(`href="[^"]*/${l}/techniques/"`), l);
  }
});

test('techniques: nothing third-party loads at rest; videos wait for the click-to-load player', () => {
  for (const [l] of LANGS) {
    const html = read(`${l}/techniques/index.html`);
    assert.ok(!/<iframe\b/i.test(html), l);
    for (const [tag] of html.matchAll(/<(img|iframe|link|source|video|script|use|image)\b[^>]*>/gi)) {
      for (const [, , url] of tag.matchAll(/\s(src|srcset|href)="([^"]*)"/gi)) assert.ok(!/^(https?:)?\/\//.test(url) || tag.startsWith('<link rel="canonical"') || tag.startsWith('<link rel="alternate"'), `${l}: ${tag}`);
    }
    assert.ok(html.includes("'https://www.youtube-nocookie.com/embed/'"), l);
  }
});

test('techniques: search folds every script, so seoi-nage is found by romaji, Cyrillic, Hebrew and kanji', () => {
  assert.equal(polivanov('Seoi-nage'), 'сэой-нагэ');
  assert.equal(polivanov('Ippon-seoi-nage'), 'иппон-сэой-нагэ');
  assert.equal(polivanov('Sukui-nage'), 'сукуи-нагэ');
  assert.equal(polivanov('Ryote-jime'), 'рётэ-дзимэ');
  const card = read('en/techniques/index.html').match(/<li class="tq-card[^"]*" id="seoi-nage" data-s="([^"]+)"/)[1];
  for (const q of ['Seoi', 'сэой', 'СЕОИ', 'סאוי', '背負', 'shoulder throw', 'бросок через спину']) assert.ok(card.includes(norm(q)), q);
});
