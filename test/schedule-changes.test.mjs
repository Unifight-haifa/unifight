import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { activeChanges, checkChanges, fillSchedule, renderSchedule, sessionKey } from '../src/lib/schedule-changes.mjs';

const read = (u) => JSON.parse(readFileSync(u, 'utf8'));
const fx = new URL('./fixtures/schedule-changes/', import.meta.url);
const entries = readdirSync(fx).sort().map((f) => [f, read(new URL(f, fx))]);
const sdir = new URL('../content/schedule/', import.meta.url);
const schedules = Object.fromEntries(readdirSync(sdir).map((f) => [f.slice(0, -5), read(new URL(f, sdir))]));
const venues = read(new URL('../content/venues.json', import.meta.url));
const TODAY = '2026-10-18';

test('a bad change file fails with a message naming the problem', () => {
  const [file, ok] = entries.find(([f]) => f.includes('move'));
  const bad = (patch) => () => checkChanges([[file, { ...ok, ...patch }]], schedules, venues);
  assert.throws(bad({ schedule: 'nobody' }), /unknown schedule "nobody"/);
  assert.throws(bad({ new: { ...ok.new, venue: 'moon' } }), /unknown venue "moon"/);
  assert.throws(bad({ session: { day: 3, start: '09:00' } }), /no session matches day 3 09:00/);
  assert.throws(bad({ from: '2026-10-22', to: '2026-10-21' }), /to \(2026-10-21\) is before from/);
  assert.throws(bad({ note: { he: 'x', ru: 'y' } }), /note\.en is missing/);
  assert.throws(bad({ id: 'other' }), /match the file name/);
  assert.throws(bad({ new: { ...ok.new, date: '2026-10-24' } }), /Saturday/);
  assert.throws(bad({ from: '2026-10-20', to: '2026-10-20' }), /falls on weekday 3/);
});

test('expired changes are dropped, the rest keep their display window', () => {
  const all = checkChanges(entries, schedules, venues);
  assert.equal(all.length, 5);
  const act = activeChanges(all, TODAY);
  assert.deepEqual(act.map((c) => c.id), ['2026-10-23-natanel-extra', '2026-10-20-natanel-cancel', '2026-10-21-natanel-move', '2026-11-03-natanel-note']);
  // cancel/move are announced 3 days ahead; extra/note show from `from`
  assert.equal(act.find((c) => c.type === 'cancel').show, '2026-10-17');
  assert.equal(act.find((c) => c.type === 'note').show, '2026-11-03');
});

test('changes render with data-from/data-to, future ones start hidden', () => {
  const act = activeChanges(checkChanges(entries, schedules, venues), TODAY);
  const { notice, sessions, extras } = renderSchedule(act, 'en', TODAY, schedules, venues, {});
  assert.match(notice, /<li id="chg-2026-11-03-natanel-note" class="chg chg-note" data-from="2026-11-03" data-to="2026-11-05" hidden>/);
  assert.match(notice, /<li id="chg-2026-10-20-natanel-cancel" class="chg chg-cancel" data-from="2026-10-17" data-to="2026-10-20">/);
  assert.match(sessions['natanel-zhurovel#8'], /class="ses-chg chg-cancel" data-from="2026-10-17" data-to="2026-10-20"><b>Cancelled · Tue 20 Oct/);
  assert.match(sessions['natanel-zhurovel#10'], /chg-move/);
  // the moved class lands on Thursday, the extra one on Friday, filterable by grade and venue
  assert.match(extras[4], /<li class="ses ses-x" data-v="leo-baeck-hadar" data-g="5-6"/);
  assert.match(extras[5], /<li class="ses ses-x" data-v="ein-hayam" data-g="3-7"[^>]* data-from="2026-10-18" data-to="2026-10-23">/);
  assert.equal(activeChanges(checkChanges(entries, schedules, venues), '2026-11-06').length, 0);
});

test('bot input cannot inject markup', () => {
  const [file, ok] = entries.find(([f]) => f.includes('move'));
  const bad = (patch, f = file) => () => checkChanges([[f, { ...ok, ...patch }]], schedules, venues);
  assert.throws(bad({ new: { ...ok.new, venue: '"><script>alert(1)</script>' } }), /unknown venue/);
  assert.throws(bad({ new: { ...ok.new, venue: 'constructor' } }), /unknown venue/);
  assert.throws(bad({ new: { ...ok.new, start: '16:00"><b>' } }), /HH:MM/);
  assert.throws(bad({ id: 'x"y' }, 'x"y.json'), /lowercase letters/);
  assert.throws(bad({ type: 'note' }), /note change takes no session/);
  // smuggled fields are dropped; ses only ever comes from the schedule file
  const [c] = checkChanges([[file, { ...ok, ses: { venue: '"><script>' }, evil: '<i>' }]], schedules, venues);
  assert.equal(c.evil, undefined);
  assert.equal(c.ses.venue, 'leo-baeck-hadar');
  const note = { he: '<script>alert("x")</script> $& $1', ru: '<script>', en: '"><img src=x onerror=alert(1)> $& $`' };
  const act = activeChanges(checkChanges([[file, { ...ok, note }]], schedules, venues), TODAY);
  const html = fillSchedule('<!--SCHED_CHANGES--><ul><!--SES_X 4--></ul><li><!--SES natanel-zhurovel#10--></li>', renderSchedule(act, 'en', TODAY, schedules, venues, {}));
  assert.doesNotMatch(html, /<script|<img/);
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt; $&amp; $`'));
  assert.doesNotMatch(html, /<!--/);
});

test('a change lands on its own coach\'s class; Barkai girls and boys are told apart by group', () => {
  const ok = { id: 'x', type: 'cancel', from: '2026-10-19', to: '2026-10-19', note: { he: 'a', ru: 'b', en: 'c' }, author: 'ilana-kratysh', created: '2026-10-18T10:00:00Z' };
  const one = (c) => checkChanges([['x.json', { ...ok, ...c }]], schedules, venues);
  assert.throws(() => one({ schedule: 'ilana-kratysh', session: { day: 1, start: '14:00' } }), /several sessions match day 1 14:00/);
  const [boys] = one({ schedule: 'ilana-kratysh', session: { day: 1, start: '14:00', group: 'boys' } });
  assert.equal(boys.ses.audience, 'boys');
  assert.deepEqual(boys.session, { day: 1, start: '14:00', group: 'boys' });
  // both coaches train Monday 19:30; each cancel marks only its own card
  const [nat] = one({ schedule: 'natanel-zhurovel', session: { day: 1, start: '19:30' } });
  const [ila] = one({ schedule: 'ilana-kratysh', session: { day: 1, start: '19:30' } });
  assert.notEqual(sessionKey(schedules, 'natanel-zhurovel', nat.ses), sessionKey(schedules, 'ilana-kratysh', ila.ses));
  const { sessions } = renderSchedule(activeChanges([boys, nat], TODAY), 'en', TODAY, schedules, venues, {});
  assert.deepEqual(Object.keys(sessions).sort(), [sessionKey(schedules, 'ilana-kratysh', boys.ses), sessionKey(schedules, 'natanel-zhurovel', nat.ses)].sort());
  assert.match(sessionKey(schedules, 'ilana-kratysh', boys.ses), /^ilana-kratysh#\d+$/);
});

test('the built landing lists every class of both coaches, with coach, audience and adults filters', () => {
  const dist = new URL('../dist/', import.meta.url);
  const n = (id) => schedules[id].sessions.length;
  for (const l of ['he', 'ru', 'en']) {
    const html = readFileSync(new URL(`${l}/index.html`, dist), 'utf8');
    assert.equal(html.match(/<li class="ses" [^>]*data-c="ilana-kratysh"/g).length, n('ilana-kratysh'), l);
    assert.equal(html.match(/<li class="ses" [^>]*data-c="natanel-zhurovel"/g).length, n('natanel-zhurovel'), l);
    for (const c of ['', 'ilana-kratysh', 'natanel-zhurovel']) assert.ok(html.includes(`data-coach="${c}"`), `${l}: coach chip ${c}`);
    assert.ok(html.includes('data-grade="18"'), `${l}: adults chip`);
    assert.equal(html.match(/data-g="18-18"/g).length, 2, `${l}: adults classes`);
    assert.equal(html.match(/class="ses-kind k-aud"/g).length, 4, `${l}: girls and boys badges`);
    assert.equal(html.match(/class="ses-kind k-olympic-class"/g).length, 3, `${l}: Rabin olympic class`);
    for (const v of Object.keys(venues)) assert.ok(html.includes(`<option value="${v}"`), `${l}: venue option ${v}`);
  }
});

test('the built landing carries no schedule-change markers', () => {
  const dist = new URL('../dist/', import.meta.url);
  for (const l of ['he', 'ru', 'en']) assert.doesNotMatch(readFileSync(new URL(`${l}/index.html`, dist), 'utf8'), /<!--(SES|SCHED_CHANGES)/, l);
});
