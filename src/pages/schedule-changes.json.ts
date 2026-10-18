import type { APIRoute } from 'astro';
import { getRelativeLocaleUrl } from 'astro:i18n';
import { LANGS } from '../i18n/ui';
import { CHANGES, venues } from '../lib/changes';
import { summary } from '../lib/schedule-changes.mjs';

// Unicode isolates keep times in order inside Hebrew text (U+2066 … U+2069)
const iso = (s: string) => `\u2066${s}\u2069`;

// polled by the bot until a change's id shows up; lists every change that has not ended yet
export const GET: APIRoute = ({ site }) =>
  Response.json(
    CHANGES.map(({ ses, show, ...c }) => ({
      ...c,
      show_from: show,
      summary: Object.fromEntries(LANGS.map((l) => [l, summary({ ...c, ses }, l, venues, l === 'he' ? iso : undefined)])),
      url: Object.fromEntries(LANGS.map((l) => [l, new URL(`${getRelativeLocaleUrl(l)}#chg-${c.id}`, site).href])),
    })),
  );
