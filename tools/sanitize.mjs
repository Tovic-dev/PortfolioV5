// The content is HTML by design (<em>, <span class>, <a href>) and goes into the pages as written. This is the
// allowlist it is held to: the build fails on anything else (another tag, an event attribute, a javascript: or
// data: link), and translations whose tags differ from the English are rejected (tools/translate.mjs).
const SAFE_URL = /^(https:\/\/|mailto:|\/(?!\/))/i; // https, mailto or a path on the site ("//host" is not a path)
const TAGS = {
  em: a => !Object.keys(a).length,
  span: a => Object.keys(a).every(k => k === 'class') && /^[a-z0-9 _-]*$/i.test(a.class || ''),
  a: a => Object.keys(a).every(k => ['href', 'rel', 'target'].includes(k)) && SAFE_URL.test(a.href || '')
    && (!a.target || a.target === '_blank') && (!a.rel || /^[a-z ]+$/i.test(a.rel)),
};
const ATTR = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;

// problems in one string ([] when it is fine)
export function htmlProblems(s) {
  const out = [];
  for (const m of String(s).matchAll(/<\/?([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const name = m[1].toLowerCase(), rest = m[2] || '', attrs = {};
    if (m[0].startsWith('</')) { if (!TAGS[name]) out.push(`tag <${name}>`); continue; }
    for (const [, k, v] of rest.matchAll(ATTR)) attrs[k.toLowerCase()] = v;
    const leftover = rest.replace(ATTR, '').replace(/\s|\//g, '');
    if (!TAGS[name]) out.push(`tag <${name}>`);
    else if (leftover || !TAGS[name](attrs)) out.push(`attributes of <${name}${rest}>`);
  }
  if (/<\s*\/?\s*(script|iframe|object|embed|style)/i.test(s)) out.push('script/iframe/object/embed/style');
  return out;
}

// the tags of a string, in order, with their attributes: a translation must keep exactly these
export const tagSignature = s => [...String(s).matchAll(/<\/?[a-zA-Z][^>]*>/g)].map(m => m[0].replace(/\s+/g, ' ')).join('');

// fields that hold a URL and are written into href attributes
const URL_KEYS = /^(url|awardUrl|alumniOfUrl|worksForUrl)$/;

// every problem in a content document, as "field: problem"
export function contentProblems(doc) {
  const out = [];
  const walk = (v, p, key) => {
    if (typeof v === 'string') {
      for (const x of htmlProblems(v)) out.push(`${p}: ${x}`);
      if ((URL_KEYS.test(key) || /(^|\.)sameAs\.\d+$/.test(p)) && v && !SAFE_URL.test(v)) out.push(`${p}: unsafe URL "${v.slice(0, 60)}"`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}.${i}`, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k, k);
  };
  walk(doc, '', '');
  return out;
}
