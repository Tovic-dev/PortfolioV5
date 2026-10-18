// Responsive copies of the photos in img/ (CMS uploads included), made on every build into dist/img/r/:
// WebP at 640 and 1200 px and at the original width, named by the source's content hash (so the immutable cache
// never serves an old version). The pages list them in srcset; the original JPEG/PNG stays as src and for the
// image viewer. Needs sharp (root package.json, installed by Vercel); without it the pages use the originals.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const WIDTHS = [640, 1200];

export async function responsiveImages(ROOT, OUT, sizes) {
  let sharp;
  try { sharp = (await import('sharp')).default; } catch { console.warn('! sharp not installed: no responsive images'); return {}; }
  const dir = path.join(OUT, 'img/r');
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  const jobs = Object.entries(sizes).filter(([src]) => !src.startsWith('img/og')).map(async ([src, [w]]) => {
    const file = path.join(ROOT, src), buf = fs.readFileSync(file);
    const base = path.basename(src).replace(/\.[^.]+$/, '') + '.' + crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
    const widths = [...WIDTHS.filter(x => x < w * 0.9), w];
    out[src] = await Promise.all(widths.map(async x => {
      const name = `${base}-${x}.webp`;
      await sharp(buf).resize({ width: x, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(path.join(dir, name));
      return [x, `img/r/${name}`];
    }));
  });
  await Promise.all(jobs);
  return out;
}
