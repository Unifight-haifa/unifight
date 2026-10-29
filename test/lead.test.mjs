import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const read = (p) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const site = json('../content/site.json');
const venues = json('../content/venues.json');
const LANGS = [['he', 'rtl'], ['ru', 'ltr'], ['en', 'ltr']];
const form = (html) => html.match(/<form class="lf-f"[\s\S]*?<\/form>/)[0];

test('the lead form is on the landing in he, ru and en with its required fields', () => {
  for (const [l, d] of LANGS) {
    const html = read(`${l}/index.html`);
    assert.ok(html.includes(`<html lang="${l}" dir="${d}"`), l);
    const f = form(html);
    for (const re of [/<input name="name" required/, /<input name="phone" type="tel" required/, /name="who" value="child" required/, /name="who" value="adult"/,
      /<input name="age" type="number" required/, /<select name="hall">/, /<textarea name="message"/, /<input type="checkbox" name="consent" value="yes" required>/]) {
      assert.match(f, re, `${l}: ${re}`);
    }
    // honeypot: off-screen, out of the tab order and hidden from screen readers
    assert.match(f, /<label class="vh" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"><\/label>/, l);
    assert.match(f, new RegExp(`<a href="/[^"]*${l}/privacy/">`), `${l}: consent links the privacy page`);
    for (const k of ['data-tpl', 'data-after', 'data-bad-phone']) assert.match(f, new RegExp(` ${k}="[^"]+"`), `${l}: ${k} resolved to one language`);
    assert.match(f, /data-tpl="[^"]*\{hall\}/, l);
    assert.match(f, /data-after="[^"]*\{hall\}/, l);
  }
});

test('the hall select lists exactly the venues in content/venues.json, labelled in the page language', () => {
  for (const [l] of LANGS) {
    const opts = [...form(read(`${l}/index.html`)).matchAll(/<option value="([a-z-]*)" label="([^"]*)"/g)];
    assert.equal(opts[0][1], '', 'first option is "not sure yet"');
    assert.deepEqual(opts.slice(1).map((o) => o[1]).sort(), Object.keys(venues).sort(), l);
    for (const [, k, label] of opts.slice(1)) assert.equal(label, venues[k][l].replace(/"/g, '&quot;'), `${l}: ${k}`);
  }
});

test('with no endpoint the form submits to WhatsApp; with one it posts there', () => {
  const ep = site.contact.lead_endpoint;
  assert.equal(typeof ep, 'string');
  if (ep) assert.match(ep, /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/);
  const f = form(read('en/index.html'));
  assert.ok(f.includes(`data-endpoint="${ep}"`));
  assert.ok(f.includes('data-wa="https://wa.me/972547632054"'));
  assert.ok(f.includes(ep ? '<span data-l="en">Send</span>' : '<span data-l="en">Send via WhatsApp</span>'));
});

test('the phone check accepts Israeli numbers only', () => {
  const js = read('he/index.html');
  const re = new RegExp(js.match(/\/(\^\(\?:\\\+\?9720\?\|0\)[^/]+)\/\.test\(tel\(\)\)/)[1]);
  const norm = (s) => s.replace(/[\s().-]/g, '');
  for (const ok of ['054-763-2054', '0547632054', '+972 54 763 2054', '972547632054', '+972-0547632054', '04-8123456', '077-1234567']) assert.ok(re.test(norm(ok)), ok);
  for (const bad of ['12345', '054-763-205', '+1 202 555 0123', '0647632054', '05476320541']) assert.ok(!re.test(norm(bad)), bad);
  // the Apps Script repeats the rule server-side
  const gs = readFileSync(new URL('../integrations/lead-form/Code.gs', import.meta.url), 'utf8');
  assert.ok(gs.includes(`var PHONE = ${re};`));
});

test('schedule WhatsApp buttons name the hall even before night.js adds the class', () => {
  for (const [l] of LANGS) {
    const links = [...read(`${l}/index.html`).matchAll(/<li class="ses"[^>]*data-v="([a-z-]+)"[\s\S]*?<a class="ses-wa" href="([^"]+)"/g)];
    assert.ok(links.length > 10, l);
    for (const [, v, href] of links) assert.ok(decodeURIComponent(new URL(href.replace(/&amp;/g, '&')).searchParams.get('text')).endsWith(venues[v][l]), `${l}: ${v}`);
  }
});

test('venue cards open the form with their hall and show a group link only when one is set', () => {
  for (const [l] of LANGS) {
    const html = read(`${l}/index.html`);
    for (const [k, v] of Object.entries(venues)) {
      const card = html.match(new RegExp(`<article class="venue rv" id="v-${k}"[\\s\\S]*?</article>`))[0];
      assert.ok(card.includes(`<a href="#lead" data-hall="${k}">`), `${l}: ${k}`);
      if (v.whatsapp_group) assert.match(v.whatsapp_group, /^https:\/\/chat\.whatsapp\.com\/\w+$/, k);
      assert.equal(card.includes('placement="venue_group"'), !!v.whatsapp_group, `${l}: ${k}`);
    }
  }
});

// Code.gs against stand-ins for the Apps Script services
function gas(props = { NOTIFY_EMAIL: 'club@example.org' }) {
  const rows = [], mails = [];
  const sheet = { appendRow: (r) => rows.push(r), setFrozenRows() {}, getDataRange: () => ({ getValues: () => rows }) };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (rows.length ? sheet : null), insertSheet: () => sheet }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    MailApp: { sendEmail: (m) => mails.push(m) },
    ContentService: { createTextOutput: (s) => s },
    Utilities: { formatDate: () => '29.10 10:00' },
  };
  vm.runInNewContext(readFileSync(new URL('../integrations/lead-form/Code.gs', import.meta.url), 'utf8'), ctx);
  return { ctx, rows, mails };
}
const LEAD = { lang: 'ru', name: 'Тест', phone: '054-763-2054', who: 'child', age: '8', hall: 'ein-hayam', hall_name: 'Эйн-ха-Ям', message: '', consent: 'yes' };

test('Apps Script: a valid lead becomes a row and an email with a wa.me link', () => {
  const { ctx, rows, mails } = gas();
  assert.equal(ctx.doPost({ parameter: LEAD }), 'ok');
  assert.deepEqual([...rows[0]], ['time', 'lang', 'hall', 'hall_name', 'name', 'phone', 'who', 'age', 'message', 'status']);
  assert.deepEqual([...rows[1]].slice(1), ['ru', 'ein-hayam', 'Эйн-ха-Ям', 'Тест', "'0547632054", 'child', '8', '', 'new']);
  assert.ok(rows[1][0] instanceof Date || Object.prototype.toString.call(rows[1][0]) === '[object Date]');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'club@example.org');
  assert.match(mails[0].subject, /Эйн-ха-Ям/);
  assert.match(mails[0].body, /https:\/\/wa\.me\/972547632054/);
});

test('Apps Script: honeypot, bad input and formula injection', () => {
  const { ctx, rows, mails } = gas();
  assert.equal(ctx.doPost({ parameter: { ...LEAD, website: 'spam' } }), 'ok');
  for (const bad of [{ phone: '12345' }, { consent: '' }, { who: 'pet' }, { age: '200' }, { name: '' }, { lang: 'fr' }, { hall: '<x>' }]) {
    assert.equal(ctx.doPost({ parameter: { ...LEAD, ...bad } }), 'bad request', JSON.stringify(bad));
  }
  assert.equal(rows.length, 0);
  assert.equal(mails.length, 0);
  ctx.doPost({ parameter: { ...LEAD, name: '=HYPERLINK("x")', message: '+1' } });
  assert.equal(rows[1][4], `'=HYPERLINK("x")`);
  assert.equal(rows[1][8], "'+1");
});

test('Apps Script: no recipient set keeps the row and sends nothing; digest lists open leads', () => {
  const quiet = gas({});
  assert.equal(quiet.ctx.doPost({ parameter: LEAD }), 'ok');
  assert.equal(quiet.rows.length, 2);
  assert.equal(quiet.mails.length, 0);
  const { ctx, rows, mails } = gas({ NOTIFY_EMAIL: 'a@example.org', DIGEST_EMAIL: 'b@example.org' });
  ctx.doPost({ parameter: LEAD });
  ctx.doPost({ parameter: { ...LEAD, name: 'Done' } });
  rows[2][9] = 'called';
  ctx.dailyDigest();
  const digest = mails.at(-1);
  assert.equal(digest.to, 'b@example.org');
  assert.match(digest.subject, /: 1$/);
  assert.ok(digest.body.includes('Тест') && !digest.body.includes('Done'));
});
