# Portfolio · Mikel Arnao

Product Design Engineer portfolio. Static site, no build step.

- `index.html`: the whole site (HTML, CSS and JS). Hash routes: `#home`, `#works`, `#about`, `#<project-id>`.
- `img/`: project photos.
- `models/`: CAD models (SEAT mirror, Ardura, Orbea rack) as glTF wrapped in small JS files (`*.gltf.js`), so they load both on a server and when opening `index.html` directly.
- Libraries from CDN: three.js r128 + GLTFLoader, GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13.

## Run locally

```
python3 -m http.server 8000
```
then open http://localhost:8000. Opening `index.html` directly also works.

## Deploy

Vercel: import the repo, framework preset **Other**, no build command, output directory `.` (root).
