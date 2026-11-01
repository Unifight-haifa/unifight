// Site-wide content (content/site/*.json) for the owner and editors. No DOM access at import time (tested in Node).
import { api, errText } from './api.js';
import { LANGS, t, uiLang, fieldLabel } from './i18n.js';
import { toWebp, toBase64 } from './photo.js';
import { IMAGE_SLOTS } from '../lib/site-check.mjs';

const $ = (s, root = document) => root.querySelector(s);
// provenance keys: the Worker keeps them as they are anyway
const SKIP = new Set(['source', 'confidence', 'placeholder', 'note', 'legal_source', 'id']);
const ONE = new Set(['tel', 'phone', 'url', 'href']);
const CHUNK = 24; // the Worker's /translate field cap
const isText = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && LANGS.some((l) => typeof v[l] === 'string');

/** Editable leaves of a content/site file, depth-first: {path: ['a', '0', 'b'], kind: 'text' | 'one'}. */
export function siteFields(data, at = []) {
  if (isText(data)) {
    // a button text carries its own link (hero cta href)
    return [{ path: at, kind: 'text' }, ...(typeof data.href === 'string' ? [{ path: [...at, 'href'], kind: 'one' }] : [])];
  }
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).flatMap(([k, v]) => {
    if (SKIP.has(k)) return [];
    const path = [...at, k];
    if (typeof v !== 'string') return siteFields(v, path);
    return ONE.has(k) || (k === 'value' && at.at(-1) === 'email') ? [{ path, kind: 'one' }] : [];
  });
}

export const getAt = (o, path) => path.reduce((x, k) => x?.[k], o);
export const setAt = (o, path, v) => (getAt(o, path.slice(0, -1))[path.at(-1)] = v);

let C; // ctx from app.js: {watch, status, busy, applyT}
// not ctx.fail: its reload button reloads the coach profile
const fail = (e) => C.status(errText(e), 'bad');
let F; // {id, data, sha}
const imgSrc = (src) => `${import.meta.env.BASE_URL}${src.includes('/') ? src : `img-night/${src}`}`;

// list items are named by their own label or name, not by index; LRI..PDI keeps the path order on an RTL page
function title(path) {
  return '\u2066' + path.map((k, i) => {
    if (!/^\d+$/.test(k)) return fieldLabel(k);
    const item = getAt(F.data, path.slice(0, i + 1));
    return item?.label || item?.name?.[uiLang()] || item?.name?.ru || String(Number(k) + 1);
  }).join(' › ') + '\u2069';
}

function input(value, { lang, rows }) {
  const el = document.createElement(rows ? 'textarea' : 'input');
  if (rows) el.rows = rows;
  el.value = value ?? '';
  if (lang) Object.assign(el, { lang, dir: lang === 'he' ? 'rtl' : 'ltr' });
  else el.dir = 'ltr';
  return el;
}

function triBox(legend, val = {}, rows = 0) {
  const fs = $('#site-tri').content.firstElementChild.cloneNode(true);
  $('legend', fs).textContent = legend;
  for (const l of LANGS) $(`[data-lang="${l}"]`, fs).append(input(val[l], { lang: l, rows }));
  return fs;
}

function renderText() {
  $('#site-fields').replaceChildren(...siteFields(F.data).map(({ path, kind }) => {
    const val = getAt(F.data, path);
    if (kind === 'one') {
      const lab = Object.assign(document.createElement('label'), { className: 'one' });
      lab.append(Object.assign(document.createElement('span'), { textContent: title(path) }), input(val, {}));
      lab.path = path;
      return lab;
    }
    const len = Math.max(...LANGS.map((l) => (val[l] ?? '').length));
    const long = len > 80 || LANGS.some((l) => (val[l] ?? '').includes('\n'));
    const fs = triBox(title(path), val, long ? Math.min(8, Math.ceil(len / 35) + 1) : 0);
    fs.path = path;
    return fs;
  }));
}

const els = (box) => Object.fromEntries(LANGS.map((l) => [l, $(`[data-lang="${l}"] :is(input,textarea)`, box)]));

function collectText() {
  const out = structuredClone(F.data);
  for (const box of $('#site-fields').children) {
    if (box.matches('label.one')) setAt(out, box.path, $('input', box).value.trim());
    else for (const [l, el] of Object.entries(els(box))) getAt(out, box.path)[l] = el.value.trim();
  }
  return out;
}

function slotBox(slot) {
  const cur = F.data[slot] ?? {};
  const box = $('#site-slot').content.firstElementChild.cloneNode(true);
  C.applyT(box);
  box.dataset.slot = slot;
  $('summary', box).dataset.t = `site.slot.${slot}`;
  $('summary', box).textContent = t(`site.slot.${slot}`);
  const img = $('img', box);
  if (cur.src) img.src = imgSrc(cur.src);
  const alt = triBox(t('alt'), cur.alt);
  $('legend', alt).dataset.t = 'alt';
  $('.alt', box).replaceWith(alt);
  let webp = null;
  const save = $('.save', box);
  $('input[type=file]', box).addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    save.disabled = true;
    C.status(t('photoBusy'));
    try {
      const [maxW, maxH] = IMAGE_SLOTS[slot];
      webp = await toWebp(file, { maxW, maxH });
    } catch (e) {
      webp = null;
      return C.status(e?.code === 'heic' ? t('heic') : errText(e), 'bad');
    }
    URL.revokeObjectURL(img.dataset.blob);
    img.src = img.dataset.blob = URL.createObjectURL(new Blob([webp.bytes], { type: 'image/webp' }));
    save.disabled = false;
    C.status('');
  });
  save.addEventListener('click', () => {
    const a = Object.fromEntries(Object.entries(els(alt)).map(([l, el]) => [l, el.value.trim()]));
    const fields = { webp: toBase64(webp.bytes), ...(LANGS.some((l) => a[l]) ? { alt: a } : {}) };
    C.status(t('saving'));
    C.busy(save, async () => {
      const r = await api('POST', '/save', { op: 'site.image', id: slot, base_sha: F.sha, fields });
      C.watch(r);
      await load('images');
    }).catch(fail).finally(() => (save.disabled = !webp));
  });
  return box;
}

async function load(id) {
  const r = await api('GET', `/content/site/${encodeURIComponent(id)}`);
  F = { id, data: r.data, sha: r.sha };
  const images = id === 'images';
  // a reload after save keeps the slot the editor had open
  const open = $('#site-images details[open]')?.dataset.slot;
  if (images) $('#site-images').replaceChildren(...Object.keys(IMAGE_SLOTS).map((s) => Object.assign(slotBox(s), { open: s === open })));
  else renderText();
  $('#site-form').hidden = images;
  $('#site-images').hidden = !images;
}

async function translate(btn) {
  const src = uiLang();
  const boxes = [...$('#site-fields').querySelectorAll('fieldset')].filter((b) => {
    const e = els(b);
    return e[src].value.trim() && LANGS.some((l) => !e[l].value.trim());
  });
  if (!boxes.length) return C.status(t('site.nothingToTranslate'), 'bad');
  C.status(t('translating'));
  await C.busy(btn, async () => {
    for (let i = 0; i < boxes.length; i += CHUNK) {
      const part = boxes.slice(i, i + CHUNK);
      const fields = Object.fromEntries(part.map((b) => [b.path.join('.'), els(b)[src].value]));
      const r = await api('POST', '/translate', { source_lang: src, context: 'site', fields });
      for (const b of part) {
        for (const [l, el] of Object.entries(els(b))) {
          const got = r[l]?.[b.path.join('.')];
          // never overwrite what the editor typed
          if (l === src || el.value.trim() || typeof got !== 'string') continue;
          el.value = got;
          el.closest('label').dataset.proposed = t('proposed');
        }
      }
    }
    C.status('');
  });
}

/** Binds the Site card; files load when picked. */
export function mountSite(root, ctx) {
  C = ctx;
  root.hidden = false;
  if (root.dataset.ready) return;
  root.dataset.ready = '1';
  const pick = $('#site-file');
  pick.addEventListener('change', () => {
    $('#site-form').hidden = $('#site-images').hidden = true;
    if (pick.value) load(pick.value).catch(fail);
  });
  $('#site-form').addEventListener('input', (e) => delete e.target.closest('label')?.dataset.proposed);
  $('#site-translate').addEventListener('click', (ev) => translate(ev.currentTarget).catch(fail));
  $('#site-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    C.status(t('saving'));
    const { id } = F;
    C.busy($('#site-save'), async () => {
      const r = await api('POST', '/save', { op: 'site.text', id, base_sha: F.sha, fields: collectText() });
      C.watch(r);
      // reads now come from the PR branch, so the next save is not stale
      await load(id);
    }).catch(fail);
  });
}
