// npm run review: what still needs the owner before it counts as verified or consented (INTG-02, INTG-03)
import { readdirSync, readFileSync } from 'node:fs';
import { factLists, reviewRows } from '../src/lib/integrity.mjs';

const root = new URL('../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const files = (dir, re) => readdirSync(new URL(dir, root), { recursive: true }).filter((f) => re.test(f)).map((f) => `${dir}${f}`).sort();
const tournaments = Object.fromEntries(files('content/tournaments/', /\.json$/).map((p) => [p.split('/').pop().slice(0, -5), json(p)]));
const rows = reviewRows(factLists({ site: json('content/site.json'), history: json('content/history.json'), tournaments }));
const ledger = json('content/consent.json');
const media = [...files('public/img-night/', /\.(jpe?g|png|webp)$/i), ...files('src/assets/gallery/', /\.(jpe?g|png|webp)$/i), ...files('src/assets/club/', /\.(jpe?g|png|webp)$/i)];
const open = media.filter((m) => !(m in ledger.media));

const out = ['# Content review', '', `## Not verified (${rows.length})`, '', 'Club pages hide these. The landing still shows the ones marked "on landing"; confirm them or say they should go.', ''];
for (const r of rows) out.push(`- ${r.at} · ${r.id} · ${r.confidence}${r.landing ? ' · on landing' : ''}${r.note ? ` · ${r.note}` : ''}\n  ${r.sources.join(' ; ')}`);
out.push('', `## Consent ledger`, '', `${ledger.consents.length} signed consents recorded. ${open.length} of ${media.length} published photos are not yet classified in content/consent.json (minors: true/false):`, '');
for (const m of open) out.push(`- ${m}`);
console.log(out.join('\n'));
