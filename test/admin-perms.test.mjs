import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { can, isCoachId, mergeFields, OPS } from '../src/lib/admin-perms.mjs';

const cdir = new URL('../content/coaches/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, cdir), 'utf8'));
const ids = readdirSync(cdir).filter((f) => !f.startsWith('_')).map((f) => f.slice(0, -5));
const own = 'natanel-zhurovel', other = 'ilana-kratysh';
const T = { he: 'א', ru: 'б', en: 'c' };

test('OPS is exactly the admin surface; nothing writes news, .github, src or scripts', () => {
  assert.deepEqual([...OPS].sort(), ['access.manage', 'change.create', 'change.delete', 'coach.meta', 'coach.photo', 'coach.text', 'schedule.sessions', 'shared.section']);
  assert.ok(ids.includes(own) && ids.includes(other));
});

test('can(): role x op x own/other matrix', () => {
  const coach = { email: 'n@x', role: 'coach', coach_id: own };
  const editor = { email: 'e@x', role: 'editor', coach_id: null };
  const owner = { email: 'o@x', role: 'owner', coach_id: null };
  const odd = { email: 'z@x', role: 'admin', coach_id: own };
  const target = (op, id) => (op.startsWith('coach.') ? { coach: id, known: ids } : op.startsWith('schedule.') || op.startsWith('change.') ? { schedule: id, known: ids } : {});
  const coachOwn = ['coach.text', 'coach.photo', 'schedule.sessions', 'change.create', 'change.delete'];
  const rows = [];
  for (const op of OPS) {
    for (const id of [own, other]) {
      const t = target(op, id);
      rows.push([coach, op, t, coachOwn.includes(op) && id === own]);
      rows.push([editor, op, t, op !== 'access.manage']);
      rows.push([owner, op, t, true]);
      rows.push([odd, op, t, false]);
    }
  }
  rows.push([owner, 'news.write', {}, false], [editor, 'src.write', {}, false]);
  // a coach must not reach another schedule through the coach target and vice versa
  rows.push([coach, 'schedule.sessions', { coach: own, schedule: other }, false]);
  for (const bad of ['../x', '_section', 'A-B', '', 'x/y', 'ghost-coach']) {
    rows.push([owner, 'coach.text', { coach: bad, known: ids }, false]);
    rows.push([editor, 'schedule.sessions', { schedule: bad, known: ids }, false]);
  }
  rows.push([coach, 'coach.text', { coach: own, known: [other] }, false]);
  for (const [u, op, t, want] of rows) assert.equal(can(u, op, t), want, `${u.role} ${op} ${JSON.stringify({ ...t, known: undefined })}`);
  assert.equal(can(null, 'coach.text', { coach: own }), false);
  assert.equal(isCoachId('a-b-1'), true);
  assert.equal(isCoachId('a--b'), false);
});

test('mergeFields: coach.text writes only text fields, never mutates current', () => {
  const cur = read(`${own}.json`), snap = structuredClone(cur);
  const out = mergeFields('coach.text', cur, { bio: T, order: 1, color: '#000', id: 'x', name: T, group: 'z', sources: [] });
  assert.deepEqual(cur, snap);
  assert.deepEqual(out.bio, T);
  assert.deepEqual({ ...out, bio: cur.bio }, cur);

  const alt = mergeFields('coach.text', cur, { alt: T });
  assert.deepEqual(alt.photo, { ...cur.photo, alt: T });
  assert.ok(cur.dan_rank.placeholder);
  assert.deepEqual(mergeFields('coach.text', cur, { dan_rank: { ...T, placeholder: true } }).dan_rank, T);

  const ila = read(`${other}.json`);
  const t = mergeFields('coach.text', ila, { about: [T], approach: [T], approach_own: false });
  assert.deepEqual([t.about, t.approach, t.approach_own], [[T], [T], false]);
  assert.deepEqual(cur, snap);
});

test('mergeFields: coach.meta, schedule.sessions and shared.section stay in their lane', () => {
  const cur = read(`${own}.json`);
  const m = mergeFields('coach.meta', cur, { order: 9, group: 'g', color: '#111', name: T, role: T, youtube: 'y', bio: T, id: 'x' });
  assert.deepEqual({ ...m, order: cur.order, group: cur.group, color: cur.color, name: cur.name, role: cur.role, youtube: cur.youtube }, cur);
  assert.equal(m.order, 9);

  const sc = JSON.parse(readFileSync(new URL(`../content/schedule/${own}.json`, import.meta.url), 'utf8'));
  const s = mergeFields('schedule.sessions', sc, { sessions: [], slogan: T, values: [], days: [] });
  assert.deepEqual(s, { ...sc, sessions: [] });

  const sec = read('_section.json'), snap = structuredClone(sec);
  const out = mergeFields('shared.section', sec, { fields: { title: T, roster: [], team_photo: null, team_count: 0 } });
  assert.deepEqual(out, { ...sec, title: T });
  assert.deepEqual(sec, snap);
  assert.deepEqual(mergeFields('nope', sec, { title: T }), sec);
});
