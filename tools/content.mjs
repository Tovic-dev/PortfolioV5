// Loads the site content (content/*.json, edited in /admin/) for one locale, the shape index.html expects as D.
// Missing translations fall back, field by field, to the default locale. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentProblems } from './sanitize.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// the site's public address: canonical URLs, sitemap, share tags (SITE_URL overrides it, e.g. for a staging build)
export const SITE = (process.env.SITE_URL || 'https://www.mikelarnao.com').replace(/\/$/, '');
// stored in the content as names; the code addresses them by index (3D model slots in index.html, sketch drawings)
export const MODELS = ['seat', 'ardura', 'orbea', 'house', 'vent'];
export const SKETCHES = ['plant-pot', 'mirror', 'rack', 'robot', 'house', 'route-app', 'finance-app'];

// a number never wraps away from its unit: "85 %" and "13 €" get a no-break space
const nbsp = v => typeof v === 'string' ? v.replace(/(\d) (%|€)/g, '$1 $2')
  : Array.isArray(v) ? v.map(nbsp) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nbsp(x)])) : v;
// every file is held to the HTML/URL allowlist (tools/sanitize.mjs): the build stops on anything else
function readJSON(f) {
  if (!fs.existsSync(f)) return null;
  const doc = JSON.parse(fs.readFileSync(f, 'utf8')), bad = contentProblems(doc);
  if (bad.length) throw new Error(`${path.relative(ROOT, f)} has markup or links that are not allowed:\n  ${bad.join('\n  ')}`);
  return nbsp(doc);
}
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
// objects merge key by key; arrays and scalars come whole from the locale when it has them
function merge(base, over) {
  if (over === undefined || over === null) return base;
  if (isObj(base) && isObj(over)) {
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
    return out;
  }
  return over;
}

export function i18n() {
  const c = readJSON(path.join(ROOT, 'content/i18n.json'));
  return { defaultLang: c.default, locales: c.locales };
}

// width/height of the images, read from the files (JPEG, PNG, WebP)
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}
export function imageSizes() {
  const out = {};
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => {
    const rel = d + '/' + e.name;
    if (e.isDirectory()) walk(rel);
    else if (/\.(jpe?g|png|webp)$/i.test(e.name)) { const s = imageSize(path.join(ROOT, rel)); if (s) out[rel] = s; }
  });
  walk('img');
  return out;
}

const local = p => (p ? String(p).replace(/^\//, '') : undefined); // "/img/x.jpg" (CMS) -> "img/x.jpg" (page)
function project(id, e) {
  const some = a => (a && a.length ? a : undefined);
  return {
    id, title: e.title, sub: e.subtitle, terr: e.categories || [], year: e.year || undefined,
    m3d: MODELS.includes(e.model) ? MODELS.indexOf(e.model) : undefined, sk: SKETCHES.indexOf(e.sketch),
    cover: local(e.cover), ctx: e.context || undefined, client: e.client || undefined, team: e.team || undefined,
    tools: e.tools || undefined, role: e.role, deck: e.deck, award: e.award || undefined, awardUrl: (e.award && e.awardUrl) || undefined,
    stats: some((e.stats || []).map(s => [s.value, s.label])),
    hero: e.hero && e.hero.image ? [local(e.hero.image), e.hero.caption || ''] : undefined,
    sec: (e.sections || []).map(s => [s.title, s.paragraphs || [], (s.figures || []).map(f => [local(f.image), f.caption || '']), some(s.list)]),
  };
}

export function loadContent(lang) {
  const { defaultLang, locales } = i18n();
  const file = name => merge(readJSON(path.join(ROOT, `content/${name}.${defaultLang}.json`)),
    lang === defaultLang ? null : readJSON(path.join(ROOT, `content/${name}.${lang}.json`)));
  const dir = path.join(ROOT, 'content/projects');
  const ids = fs.readdirSync(dir).map(f => f.match(new RegExp(`^(.+)\\.${defaultLang}\\.json$`))).filter(Boolean).map(m => m[1]);
  // "Ocultar en la web" (hidden) leaves a project out of every page, the sitemap and llms.txt. A project featured
  // on the home page stays published (its chapter links to it): take it off the home page first.
  const home = file('home'), featured = new Set((home.featured || []).map(f => f.project));
  const projects = ids.map(id => ({ id, e: file(`projects/${id}`) }))
    .filter(({ id, e }) => {
      if (!e.hidden) return true;
      if (featured.has(id)) { console.warn(`! "${id}" is hidden but featured on the home page: it stays published.`); return true; }
      return false;
    })
    .sort((a, b) => (a.e.order ?? 999) - (b.e.order ?? 999) || a.id.localeCompare(b.id))
    .map(({ id, e }) => project(id, e));
  const models = file('models') || { labels: [] };
  // the profile for search engines and AI (JSON-LD, llms.txt) lives in its own file, edited as its own CMS entry
  const site = { ...file('site'), person: file('person') || {} };
  return {
    lang, defaultLang, locales,
    site, home, works: file('works'), about: file('about'),
    labels: Object.fromEntries(models.labels.filter(l => l.label && l.label !== l.part).map(l => [l.part, l.label])),
    projects, img: imageSizes(),
  };
}
