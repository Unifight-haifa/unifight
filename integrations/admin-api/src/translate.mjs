import { buildPrompt, fixRu } from '../../../src/lib/translate-prompt.mjs';

const MODEL = 'claude-sonnet-5-5'; // same as n8n/bot-translate.json

export async function translate(env, args, fetchFn = fetch) {
  if (!env.ANTHROPIC_KEY) throw new Error('not_configured');
  const { system, input, source_lang, keys } = buildPrompt(args);
  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.TRANSLATE_MODEL || MODEL, max_tokens: 2000, system, messages: [{ role: 'user', content: input }] }),
  });
  // Status only: the body may quote the request back.
  if (!res.ok) throw new Error(`translation service ${res.status}`);
  let out;
  try {
    const text = (await res.json()).content[0].text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    out = JSON.parse(text);
  } catch {
    throw new Error('translation incomplete');
  }
  const result = {};
  for (const l of ['he', 'ru', 'en']) {
    // The coach's own words win over the model's echo of them.
    if (l === source_lang) {
      result[l] = Object.fromEntries(keys.map((k) => [k, String(args.fields[k])]));
      continue;
    }
    const v = out?.[l];
    if (!keys.every((k) => typeof v?.[k] === 'string' && v[k].trim())) throw new Error('translation incomplete');
    result[l] = Object.fromEntries(keys.map((k) => [k, l === 'ru' ? fixRu(v[k]) : v[k]]));
  }
  return result;
}
