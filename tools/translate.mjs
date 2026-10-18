// Machine translation of the site content with Claude Haiku, run by the GitHub Action on every content change
// (.github/workflows/translate.yml) or by hand:  ANTHROPIC_API_KEY=... node tools/translate.mjs [--dry]
//
// - Which fields to translate comes from the CMS configuration (tools/cms-config.mjs): `i18n: true` text is
//   translated, `i18n: 'duplicate'` and untranslatable widgets (images, numbers, selects, relations) are copied.
// - Only new or changed English text is sent. content/translations.lock.json keeps, per language, file and field,
//   a hash of the English text each translation came from: while it matches, the translation is kept as it is,
//   so corrections made by hand in the CMS survive until that English text changes.
// - Targets are `translate` in content/i18n.json. A language is added to `locales` (published, and shown in the
//   CMS and the language switcher) once all its files are translated.
// - --dry writes "[es] English text" instead of calling the API, to test the pipeline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, loadContent } from './content.mjs';
import { config } from './cms-config.mjs';

const DRY = process.argv.includes('--dry');
const MODEL = 'claude-haiku-5-5';
const LANGS = { es: 'Spanish (Spain)', eu: 'Basque (euskara batua)' };
const CHUNK = 40; // strings per request
// terms the first translation got wrong, fixed by hand: so new text uses the same words
const GLOSSARY = {
  es: `- Terminology: "case study" = "caso de estudio"; "exploded view" = "vista explosionada", the "Explode" slider = "Despiece"; "air vent" (car) = "aireador"; Mercedes V-Class = "Mercedes Clase V"; the UPV/EHU contest is "Olimpiada Ingeniería en la Edificación"; ESO (secondary school) stays "ESO". Address the reader as "tú".
`,
  eu: `- Terminology: "internships" = "praktikak" (never "barnetegi"); "to fold" = "tolestu" (never "plegatu"); "air vent" (car) = "aireztapen-irteera"; "plant pot" = "lorontzi"; "eco-design" = "ekodiseinua"; "rack" (bicycle) = "euskarria"; "native" (language level) = "ama-hizkuntza"; "End of issue" = "Alearen amaiera"; "About" (menu) = "Niri buruz"; ESO (secondary school) = "DBH"; the UPV/EHU contest is "Eraikuntzako Ingeniaritza Olinpiada"; Mercedes V-Class = "Mercedes V Klasea". Texts about the author's own work use the first person ("diseinatu nituen", not "diseinatu zituen").
`,
};

const I18N_FILE = path.join(ROOT, 'content/i18n.json'), LOCK_FILE = path.join(ROOT, 'content/translations.lock.json');
const readJSON = (f, fb) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fb);
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

const i18n = readJSON(I18N_FILE);
const targets = (i18n.translate || []).filter(l => l !== i18n.default);
if (!targets.length) { console.log('Nothing to translate (no "translate" languages in content/i18n.json).'); process.exit(0); }
for (const l of targets) if (!LANGS[l]) throw new Error(`No language name for "${l}" in tools/translate.mjs`);
const lock = readJSON(LOCK_FILE, {});

// ---- the files and their field definitions, from the CMS configuration -------------------------------------
const cfg = config(loadContent(i18n.default));
const files = [];
for (const c of cfg.collections) {
  if (c.folder) {
    for (const f of fs.readdirSync(path.join(ROOT, c.folder))) {
      const m = f.match(new RegExp(`^(.+)\\.${i18n.default}\\.json$`));
      if (m) files.push({ base: `${c.folder}/${m[1]}`, fields: c.fields });
    }
  }
  for (const f of c.files || []) files.push({ base: f.file.replace('.{{locale}}.json', ''), fields: f.fields });
}

// ---- walk one document: copy what is not translated, queue what is ---------------------------------------
// Returns the target document; strings to translate get a placeholder and an entry in `queue`.
function build(fields, en, cur, prefix, ctx) {
  const out = {};
  for (const f of fields) {
    const p = prefix ? `${prefix}.${f.name}` : f.name;
    if (!(f.name in (en || {}))) continue;
    out[f.name] = value(f, en[f.name], cur && cur[f.name], p, ctx);
  }
  // keys the CMS does not describe (e.g. the variable-type key of typed lists) are copied
  for (const k of Object.keys(en || {})) if (!(k in out)) out[k] = en[k];
  return out;
}
function value(f, en, cur, p, ctx) {
  const translated = f.i18n === true;
  if (!translated || en === null || en === undefined) return en;
  if (f.widget === 'object') return build(f.fields, en, cur, p, ctx);
  if (f.widget === 'list') {
    if (!Array.isArray(en)) return en;
    return en.map((item, i) => {
      const c = Array.isArray(cur) ? cur[i] : undefined, ip = `${p}.${i}`;
      if (f.types) { const t = f.types.find(t => t.name === item[f.typeKey || 'type']); return t ? build(t.fields, item, c, ip, ctx) : item; }
      if (f.fields) return build(f.fields, item, c, ip, ctx);
      if (f.field) return value(f.field, item, c, ip, ctx);
      return item;
    });
  }
  if (typeof en !== 'string' || !['string', 'text'].includes(f.widget || 'string')) return en;
  if (!en.trim()) return en;
  const h = hash(en);
  ctx.used[p] = h;
  if (ctx.lock[p] === h && typeof cur === 'string' && cur.trim()) return cur; // unchanged source: keep (also hand edits)
  ctx.queue.push({ id: p, text: en });
  return { __pending: p };
}
const fillPending = (v, done) => Array.isArray(v) ? v.map(x => fillPending(x, done))
  : isObj(v) ? (v.__pending !== undefined ? done[v.__pending] : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillPending(x, done)]))) : v;

// ---- the model call ---------------------------------------------------------------------------------------
let client, z, zodOutputFormat;
async function translateBatch(lang, items) {
  if (DRY) return Object.fromEntries(items.map(i => [i.id, `[${lang}] ${i.text}`]));
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (GitHub: Settings → Secrets → Actions).');
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    ({ z } = await import('zod'));
    ({ zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod'));
    client = new Anthropic({ maxRetries: 4 });
  }
  const Schema = z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) });
  const system = `You translate the website of Mikel Arnao, a Product Design Engineering student and designer from Donostia (Basque Country), from British English into ${LANGS[lang]}.
The site is a professional portfolio read by recruiters, engineers and design studios: write natural, concise and professional ${LANGS[lang]}, as a native writer would, not a literal translation. Keep the first person where the source uses it.
Rules:
- Keep every HTML tag and attribute exactly as written (for example <em>…</em>, <a href="…">…</a>); translate only the text between tags.
- Keep placeholders in braces unchanged, such as {title}, {subtitle}, {deck}, {count} and {categories}.
- Do not translate proper names, brands, product, company and team names, software, standards and codes (Mikel Arnao, SEAT Ateca, Ardura, Orbea, Mercedes V-Class, BIRA, OLEA, Alpesa, Vidrala, Ibili, ULMA Handling Systems, Mondragon Unibertsitatea, UPV/EHU, SolidWorks, KeyShot, ECE R46, PCTFE, EUIPO, iF Design Student Award, FIRST LEGO League…). Keep numbers, units and symbols.
- Place names: use the usual form in the target language (Donostia stays Donostia).
- Short interface labels (menus, buttons, captions) must stay short, of similar length to the source.
${GLOSSARY[lang] || ''}- Each item has an id that tells where the text is used (for example site.ui.navWorks is a menu item, projects/ardura.sections.2.paragraphs.0 is a paragraph of a case study).
Return every item with the same id and its translation in "text".`;
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: JSON.stringify({ items }) }],
    output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
  });
  if (response.stop_reason === 'refusal') throw new Error(`Refused (${response.stop_details?.category || 'no category'}) for ${items[0].id}…`);
  if (response.stop_reason === 'max_tokens' && items.length > 1) { // too long for one answer: split it
    const h = Math.ceil(items.length / 2);
    return { ...(await translateBatch(lang, items.slice(0, h))), ...(await translateBatch(lang, items.slice(h))) };
  }
  const got = Object.fromEntries((response.parsed_output?.items || []).map(i => [i.id, i.text]));
  const missing = items.filter(i => typeof got[i.id] !== 'string' || !got[i.id].trim());
  if (missing.length) {
    if (missing.length === items.length) throw new Error(`No translations returned for ${items[0].id}…`);
    Object.assign(got, await translateBatch(lang, missing));
  }
  return got;
}

// ---- run ----------------------------------------------------------------------------------------------------
let changedFiles = 0, sent = 0;
for (const lang of targets) {
  lock[lang] ||= {};
  for (const file of files) {
    const enFile = path.join(ROOT, `${file.base}.${i18n.default}.json`), outFile = path.join(ROOT, `${file.base}.${lang}.json`);
    const en = readJSON(enFile), cur = readJSON(outFile, null);
    if (!en) continue;
    const ctx = { lock: lock[lang][file.base] || {}, queue: [], used: {} };
    const draft = build(file.fields, en, cur, '', ctx);
    const done = {};
    for (let i = 0; i < ctx.queue.length; i += CHUNK) {
      const batch = ctx.queue.slice(i, i + CHUNK).map(q => ({ id: `${file.base}.${q.id}`, text: q.text }));
      const res = await translateBatch(lang, batch);
      for (const q of ctx.queue.slice(i, i + CHUNK)) done[q.id] = res[`${file.base}.${q.id}`];
      sent += batch.length;
    }
    const out = fillPending(draft, done);
    lock[lang][file.base] = ctx.used; // only the fields that exist now
    if (JSON.stringify(out) !== JSON.stringify(cur)) { writeJSON(outFile, out); changedFiles++; console.log(`${lang}  ${file.base}  (${ctx.queue.length} translated)`); }
  }
  // translations of projects whose English file is gone
  for (const c of cfg.collections.filter(c => c.folder)) {
    for (const f of fs.readdirSync(path.join(ROOT, c.folder))) {
      const m = f.match(new RegExp(`^(.+)\\.${lang}\\.json$`));
      if (m && !fs.existsSync(path.join(ROOT, c.folder, `${m[1]}.${i18n.default}.json`))) {
        fs.rmSync(path.join(ROOT, c.folder, f)); delete lock[lang][`${c.folder}/${m[1]}`]; changedFiles++; console.log(`${lang}  removed ${c.folder}/${f}`);
      }
    }
  }
  if (!i18n.locales.includes(lang)) { i18n.locales.push(lang); writeJSON(I18N_FILE, i18n); console.log(`${lang}  published (added to locales)`); }
}
const sorted = o => isObj(o) ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sorted(o[k])])) : o;
writeJSON(LOCK_FILE, sorted(lock));
console.log(`${sent} strings translated${DRY ? ' (dry run)' : ` with ${MODEL}`}, ${changedFiles} files changed.`);
