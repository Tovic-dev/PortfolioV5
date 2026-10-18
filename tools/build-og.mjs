// Renders the share cards (1200×630, what LinkedIn, WhatsApp, X… show for a link) and the PNG icons with Chrome,
// in every published language:
//   img/og.jpg, img/og-<lang>.jpg           site card (home, works, about): who, what, availability, the work
//   img/og/<id>.jpg, img/og/<lang>/<id>.jpg  one card per project (cover photo, or its sketch when it has none)
//   apple-touch-icon.png 180×180, favicon-32.png 32×32 (from favicon.svg)
// The text comes from content/ (CMS), the fonts from fonts/ (embedded, so the cards look the same on any machine),
// the site card's image is img/og-art-seat.png (the exploded SEAT, captured once from the site's 3D).
// The GitHub Action runs this after every content change; by hand:  cd tools && npm install && npm run og
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright-core';
import { ROOT, i18n, loadContent } from './content.mjs';

const { defaultLang, locales } = i18n();
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const typeOf = f => (/\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// the site's own @font-face rules, with the font files inlined
const FONTS = `<style>${(src.match(/@font-face\{[^}]*\}/g) || []).join('')
  .replace(/url\(fonts\/([^)]+)\)/g, (m, f) => `url(${dataUrl(path.join(ROOT, 'fonts', f), 'font/woff2')})`)}</style>`;
const ART = dataUrl(path.join(ROOT, 'img/og-art-seat.png'), 'image/png');
const BRANDS = ['SEAT', 'Orbea', 'Mercedes', 'Vidrala', 'Alpesa', 'Ibili']; // shown on the site card when a published project has them

const BASE = `html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#ECECE7;color:#141413;font-family:"Inter Tight",sans-serif;-webkit-font-smoothing:antialiased}
.m{font:500 13px/1.4 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#5D5D57}
.rule{position:absolute;left:64px;right:64px;top:40px;border-top:1px solid rgba(20,20,19,.16)}`;

const SITE_CSS = `${BASE}
.top{position:absolute;left:64px;right:64px;top:52px;display:flex;justify-content:space-between}
.top b{color:#141413;font-weight:500}
.l{position:absolute;left:64px;top:104px;bottom:58px;width:600px;display:flex;flex-direction:column}
.av{display:flex;align-items:center;gap:10px;color:#141413;font-size:14px}
.av i{width:9px;height:9px;border-radius:50%;background:#FF5B14;flex:none}
h1{margin:22px 0 0 -6px;font-weight:640;font-size:150px;line-height:.84;letter-spacing:-.065em}
h1 em{font-style:normal;color:#5D5D57}
.deck{margin:26px 0 0;font:430 29px/1.22 "Inter Tight",sans-serif;letter-spacing:-.02em;max-width:520px;text-wrap:balance}
.deck em{font-style:normal;color:#FF5B14}
.cta{margin-top:auto;display:flex;align-items:center;gap:20px;white-space:nowrap}
.btn{background:#141413;color:#ECECE7;font:500 14px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;padding:15px 20px;white-space:nowrap}
.art{position:absolute;right:28px;top:88px;width:560px;height:467px;object-fit:contain}
.fig{position:absolute;right:64px;bottom:58px;text-align:right}`;

const PROJECT_CSS = `${BASE}
.l{position:absolute;left:64px;top:64px;bottom:56px;width:540px;display:flex;flex-direction:column}
h1{font-weight:600;line-height:.92;letter-spacing:-.05em;margin:24px 0 0;text-wrap:balance}
.sub{font:400 25px/1.3 Inter,sans-serif;letter-spacing:-.01em;color:#5D5D57;margin-top:22px;text-wrap:balance}
.by{margin-top:auto;display:flex;gap:14px;align-items:center}.by b{color:#FF5B14}
.fig{position:absolute;right:40px;top:58px;width:520px;height:520px;border:1px solid rgba(20,20,19,.16);background:#F5F5F1 center/cover no-repeat;overflow:hidden}
.fig svg{position:absolute;inset:60px 40px}.fig svg *{fill:none;stroke:#141413;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.fig svg .acc{stroke:#FF5B14;stroke-width:2.4}.fig svg .dash{stroke-dasharray:4 5;stroke:#5D5D57}
.no{position:absolute;left:18px;top:14px;font:600 44px/1 "Inter Tight";letter-spacing:-.04em}`;

const page = html => `<!doctype html><html><head><meta charset="utf-8">${FONTS}</head><body>${html}</body></html>`;

// The site card is an invitation, not a screenshot: availability, the name, what he does in one line, the
// way in (button + proof: how many case studies, which brands) and the exploded SEAT as the image.
function siteCard(D, C) {
  const S = D.site, H = D.home, UI = S.ui;
  const brands = BRANDS.filter(b => C.PROJ.some(p => `${p.title} ${p.client || ''}`.includes(b))).slice(0, 4);
  return page(`<style>${SITE_CSS}</style><div class="rule"></div>
<div class="top m"><span><b>${esc(S.name)}</b> · ${esc(UI.ogKicker)}</span><span>mikelarnao.com</span></div>
<div class="l">
  <div class="av m"><i></i>${esc(H.availability)}</div>
  <h1>${esc(H.first)}<br><em>${esc(H.last)}</em></h1>
  <p class="deck">${H.deckMobile || H.deck}</p>
  <div class="cta"><span class="btn">${esc(UI.ogCta)} →</span><span class="m proof" data-base="${esc(C.PROJ.length + ' ' + UI.caseStudies)}" data-b='${JSON.stringify(brands)}'></span></div>
</div>
<script>/* as many brands as fit before the image (the button's length changes with the language) */
document.fonts.ready.then(()=>{const s=document.querySelector('.proof'),b=JSON.parse(s.dataset.b);
  const put=()=>s.textContent=s.dataset.base+(b.length?' · '+b.join(' · '):'');put();
  while(b.length&&s.getBoundingClientRect().right>596){b.pop();put()}})</script>
<img class="art" src="${ART}" alt="">
<div class="fig m">${esc(UI.fig)} 01 · SEAT Ateca · ${esc(UI.explodedView)}</div>`);
}

function projectCard(D, C, p) {
  const UI = D.site.ui, size = p.title.length <= 12 ? 104 : p.title.length <= 20 ? 84 : 70;
  const fig = p.cover
    ? `<div class="fig" style="background-image:url(${dataUrl(path.join(ROOT, p.cover), typeOf(p.cover))})"></div>`
    : `<div class="fig"><span class="no">${String(p.n).padStart(2, '0')}</span><svg viewBox="0 0 240 160">${C.DRAW[p.sk] || ''}</svg></div>`;
  return page(`<style>${PROJECT_CSS}</style><div class="rule"></div>
<div class="l"><div class="m">${esc(UI.work)} ${String(p.n).padStart(2, '0')} · ${p.terr.map(t => C.TERR[t]).join(' · ')}${p.year ? ' · ' + p.year : ''}</div>
<h1 style="font-size:${size}px">${esc(p.title).split(' ').map(w => `<span style="white-space:nowrap">${w}</span>`).join(' ')}</h1><div class="sub">${esc(p.sub)}</div>
<div class="by m"><span>${esc(D.site.name)} · ${esc(D.site.role)}</span><b>●</b></div></div>${fig}`);
}

const browser = await chromium.launch({ channel: 'chrome' });
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const shot = async (html, rel) => {
  await tab.setContent(html, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
  await tab.screenshot({ path: path.join(ROOT, rel), type: 'jpeg', quality: 86 });
  console.log(rel);
};
for (const lang of locales) {
  const D = loadContent(lang);
  const C = vm.runInContext(src.slice(src.indexOf('const D='), src.indexOf('\n/* the app: '))
    .replace('/*@content*/null/*@end*/', JSON.stringify(D)) + ';({PROJ,TERR,DRAW})', vm.createContext({}));
  const sub = lang === defaultLang ? '' : lang;
  await shot(siteCard(D, C), sub ? `img/og-${sub}.jpg` : 'img/og.jpg');
  for (const p of C.PROJ) await shot(projectCard(D, C, p), `img/og/${sub ? sub + '/' : ''}${p.id}.jpg`);
}
const svg = dataUrl(path.join(ROOT, 'favicon.svg'), 'image/svg+xml');
for (const [file, px] of [['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
  await tab.setViewportSize({ width: px, height: px });
  // the home-screen icon is full-bleed (iOS rounds the corners itself); the tab icon keeps the SVG's rounding
  await tab.setContent(`<body style="margin:0;background:${px > 32 ? '#141413' : 'transparent'}"><img src="${svg}" style="display:block;width:${px}px;height:${px}px"></body>`);
  await tab.screenshot({ path: path.join(ROOT, file), omitBackground: px <= 32 });
  console.log(file);
}
await browser.close();
