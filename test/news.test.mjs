import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkNews, checkRenderedBody } from '../src/lib/news-check.mjs';

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
      const body = html.split('class="news-body">')[1]?.split('</article>')[0];
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
  ]) assert.throws(() => checkRenderedBody(bad), undefined, bad);
  assert.throws(() => checkRenderedBody('<p><img alt="a>b" onerror=alert(1) src="/x.jpg"></p>'), /event handler/);
  assert.doesNotThrow(() => checkRenderedBody('<p>Hi &lt;img src=x onerror=alert(1)&gt; and src=x onclick=y in prose</p>'));
  assert.doesNotThrow(() => checkRenderedBody('<p><a href="https://example.org">a</a> <img src="/unifight/_astro/c.jpg" srcset="/unifight/_astro/c.jpg 1x, /unifight/_astro/d.jpg 2x"> <a href="#t">t</a></p>'));
});
