// Renders the share cards and PNG icons with the locally installed Chrome:
//   img/og/<project-id>.jpg   1200×630 card per project (cover photo, or its sketch when it has none)
//   apple-touch-icon.png      180×180, favicon-32.png  32×32   (from favicon.svg)
// img/og.jpg (cover card with the exploded SEAT) is kept as it is.
// Run after changing project titles, covers or the favicon:  cd tools && npm install && npm run og
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright-core';
import { ROOT, i18n, loadContent } from './content.mjs';

// the content block of index.html with the default-locale content (cards are made once, in that language)
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const D = loadContent(i18n().defaultLang);
const C = vm.runInContext(src.slice(src.indexOf('const D='), src.indexOf('\n/* the app: '))
  .replace('/*@content*/null/*@end*/', JSON.stringify(D)) + ';({PROJ,TERR,DRAW})', vm.createContext({}));
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600&family=Inter:wght@400&family=IBM+Plex+Mono:wght@500&display=swap">';
const CSS = `html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#ECECE7;color:#141413;font-family:"Inter Tight",sans-serif}
.rule{position:absolute;left:64px;right:64px;top:40px;border-top:1px solid rgba(20,20,19,.16)}
.l{position:absolute;left:64px;top:64px;bottom:56px;width:540px;display:flex;flex-direction:column}
.m{font:500 13px/1.4 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#5D5D57}
h1{font-weight:600;line-height:.92;letter-spacing:-.05em;margin:24px 0 0;text-wrap:balance}
.sub{font:400 25px/1.3 Inter,sans-serif;letter-spacing:-.01em;color:#5D5D57;margin-top:22px;text-wrap:balance}
.by{margin-top:auto;display:flex;gap:14px;align-items:center}.by b{color:#FF5B14}
.fig{position:absolute;right:40px;top:58px;width:520px;height:520px;border:1px solid rgba(20,20,19,.16);background:#F5F5F1 center/cover no-repeat;overflow:hidden}
.fig svg{position:absolute;inset:60px 40px}.fig svg *{fill:none;stroke:#141413;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.fig svg .acc{stroke:#FF5B14;stroke-width:2.4}.fig svg .dash{stroke-dasharray:4 5;stroke:#5D5D57}
.no{position:absolute;left:18px;top:14px;font:600 44px/1 "Inter Tight";letter-spacing:-.04em}`;

function card(p) {
  const size = p.title.length <= 12 ? 104 : p.title.length <= 20 ? 84 : 70;
  const fig = p.cover
    ? `<div class="fig" style="background-image:url(${dataUrl(path.join(ROOT, p.cover), /\.png$/i.test(p.cover) ? 'image/png' : /\.webp$/i.test(p.cover) ? 'image/webp' : 'image/jpeg')})"></div>`
    : `<div class="fig"><span class="no">${String(p.n).padStart(2, '0')}</span><svg viewBox="0 0 240 160">${C.DRAW[p.sk] || ''}</svg></div>`;
  return `<!doctype html><html><head>${FONTS}<style>${CSS}</style></head><body><div class="rule"></div>
<div class="l"><div class="m">Work ${String(p.n).padStart(2, '0')} · ${p.terr.map(t => C.TERR[t]).join(' · ')}${p.year ? ' · ' + p.year : ''}</div>
<h1 style="font-size:${size}px">${esc(p.title).split(' ').map(w => `<span style="white-space:nowrap">${w}</span>`).join(' ')}</h1><div class="sub">${esc(p.sub)}</div>
<div class="by m"><span>${esc(D.site.name)} · ${esc(D.site.role)}</span><b>●</b></div></div>${fig}</body></html>`;
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
fs.mkdirSync(path.join(ROOT, 'img/og'), { recursive: true });
for (const p of C.PROJ) {
  await page.setContent(card(p), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ROOT, 'img/og', p.id + '.jpg'), type: 'jpeg', quality: 86 });
  console.log('img/og/' + p.id + '.jpg');
}
const svg = dataUrl(path.join(ROOT, 'favicon.svg'), 'image/svg+xml');
for (const [file, px] of [['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
  await page.setViewportSize({ width: px, height: px });
  // the home-screen icon is full-bleed (iOS rounds the corners itself); the tab icon keeps the SVG's rounding
  await page.setContent(`<body style="margin:0;background:${px > 32 ? '#141413' : 'transparent'}"><img src="${svg}" style="display:block;width:${px}px;height:${px}px"></body>`);
  await page.screenshot({ path: path.join(ROOT, file), omitBackground: px <= 32 });
  console.log(file);
}
await browser.close();
