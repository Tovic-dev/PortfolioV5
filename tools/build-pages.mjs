// Builds dist/: one static HTML page per URL and locale, each with its view pre-rendered from content/*.json and
// its own title, description, canonical, hreflang, Open Graph / Twitter tags and JSON-LD, plus sitemap.xml,
// robots.txt, 404.html and the CMS at /admin/. The client router takes over after load (same index.html code).
// No dependencies, so Vercel can run it as the build step:  node tools/build-pages.mjs
// The absolute base URL is SITE in tools/content.mjs (SITE_URL overrides it).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { ROOT, SITE, i18n, loadContent } from './content.mjs';
import { writeAdmin } from './cms-config.mjs';

const OUT = path.join(ROOT, 'dist');
// Vercel Web Analytics (no cookies; it also counts the client-side route changes). Only in Vercel builds,
// where /_vercel/insights/ exists, so local builds don't request it.
const ANALYTICS = process.env.VERCEL ? [
  `<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)}</script>`,
  `<script defer src="/_vercel/insights/script.js"></script>`,
] : [];
const { defaultLang, locales } = i18n();
const prefix = l => (l === defaultLang ? '' : '/' + l);

const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// the content block of index.html: D + pure render functions, up to the app code
const a = src.indexOf('const D='), b = src.indexOf('\n/* the app: ');
if (a < 0 || b < 0) throw new Error('content block not found in index.html');
const scriptJSON = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const withData = (code, D) => code.replace('/*@content*/null/*@end*/', '/*@content*/' + scriptJSON(D) + '/*@end*/');

// img/ is cached as immutable, so share images carry a content hash: a regenerated card gets a new URL
// (LinkedIn and others fetch it again)
const version = file => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, file))).digest('hex').slice(0, 8);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const once = (html, find, repl) => {
  const i = html.indexOf(find);
  if (i < 0 || html.indexOf(find, i + 1) >= 0) throw new Error('expected exactly one match for: ' + find.slice(0, 80));
  return html.slice(0, i) + repl + html.slice(i + find.length);
};
function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function buildLocale(lang) {
  const D = loadContent(lang);
  const C = vm.runInContext(withData(src.slice(a, b), D) + ';({PROJ,IMG,ROUTE,pageMeta,tocHTML,filtersHTML,projectHTML,bodyHTML})', vm.createContext({}));
  const S = D.site, P = S.person;
  const PERSON = {
    '@type': 'Person', '@id': SITE + '/#person', name: S.name, jobTitle: P.jobTitle, url: SITE + '/',
    address: { '@type': 'PostalAddress', addressLocality: P.locality, addressRegion: P.region, addressCountry: P.country },
    alumniOf: { '@type': 'CollegeOrUniversity', name: P.alumniOf }, sameAs: P.sameAs,
  };
  // the page source for this locale: content in, body rendered, language set
  const page = withData(src, D).replace('<html lang="en">', `<html lang="${lang}">`), body0 = C.bodyHTML();

  function render(r, urlPath, { noindex = false, canonical = urlPath, base = null } = {}) {
    const meta = C.pageMeta(r), url = SITE + urlPath;
    // share image: the project's 1200×630 card (tools/build-og.mjs), else its cover photo, else the site card
    const card = r.v === 'project' && `img/og/${r.p.id}.jpg`;
    const [file, w, h] = card && fs.existsSync(path.join(ROOT, card)) ? [card, 1200, 630]
      : meta.image ? [meta.image, ...(C.IMG[meta.image] || [1600, 1000])] : ['img/og.jpg', 1200, 630];
    const image = `${SITE}/${file}?v=${version(file)}`;
    const ld = r.v === 'project'
      ? { '@context': 'https://schema.org', '@type': 'CreativeWork', name: r.p.title, description: meta.description, url, image,
          dateCreated: r.p.year, creator: { '@id': PERSON['@id'] }, isPartOf: { '@id': SITE + '/#website' } }
      : { '@context': 'https://schema.org', '@graph': [PERSON,
          { '@type': 'WebSite', '@id': SITE + '/#website', name: S.name, url: SITE + '/', author: { '@id': PERSON['@id'] } },
          { '@type': { about: 'ProfilePage', works: 'CollectionPage' }[r.v] || 'WebPage', name: meta.title, url, mainEntity: { '@id': PERSON['@id'] } }] };
    // other languages of this page (only once there is more than one)
    const alternates = base && locales.length > 1
      ? [...locales.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(SITE + prefix(l) + base)}">`),
         `<link rel="alternate" hreflang="x-default" href="${esc(SITE + base)}">`] : [];
    const head = [
      `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
      `<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">`,
      `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
      `<meta name="theme-color" content="#ECECE7">`,
      canonical && `<link rel="canonical" href="${esc(SITE + canonical)}">`,
      ...alternates,
      noindex && `<meta name="robots" content="noindex">`,
      `<meta property="og:type" content="${r.v === 'project' ? 'article' : 'website'}">`,
      `<meta property="og:site_name" content="${esc(S.name)}">`,
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
      ...ANALYTICS,
    ].filter(Boolean).join('\n');

    let html = page, body = body0;
    html = once(html, '<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">'); // relative assets from nested URLs
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
    html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(meta.description)}">\n${head}`);
    // show only this URL's view, already filled in
    if (r.v !== 'home') body = once(body, '<div class="view" id="v-home">', '<div class="view" id="v-home" hidden>');
    if (r.v === 'works') body = once(body, '<div class="view vpage wrap" id="v-works" hidden>', '<div class="view vpage wrap" id="v-works">')
      .replace('id="filters"></div>', `id="filters">${C.filtersHTML()}</div>`).replace('<ul class="toc" id="toc"></ul>', `<ul class="toc" id="toc">${C.tocHTML()}</ul>`);
    if (r.v === 'project') body = once(body, '<div class="view vpage wrap ph" id="v-project" hidden></div>', `<div class="view vpage wrap ph" id="v-project">${C.projectHTML(r.p)}</div>`);
    if (r.v === 'about') body = once(body, '<div class="view vpage wrap" id="v-about" hidden>', '<div class="view vpage wrap" id="v-about">');
    if (r.v === '404') body = once(body, '<div class="view vpage wrap" id="v-404" hidden>', '<div class="view vpage wrap" id="v-404">');
    return once(html, '<!--@body-->', body);
  }

  const L = prefix(lang);
  const pages = [
    [{ v: 'home' }, '/'], [{ v: 'works' }, '/works/'], [{ v: 'about' }, '/about/'],
    ...C.PROJ.map(p => [{ v: 'project', p }, `/works/${p.id}/`]),
  ];
  for (const [r, base] of pages) write(L + base + 'index.html', render(r, L + base, { base }));
  if (lang === defaultLang) {
    write('@motion/index.html', render({ v: 'home' }, '/@motion/', { noindex: true, canonical: '/' }));
    write('404.html', render({ v: '404' }, '/404', { noindex: true, canonical: null }));
  }
  return { D, urls: pages.map(([, base]) => L + base) };
}

fs.rmSync(OUT, { recursive: true, force: true });
const built = locales.map(buildLocale);
const urls = built.flatMap(x => x.urls);

const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  urls.map(u => `  <url><loc>${SITE + u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeAdmin(OUT, built[0].D);

// static assets the pages use (the *.gltf.js wrappers are only the source of the GLBs)
for (const dir of ['img', 'fonts', 'vendor']) fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
fs.cpSync(path.join(ROOT, 'models'), path.join(OUT, 'models'), { recursive: true, filter: f => !f.endsWith('.gltf.js') });
for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png']) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));

console.log(`dist/: ${urls.length} pages (${locales.join(', ')}) + @motion, 404, sitemap.xml, robots.txt, admin/  (site ${SITE})`);
