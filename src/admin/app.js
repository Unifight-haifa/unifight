import { api, config, setToken, clearToken, hasToken, errText } from './api.js';
import { LANGS, t, uiLang, setUiLang } from './i18n.js';

const $ = (s, root = document) => root.querySelector(s);
const show = (s, on = true) => ($(s).hidden = !on);
const form = $('#profile-form');
// Google sign-in is blocked in Telegram webviews (disallowed_useragent), so ?tg=1 never loads GIS.
const TG = new URLSearchParams(location.search).get('tg') === '1';
const POLL_MS = 15000;
const POLL_MAX = 40; // 10 min
const S = { me: null, coaches: [], coach: null, base: null, poll: 0 };

function status(text, kind = '') {
  $('#status').textContent = text;
  $('#status').className = kind;
}

function applyT(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
}

function loadScript(src) {
  return new Promise((ok, bad) => {
    const s = Object.assign(document.createElement('script'), { src, async: true, onload: ok, onerror: bad });
    document.head.append(s);
  });
}

async function busy(btn, fn) {
  btn.disabled = true;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
  }
}

/* ---- sign-in ---- */

async function session(path, body) {
  const r = await api('POST', path, body);
  setToken(r.token);
  show('#signin', false);
  status('');
  await signedIn(r.me);
}

async function telegramStart() {
  await loadScript('https://telegram.org/js/telegram-web-app.js').catch(() => {});
  const wa = window.Telegram?.WebApp;
  initUi();
  if (!wa?.initData) return status(t('err.unauthorized'), 'bad');
  wa.ready();
  show('#gsi', false);
  try {
    await session('/session/telegram', { initData: wa.initData });
  } catch (e) {
    if (e.code !== 'not_linked' && e.code !== 'bad_code') return status(errText(e), 'bad');
    show('#signin');
    show('#tgcode');
    if (e.code === 'bad_code') status(errText(e), 'bad');
  }
  $('#tgcode').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const code = ev.target.elements.code.value.trim();
    busy(ev.submitter ?? $('#tgcode button'), () => session('/session/telegram', { initData: wa.initData, code })).catch((e) => status(errText(e), 'bad'));
  });
}

async function googleStart() {
  show('#signin');
  await loadScript('https://accounts.google.com/gsi/client');
  google.accounts.id.initialize({
    client_id: config().google,
    ux_mode: 'popup',
    callback: ({ credential }) => session('/session/google', { credential }).catch((e) => status(errText(e), 'bad')),
  });
  google.accounts.id.renderButton($('#gsi'), { theme: 'filled_black', size: 'large', text: 'signin_with', locale: uiLang() });
}

async function signedIn(me) {
  S.me = me;
  $('#who-email').textContent = me.email;
  show('#who');
  if (!TG) {
    show('#telegram');
    show('#tg-linked', !!me.telegram);
  }
  S.coaches = (await api('GET', '/coaches')).coaches;
  fillCoachSelects();
  show('#picker', S.coaches.length > 1);
  if (me.role === 'owner') loadAccess().catch((e) => status(errText(e), 'bad'));
  window.addEventListener('hashchange', route);
  route();
}

/* ---- coach picker ---- */

const coachName = (id) => {
  const c = S.coaches.find((x) => x.id === id);
  return c?.name?.[uiLang()] || c?.name?.ru || id || '';
};

function options(sel, ids, blank) {
  const keep = sel.value;
  sel.replaceChildren(...(blank ? [new Option('—', '')] : []), ...ids.map((id) => new Option(coachName(id), id)));
  if (keep) sel.value = keep;
}

function fillCoachSelects() {
  const ids = S.coaches.map((c) => c.id);
  options($('#coach'), ids);
  options($('#access-add').elements.coach_id, ids, true);
}

function route() {
  const id = location.hash.match(/coach=([a-z0-9-]+)/)?.[1] ?? S.me.coach_id ?? S.coaches[0]?.id;
  if (!id) return;
  $('#coach').value = id;
  loadProfile(id);
}

$('#coach').addEventListener('change', (e) => (location.hash = `coach=${e.target.value}`));

/* ---- profile text ---- */

const tri = (prefix) => Object.fromEntries(LANGS.map((l) => [l, form.elements[`${prefix}.${l}`]]));
const paraBox = (list) => $(`[data-list="${list}"] .paras`, form);

function addPara(list, p = {}) {
  const fs = $('#para').content.firstElementChild.cloneNode(true);
  applyT(fs);
  for (const l of LANGS) $(`[data-lang="${l}"]`, fs).value = p[l] ?? '';
  $('.rm', fs).addEventListener('click', () => fs.remove());
  paraBox(list).append(fs);
}

for (const fs of form.querySelectorAll('[data-list]')) {
  $('.add', fs).addEventListener('click', () => addPara(fs.dataset.list));
}

// Every translatable text as {key, els: {he, ru, en}}; key is what /translate sees.
function groups() {
  const out = ['bio', 'dan_rank', 'alt'].map((key) => ({ key, els: tri(key) }));
  for (const list of ['about', 'approach']) {
    paraBox(list).querySelectorAll('.para').forEach((fs, i) => {
      out.push({ key: `${list}.${i}`, els: Object.fromEntries(LANGS.map((l) => [l, $(`[data-lang="${l}"]`, fs)])) });
    });
  }
  return out;
}

function clearProposed() {
  for (const lab of form.querySelectorAll('label[data-proposed]')) delete lab.dataset.proposed;
}

form.addEventListener('input', (e) => delete e.target.closest('label')?.dataset.proposed);

function fill(data) {
  for (const l of LANGS) {
    tri('bio')[l].value = data.bio?.[l] ?? '';
    tri('dan_rank')[l].value = data.dan_rank?.placeholder ? '' : data.dan_rank?.[l] ?? '';
    tri('alt')[l].value = data.photo?.alt?.[l] ?? '';
  }
  form.elements.approach_own.checked = !!data.approach_own;
  for (const list of ['about', 'approach']) {
    paraBox(list).replaceChildren();
    for (const p of data[list] ?? []) addPara(list, p);
  }
  clearProposed();
  show('#reload', false);
}

async function loadProfile(id) {
  show('#profile', false);
  try {
    S.base = await api('GET', `/content/coach/${encodeURIComponent(id)}`);
    S.coach = id;
    fill(S.base.data);
    show('#profile');
    if (!S.poll) status('');
  } catch (e) {
    status(errText(e), 'bad');
  }
}

function collect() {
  const val = (els) => Object.fromEntries(LANGS.map((l) => [l, els[l].value.trim()]));
  const any = (o) => LANGS.some((l) => o[l]);
  const paras = (list) => [...paraBox(list).querySelectorAll('.para')]
    .map((fs) => val(Object.fromEntries(LANGS.map((l) => [l, $(`[data-lang="${l}"]`, fs)]))))
    .filter(any);
  const fields = { bio: val(tri('bio')), about: paras('about'), approach: paras('approach'), approach_own: form.elements.approach_own.checked };
  // An empty dan rank stays as the file's placeholder; alt needs a photo to hang on.
  const dan = val(tri('dan_rank'));
  if (any(dan)) fields.dan_rank = dan;
  if (S.base.data.photo) fields.alt = val(tri('alt'));
  return fields;
}

$('#translate').addEventListener('click', (ev) => {
  const src = form.elements.source.value;
  const gs = groups().filter((g) => g.els[src].value.trim());
  if (!gs.length) return status(t('noText'), 'bad');
  status(t('translating'));
  const fields = Object.fromEntries(gs.map((g) => [g.key, g.els[src].value]));
  busy(ev.currentTarget, async () => {
    const r = await api('POST', '/translate', { source_lang: src, context: 'coach-bio', coach: S.coach, fields });
    for (const g of gs) {
      for (const l of LANGS) {
        if (l === src || typeof r[l]?.[g.key] !== 'string') continue;
        g.els[l].value = r[l][g.key];
        g.els[l].closest('label').dataset.proposed = t('proposed');
      }
    }
    status('');
  }).catch((e) => status(errText(e), 'bad'));
});

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const id = S.coach;
  status(t('saving'));
  busy($('#save'), async () => {
    const { sha } = await api('POST', '/save', { op: 'coach.text', id, base_sha: S.base.sha, fields: collect() });
    clearProposed();
    watch(sha);
    S.base = await api('GET', `/content/coach/${encodeURIComponent(id)}`);
  }).catch((e) => {
    show('#reload', e.code === 'stale');
    status(errText(e), 'bad');
  });
});

$('#reload').addEventListener('click', () => loadProfile(S.coach));

/* ---- deploy status ---- */

function watch(sha) {
  clearInterval(S.poll);
  status(t('st.pending'));
  let n = 0;
  const done = (text, kind) => {
    clearInterval(S.poll);
    S.poll = 0;
    status(text, kind);
  };
  S.poll = setInterval(async () => {
    n++;
    try {
      const s = await api('GET', `/status/${encodeURIComponent(sha)}`);
      if (s.state === 'live') return done(t('st.live'), 'good');
      if (s.state === 'failed') return done(t('st.failed', { step: s.step || '?' }), 'bad');
    } catch {
      // a missed poll is not a failed build; the next tick retries
    }
    if (n >= POLL_MAX) done(t('st.timeout'), 'bad');
  }, POLL_MS);
}

/* ---- Access (owner) ---- */

const roleText = (r) => t({ coach: 'roleCoach', editor: 'roleEditor', owner: 'roleOwner' }[r] ?? 'roleCoach');

function accessRow(u) {
  const tr = document.createElement('tr');
  const cell = (text, ltr) => {
    const td = tr.insertCell();
    td.textContent = text;
    if (ltr) td.dir = 'ltr';
    return td;
  };
  cell(u.email, true);
  cell(roleText(u.role));
  cell(coachName(u.coach_id));
  cell(u.telegram ? '✓' : '');
  const td = cell('');
  if (u.active) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: t('revoke') });
    b.addEventListener('click', () => {
      if (!confirm(t('revokeConfirm', { email: u.email }))) return;
      busy(b, () => api('DELETE', `/access/${encodeURIComponent(u.email)}`).then(loadAccess)).catch((e) => status(errText(e), 'bad'));
    });
    td.append(b);
  } else tr.style.opacity = '.5';
  return tr;
}

async function loadAccess() {
  show('#access');
  const { users } = await api('GET', '/access');
  $('#access-rows').replaceChildren(...users.map(accessRow));
}

$('#access-add').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target.elements;
  const email = f.email.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return status(t('badEmail'), 'bad');
  busy(ev.submitter ?? $('#access-add button'), async () => {
    await api('POST', '/access', { email, role: f.role.value, coach_id: f.coach_id.value || null });
    ev.target.reset();
    status('');
    await loadAccess();
  }).catch((e) => status(errText(e), 'bad'));
});

/* ---- Connect Telegram ---- */

$('#tg-connect').addEventListener('click', (ev) => {
  busy(ev.currentTarget, async () => {
    const { code, url, expires_at } = await api('POST', '/telegram/link-code');
    Object.assign($('#tg-link'), { href: url, textContent: url });
    $('#tg-code').textContent = code;
    // the Worker sends unix seconds
    const at = new Date(typeof expires_at === 'number' && expires_at < 1e12 ? expires_at * 1000 : expires_at);
    $('#tg-exp').textContent = t('expires', { time: at.toLocaleTimeString(uiLang(), { hour: '2-digit', minute: '2-digit' }) });
    show('#tg-out');
  }).catch((e) => status(errText(e), 'bad'));
});

/* ---- chrome ---- */

$('#uilang').addEventListener('change', (e) => {
  setUiLang(e.target.value);
  applyT();
  if (S.me) fillCoachSelects();
  if (S.me?.role === 'owner') loadAccess().catch(() => {});
});

$('#signout').addEventListener('click', () => {
  clearToken();
  location.reload();
});

function initUi() {
  setUiLang(uiLang());
  applyT();
  $('#uilang').value = uiLang();
  form.elements.source.value = uiLang();
}

async function start() {
  if (!config()) {
    initUi();
    return show('#notice');
  }
  // in Telegram the UI language waits for initData's language_code
  if (TG) return telegramStart();
  initUi();
  if (hasToken()) {
    try {
      return await signedIn(await api('GET', '/me'));
    } catch (e) {
      if (e.code !== 'unauthorized') return status(errText(e), 'bad');
    }
  }
  googleStart().catch(() => status(t('err.network'), 'bad'));
}

start();
