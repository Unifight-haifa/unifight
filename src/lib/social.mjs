// Plain-text versions of a news post for pasting into Instagram, YouTube and WhatsApp.
export const LIMITS = { instagram: 2200, youtube: 5000, whatsapp: 65536 };
const ENT = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };

export function plainText(md) {
  return md
    .replace(/&(lt|gt|amp|quot|#39);/g, (e) => ENT[e])
    .replace(/^[ \t]{0,3}\[[^\]]+\]:.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\](\([^)]*\)|\[[^\]]*\])/g, '$1')
    .replace(/^[ \t]{0,3}(#{1,6}[ \t]+|>[ \t]?)/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/(^|[^\p{L}\p{N}])[*_](\S(?:[^*_\n]*\S)?)[*_](?=[^\p{L}\p{N}]|$)/gmu, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// cut at a word boundary and mark the cut, so a long post never ends mid-word
export function fit(text, max) {
  if (text.length <= max) return text;
  if (max < 2) return '';
  const cut = text.slice(0, max - 1);
  const space = cut.search(/\s\S*$/);
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—–-]+$/, '') + '…';
}

export function socialTexts({ title, body, url, hashtags, linkInBio }) {
  const head = plainText(title);
  const text = plainText(body);
  const tags = hashtags.join(' ');
  const build = (tail, max) => {
    const room = max - [head, tail, tags].join('\n\n\n\n').length;
    return [head, fit(text, room), tail, tags].filter(Boolean).join('\n\n');
  };
  return {
    // Instagram captions have no clickable links
    instagram: build(linkInBio, LIMITS.instagram),
    youtube: build(url, LIMITS.youtube),
    whatsapp: build(url, LIMITS.whatsapp),
  };
}
