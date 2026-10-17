import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const htmlFiles = (dir) => readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => join(dir, f));
const dist = new URL('../dist/', import.meta.url).pathname;

test('without PUBLIC_GA_ID nothing analytics-related is rendered', { skip: !!process.env.PUBLIC_GA_ID && 'dist was built with an ID' }, () => {
  for (const f of htmlFiles(dist)) {
    const html = readFileSync(f, 'utf8');
    assert.ok(!/googletagmanager|gtag|data-consent|google-site-verification/.test(html), f);
  }
});

// one extra build with a fake ID; the consent code path is what's under test
let ga;
before(() => {
  ga = mkdtempSync(join(tmpdir(), 'unifight-ga-'));
  execFileSync('npx', ['astro', 'build', '--outDir', ga], {
    env: { ...process.env, PUBLIC_GA_ID: 'G-TEST123', PUBLIC_GSC_VERIFICATION: 'gsc-test-token' },
    stdio: 'pipe',
  });
});
after(() => ga && rmSync(ga, { recursive: true, force: true }));

const consentScript = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('googletagmanager'));

test('gtag.js is only injected from inside load(), and load() only runs on "granted"', () => {
  const pages = htmlFiles(ga).filter((f) => readFileSync(f, 'utf8').includes('googletagmanager'));
  assert.ok(pages.length >= 15, `${pages.length} pages`);
  for (const f of pages) {
    const html = readFileSync(f, 'utf8');
    assert.ok(!/<script[^>]+src="[^"]*googletagmanager/.test(html), f);
    assert.equal(html.match(/googletagmanager/g).length, 1, f);
    const js = consentScript(html);
    const body = js.slice(js.indexOf('function load() {'), js.indexOf('\nfunction choose('));
    assert.ok(body.includes("s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID"), f);
    const calls = js.split('\n').filter((l) => /\bload\(\)/.test(l) && !l.startsWith('function load'));
    assert.equal(calls.length, 2, f);
    for (const l of calls) assert.match(l, /=== 'granted'/, l);
  }
});

function run(stored) {
  const added = [];
  const box = { hidden: true, querySelector: () => ({ focus() {} }) };
  let onClick;
  const store = new Map(stored ? [['consent', stored]] : []);
  const ctx = {
    document: {
      querySelector: () => box,
      addEventListener: (type, fn) => type === 'click' && (onClick = fn),
      createElement: (tag) => ({ tag }),
      head: { appendChild: (el) => added.push(el) },
      documentElement: { lang: 'he' },
      cookie: '',
    },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    location: { hostname: 'example.github.io', reload() {} },
  };
  ctx.window = ctx;
  const js = consentScript(readFileSync(join(ga, 'he/index.html'), 'utf8'));
  vm.runInNewContext(js, ctx);
  const click = (dataset) => onClick({ target: { closest: () => ({ dataset, hasAttribute: () => false }) } });
  return { ctx, box, added, store, click };
}

test('first visit: banner shows, nothing loads until Accept', () => {
  const r = run(null);
  assert.equal(r.box.hidden, false);
  assert.deepEqual(r.added, []);
  r.click({ ga: 'whatsapp_click', gaPlacement: 'contact' });
  assert.equal(r.ctx.gtag, undefined);
  r.click({ consentChoice: 'granted' });
  assert.equal(r.box.hidden, true);
  assert.equal(r.store.get('consent'), 'granted');
  assert.equal(r.added.length, 1);
  assert.equal(r.added[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  r.click({ ga: 'whatsapp_click', gaPlacement: 'contact', gaVenue: 'dror-school' });
  const ev = r.ctx.dataLayer.filter((a) => a[0] === 'event');
  assert.deepEqual(JSON.parse(JSON.stringify(ev)), [{ 0: 'event', 1: 'whatsapp_click', 2: { language: 'he', placement: 'contact', venue: 'dror-school' } }]);
});

test('Decline stores the choice and loads nothing', () => {
  const r = run(null);
  r.click({ consentChoice: 'denied' });
  assert.equal(r.store.get('consent'), 'denied');
  assert.equal(r.box.hidden, true);
  assert.deepEqual(r.added, []);
});

test('a stored choice is respected on the next visit', () => {
  const denied = run('denied');
  assert.equal(denied.box.hidden, true);
  assert.deepEqual(denied.added, []);
  const granted = run('granted');
  assert.equal(granted.box.hidden, true);
  assert.equal(granted.added.length, 1);
});

test('each page language gets its own banner, and the tracked elements are tagged', () => {
  const read = (p) => readFileSync(join(ga, p), 'utf8');
  for (const [l, accept] of [['he', 'אישור'], ['ru', 'Принять'], ['en', 'Accept']]) {
    const html = read(`${l}/index.html`);
    assert.ok(html.includes(`data-consent-choice="granted">${accept}<`), l);
    assert.ok(html.includes('data-consent-open'), `${l} footer link`);
    for (const ev of ['whatsapp_click', 'phone_click', 'social_click', 'schedule_filter', 'map_open', 'language_switch']) {
      assert.ok(html.includes(`data-ga="${ev}"`), `${l} ${ev}`);
    }
    assert.ok(read(`${l}/news/new-website/index.html`).includes('data-ga="news_share"'), l);
    assert.ok(read(`${l}/privacy/index.html`).includes('data-consent-open'), `${l} privacy footer link`);
  }
  assert.ok(read('index.html').includes('<meta name="google-site-verification" content="gsc-test-token">'));
});
