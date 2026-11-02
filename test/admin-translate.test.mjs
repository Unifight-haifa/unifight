import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_CHARS, buildPrompt, detectLang, fixRu } from '../src/lib/translate-prompt.mjs';
import { translate } from '../integrations/admin-api/src/translate.mjs';

const glossary = JSON.parse(readFileSync(new URL('../content/glossary.json', import.meta.url), 'utf8'));
const bio = { glossary, fields: { bio: 'Алекс тренирует детей с 2010 года.' }, coach: 'Alex Kagan' };

test('the translate prompt embeds the live glossary and every rule', () => {
  const { system } = buildPrompt(bio);
  const { rules, terms } = glossary;
  assert.ok(system.includes(`GLOSSARY: ${JSON.stringify({ rules, terms })}`));
  for (const r of rules) assert.ok(system.includes(r), r);
  assert.ok(!/нивхерет|team \(nivheret\)/.test(system), 'stale n8n transliteration rule');
});

test('a coach bio stays about that coach; a schedule note is for parents', () => {
  assert.match(buildPrompt(bio).system, /bio of Alex Kagan.*only about this coach/s);
  const note = buildPrompt({ glossary, fields: { note: 'No class on Friday' }, context: 'schedule-note' }).system;
  assert.match(note, /short schedule notice for parents/);
  assert.doesNotMatch(note, /bio of/);
});

test('site text is for parents and visitors and names no coach', () => {
  const { system } = buildPrompt({ glossary, fields: { 'hero.subline': 'Judo for kids' }, context: 'site' });
  assert.match(system, /text on the club website for parents and visitors/);
  assert.doesNotMatch(system, /bio of/);
});

test('buildPrompt detects the source language and drops empty fields', () => {
  assert.equal(detectLang('שלום'), 'he');
  assert.equal(detectLang('Привет'), 'ru');
  assert.equal(detectLang('Hello'), 'en');
  const p = buildPrompt({ ...bio, fields: { bio: 'Привет', title: '  ' } });
  assert.equal(p.source_lang, 'ru');
  assert.deepEqual(p.keys, ['bio']);
  assert.deepEqual(JSON.parse(p.input), { source_lang: 'ru', fields: { bio: 'Привет' } });
  assert.equal(buildPrompt({ ...bio, source_lang: 'en' }).source_lang, 'en');
});

test('buildPrompt rejects empty and oversized text', () => {
  assert.throws(() => buildPrompt({ ...bio, fields: { bio: ' ' } }), /no text/);
  assert.throws(() => buildPrompt({ ...bio, fields: { a: 'x'.repeat(MAX_CHARS), b: 'y' } }), /text too long/);
});

test('fixRu turns «тренеры» into «тренера» and leaves other cases alone', () => {
  assert.equal(fixRu('Наши тренеры и Тренеры клуба'), 'Наши тренера и Тренера клуба');
  assert.equal(fixRu('с тренерами, у тренеров, тренерыч'), 'с тренерами, у тренеров, тренерыч');
});

const KEY = 'test-key-123';
const reply = (text, status = 200) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status });
  };
  return Object.assign(fn, { calls });
};
const ok = JSON.stringify({ he: { bio: 'אלכס' }, ru: { bio: 'Наши тренеры (эхо)' }, en: { bio: 'Alex coaches' } });
const args = { glossary, fields: { bio: 'אלכס מאמן ילדים' }, coach: 'Alex Kagan' };

test('translate posts once to Anthropic with the key, model and glossary prompt', async () => {
  const f = reply(ok);
  const out = await translate({ ANTHROPIC_KEY: KEY }, args, f);
  assert.equal(f.calls.length, 1);
  const [{ url, init, body }] = f.calls;
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-api-key'], KEY);
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  assert.equal(body.model, 'claude-sonnet-5-5');
  const p = buildPrompt(args);
  assert.equal(body.system, p.system);
  assert.deepEqual(body.messages, [{ role: 'user', content: p.input }]);
  assert.deepEqual(out, { he: { bio: 'אלכס מאמן ילדים' }, ru: { bio: 'Наши тренера (эхо)' }, en: { bio: 'Alex coaches' } });
  await translate({ ANTHROPIC_KEY: KEY, TRANSLATE_MODEL: 'claude-haiku-5-5' }, args, f);
  assert.equal(f.calls[1].body.model, 'claude-haiku-5-5');
});

test('translate parses fenced replies and rejects incomplete ones', async () => {
  const env = { ANTHROPIC_KEY: KEY };
  assert.equal((await translate(env, args, reply('```json\n' + ok + '\n```'))).en.bio, 'Alex coaches');
  await assert.rejects(translate(env, args, reply(JSON.stringify({ he: { bio: 'x' }, ru: { bio: 'x' } }))), /translation incomplete/);
  await assert.rejects(translate(env, args, reply(JSON.stringify({ he: {}, ru: { bio: 'x' }, en: { bio: '' } }))), /translation incomplete/);
  await assert.rejects(translate(env, args, reply('not json')), /translation incomplete/);
});

test('translate errors never echo the key or the text', async () => {
  for (const status of [401, 529]) {
    const err = await translate({ ANTHROPIC_KEY: KEY }, args, reply('bad ' + KEY, status)).catch((e) => e);
    assert.equal(err.message, `translation service ${status}`);
  }
  await assert.rejects(translate({}, args, reply(ok)), { message: 'not_configured' });
});
