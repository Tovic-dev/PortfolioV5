# Portfolio · Mikel Arnao

Product Design Engineer portfolio. Static site, no build step.

- `index.html`: the whole site (HTML, CSS and JS). Hash routes: `#home`, `#works`, `#about`, `#<project-id>`.
- `img/`: project photos.
- `models/`: CAD models (SEAT mirror, Ardura, Orbea rack).
  - `*.glb`: what the site loads. Draco-compressed, with the feature edges baked in, loaded one at a time.
  - `*.gltf.js`: the SolidWorks exports wrapped in JS. Source for the GLBs, and the fallback when opening `index.html` directly (`file://`).
- `tools/build-models.mjs`: rebuilds the GLBs after changing a `*.gltf.js` (`cd tools && npm install && npm run models`).
- Libraries from CDN: three.js r128 + GLTFLoader + DRACOLoader, GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13.

## Run locally

```
python3 -m http.server 8000
```
then open http://localhost:8000. Opening `index.html` directly also works.

## Deploy

Vercel: import the repo, framework preset **Other**, no build command, output directory `.` (root).
