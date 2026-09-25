// Builds the site into dist/.
//   node scripts/build.mjs          build
//   node scripts/build.mjs --serve  build, then serve dist/ on http://localhost:8000
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { renderOg } from './og.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE = 'https://aowshad.github.io/cursory/';
const BASE = new URL(SITE).pathname;                // '/cursory/', for pages served at any depth (404)
const COPY = ['index.html', 'builder.html', 'lint.html', 'lint-engine.js', 'assets', 'og.png', 'favicon.svg'];
const DATA_TAG = '<script type="application/json" id="cursory-data"></script>';
const PUBLISHED = '2026-09-25';                     // first release of the value pages, for JSON-LD

const read = f => readFileSync(join(ROOT, f), 'utf8');
const readJSON = f => JSON.parse(read(f));
const fail = msg => { throw new Error(msg) };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

// Run assets/demos.js outside a browser, for the data check and the 404 page's mini previews.
function loadDemos() {
  const ctx = vm.createContext({
    window: {}, document: { documentElement: {}, currentScript: null }, ResizeObserver: class {}, encodeURIComponent, Math, JSON, Object, Array,
    $: () => null, $$: () => [], root: {}, copyText: () => {}
  });
  vm.runInContext(read('assets/demos.js'), ctx);
  return ctx.window.CursoryDemos || fail('assets/demos.js did not define CursoryDemos');
}

// Every value needs its text, a known group, related values that exist, a platform note and a demo.
function validate({ groups, cursors, systems }, demos) {
  const groupIds = new Set(groups.map(g => g.id)), keys = new Set(cursors.map(c => c.key)), seen = new Set(), errors = [];
  for (const g of groups) if (!g.id || !g.title || !g.description) errors.push(`group ${g.id || '?'}: missing id, title or description`);
  for (const c of cursors) {
    for (const f of ['key', 'slug', 'group', 'css', 'line', 'description']) if (!c[f]) errors.push(`${c.key || '?'}: missing ${f}`);
    for (const f of ['useFor', 'avoid', 'mistakes', 'related']) if (!Array.isArray(c[f]) || !c[f].length) errors.push(`${c.key}: missing ${f}`);
    if (!groupIds.has(c.group)) errors.push(`${c.key}: unknown group ${c.group}`);
    if (!demos.byKey[c.key]) errors.push(`${c.key}: no demo in assets/demos.js`);
    if (seen.has(c.slug)) errors.push(`${c.key}: duplicate slug ${c.slug}`);
    seen.add(c.slug);
    for (const r of c.related || []) if (!keys.has(r)) errors.push(`${c.key}: related value ${r} doesn't exist`);
    if (!systemsNote(c, systems)) errors.push(`${c.key}: no platform note (add "systems" or a row in data/systems.json)`);
  }
  for (const k of Object.keys(demos.byKey)) if (!keys.has(k)) errors.push(`demo ${k} has no entry in data/cursors.json`);
  if (errors.length) fail('Data check failed:\n  ' + errors.join('\n  '));
}
const systemsNote = (c, systems) => c.systems || (systems.find(r => r.values.includes(c.key)) || {}).note;

// Header, footer and shared <head> tags come from index.html, so they're written once.
function shared(index) {
  const pick = re => (index.match(re) || fail(`index.html: couldn't find ${re}`))[0];
  const head = index.slice(0, index.indexOf('</head>')).split('\n')
    .filter(l => /rel="icon"|name="theme-color"|rel="preconnect"|fonts\.googleapis\.com\/css2|^<script>\(function\(\)\{var t;try\{t=localStorage/.test(l)).join('\n');
  return { head, header: pick(/  <header class="top">[\s\S]*?<\/header>/), footer: pick(/<footer>[\s\S]*?<\/footer>/) };
}
// Point the main page's relative links back at the site root.
function rebase(html, root) {
  return html.replace(/href="([^"]*)"/g, (m, h) => {
    if (/^(?:[a-z]+:|\/\/)/i.test(h)) return m;
    if (h === '#top') return m;
    return `href="${root}${h}"`;
  }).replace(/<a class="brand" href="#top"/g, `<a class="brand" href="${root}"`);
}

function render(tpl, vars, name) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => k in vars ? vars[k] : fail(`${name}: no value for {{${k}}}`));
}

export async function build() {
  const t0 = Date.now();
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // 1. Copy the pages and assets.
  for (const f of COPY) cpSync(join(ROOT, f), join(DIST, f), { recursive: true });

  const data = { groups: readJSON('data/groups.json'), cursors: readJSON('data/cursors.json'), systems: readJSON('data/systems.json') };
  const demos = loadDemos();
  validate(data, demos);

  // Inline the shared data into the main page, so it needs no extra request.
  const index = read('index.html');
  if (!index.includes(DATA_TAG)) fail(`index.html: missing ${DATA_TAG}`);
  writeFileSync(join(DIST, 'index.html'), index.replace(DATA_TAG, `<script type="application/json" id="cursory-data">${json(data)}</script>`));

  // 3. Share images, before the pages that point to them.
  const LINT_ART = '<svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><rect x="4" y="2" width="32" height="20" rx="2.5" stroke-opacity=".55"/><path d="M8 7h14M8 12h18M8 17h11" stroke-opacity=".55"/><circle cx="31" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M27 17l1.6 1.6L32 15.2" stroke-width="1.6"/></svg>';
  const og = await renderOg([
    ...data.cursors.map(c => ({ slug: c.slug, name: c.key, chip: `cursor: ${c.css};`, art: demos.mini(c.key) })),
    { slug: 'studio', name: 'Cursor Studio', chip: 'cursor: url("brush.svg") 4 28, auto;', art: demos.mini('url()') },
    { slug: 'lint', name: 'Cursor Lint', chip: 'cursor: hand; → cursor: pointer;', art: LINT_ART }
  ], join(DIST, 'og'));
  // The tool pages keep og.png in their source; the build points them at their own images.
  for (const [file, slug] of [['builder.html', 'studio'], ['lint.html', 'lint']]) {
    const f = join(DIST, file), html = readFileSync(f, 'utf8'), n = html.split(`${SITE}og.png`).length - 1;
    if (!n) fail(`${file}: no og.png image tags to update`);
    writeFileSync(f, html.split(`${SITE}og.png`).join(`${SITE}og/${slug}.png`));
  }

  const parts = shared(index), today = new Date().toISOString().slice(0, 10);
  const INFO = (read('assets/site.js').match(/^const INFO='([^']*)';$/m) || fail('assets/site.js: INFO icon not found'))[1];
  const groupsLite = data.groups.map(({ id, title }) => ({ id, title }));

  // 2. A page per value.
  const tpl = read('templates/value.html'), list = data.cursors;
  list.forEach((c, i) => {
    const root = '../../', url = `${SITE}cursor/${c.slug}/`, group = data.groups.find(g => g.id === c.group);
    const og = existsSync(join(DIST, 'og', `${c.slug}.png`)) ? `${SITE}og/${c.slug}.png` : `${SITE}og.png`;
    const link = k => { const r = list.find(x => x.key === k); return `${root}cursor/${r.slug}/` };
    const prev = list[i - 1], next = list[i + 1];
    const ld = [
      { '@context': 'https://schema.org', '@type': 'TechArticle', headline: `cursor: ${c.key}`, description: c.description, inLanguage: 'en',
        url, mainEntityOfPage: url, image: og, datePublished: PUBLISHED, dateModified: today,
        author: { '@type': 'Person', name: 'Al Aowshad Himel', url: 'https://aowshad.com' }, publisher: { '@type': 'Person', name: 'Al Aowshad Himel' } },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Cursory', item: SITE },
        { '@type': 'ListItem', position: 2, name: group.title, item: `${SITE}#${group.id}` },
        { '@type': 'ListItem', position: 3, name: c.key, item: url }] }
    ];
    const html = render(tpl, {
      title: esc(`cursor: ${c.key} — CSS cursor with live demo | Cursory`), ogTitle: esc(`cursor: ${c.key} — CSS cursor with live demo`), ogAlt: esc(`cursor: ${c.key} with an illustration of its demo, on Cursory`),
      description: esc(c.description), canonical: url, ogImage: og, jsonLd: json(ld), root,
      headCommon: parts.head, header: rebase(parts.header, root), footer: rebase(parts.footer, root),
      group: group.id, groupTitle: esc(group.title), name: esc(c.key), line: esc(c.line), cssAttr: esc(c.css),
      hintButton: c.hint ? `<button class="info" type="button" aria-label="How to try it: ${esc(c.hint)}">${INFO}<span class="tipx" aria-hidden="true">${esc(c.hint)}</span></button>` : '',
      useFor: c.useFor.map(t => `<li>${esc(t)}</li>`).join(''),
      avoid: c.avoid.map(t => `<li>${esc(t)}</li>`).join(''),
      mistakes: c.mistakes.map(m => `<li><span>${esc(m.text)}</span><a href="${root}lint.html">Check your code in Cursor Lint →</a></li>`).join(''),
      systems: systemsNote(c, data.systems),
      related: c.related.map(k => `<a class="chip" href="${link(k)}">${esc(k)}</a>`).join(''),
      studioCta: c.key === 'url()' ? `
    <section class="vp-cta" aria-labelledby="studio-h"><div><h2 id="studio-h">Make your own cursor</h2><p>Draw or upload an image, set the hotspot, and export the CSS in Cursor Studio.</p></div><a class="btn lg" href="${root}builder.html">Open Cursor Studio</a></section>` : '',
      pager: (prev ? `<a class="prev" href="${link(prev.key)}"><small>← Previous</small><b>${esc(prev.key)}</b></a>` : '') +
             (next ? `<a class="next" href="${link(next.key)}"><small>Next →</small><b>${esc(next.key)}</b></a>` : ''),
      pageJson: json({ key: c.key, root, groups: groupsLite })
    }, `cursor/${c.slug}`);
    mkdirSync(join(DIST, 'cursor', c.slug), { recursive: true });
    writeFileSync(join(DIST, 'cursor', c.slug, 'index.html'), html);
  });

  // 5. The Bangla version plugs in here (step 2.4).

  // 4. 404 page (served at any depth, so its links use the site's absolute base), sitemap and robots.txt.
  const tiles = list.map(c => `<a class="ctile" href="${BASE}cursor/${c.slug}/" data-search="${esc((c.key + ' ' + c.line).toLowerCase())}" style="cursor:${esc(c.key === 'url()' ? `url("${demos.brushURL}") 4 28, crosshair` : c.css)}"><span class="nm">${esc(c.key)}</span>${demos.mini(c.key)}<span class="tsnip"><code>cursor: ${esc(c.css)};</code></span></a>`).join('');
  writeFileSync(join(DIST, '404.html'), render(read('templates/404.html'), {
    headCommon: parts.head, root: BASE, header: rebase(parts.header, BASE), footer: rebase(parts.footer, BASE),
    count: list.length, tiles, pageJson: json({ root: BASE, groups: groupsLite })
  }, '404'));

  const urls = ['', 'builder.html', 'lint.html', ...list.map(c => `cursor/${c.slug}/`)];
  writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
  writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);

  console.log(`Built dist/ in ${Date.now() - t0} ms: ${list.length} value pages, ${og.rendered + og.reused} share images (${og.rendered} rendered, ${og.reused} cached), 404 page, sitemap with ${urls.length} URLs.`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

export function serve(port = 8000) {
  createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // The live site sits under /cursory/; accept that prefix locally too, so absolute links (404 page) work.
    if (path.startsWith(BASE)) path = '/' + path.slice(BASE.length);
    let file = normalize(join(DIST, path));
    if (!file.startsWith(DIST + sep) && file !== DIST) { res.writeHead(403).end(); return }
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { location: path + '/' }).end(); return }
      file = join(file, 'index.html');
    }
    if (!existsSync(file)) {
      const notFound = join(DIST, '404.html');
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      res.end(existsSync(notFound) ? readFileSync(notFound) : 'Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  }).listen(port, '127.0.0.1', () => console.log(`Serving dist/ on http://localhost:${port}`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  build().then(() => { if (process.argv.includes('--serve')) serve() }, err => { console.error(err.message || err); process.exit(1) });
}
