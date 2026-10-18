// Builds dist/: one static HTML page per URL and locale, each with its view pre-rendered from content/*.json and
// its own title, description, canonical, hreflang, Open Graph / Twitter tags and JSON-LD, plus sitemap.xml,
// robots.txt, 404.html and the CMS at /admin/. The client router takes over after load (same index.html code).
// No dependencies, so Vercel can run it as the build step:  node tools/build-pages.mjs
// The absolute base URL is SITE in tools/content.mjs (SITE_URL overrides it).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, SITE, i18n, loadContent, imageSizes } from './content.mjs';
import { responsiveImages } from './images.mjs';
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
// The app (the last inline <script> of index.html) and each locale's content are served as files under /assets/,
// named by their content hash and cached for good: the HTML stays light for crawlers and AI fetchers, and
// moving between pages downloads them once. Both are `defer`, after the libraries, so the order is unchanged.
const appOpen = src.lastIndexOf('<script>', a), appClose = src.indexOf('</script>', a);
if (appOpen < 0 || appClose < 0) throw new Error('app script not found in index.html');
const APP = src.slice(appOpen + '<script>'.length, appClose).replace('/*@content*/null/*@end*/', 'window.__D');
const assetFile = (name, code) => {
  const rel = `assets/${name}.${crypto.createHash('md5').update(code).digest('hex').slice(0, 10)}.js`;
  write(rel, code);
  return '/' + rel;
};

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
  D.srcset = SRCSET; // responsive WebP copies of each photo (tools/images.mjs), used by img() in index.html
  const C = vm.runInContext(withData(src.slice(a, b), D) + ';({PROJ,IMG,ROUTE,pageMeta,tocHTML,filtersHTML,projectHTML,bodyHTML})', vm.createContext({}));
  const S = D.site, P = S.person;
  const L = prefix(lang), TERR = Object.fromEntries(D.works.categories.map(c => [c.key, c.label]));
  const abs = f => SITE + '/' + String(f).replace(/^\//, '');
  const txt = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const list = s => String(s || '').split(/\s*,\s*/).filter(Boolean);
  // JSON-LD: one entity graph per page; empty fields are left out
  const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (v === '' || (Array.isArray(v) && !v.length) ? undefined : v)));
  const ID = { person: SITE + '/#person', website: SITE + '/#website' };
  const PERSON = {
    '@type': 'Person', '@id': ID.person, name: S.name, givenName: P.givenName, familyName: P.familyName,
    alternateName: P.alternateName, jobTitle: P.jobTitle, description: P.description, url: SITE + '/',
    image: P.image && abs(P.image), email: S.email,
    address: { '@type': 'PostalAddress', addressLocality: P.locality, addressRegion: P.region, addressCountry: P.country },
    alumniOf: P.alumniOf && { '@type': 'CollegeOrUniversity', name: P.alumniOf, url: P.alumniOfUrl },
    worksFor: P.worksFor && { '@type': 'Organization', name: P.worksFor, url: P.worksForUrl },
    knowsAbout: P.knowsAbout, knowsLanguage: P.knowsLanguage, sameAs: P.sameAs,
    // recognitions: the award, and the page that reports it (it also names him, which ties the entity together)
    award: (P.recognitions || []).map(x => x.text),
    subjectOf: (P.recognitions || []).filter(x => x.url).map(x => ({ '@type': 'WebPage', url: x.url, name: x.text })),
  };
  const WEBSITE = { '@type': 'WebSite', '@id': ID.website, name: S.name, url: SITE + '/', inLanguage: lang,
    author: { '@id': ID.person }, publisher: { '@id': ID.person } };
  const crumbs = items => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, u], i) =>
    ({ '@type': 'ListItem', position: i + 1, name, item: SITE + u })) });
  const projectImages = p => [...new Set([p.cover, p.hero && p.hero[0], ...p.sec.flatMap(s => s[2].map(f => f[0]))].filter(Boolean))].map(abs);
  function structuredData(r, meta, url, image) {
    const page = { '@id': url + '#webpage', url, name: meta.title, description: meta.description, inLanguage: lang,
      isPartOf: { '@id': ID.website }, primaryImageOfPage: { '@type': 'ImageObject', url: image } };
    const graph = [PERSON, WEBSITE];
    if (r.v === 'home') graph.push({ ...page, '@type': 'WebPage', about: { '@id': ID.person }, mainEntity: { '@id': ID.person } });
    else if (r.v === 'about') graph.push({ ...page, '@type': 'ProfilePage', mainEntity: { '@id': ID.person },
      breadcrumb: crumbs([[S.ui.home, L + '/'], [S.ui.about, L + '/about/']]) });
    else if (r.v === 'works') graph.push({ ...page, '@type': 'CollectionPage', about: { '@id': ID.person },
      breadcrumb: crumbs([[S.ui.home, L + '/'], [S.ui.works, L + '/works/']]),
      mainEntity: { '@type': 'ItemList', numberOfItems: C.PROJ.length, itemListElement: C.PROJ.map((p, i) =>
        ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${L}/works/${p.id}/`, name: p.title })) } });
    else if (r.v === 'project') {
      const p = r.p, work = url + '#work', cats = p.terr.map(t => TERR[t]).filter(Boolean);
      graph.push({ ...page, '@type': 'WebPage', mainEntity: { '@id': work },
        breadcrumb: crumbs([[S.ui.home, L + '/'], [S.ui.works, L + '/works/'], [p.title, `${L}/works/${p.id}/`]]) });
      graph.push({ '@type': 'CreativeWork', '@id': work, name: p.title, alternativeHeadline: p.sub, description: txt(p.deck),
        url, mainEntityOfPage: { '@id': url + '#webpage' }, image: [image, ...projectImages(p)],
        dateCreated: p.year, inLanguage: lang, genre: cats, keywords: [...cats, ...list(p.tools)].join(', '),
        author: { '@id': ID.person }, creator: { '@id': ID.person },
        contributor: list(p.team).filter(n => n !== S.name && /\s/.test(n) && !/project|individual/i.test(n)).map(name => ({ '@type': 'Person', name })),
        sourceOrganization: p.client && { '@type': 'Organization', name: p.client }, award: p.award, subjectOf: p.awardUrl && { '@type': 'WebPage', url: p.awardUrl, name: p.award },
        isPartOf: { '@id': ID.website } });
    } else graph.push({ ...page, '@type': 'WebPage' });
    return clean({ '@context': 'https://schema.org', '@graph': graph });
  }
  // the page source for this locale: content in, body rendered, language set
  const contentSrc = assetFile('content-' + lang, `window.__D=${scriptJSON(D)};\n`);
  const scripts = `<script src="${contentSrc}" defer></script>\n` +
    `<script src="${assetFile('app', APP)}" defer></script>`;
  const page = (src.slice(0, appOpen) + scripts + src.slice(appClose + '</script>'.length))
    .replace('<html lang="en">', `<html lang="${lang}">`), body0 = C.bodyHTML();

  function render(r, urlPath, { noindex = false, canonical = urlPath, base = null } = {}) {
    const meta = C.pageMeta(r), url = SITE + urlPath;
    // share image: the project's 1200×630 card (tools/build-og.mjs), else its cover photo, else the site card
    // in this language when tools/build-og.mjs has made it, else the default language's
    const own = (l, f) => (l === defaultLang ? f : f.replace(/^img\/og\//, `img/og/${l}/`).replace(/^img\/og\.jpg$/, `img/og-${l}.jpg`));
    const pick = f => [own(lang, f), f].find(x => fs.existsSync(path.join(ROOT, x)));
    const card = r.v === 'project' && pick(`img/og/${r.p.id}.jpg`);
    const [file, w, h] = card ? [card, 1200, 630]
      : meta.image ? [meta.image, ...(C.IMG[meta.image] || [1600, 1000])] : [pick('img/og.jpg') || 'img/og.jpg', 1200, 630];
    const image = `${SITE}/${file}?v=${version(file)}`;
    const ld = structuredData(r, meta, url, image);
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
    if (r.v === 'project') body = once(body, '<div class="view vpage wrap ph" id="v-project" hidden></div>', `<div class="view vpage wrap ph" id="v-project" data-pid="${r.p.id}">${C.projectHTML(r.p)}</div>`);
    if (r.v === 'about') body = once(body, '<div class="view vpage wrap" id="v-about" hidden>', '<div class="view vpage wrap" id="v-about">');
    if (r.v === '404') body = once(body, '<div class="view vpage wrap" id="v-404" hidden>', '<div class="view vpage wrap" id="v-404">');
    // only this URL's view keeps its content; the app fills the others in on load (index.html, start of the app)
    body = body.replace(/(<div class="view[^"]*" id="(v-[a-z0-9]+)"[^>]*>)[\s\S]*?(?=<!-- =+ [A-Z0-9 ]+ =+ -->\s*<div class="view|<div class="view|<footer)/g,
      (m, open, id) => (id === 'v-' + r.v ? m : open + '</div>\n'));
    return once(html, '<!--@body-->', body);
  }

  const pages = [
    [{ v: 'home' }, '/'], [{ v: 'works' }, '/works/'], [{ v: 'about' }, '/about/'],
    ...C.PROJ.map(p => [{ v: 'project', p }, `/works/${p.id}/`]),
  ];
  for (const [r, base] of pages) write(L + base + 'index.html', render(r, L + base, { base }));
  if (lang === defaultLang) {
    write('@motion/index.html', render({ v: 'home' }, '/@motion/', { noindex: true, canonical: '/' }));
    write('404.html', render({ v: '404' }, '/404', { noindex: true, canonical: null }));
  }
  // for the sitemap: the content files each page shows (its lastmod) and its images
  const own = name => [`content/${name}.${defaultLang}.json`, `content/${name}.${lang}.json`];
  const sources = r => r.v === 'project' ? [...own(`projects/${r.p.id}`), ...own('works')]
    : r.v === 'works' ? [...own('works'), `content/projects`] : [...own(r.v), ...own('site')];
  const entries = pages.map(([r, base]) => ({ url: L + base, files: sources(r), images: r.v === 'project' ? projectImages(r.p) : [] }));
  return { D, entries, contentSrc };
}

fs.rmSync(OUT, { recursive: true, force: true });
const SRCSET = await responsiveImages(ROOT, OUT, imageSizes());
const built = locales.map(buildLocale);
const entries = built.flatMap(x => x.entries), urls = entries.map(e => e.url);

// lastmod: the last commit that changed the page's content (not every deploy), else today.
// Vercel clones shallowly, so an old page can show the oldest commit it has: still earlier than any real change.
const today = new Date().toISOString().slice(0, 10);
const lastmod = files => {
  try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || today; }
  catch { return today; }
};
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map(e => `  <url><loc>${xmlEsc(SITE + e.url)}</loc><lastmod>${lastmod(e.files)}</lastmod>${
  e.images.map(i => `<image:image><image:loc>${xmlEsc(i)}</image:loc></image:image>`).join('')}</url>`).join('\n')}
</urlset>
`);
// robots.txt: everyone may crawl everything but the CMS. AI crawlers (search, answers and training) are named
// explicitly to document that a portfolio wants to be read and cited; a named group replaces `*` for that bot,
// so each one repeats the /admin/ rule.
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'meta-externalagent', 'CCBot'];
write('robots.txt', `# ${SITE}: a portfolio. Crawling, citing and summarising it is welcome; /admin/ is the editor.
# A Markdown version for language models: ${SITE}/llms.txt (full text: ${SITE}/llms-full.txt)

User-agent: *
Allow: /
Disallow: /admin/

# AI search, answer and training crawlers
${AI_BOTS.map(b => `User-agent: ${b}`).join('\n')}
Allow: /
Disallow: /admin/

Sitemap: ${SITE}/sitemap.xml
`);
writeAdmin(OUT, built[0].D);
writeLLMs(built[0].D);

// One 404.html serves every missing URL (Vercel can't pick another and keep the 404 status). Under /es/ or /eu/
// it loads that language's content instead, and the app renders the whole page from it (window.__rebody).
if (locales.length > 1) {
  const map = Object.fromEntries(built.map(b => [b.D.lang, b.contentSrc])), others = locales.filter(l => l !== defaultLang);
  const f404 = path.join(OUT, '404.html');
  const chooser = `<script>(function(){var s=${JSON.stringify(map)},m=location.pathname.match(/^\\/(${others.join('|')})(\\/|$)/);`
    + `if(m)window.__rebody=1;document.write('<script src="'+s[m?m[1]:${JSON.stringify(defaultLang)}]+'"><\\/script>')})()</script>`;
  fs.writeFileSync(f404, once(fs.readFileSync(f404, 'utf8'), `<script src="${map[defaultLang]}" defer></script>`, chooser));
}

// llms.txt (https://llmstxt.org): the site in Markdown for language models, from the default-locale content.
// llms.txt is the short map; llms-full.txt has every case study in full.
function writeLLMs(D) {
  const S = D.site, P = S.person, A = D.about, TERR = Object.fromEntries(D.works.categories.map(c => [c.key, c.label]));
  const md = h => String(h || '').replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)').replace(/<\/?(em|i)>/g, '*').replace(/<\/?(b|strong)>/g, '**').replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const url = p => `${SITE}/works/${p.id}/`;
  const cats = p => p.terr.map(t => TERR[t]).filter(Boolean).join(', ');
  const facts = A.facts.map(f => `- ${f.label}: ${f.type === 'chips' ? f.items.join(', ')
    : f.type === 'languages' ? f.languages.map(l => `${l.name} (${l.level})`).join(', ') : md(f.text)}`);
  const contact = [`- Email: ${S.email}`, ...S.links.map(l => `- ${l.label}: ${l.url}`)];
  const head = [`# ${S.name}`, '', `> ${md(P.description || D.site.seo.homeDescription)}`, '',
    ...A.paragraphs.map(md).flatMap(t => [t, '']), '## Profile', '', ...facts, '', ...((P.recognitions || []).length ? ['## Recognitions', '', ...P.recognitions.map(x => `- ${x.text}${x.url ? ` (${x.url})` : ''}`), ''] : []),
    '## Contact', '', ...contact, ''];
  write('llms.txt', [...head, '## Case studies', '',
    ...D.projects.map(p => `- [${p.title}](${url(p)}): ${p.sub}. ${md(p.deck)} (${cats(p)}${p.year ? ', ' + p.year : ''})`), '',
    '## Pages', '', `- [Home](${SITE}/): selected projects and the design process`, `- [All works](${SITE}/works/): the index of the ${D.projects.length} case studies`,
    `- [About](${SITE}/about/): profile, experience and contact`, `- [Full text](${SITE}/llms-full.txt): every case study in Markdown`, ''].join('\n'));
  const meta = p => [['Categories', cats(p)], ['Year', p.year], ['Context', p.ctx], ['Client', p.client], ['Team', p.team],
    ['Tools', p.tools], ['Role', md(p.role)], ['Distinction', p.award && (p.awardUrl ? `${p.award} (${p.awardUrl})` : p.award)]].filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`);
  const project = p => [`## ${p.title}: ${p.sub}`, '', `URL: ${url(p)}`, '', md(p.deck), '', ...meta(p), '',
    ...(p.stats || []).map(([v, l]) => `- **${md(v)}** ${md(l)}`), ...(p.stats ? [''] : []),
    ...p.sec.flatMap(([title, paras, figs, items]) => [`### ${md(title)}`, '', ...paras.map(md).flatMap(t => [t, '']),
      ...(items || []).map(t => `- ${md(t)}`), ...(items ? [''] : []), ...figs.filter(f => f[1]).map(f => `*Figure: ${md(f[1])}*`), ...(figs.some(f => f[1]) ? [''] : [])])];
  write('llms-full.txt', [...head, ...D.projects.flatMap(project)].join('\n'));
}

// static assets the pages use (the *.gltf.js wrappers are only the source of the GLBs)
for (const dir of ['img', 'fonts', 'vendor']) fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
fs.cpSync(path.join(ROOT, 'models'), path.join(OUT, 'models'), { recursive: true, filter: f => !f.endsWith('.gltf.js') });
for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png']) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
// /favicon.ico, which some readers and Bing still ask for: the 32 px PNG in an ICO container (one PNG-encoded entry)
{
  const png = fs.readFileSync(path.join(ROOT, 'favicon-32.png')), ico = Buffer.alloc(22);
  ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);               // header: icon, 1 image
  ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); // 32×32, 32 bpp
  ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);                             // size and offset of the PNG
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([ico, png]));
}
// IndexNow key file (<32 hex>.txt, see tools/indexnow.mjs), served at the site root
for (const f of fs.readdirSync(ROOT).filter(f => /^[0-9a-f]{32}\.txt$/.test(f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));

console.log(`dist/: ${urls.length} pages (${locales.join(', ')}) + @motion, 404, sitemap.xml, robots.txt, llms.txt, admin/  (site ${SITE})`);
