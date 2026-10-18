# Portfolio · Mikel Arnao

Product Design Engineer portfolio. Static site.

- `content/`: all the text and image references on the site, one JSON file per page and locale (`site`, `home`, `works`, `about`, `models` and `projects/<project-id>`, each as `<name>.<locale>.json`). Edit it in the CMS at `/admin/` or by hand.
  - `i18n.json`: the default locale and the list of locales. A missing translation falls back to the default locale field by field; lists are replaced whole.
- `index.html`: the site's template, CSS and JS. The build fills in the content. Routes: `/`, `/works/`, `/about/` and `/works/<project-id>/`, plus `/<locale>/…` for each extra locale. Old `#<route>` links redirect to these. Opening it directly from disk no longer works: use the build.
- `tools/build-pages.mjs`: builds `dist/` from `content/` and `index.html`. It writes one static page per route and locale, each with its view pre-rendered and its own title, description, canonical, hreflang, Open Graph/Twitter tags and JSON-LD. It also writes `404.html`, `sitemap.xml` (with lastmod and images), `robots.txt` (AI crawlers named and allowed), `llms.txt` and `llms-full.txt`, `favicon.ico` and the CMS (`admin/`). The app script and each locale's content go to `assets/` as files named by their content hash (cached for a year), so the HTML only carries the page itself. No dependencies. `SITE_URL` sets the absolute URL (default: https://www.mikelarnao.com).
- `tools/content.mjs`: reads `content/` for the build scripts. `tools/cms-config.mjs`: writes the CMS page and its `config.json`, generated from the content.
- `favicon.svg`, `img/og.jpg`: favicon and default share image (1200×630, the home cover; `npm run og` renders it).
- `tools/build-og.mjs`: uses the installed Chrome to render `img/og/<project-id>.jpg` (a 1200×630 share card per project), `apple-touch-icon.png` and `favicon-32.png`. Run it after changing a project's title, subtitle or cover, or the favicon (`cd tools && npm install && npm run og`), then commit the images.
- `img/`: project photos (CMS uploads land here too).
- `models/`: CAD models (SEAT mirror, Ardura, Orbea rack).
  - `*.glb`: what the site loads. They are Draco-compressed, have the feature edges baked in and load one at a time.
  - `*.gltf.js`: the SolidWorks exports wrapped in JS, the source for the GLBs.
- `tools/build-models.mjs`: rebuilds the GLBs after a `*.gltf.js` changes (`cd tools && npm install && npm run models`).
- `vendor/<library>-<version>/`: self-hosted libraries, loaded with `defer`: three.js r128 + GLTFLoader + DRACOLoader (and the Draco decoder), GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13. The loaders ship minified as `*.min.js`, built from the `.js` next to them (`cd tools && npm run vendor`).
- `fonts/`: self-hosted Inter Tight, Inter and IBM Plex Mono (latin + latin-ext).

## Run locally

```
node tools/build-pages.mjs
npx http-server@14.1.1 dist -p 8000
```
then open http://localhost:8000.

## Editing content (CMS)

[Sveltia CMS](https://github.com/sveltia/sveltia-cms) runs at `/admin/`; the pinned version is in `tools/cms-config.mjs`. Sign in with **Sign In Using Access Token**, using a GitHub fine-grained personal access token for this repository with *Contents: Read and write*. Each save is a commit to `main`, and Vercel rebuilds the site in about a minute.

The 3D models and sketch drawings are code: each project picks one by name. After changing a project's title, subtitle or cover, run `npm run og` again so its share card matches.

To add a language, add it to `locales` in `content/i18n.json`. The CMS then shows it next to English, untranslated fields use the English text, and a language switcher appears in the header.

## Deploy

Vercel: import the repo with the framework preset **Other**. `vercel.json` sets the build command (`node tools/build-pages.mjs`), the output directory (`dist`) and trailing slashes.

## Search engines

Google Search Console and Bing Webmaster Tools are verified for `mikelarnao.com`; the sitemap is `https://www.mikelarnao.com/sitemap.xml`. For Bing and the other IndexNow engines, after a deploy with new or changed pages is live, run `cd tools && npm run indexnow` (every URL in the sitemap) or `npm run indexnow -- <url> …`. The key is the `<32 hex>.txt` file at the repo root.
