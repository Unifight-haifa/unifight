import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_CHARS, buildPrompt, detectLang, fixRu } from '../src/lib/translate-prompt.mjs';

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
