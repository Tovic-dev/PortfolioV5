# Portfolio · Mikel Arnao

Product Design Engineer portfolio. Static site.

- `index.html`: the whole site (HTML, CSS and JS). Routes: `/`, `/works/`, `/about/`, `/works/<project-id>/`. Old `#<route>` links redirect to these. Opened from disk it falls back to `#/works/…` URLs.
- `tools/build-pages.mjs`: builds `dist/`, one static page per route with its view pre-rendered and its own title, description, canonical, Open Graph/Twitter tags and JSON-LD, plus `404.html`, `sitemap.xml` and `robots.txt`. No dependencies. `SITE_URL` sets the absolute URL (default: the Vercel production domain).
- `favicon.svg`, `img/og.jpg`: favicon and default share image (1200×630).
- `img/`: project photos.
- `models/`: CAD models (SEAT mirror, Ardura, Orbea rack).
  - `*.glb`: what the site loads. Draco-compressed, with the feature edges baked in, loaded one at a time.
  - `*.gltf.js`: the SolidWorks exports wrapped in JS. Source for the GLBs, and the fallback when opening `index.html` directly (`file://`).
- `tools/build-models.mjs`: rebuilds the GLBs after changing a `*.gltf.js` (`cd tools && npm install && npm run models`).
- Libraries from CDN: three.js r128 + GLTFLoader + DRACOLoader, GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13.

## Run locally

```
node tools/build-pages.mjs
python3 -m http.server 8000 --directory dist
```
then open http://localhost:8000. Opening `index.html` directly also works (hash URLs).

## Deploy

Vercel: import the repo, framework preset **Other**. `vercel.json` sets the build command (`node tools/build-pages.mjs`), the output directory (`dist`) and trailing slashes.
