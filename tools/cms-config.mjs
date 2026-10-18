// Writes dist/admin/: Sveltia CMS (pinned version) and its config.json, generated from the content so the
// locales, categories and interface strings in the editor always match the site. Edits commit to GitHub;
// Vercel rebuilds the site. Sign-in: "Sign In with Token" (a GitHub personal access token).
import fs from 'node:fs';
import path from 'node:path';
import { MODELS, SKETCHES, SITE } from './content.mjs';

const SVELTIA = 'https://unpkg.com/@sveltia/cms@0.228.0/dist/sveltia-cms.js';
const REPO = 'Tovic-dev/PortfolioV5';

const T = (name, label, extra = {}) => ({ name, label, widget: 'string', i18n: true, ...extra });   // translated text
const X = (name, label, extra = {}) => T(name, label, { widget: 'text', ...extra });                 // longer text
const SAME = { i18n: 'duplicate' };                                                                     // same value in every language
const HTML = 'Admite HTML sencillo, por ejemplo <em>texto en naranja</em>.';
const humanize = k => k.replace(/([A-Z0-9])/g, ' $1').replace(/^./, c => c.toUpperCase());

function config(D) {
  const categories = D.works.categories.map(c => ({ label: c.label, value: c.key }));
  const image = (name, label) => ({ name, label, widget: 'image', required: false, ...SAME });
  return {
    backend: { name: 'github', repo: REPO, branch: 'main' },
    media_folder: 'img',
    public_folder: '/img',
    site_url: SITE,
    i18n: { structure: 'multiple_files', locales: D.locales, default_locale: D.defaultLang },
    collections: [
      {
        name: 'projects', label: 'Proyectos', label_singular: 'Proyecto', folder: 'content/projects', format: 'json', extension: 'json',
        create: true, delete: true, i18n: true, identifier_field: 'title', summary: '{{order}} · {{title}}',
        sortable_fields: ['order', 'title'], editor: { preview: false },
        fields: [
          { name: 'order', label: 'Orden en el índice', widget: 'number', value_type: 'int', ...SAME },
          T('title', 'Título'),
          T('subtitle', 'Subtítulo'),
          { name: 'categories', label: 'Categorías', widget: 'select', multiple: true, options: categories, ...SAME },
          { name: 'year', label: 'Año', widget: 'string', required: false, ...SAME },
          image('cover', 'Imagen de portada (índice y tarjeta para compartir)'),
          X('deck', 'Entradilla', { hint: HTML }),
          X('role', 'Mi rol'),
          T('client', 'Cliente', { required: false }),
          T('context', 'Contexto', { required: false }),
          T('team', 'Equipo', { required: false }),
          T('tools', 'Herramientas', { required: false }),
          T('award', 'Distinción', { required: false }),
          { name: 'stats', label: 'Cifras', widget: 'list', i18n: true, required: false, summary: '{{value}} · {{label}}',
            fields: [T('value', 'Valor'), T('label', 'Descripción')] },
          { name: 'hero', label: 'Imagen principal', widget: 'object', i18n: true, required: false,
            fields: [image('image', 'Imagen'), T('caption', 'Pie', { required: false })] },
          { name: 'sections', label: 'Secciones', widget: 'list', i18n: true, summary: '{{title}}', fields: [
            T('title', 'Título'),
            { name: 'paragraphs', label: 'Párrafos', widget: 'list', i18n: true, required: false, field: X('text', 'Párrafo', { hint: HTML }) },
            { name: 'list', label: 'Lista de puntos', widget: 'list', i18n: true, required: false, field: T('item', 'Punto') },
            { name: 'figures', label: 'Imágenes', widget: 'list', i18n: true, required: false, summary: '{{caption}}',
              fields: [image('image', 'Imagen'), T('caption', 'Pie')] },
          ] },
          { name: 'model', label: 'Modelo 3D', widget: 'select', options: ['none', ...MODELS], default: 'none',
            hint: 'Visor 3D del proyecto. Solo hay estos cinco modelos (están en el código).', ...SAME },
          { name: 'sketch', label: 'Boceto (índice, si no hay portada)', widget: 'select', options: ['none', ...SKETCHES], default: 'none', ...SAME },
        ],
      },
      {
        name: 'pages', label: 'Páginas', i18n: true, editor: { preview: false },
        files: [
          {
            name: 'home', label: 'Portada', file: 'content/home.{{locale}}.json', i18n: true,
            fields: [
              T('first', 'Nombre (titular, línea 1)'), T('last', 'Apellido (titular, línea 2)'),
              X('deck', 'Presentación', { hint: HTML }),
              T('coverTag', 'Rótulo de la figura'), X('coverCaption', 'Pie de la figura'),
              { name: 'featured', label: 'Proyectos destacados (los 5 modelos 3D, en este orden)', widget: 'list', i18n: true,
                min: 5, max: 5, allow_add: false, allow_remove: false, summary: '{{titleA}} {{titleB}}', fields: [
                  { name: 'project', label: 'Proyecto enlazado', widget: 'relation', collection: 'projects', value_field: '{{slug}}',
                    search_fields: ['title'], display_fields: ['title'], ...SAME },
                  T('line', 'Línea en la portada'), T('lineCategory', 'Categoría en la portada'), T('kicker', 'Categorías del artículo'),
                  T('titleA', 'Título, línea 1'), T('titleB', 'Título, línea 2'), X('deck', 'Entradilla'), X('approach', 'Approach'),
                  T('role', 'Mi rol'), T('factLabel', 'Dato: etiqueta (Year, Distinction…)'), T('factValue', 'Dato: valor'),
                  { name: 'factStamp', label: 'Mostrar el dato como sello', widget: 'boolean', required: false, ...SAME },
                  T('short', 'Nombre corto (barra inferior)'), T('figure', 'Nombre en el pie del 3D'),
                ] },
              { name: 'tools', label: 'Herramientas (cinta)', widget: 'list', i18n: true, field: T('tool', 'Herramienta') },
              { name: 'procedure', label: 'Procedure', widget: 'object', i18n: true, fields: [
                T('kicker', 'Rótulo'), T('title', 'Título', { hint: HTML }), X('intro', 'Introducción'),
                { name: 'steps', label: 'Fases', widget: 'list', i18n: true, summary: '{{label}} · {{title}}',
                  fields: [T('label', 'Etiqueta'), T('title', 'Título'), X('text', 'Texto')] },
              ] },
            ],
          },
          {
            name: 'works', label: 'Works (índice)', file: 'content/works.{{locale}}.json', i18n: true,
            fields: [
              T('kicker', 'Rótulo'), T('title', 'Título', { hint: HTML }),
              { name: 'categories', label: 'Categorías', widget: 'list', i18n: true, summary: '{{label}}',
                hint: 'La clave identifica la categoría en los proyectos: no la cambies en una categoría que ya se usa.',
                fields: [T('key', 'Clave'), T('label', 'Nombre')] },
            ],
          },
          {
            name: 'about', label: 'About y contacto', file: 'content/about.{{locale}}.json', i18n: true,
            fields: [
              T('kicker', 'Rótulo'), T('title', 'Título', { hint: HTML }), X('lede', 'Entradilla', { hint: HTML }),
              { name: 'paragraphs', label: 'Párrafos', widget: 'list', i18n: true, field: X('text', 'Párrafo', { hint: HTML }) },
              { name: 'facts', label: 'Ficha', widget: 'list', i18n: true, typeKey: 'type', summary: '{{label}}', types: [
                { name: 'text', label: 'Texto', widget: 'object', fields: [T('label', 'Etiqueta'), T('text', 'Texto')] },
                { name: 'chips', label: 'Etiquetas', widget: 'object', fields: [T('label', 'Etiqueta'),
                  { name: 'items', label: 'Elementos', widget: 'list', i18n: true, field: T('item', 'Elemento') }] },
                { name: 'languages', label: 'Idiomas', widget: 'object', fields: [T('label', 'Etiqueta'),
                  { name: 'languages', label: 'Idiomas', widget: 'list', i18n: true, summary: '{{name}} · {{level}}', fields: [
                    T('name', 'Idioma'), T('level', 'Nivel'),
                    { name: 'full', label: 'Barra completa', widget: 'boolean', required: false, ...SAME }] }] },
              ] },
              { name: 'contact', label: 'Contacto', widget: 'object', i18n: true, fields: [
                T('kicker', 'Rótulo'), X('subtitle', 'Subtítulo'), T('title', 'Título grande'), X('text', 'Texto')] },
              { name: 'colophon', label: 'Colofón', widget: 'list', i18n: true, summary: '{{label}}',
                fields: [T('label', 'Etiqueta'), T('text', 'Texto')] },
            ],
          },
          {
            name: 'site', label: 'Ajustes del sitio y textos de interfaz', file: 'content/site.{{locale}}.json', i18n: true,
            fields: [
              T('name', 'Nombre'), T('role', 'Cargo'),
              { name: 'email', label: 'Email', widget: 'string', ...SAME },
              { name: 'links', label: 'Enlaces de contacto', widget: 'list', i18n: true, summary: '{{label}}',
                fields: [T('label', 'Texto'), { name: 'url', label: 'URL', widget: 'string', ...SAME }] },
              { name: 'person', label: 'Datos para buscadores (JSON-LD)', widget: 'object', i18n: true, fields: [
                T('jobTitle', 'Cargo'), T('locality', 'Ciudad'), T('region', 'Región'), T('country', 'País (código)'),
                T('alumniOf', 'Universidad'), { name: 'sameAs', label: 'Perfiles (URL)', widget: 'list', i18n: true, field: T('url', 'URL') }] },
              { name: 'seo', label: 'SEO', widget: 'object', i18n: true,
                hint: 'Admiten {title}, {deck}, {count} y {categories} donde tiene sentido.',
                fields: Object.keys(D.site.seo).map(k => (/Description$/.test(k) ? X : T)(k, humanize(k))) },
              { name: 'footer', label: 'Pie de página', widget: 'object', i18n: true,
                fields: [T('left', 'Izquierda'), T('place', 'Ciudad (junto al reloj)'), T('right', 'Derecha')] },
              { name: 'notFound', label: 'Página 404', widget: 'object', i18n: true, fields: [
                T('kicker', 'Rótulo'), T('title', 'Título', { hint: HTML }), X('text', 'Texto'), T('home', 'Botón a portada'), T('works', 'Botón al índice')] },
              { name: 'ui', label: 'Textos de interfaz', widget: 'object', i18n: true, collapsed: true,
                fields: Object.keys(D.site.ui).map(k => T(k, humanize(k))) },
            ],
          },
          {
            name: 'models', label: 'Etiquetas de las piezas 3D', file: 'content/models.{{locale}}.json', i18n: true,
            fields: [
              { name: 'labels', label: 'Etiquetas', widget: 'list', i18n: true, allow_add: false, allow_remove: false, allow_reorder: false,
                summary: '{{label}}', fields: [
                { name: 'part', label: 'Pieza', widget: 'string', readonly: true, ...SAME }, T('label', 'Texto que se muestra')] },
            ],
          },
        ],
      },
    ],
  };
}

export function writeAdmin(out, D) {
  const dir = path.join(out, 'admin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config(D), null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Editor · ${D.site.name}</title>
<link href="/admin/config.json" type="application/json" rel="cms-config-url">
</head>
<body>
<script src="${SVELTIA}"></script>
</body>
</html>
`);
}
