// Tells Bing (and the other IndexNow engines: Yandex, Seznam, Naver…) that pages changed, so they recrawl them soon.
// Sends every URL in the live sitemap, or only the URLs given:  cd tools && npm run indexnow [-- <url> …]
// Run it after a deploy is live. The key is the <32 hex>.txt file at the repo root, published at the site root.
import fs from 'node:fs';
import { ROOT, SITE } from './content.mjs';

const keyFile = fs.readdirSync(ROOT).find(f => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('no IndexNow key file (<32 hex>.txt) at the repo root');
const key = keyFile.slice(0, -4);

let urls = process.argv.slice(2);
if (!urls.length) {
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}
const live = await fetch(`${SITE}/${keyFile}`).then(r => (r.ok ? r.text() : ''));
if (live.trim() !== key) throw new Error(`${SITE}/${keyFile} is not live yet: deploy first`);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls }),
});
// 200: received; 202: received, key still being checked; 4xx: see https://www.indexnow.org/documentation
console.log(`IndexNow: ${res.status} ${res.statusText} · ${urls.length} URLs`);
if (!res.ok) process.exit(1);
