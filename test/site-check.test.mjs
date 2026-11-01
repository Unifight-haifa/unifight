import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeSite, checkSite, SITE_FILES, IMAGE_SLOTS, CJK } from '../src/lib/site-check.mjs';

const read = (id) => JSON.parse(readFileSync(new URL(`../content/site/${id}.json`, import.meta.url), 'utf8'));
const at = (id) => `content/site/${id}.json`;
// Merge an edited copy of the real file and run the checks, as /save does.
const save = (id, edit) => {
  const cur = read(id);
  const input = structuredClone(cur);
  edit(input);
  const m = mergeSite(cur, input, at(id));
  checkSite(id, m, cur);
  return m;
};

test('every real content/site file merges onto itself and passes unchanged', () => {
  assert.deepEqual(SITE_FILES, ['contact', 'hero', 'footer', 'ui', 'pages']);
  for (const id of SITE_FILES) {
    const cur = read(id);
    const m = mergeSite(cur, cur, at(id));
    assert.deepEqual(m, cur, id);
    checkSite(id, m, cur);
  }
  assert.deepEqual(Object.keys(IMAGE_SLOTS).sort(), Object.keys(read('images')).sort());
});

test('mergeSite copies values only: unknown keys, type changes and length changes throw', () => {
  const cur = read('hero');
  const m = mergeSite(cur, { subline: { en: 'New line.' } }, at('hero'));
  assert.equal(m.subline.en, 'New line.');
  assert.equal(m.subline.he, cur.subline.he);
  assert.deepEqual(m.headline, cur.headline);
  assert.throws(() => mergeSite(cur, { extra: 1 }, at('hero')), /content\/site\/hero\.json\.extra: unknown field/);
  assert.throws(() => mergeSite(cur, { subline: { de: 'x' } }, at('hero')), /subline\.de: unknown field/);
  assert.throws(() => mergeSite(cur, { subline: 'flat' }, at('hero')), /subline: must be/);
  assert.throws(() => mergeSite(cur, { subline: { en: 5 } }, at('hero')), /subline\.en: must be/);
  const c = read('contact');
  assert.throws(() => mergeSite(c, { phones: [] }, at('contact')), /phones: must have 1 item/);
  assert.throws(() => mergeSite(c, { social: [...c.social, c.social[0]] }, at('contact')), /social: must have 3 items/);
  assert.throws(() => mergeSite(c, { social: [{}, {}, { url: 'https://tiktok.com/@x' }] }, at('contact')), /social\[2\]\.url: unknown field/);
  assert.throws(() => mergeSite(c, JSON.parse('{"__proto__": {"x": 1}}'), at('contact')), /unknown field/);
});

test('source, confidence, placeholder, note, legal_source and id keep their current value', () => {
  const c = read('contact');
  const m = mergeSite(c, {
    phones: [{ source: 'x', confidence: 'confirmed' }],
    email: { note: 'changed', confidence: 'guess' },
    social: [{ id: 'evil' }, { confidence: 'confirmed' }, { placeholder: false }],
  }, at('contact'));
  assert.deepEqual(m, c);
  const f = read('footer');
  assert.deepEqual(mergeSite(f, { legal_source: 'https://x.test/', accessibility_link: { placeholder: false } }, at('footer')), f);
});

test('every he/ru/en text keeps three strings; an emptied language is refused', () => {
  assert.throws(() => save('hero', (h) => { h.subline.ru = ''; }), /subline\.ru: is empty/);
  assert.throws(() => save('ui', (u) => { u.lead.name.he = '  '; }), /lead\.name\.he: is empty/);
  assert.equal(save('contact', (c) => { c.lead_endpoint = ''; }).lead_endpoint, '');
});

test('Japanese or Chinese characters are refused anywhere', () => {
  assert.ok(CJK.test('柔道') && CJK.test('カ') && !CJK.test('Дзюдо'));
  assert.throws(() => save('footer', (f) => { f.tagline.en = 'Judo 柔道'; }), /tagline\.en: Japanese or Chinese/);
  assert.throws(() => save('pages', (p) => { p.map.title.ru = 'カ'; }), /map\.title\.ru: Japanese or Chinese/);
});

test('contact: tel, phone, email, social urls and the lead endpoint are checked', () => {
  const m = save('contact', (c) => { c.phones[0].phone = '04-812-3456'; c.phones[0].tel = '+97248123456'; });
  assert.equal(m.phones[0].tel, '+97248123456');
  for (const [edit, re] of [
    [(c) => { c.phones[0].tel = '+97212345678'; }, /phones\[0\]\.tel/],
    [(c) => { c.phones[0].tel = '054-763-2054'; }, /phones\[0\]\.tel/],
    [(c) => { c.phones[0].tel = '+972547632055'; }, /phones\[0\]: phone and tel/],
    [(c) => { c.phones[0].phone = '054<b>7632054'; }, /phones\[0\]\.phone/],
    [(c) => { c.email.value = 'no-at-sign'; }, /email\.value/],
    [(c) => { c.email.value = 'a"b@x.com'; }, /email\.value/],
    [(c) => { c.social[0].url = 'http://www.facebook.com/x'; }, /social\[0\]\.url/],
    [(c) => { c.social[1].url = 'https://x.test/" onclick="y'; }, /social\[1\]\.url/],
    [(c) => { c.social[1].url = 'https://x.test/<a'; }, /social\[1\]\.url/],
    [(c) => { c.lead_endpoint = 'javascript:alert(1)'; }, /lead_endpoint/],
  ]) assert.throws(() => save('contact', edit), re);
  // TikTok has no url yet; its placeholder texts stay editable
  assert.equal(save('contact', (c) => { c.social[2].en = '[TikTok soon]'; }).social[2].en, '[TikTok soon]');
  assert.equal(save('contact', (c) => { c.lead_endpoint = 'https://leads.example.org/in'; }).lead_endpoint, 'https://leads.example.org/in');
});

test('hero: headline keeps ". " in every language; cta href is #anchor or https', () => {
  assert.throws(() => save('hero', (h) => { h.headline.en = 'Strong on the mat'; }), /headline\.en: must contain/);
  assert.equal(save('hero', (h) => { h.cta_primary.href = '#schedule'; }).cta_primary.href, '#schedule');
  assert.equal(save('hero', (h) => { h.cta_secondary.href = 'https://example.org/x'; }).cta_secondary.href, 'https://example.org/x');
  for (const bad of ['javascript:alert(1)', '#a b', '#"x', 'https://x.test/"', '']) {
    assert.throws(() => save('hero', (h) => { h.cta_primary.href = bad; }), /cta_primary\.href/, bad);
  }
});

test('ui: lead templates keep every {placeholder} per language', () => {
  assert.throws(() => save('ui', (u) => { u.lead.tpl.ru = u.lead.tpl.ru.replace('{phone}', ''); }), /lead\.tpl\.ru: keep \{phone\}/);
  assert.throws(() => save('ui', (u) => { u.lead.after.he = 'שלום'; }), /lead\.after\.he: keep \{hall\}/);
  assert.match(save('ui', (u) => { u.lead.tpl.en = `Hello!\n${u.lead.tpl.en}`; }).lead.tpl.en, /^Hello!/);
});

test('pages: titles and descriptions stay unique per language', () => {
  assert.throws(() => save('pages', (p) => { p.video.title.en = p.gallery.title.en; }), /pages\.json: two pages share the en title/);
  assert.throws(() => save('pages', (p) => { p.map.desc.he = p.about.desc.he; }), /pages\.json: two pages share the he desc/);
  assert.equal(save('pages', (p) => { p.video.title.en = 'Videos'; }).video.title.en, 'Videos');
});

test('every link field in every file is empty, #anchor or https, at any depth', () => {
  const bad = 'javascript:alert(1)';
  const cases = {
    contact: [(c) => { c.social[0].url = bad; }, /social\[0\]\.url/],
    hero: [(h) => { h.cta_secondary.href = bad; }, /cta_secondary\.href/],
    footer: [(f) => { f.accessibility_link.href = bad; }, /accessibility_link\.href/],
    ui: [(u) => { u.lead.name.link = bad; }, /lead\.name\.link/],
    pages: [(p) => { p.map.og = { image_url: bad }; }, /map\.og\.image_url/],
  };
  assert.deepEqual(Object.keys(cases), SITE_FILES);
  for (const [id, [edit, re]] of Object.entries(cases)) {
    const cur = read(id);
    const m = structuredClone(cur);
    edit(m);
    // checkSite directly: a field the real file lacks can't get past mergeSite, but a future one could
    assert.throws(() => checkSite(id, m, cur), re, id);
  }
  const f = read('footer');
  for (const ok of ['', '#contact', 'https://example.org/a11y']) {
    checkSite('footer', { ...f, accessibility_link: { ...f.accessibility_link, href: ok } }, f);
  }
});
