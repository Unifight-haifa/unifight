import { t } from './i18n.js';

const KEY = 'adminToken';
let cfgCache;

/** {api, google} baked in at build time; null when the panel isn't connected yet. */
export function config() {
  if (cfgCache === undefined) {
    const c = JSON.parse(document.getElementById('cfg')?.textContent || '{}');
    cfgCache = c.api ? { api: c.api.replace(/\/$/, ''), google: c.google } : null;
  }
  return cfgCache;
}

// sessionStorage: the token dies with the tab, and never sits in localStorage.
export const setToken = (tok) => sessionStorage.setItem(KEY, tok);
export const clearToken = () => sessionStorage.removeItem(KEY);
export const hasToken = () => !!sessionStorage.getItem(KEY);

export async function api(method, path, body) {
  const headers = {};
  const tok = sessionStorage.getItem(KEY);
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(config().api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw { code: 'network', status: 0 };
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  if (res.status === 401) clearToken();
  throw { code: data.error || 'internal', detail: data.detail, status: res.status };
}

export function errText(e) {
  const code = e?.code && t(`err.${e.code}`) !== `err.${e.code}` ? e.code : 'internal';
  return [t(`err.${code}`), e?.detail && String(e.detail)].filter(Boolean).join(' ');
}
