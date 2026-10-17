import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const LANGS = ['he', 'ru', 'en'];
const read = (p) => readFileSync(new URL(p, dist), 'utf8');

// backgrounds behind text, logos next to the visible club name, the avatar beside its coach's heading
const DECORATIVE = ['brand/logo.png', 'img-night/groundwork.jpg', 'img-night/medals-team.jpg', 'img-night/train-georgia-randori.jpg', 'img-night/kids-belts-throw.jpg', 'class="sc-ava"'];

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
