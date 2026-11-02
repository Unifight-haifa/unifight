// Admin panel permissions and field merge. Plain ESM without imports so the Worker bundles it.
export const OPS = ['coach.text', 'coach.photo', 'coach.meta', 'schedule.sessions', 'change.create', 'change.delete', 'shared.section', 'site.text', 'site.image', 'access.manage'];

export const isCoachId = (s) => typeof s === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

const COACH_OWN = { 'coach.text': 'coach', 'coach.photo': 'coach', 'schedule.sessions': 'schedule', 'change.create': 'schedule', 'change.delete': 'schedule' };

/** user: {email, role, coach_id}; target: {coach?, schedule?, known?: live ids on main}. */
export function can(user, op, target = {}) {
  if (!OPS.includes(op)) return false;
  for (const k of ['coach', 'schedule']) {
    const id = target[k];
    if (id === undefined) continue;
    if (!isCoachId(id) || (target.known && !target.known.includes(id))) return false;
  }
  if (user?.role === 'owner') return true;
  if (user?.role === 'editor') return op !== 'access.manage';
  if (user?.role === 'coach') return !!COACH_OWN[op] && !!user.coach_id && target[COACH_OWN[op]] === user.coach_id;
  return false;
}

export const FIELDS = {
  'coach.text': ['bio', 'about', 'approach', 'approach_own', 'dan_rank', 'alt'],
  'coach.meta': ['name', 'role', 'order', 'group', 'color', 'youtube'],
  'schedule.sessions': ['sessions'],
  'shared.section': ['title', 'intro', 'more_coaches', 'founded_note'],
};

// Shape checks are not here: the Worker runs checkTranslations on the merged file.
export function mergeFields(op, current, fields) {
  const out = structuredClone(current);
  const src = (op === 'shared.section' ? fields?.fields ?? fields : fields) ?? {};
  for (const k of FIELDS[op] ?? []) {
    if (!Object.hasOwn(src, k)) continue;
    const v = structuredClone(src[k]);
    if (k === 'alt') out.photo = { ...out.photo, alt: v };
    else if (k === 'dan_rank' && v && typeof v === 'object') {
      delete v.placeholder;
      out.dan_rank = v;
    } else out[k] = v;
  }
  return out;
}
