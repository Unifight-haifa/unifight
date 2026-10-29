import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BANNED, NIVHERET } from '../src/lib/club-check.mjs';
import { checkNews, checkRenderedBody } from '../src/lib/news-check.mjs';
import { LIMITS, fit, plainText, socialTexts } from '../src/lib/social.mjs';

const dist = new URL('../dist/', import.meta.url);
const src = new URL('../src/content/news/', import.meta.url);
const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
const LANGS = { he: 'rtl', ru: 'ltr', en: 'ltr' };
const meta = (html, prop) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];

const posts = readdirSync(src).map((dir) => ({
  dir,
  slug: dir.slice(11),
  draft: /^draft:\s*true\s*$/m.test(readFileSync(new URL(`${dir}/index.he.md`, src), 'utf8')),
}));
const published = posts.filter((p) => !p.draft);
const drafts = posts.filter((p) => p.draft);
const page = (l, slug) => readFileSync(new URL(`${l}/news/${slug}/index.html`, dist), 'utf8');
const feed = () => JSON.parse(readFileSync(new URL('news.json', dist), 'utf8'));

test('fixtures cover both a published and a draft post', () => {
  assert.ok(published.length > 0 && drafts.length > 0);
});

for (const { slug } of published) {
  for (const [l, d] of Object.entries(LANGS)) {
    test(`${l}/news/${slug}/ exists with lang="${l}" dir="${d}" and is listed`, () => {
      assert.ok(page(l, slug).includes(`<html lang="${l}" dir="${d}"`));
      const list = readFileSync(new URL(`${l}/news/index.html`, dist), 'utf8');
      assert.ok(list.includes(`href="${base}${l}/news/${slug}/"`));
    });

    test(`${l}/news/${slug}/ has article og tags and hreflang`, () => {
      const html = page(l, slug);
      assert.equal(meta(html, 'og:type'), 'article');
      for (const p of ['og:title', 'og:description', 'og:url']) assert.ok(meta(html, p), p);
      const img = new URL(meta(html, 'og:image'));
      assert.ok(img.pathname.endsWith('.jpeg') || img.pathname.endsWith('.jpg'), img.href);
      assert.ok(statSync(new URL(img.pathname.slice(base.length), dist)).size < 600_000);
      const alt = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(alt.sort(), Object.keys(LANGS).sort());
    });

    test(`${l}/news/${slug}/ share links carry the encoded post URL`, () => {
      const html = page(l, slug);
      const url = meta(html, 'og:url');
      const enc = encodeURIComponent(url);
      for (const host of ['https://wa.me/?text=', 'https://www.facebook.com/sharer/sharer.php?u=', 'https://t.me/share/url?url=']) {
        const href = html.match(new RegExp(`href="(${host.replace(/[?.]/g, '\\$&')}[^"]*)"`))?.[1];
        assert.ok(href?.includes(enc), host);
      }
      assert.match(html, new RegExp(`<a [^>]*href="${url}" data-copy`));
    });
  }
}

test('news.json is valid and lists every published post in all languages', () => {
  const items = feed();
  assert.deepEqual(items.map((p) => p.slug).sort(), published.map((p) => p.slug).sort());
  for (const p of items) {
    for (const l of Object.keys(LANGS)) {
      assert.equal(new URL(p.url[l]).pathname, `${base}${l}/news/${p.slug}/`);
      assert.ok(p.title[l] && p.summary[l].length <= 160);
    }
    assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(existsSync(new URL(new URL(p.cover).pathname.slice(base.length), dist)), p.cover);
  }
});

// [width, height] from a baseline or progressive JPEG's SOF marker
const jpegSize = (b) => {
  for (let i = 2; i < b.length; i += 2 + b.readUInt16BE(i + 2)) {
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
  }
};
const distFile = (url) => new URL(new URL(url).pathname.slice(base.length), dist);

test('post covers for og:image and the feeds are exactly 1200×630', () => {
  for (const { slug } of published) {
    for (const l of Object.keys(LANGS)) {
      const html = page(l, slug);
      assert.deepEqual([meta(html, 'og:image:width'), meta(html, 'og:image:height')], ['1200', '630'], `${l}/${slug}`);
      assert.deepEqual(jpegSize(readFileSync(distFile(meta(html, 'og:image')))), [1200, 630], `${l}/${slug}`);
    }
  }
});

test('/<lang>/rss.xml lists every published post in that language', () => {
  for (const l of Object.keys(LANGS)) {
    const xml = readFileSync(new URL(`${l}/rss.xml`, dist), 'utf8');
    assert.equal(xml, readFileSync(new URL(`${l}/news/rss.xml`, dist), 'utf8'));
    assert.match(xml, new RegExp(`^<\\?xml version="1.0" encoding="UTF-8"\\?><rss version="2.0"><channel><title>[^<]+</title><link>[^<]+</link><description>[^<]+</description><language>${l}</language>`));
    assert.ok(xml.endsWith('</channel></rss>'));
    const links = [...xml.matchAll(/<item><title>[^<]+<\/title><link>([^<]+)<\/link><guid>\1<\/guid><pubDate>[^<]+<\/pubDate><description>[^<]*<\/description><\/item>/g)].map((m) => m[1]);
    assert.equal(xml.split('<item>').length - 1, links.length, `${l}: every item well-formed`);
    assert.deepEqual(links.map((u) => new URL(u).pathname).sort(), published.map((p) => `${base}${l}/news/${p.slug}/`).sort());
  }
});

test('feed.json is a JSON Feed 1.1 with cover, coach and share text per post and language', () => {
  const f = JSON.parse(readFileSync(new URL('feed.json', dist), 'utf8'));
  assert.equal(f.version, 'https://jsonfeed.org/version/1.1');
  assert.ok(f.title && f.home_page_url && f.feed_url.endsWith(`${base}feed.json`));
  assert.equal(f.items.length, published.length * 3);
  assert.equal(new Set(f.items.map((i) => i.id)).size, f.items.length);
  for (const i of f.items) {
    assert.ok(i.id === i.url && i.title && i.content_text && i.authors[0].name, i.id);
    assert.equal(new URL(i.url).pathname, `${base}${i.language}/news/${i._unifight.slug}/`);
    assert.ok(!Number.isNaN(Date.parse(i.date_published)));
    assert.deepEqual(jpegSize(readFileSync(distFile(i.image))), [1200, 630]);
    assert.ok(existsSync(new URL(`../content/coaches/${i._unifight.coach}.json`, import.meta.url)), i._unifight.coach);
    assert.ok(i._unifight.share_text.includes(i.url), i.id);
  }
});

test('every page advertises its language feed and feed.json', () => {
  for (const l of Object.keys(LANGS)) {
    for (const p of [`${l}/index.html`, `${l}/news/index.html`, `${l}/contact/index.html`]) {
      const html = readFileSync(new URL(p, dist), 'utf8');
      assert.ok(html.includes(`<link rel="alternate" type="application/rss+xml"`) && html.includes(`href="${base}${l}/rss.xml"`), p);
      assert.ok(html.includes(`<link rel="alternate" type="application/feed+json"`) && html.includes(`href="${base}feed.json"`), p);
    }
  }
});

test('draft posts are absent from dist', () => {
  for (const { slug } of drafts) {
    for (const l of Object.keys(LANGS)) assert.ok(!existsSync(new URL(`${l}/news/${slug}/`, dist)), `${l}/${slug}`);
    assert.ok(!feed().some((p) => p.slug === slug));
  }
});

function rejects(file, re) {
  const root = mkdtempSync(join(tmpdir(), 'news-'));
  try {
    cpSync(new URL(published[0].dir, src), join(root, published[0].dir), { recursive: true });
    rmSync(join(root, published[0].dir, file));
    assert.throws(() => checkNews(pathToFileURL(`${root}/`)), re);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('content check accepts the real posts', () => assert.doesNotThrow(() => checkNews(src)));
test('content check rejects a post missing a language', () => rejects('index.ru.md', /index\.ru\.md is missing/));
test('content check rejects a post whose cover is missing', () => rejects('cover.jpg', /cover cover\.jpg not found/));

test('content check rejects raw HTML in a post', () => {
  const root = mkdtempSync(join(tmpdir(), 'news-'));
  try {
    const dir = join(root, published[0].dir);
    cpSync(new URL(published[0].dir, src), dir, { recursive: true });
    const f = join(dir, 'index.ru.md');
    const orig = readFileSync(f, 'utf8');
    for (const [bad, re] of [
      ['<img src=x onerror=alert(1)>', /raw HTML/],
      ['`a` <script>alert(1)</script> `b`', /raw HTML/],
      ['<javascript:alert(1)>', /raw HTML/],
      ['[x](javascript:alert(1))', /link target/],
      ['[x]( JaVaScRiPt:alert(1))', /link target/],
      ['[x](&#106;avascript:alert(1))', /link target/],
      ['[r]: data:text/html,hi', /link target/],
      ['[click][x]\n\n[x]: javascript:alert(1) "t"', /link target/],
    ]) {
      writeFileSync(f, `${orig}\n${bad}\n`);
      assert.throws(() => checkNews(pathToFileURL(`${root}/`)), re, bad);
    }
    writeFileSync(f, `${orig}\n[site](https://example.org/x) ![p](photo-2.jpg) [a](/unifight/ru/)\n`);
    assert.doesNotThrow(() => checkNews(pathToFileURL(`${root}/`)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rendered post bodies contain only safe tags and links', () => {
  for (const l of ['he', 'ru', 'en']) {
    for (const d of readdirSync(new URL(`${l}/news/`, dist), { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const html = readFileSync(new URL(`${l}/news/${d.name}/index.html`, dist), 'utf8');
      const body = html.split('class="news-body">')[1]?.split('<footer class="news-end">')[0];
      assert.ok(body, `${l}/${d.name} has a body`);
      assert.doesNotThrow(() => checkRenderedBody(body), `${l}/${d.name}`);
    }
  }
});

test('rendered-body gate rejects unsafe output', () => {
  for (const bad of [
    '<p><a href="javascript:alert(1)">x</a></p>',
    '<p><a href="JaVaScRiPt:alert(1)">x</a></p>',
    '<p><a href="&#106;avascript:alert(1)">x</a></p>',
    '<p><a href=javascript:alert(1)>x</a></p>',
    '<p><img src="data:image/svg+xml,x"></p>',
    '<p><a href="//evil.example">x</a></p>',
    '<p><img src=x onerror=alert(1)></p>',
    '<script>alert(1)</script>',
    '<p><iframe src="https://e.example"></iframe></p>',
    '<p><img/src=x/onerror=alert(1)></p>',
    '<p><svg/onload=alert(1)></p>',
    '<p><a href="https://ok.example" x="y"z onclick=alert(1)>x</a></p>',
  ]) assert.throws(() => checkRenderedBody(bad), undefined, bad);
  assert.throws(() => checkRenderedBody('<p><img alt="a>b" onerror=alert(1) src="/x.jpg"></p>'), /event handler/);
  assert.doesNotThrow(() => checkRenderedBody('<p>Hi &lt;img src=x onerror=alert(1)&gt; and src=x onclick=y in prose</p>'));
  assert.doesNotThrow(() => checkRenderedBody('<p><a href="https://example.org">a</a> <img src="/unifight/_astro/c.jpg" srcset="/unifight/_astro/c.jpg 1x, /unifight/_astro/d.jpg 2x"> <a href="#t">t</a></p>'));
});

const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const social = json('content/social.json');

test('social text: markdown becomes plain text, long posts are trimmed cleanly', () => {
  assert.equal(
    plainText('## Hi\n\n**Bold** and _it_ [link](https://x.example) ![p](photo-2.jpg)\n\n- one\n- two\n\n> quote &lt;3 snake_case\n\n[r]: https://x.example'),
    'Hi\n\nBold and it link\n\n• one\n• two\n\nquote <3 snake_case',
  );
  const body = 'слово '.repeat(1000);
  const t = socialTexts({ title: 'T', body, url: 'https://e.example/p/', hashtags: ['#a', '#b', '#c'], linkInBio: 'bio' });
  assert.ok(t.instagram.length <= LIMITS.instagram, String(t.instagram.length));
  assert.match(t.instagram, /слово…\n\nbio\n\n#a #b #c$/);
  assert.ok(!t.instagram.includes('https://'));
  for (const k of ['youtube', 'whatsapp']) assert.ok(t[k].includes('\n\nhttps://e.example/p/\n\n#a #b #c') && t[k].length <= LIMITS[k], k);
  assert.equal(fit('abc', 3), 'abc');
});

test('social hashtags are 3-6 real hashtags per language', () => {
  for (const l of Object.keys(LANGS)) {
    const tags = social.hashtags[l];
    assert.ok(tags.length >= 3 && tags.length <= 6, l);
    for (const h of tags) assert.match(h, /^#[\p{L}\p{N}_]+$/u, h);
    assert.ok(social.link_in_bio[l], l);
  }
});

for (const { slug } of published) {
  for (const l of Object.keys(LANGS)) {
    test(`${l}/news/${slug}/ ends with a labelled icon share row and no staff social-text kit`, () => {
      const html = page(l, slug);
      const nav = html.match(/<nav class="news-share"[\s\S]*?<\/nav>/)?.[0];
      assert.ok(nav, 'share row');
      const icons = [...nav.matchAll(/<(?:a|button) [^>]*class="share-ico"[^>]*>/g)].map((m) => m[0]);
      assert.equal(icons.length, 5);
      for (const tag of icons) assert.match(tag, /aria-label="[^"]+"/, tag);
      assert.match(nav, /<button type="button" class="share-ico" hidden data-share/);
      assert.match(nav, /class="share-status" role="status" aria-live="polite"/);
      // owner rejected the public copy-for-Instagram/YouTube block (2026-10-29); feed.json still carries the share text
      assert.ok(!/news-social|<textarea/.test(html), `${l}/${slug}`);
    });
  }
}

const glossary = json('content/glossary.json');
const triple = (o) => `${o.he}|${o.ru}|${o.en}`;

test('glossary coach names match content/coaches exactly', () => {
  const dir = new URL('../content/coaches/', import.meta.url);
  const names = readdirSync(dir).filter((f) => !f.startsWith('_')).map((f) => triple(JSON.parse(readFileSync(new URL(f, dir), 'utf8')).name));
  assert.deepEqual(glossary.terms.coaches.map(triple).sort(), names.sort());
});

test('glossary venues match content/venues.json', () => {
  assert.deepEqual(glossary.terms.venues.map(triple).sort(), Object.values(json('content/venues.json')).map(triple).sort());
});

test('glossary keeps nivheret as the club team and «тренера» as the plural', () => {
  const all = Object.values(glossary.terms).flat();
  for (const e of all) for (const l of Object.keys(LANGS)) assert.ok(e[l]?.trim() && !BANNED.test(e[l]), `${l}: ${e[l]}`);
  const niv = all.find((e) => e.he === 'נבחרת המועדון');
  for (const l of Object.keys(LANGS)) assert.match(niv[l], NIVHERET);
  assert.ok(all.some((e) => e.ru === 'тренера') && glossary.rules.some((r) => r.includes('«тренера»')));
});

test('the n8n Translate prompt embeds the current glossary', () => {
  const t = json('n8n/news-publish.json').nodes.find((n) => n.name === 'Translate');
  const { rules, terms } = glossary;
  assert.ok(t.parameters.options.system.includes(`GLOSSARY: ${JSON.stringify({ rules, terms })}\n`), 'out of sync: re-embed with the command in docs/n8n-news-design.md §5');
});

test('a post with video: shows the click-to-play player, posts without it do not', () => {
  const id = (p) => readFileSync(new URL(`${p.dir}/index.he.md`, src), 'utf8').match(/^video:\s*(\S+)\s*$/m)?.[1];
  const withVideo = published.filter(id);
  assert.ok(withVideo.length > 0, 'expected at least one post with video:');
  for (const p of published) {
    for (const l of Object.keys(LANGS)) {
      const html = page(l, p.slug);
      if (!id(p)) {
        assert.ok(!html.includes('data-video-modal'), `${l}/${p.slug}`);
        continue;
      }
      assert.match(html, new RegExp(`<div class="news-video">\\s*<a href="https://youtu\\.be/${id(p)}" data-video="${id(p)}"`), `${l}/${p.slug}`);
      assert.ok(html.includes('data-video-modal') && html.includes('youtube-nocookie.com/embed/'), `${l}/${p.slug}`);
      // YouTube is only contacted after the click
      assert.ok(!/<iframe/i.test(html), `${l}/${p.slug}`);
    }
  }
});
