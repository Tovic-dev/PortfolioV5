// Builds dist/: one static HTML page per URL, each with its view pre-rendered and its own
// title, description, canonical, Open Graph / Twitter tags and JSON-LD, plus sitemap.xml,
// robots.txt and 404.html. The client router takes over after load (same index.html code).
// No dependencies, so Vercel can run it as the build step:  node tools/build-pages.mjs
// SITE_URL overrides the absolute base URL (default: the Vercel production domain).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://portfolio-v5-eight-bice.vercel.app'))
  .replace(/\/$/, '');
const PERSON = {
  '@type': 'Person', '@id': SITE + '/#person', name: 'Mikel Arnao', jobTitle: 'Product Design Engineer', url: SITE + '/',
  address: { '@type': 'PostalAddress', addressLocality: 'Donostia', addressRegion: 'Basque Country', addressCountry: 'ES' },
  alumniOf: { '@type': 'CollegeOrUniversity', name: 'Mondragon Unibertsitatea' },
  sameAs: ['https://www.linkedin.com/in/mikelarnao', 'https://github.com/Tovic-dev'],
};

const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// the content block of index.html: data + pure render functions, from IMG= up to the main IIFE
const a = src.indexOf('const IMG='), b = src.indexOf('\n(function(){');
if (a < 0 || b < 0) throw new Error('content block not found in index.html');
const C = vm.runInContext(src.slice(a, b) + ';({PROJ,IMG,ROUTE,pageMeta,tocHTML,filtersHTML,projectHTML})', vm.createContext({}));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const once = (html, find, repl) => {
  const i = html.indexOf(find);
  if (i < 0 || html.indexOf(find, i + 1) >= 0) throw new Error('expected exactly one match for: ' + find);
  return html.slice(0, i) + repl + html.slice(i + find.length);
};

function render(r, urlPath, { noindex = false, canonical = urlPath } = {}) {
  const meta = C.pageMeta(r), url = SITE + urlPath;
  // share image: the project's 1200×630 card (tools/build-og.mjs), else its cover photo, else the site card
  const card = r.v === 'project' && `img/og/${r.p.id}.jpg`;
  const [image, w, h] = card && fs.existsSync(path.join(ROOT, card)) ? [`${SITE}/${card}`, 1200, 630]
    : meta.image ? [`${SITE}/img/${meta.image}.jpg`, ...(C.IMG[meta.image] || [1600, 1000])] : [`${SITE}/img/og.jpg`, 1200, 630];
  const ld = r.v === 'project'
    ? { '@context': 'https://schema.org', '@type': 'CreativeWork', name: r.p.title, description: meta.description, url, image,
        dateCreated: r.p.year, creator: { '@id': PERSON['@id'] }, isPartOf: { '@id': SITE + '/#website' } }
    : { '@context': 'https://schema.org', '@graph': [PERSON,
        { '@type': 'WebSite', '@id': SITE + '/#website', name: 'Mikel Arnao', url: SITE + '/', author: { '@id': PERSON['@id'] } },
        { '@type': { about: 'ProfilePage', works: 'CollectionPage' }[r.v] || 'WebPage', name: meta.title, url, mainEntity: { '@id': PERSON['@id'] } }] };
  const head = [
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<meta name="theme-color" content="#ECECE7">`,
    canonical && `<link rel="canonical" href="${esc(SITE + canonical)}">`,
    noindex && `<meta name="robots" content="noindex">`,
    `<meta property="og:type" content="${r.v === 'project' ? 'article' : 'website'}">`,
    `<meta property="og:site_name" content="Mikel Arnao">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="${w}">`,
    `<meta property="og:image:height" content="${h}">`,
    `<meta property="og:image:alt" content="${esc(meta.title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n');

  let html = src;
  html = once(html, '<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">'); // relative assets from nested URLs
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(meta.description)}">\n${head}`);
  // show only this URL's view, already filled in
  if (r.v !== 'home') html = once(html, '<div class="view" id="v-home">', '<div class="view" id="v-home" hidden>');
  if (r.v === 'works') html = once(html, '<div class="view vpage wrap" id="v-works" hidden>', '<div class="view vpage wrap" id="v-works">')
    .replace('id="filters"></div>', `id="filters">${C.filtersHTML()}</div>`).replace('<ul class="toc" id="toc"></ul>', `<ul class="toc" id="toc">${C.tocHTML()}</ul>`);
  if (r.v === 'project') html = once(html, '<div class="view vpage wrap ph" id="v-project" hidden></div>', `<div class="view vpage wrap ph" id="v-project">${C.projectHTML(r.p)}</div>`);
  if (r.v === 'about') html = once(html, '<div class="view vpage wrap" id="v-about" hidden>', '<div class="view vpage wrap" id="v-about">');
  if (r.v === '404') html = once(html, '<div class="view vpage wrap" id="v-404" hidden>', '<div class="view vpage wrap" id="v-404">');
  return html;
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

fs.rmSync(OUT, { recursive: true, force: true });
const pages = [
  [{ v: 'home' }, C.ROUTE.home], [{ v: 'works' }, C.ROUTE.works], [{ v: 'about' }, C.ROUTE.about],
  ...C.PROJ.map(p => [{ v: 'project', p }, C.ROUTE.project(p.id)]),
];
for (const [r, p] of pages) write(p + 'index.html', render(r, p));
write('@motion/index.html', render({ v: 'home' }, '/@motion/', { noindex: true, canonical: '/' }));
write('404.html', render({ v: '404' }, '/404', { noindex: true, canonical: null }));

const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  pages.map(([, p]) => `  <url><loc>${SITE + p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

// static assets the pages use (the *.gltf.js wrappers are only for opening index.html from disk)
for (const dir of ['img', 'fonts', 'vendor']) fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
fs.cpSync(path.join(ROOT, 'models'), path.join(OUT, 'models'), { recursive: true, filter: f => !f.endsWith('.gltf.js') });
for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png']) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));

console.log(`dist/: ${pages.length} pages + @motion, 404, sitemap.xml, robots.txt  (site ${SITE})`);
