import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
const LANGS = ['he', 'ru', 'en'];
const read = (p) => readFileSync(new URL(p, dist), 'utf8');

// backgrounds behind text, logos next to the visible club name, the avatar beside its coach's heading
const DECORATIVE = ['brand/logo.png', 'img-night/groundwork.jpg', 'img-night/medals-team.jpg', 'img-night/train-georgia-randori.jpg', 'img-night/kids-belts-throw.jpg', 'class="ava-i"'];

for (const l of LANGS) {
  test(`${l} landing: every non-decorative img has an alt in the page language`, () => {
    const html = read(`${l}/index.html`);
    const imgs = html.match(/<img\b[^>]*>/g);
    assert.ok(imgs.length > 50);
    assert.ok(!/\balt-(he|ru|en)=/.test(html), 'unresolved alt-<lang>');
    for (const tag of imgs) {
      const alt = tag.match(/\balt="([^"]*)"/)?.[1];
      assert.notEqual(alt, undefined, tag.slice(0, 120));
      if (alt === '') assert.ok(DECORATIVE.some((d) => tag.includes(d)), `empty alt: ${tag.slice(0, 120)}`);
    }
    const sample = { he: 'ילדים בחליפות ג׳ודו מטפסים', ru: 'Дети в кимоно лазают', en: 'Children in judo suits climbing' }[l];
    assert.ok(html.includes(`alt="${sample}`), sample);
  });
}

// every built page that search engines may index, as a path under base
const indexable = readdirSync(dist, { recursive: true })
  .filter((f) => f === 'index.html' || f.endsWith('/index.html'))
  .filter((f) => !read(f).includes('<meta name="robots" content="noindex">'))
  .map((f) => base + f.replace(/index\.html$/, ''))
  .sort();

test('sitemap.xml is well-formed and lists exactly the indexable pages', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">\n/);
  assert.match(xml, /\n<\/urlset>\n$/);
  const urls = xml.match(/<url>.*?<\/url>/g);
  assert.equal(xml.split('<url>').length - 1, urls.length);
  const locs = urls.map((u) => new URL(u.match(/^<url><loc>([^<]+)<\/loc>/)[1]).pathname).sort();
  assert.deepEqual(locs, indexable);
  assert.ok(locs.length >= 12 && LANGS.every((l) => locs.includes(`${base}${l}/`)));
  for (const u of urls) {
    const alts = [...u.matchAll(/<xhtml:link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)"\/>/g)].map((m) => m[1]);
    assert.deepEqual(alts.filter((h) => h !== 'x-default'), LANGS, u);
  }
});

test('robots.txt points at the sitemap', () => {
  const sm = read('robots.txt').match(/^Sitemap: (\S+)$/m)?.[1];
  assert.equal(new URL(sm).pathname, `${base}sitemap.xml`);
});

test('indexable pages have unique titles and descriptions, plus canonical and hreflang', () => {
  const seen = { title: new Set(), desc: new Set() };
  for (const path of indexable) {
    const html = read(path.slice(base.length) + 'index.html');
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && desc, path);
    assert.ok(!seen.title.has(title) && !seen.desc.has(desc), `duplicate on ${path}`);
    seen.title.add(title);
    seen.desc.add(desc);
    assert.equal(new URL(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]).pathname, path);
    for (const l of LANGS) assert.ok(html.includes(`<link rel="alternate" hreflang="${l}"`), `${path} ${l}`);
  }
});

const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));

for (const l of LANGS) {
  test(`${l} landing JSON-LD describes the club and its venues`, () => {
    const [club] = jsonLd(read(`${l}/index.html`));
    assert.deepEqual(club['@type'], ['SportsClub', 'SportsOrganization']);
    assert.equal(club.sport, 'Judo');
    assert.equal(club.telephone, '+972-54-763-2054');
    assert.equal(club.email, 'unifight.haifa@outlook.com');
    assert.deepEqual(club.sameAs, ['https://www.facebook.com/unifightjudoclub/']);
    assert.equal(new URL(club.url).pathname, `${base}${l}/`);
    const venues = JSON.parse(readFileSync(new URL('../content/venues.json', import.meta.url), 'utf8'));
    const geo = JSON.parse(readFileSync(new URL('../content/venues-geo.json', import.meta.url), 'utf8'));
    assert.equal(club.location.length, Object.keys(venues).length);
    // venues without a reliable geocode carry no geo; Atlit is ~12 km south of Haifa
    assert.equal(club.location.filter((p) => p.geo).length, Object.keys(geo).length);
    for (const p of club.location) {
      assert.ok(p.name && p.address.streetAddress && p.address.addressLocality, JSON.stringify(p));
      if (p.geo) assert.ok(Math.abs(p.geo.latitude - 32.8) < 0.15 && Math.abs(p.geo.longitude - 35) < 0.1);
    }
  });
}

test('news posts carry NewsArticle JSON-LD', () => {
  const posts = indexable.filter((p) => /\/news\/[^/]+\/$/.test(p));
  assert.ok(posts.length > 0);
  for (const path of posts) {
    const [a] = jsonLd(read(path.slice(base.length) + 'index.html'));
    assert.equal(a['@type'], 'NewsArticle', path);
    assert.ok(a.headline && a.datePublished && a.author.name && a.image.length, path);
    assert.equal(new URL(a.url).pathname, path);
  }
});

test('every page links the club favicon', () => {
  const pages = readdirSync(new URL('../dist/', import.meta.url), { recursive: true }).filter((f) => f.endsWith('.html'));
  for (const f of pages) assert.match(readFileSync(new URL(`../dist/${f}`, import.meta.url), 'utf8'), /rel="icon"[^>]*favicon/, f);
  for (const f of ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png']) assert.ok(existsSync(new URL(`../dist/${f}`, import.meta.url)), f);
});
