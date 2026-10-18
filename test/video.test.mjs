import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { checkVideos } from '../src/lib/videos-check.mjs';

const json = (p) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), 'utf8'));
const videos = json('videos.json');
const thumbs = new URL('../public/videos/', import.meta.url);
const page = (l) => readFileSync(new URL(`../dist/${l}/video/index.html`, import.meta.url), 'utf8');
const landing = (l) => readFileSync(new URL(`../dist/${l}/index.html`, import.meta.url), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const TP = /youtube|ytimg|googlevideo/i;

test('every video renders on all three language pages', () => {
  assert.ok(videos.length > 0);
  for (const l of ['he', 'ru', 'en']) {
    const html = page(l);
    for (const v of videos) {
      assert.ok(html.includes(`data-video="${v.id}"`), `${l} ${v.id}`);
      assert.ok(html.includes(esc(v.title[l])) || html.includes(v.title[l]), `${l} ${v.id} title`);
      assert.ok(html.includes(`/videos/${v.thumb}"`), `${l} ${v.id} thumb`);
    }
  }
});

test('nothing from YouTube loads at rest; the player is built only in JS', () => {
  for (const html of ['he', 'ru', 'en'].flatMap((l) => [page(l), landing(l)])) {
    const l = html.match(/<html lang="(\w+)"/)[1];
    assert.ok(!/<iframe\b/i.test(html), l);
    for (const [tag] of html.matchAll(/<(img|iframe|link|source|video|script)\b[^>]*>/gi)) {
      for (const [, , url] of tag.matchAll(/\s(src|srcset|href)="([^"]*)"/gi)) assert.ok(!TP.test(url), `${l}: ${tag}`);
    }
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    assert.ok(scripts.includes("'https://www.youtube-nocookie.com/embed/'"), l);
  }
});

test('the landing film and coach profiles open listed uploads in the player; the teaser loop waits', () => {
  const coaches = readdirSync(new URL('../content/coaches/', import.meta.url)).filter((f) => !f.startsWith('_')).map((f) => json(`coaches/${f}`));
  const ids = [json('site.json').film.video, ...coaches.filter((c) => c.youtube).map((c) => c.youtube)];
  assert.ok(ids.length >= 3);
  for (const id of ids) assert.ok(videos.some((v) => v.id === id), `${id} is not in videos.json`);
  for (const l of ['he', 'ru', 'en']) {
    const html = landing(l);
    assert.ok(html.includes('data-video-modal'), l);
    for (const id of ids) assert.match(html, new RegExp(`<a [^>]*href="https://youtu.be/${id}" data-video="${id}" data-kind="video" data-title="[^"]+" data-ga="video_play"`), `${l} ${id}`);
    const video = html.match(/<video\b[^>]*>/)[0];
    for (const a of [' muted', ' playsinline', ' loop', ' preload="none"', ' poster="']) assert.ok(video.includes(a), `${l}: ${video}`);
  }
});

test('without JS every card is a plain youtu.be link', () => {
  for (const l of ['he', 'ru', 'en']) {
    const links = [...page(l).matchAll(/<a href="([^"]+)" data-video="([^"]+)"/g)];
    assert.equal(links.length, videos.length, l);
    for (const [, href, id] of links) assert.equal(href, `https://youtu.be/${id}`);
  }
});

test('sitemap lists the video page in every language', () => {
  const xml = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  for (const l of ['he', 'ru', 'en']) assert.match(xml, new RegExp(`<loc>[^<]*/${l}/video/</loc>`), l);
});

test('the videos.json check accepts the real file and rejects bad entries', () => {
  checkVideos(videos, thumbs);
  const ok = videos[0];
  assert.throws(() => checkVideos([{ ...ok, id: 'not-an-id' }], thumbs), /not a YouTube video id/);
  assert.throws(() => checkVideos([{ ...ok, id: 'BCyV2Lwp9Y4"' }], thumbs), /not a YouTube video id/);
  const { ru, ...noRu } = ok.title;
  assert.throws(() => checkVideos([{ ...ok, title: noRu }], thumbs), /title\.ru is missing/);
  assert.throws(() => checkVideos([{ ...ok, description: { ...ok.description, en: ' ' } }], thumbs), /description\.en is missing/);
  assert.throws(() => checkVideos([{ ...ok, thumb: 'nope.jpg' }], thumbs), /not found/);
  assert.throws(() => checkVideos([ok, ok], thumbs), /listed twice/);
});
