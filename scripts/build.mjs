// Builds the site into dist/.
//   node scripts/build.mjs          build
//   node scripts/build.mjs --serve  build, then serve dist/ on http://localhost:8000
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE = 'https://aowshad.github.io/cursory/';
const COPY = ['index.html', 'builder.html', 'lint.html', 'lint-engine.js', 'assets', 'og.png', 'favicon.svg'];
const DATA_TAG = '<script type="application/json" id="cursory-data"></script>';

const read = f => readFileSync(join(ROOT, f), 'utf8');
const fail = msg => { throw new Error(msg) };

// Every card needs its text, a known group and a demo in assets/demos.js.
function validate({ groups, cursors }) {
  const ctx = vm.createContext({
    window: {}, document: { documentElement: {} }, ResizeObserver: class {}, encodeURIComponent, Math, JSON, Object, Array,
    $: () => null, $$: () => [], root: {}, copyText: () => {}
  });
  vm.runInContext(read('assets/demos.js'), ctx);
  const demos = ctx.window.CursoryDemos?.byKey || fail('assets/demos.js did not define CursoryDemos');
  const groupIds = new Set(groups.map(g => g.id)), seen = new Set(), errors = [];
  for (const g of groups) if (!g.id || !g.title || !g.description) errors.push(`group ${g.id || '?'}: missing id, title or description`);
  for (const c of cursors) {
    for (const f of ['key', 'slug', 'group', 'css', 'line']) if (!c[f]) errors.push(`${c.key || '?'}: missing ${f}`);
    if (!groupIds.has(c.group)) errors.push(`${c.key}: unknown group ${c.group}`);
    if (!demos[c.key]) errors.push(`${c.key}: no demo in assets/demos.js`);
    if (seen.has(c.slug)) errors.push(`${c.key}: duplicate slug ${c.slug}`);
    seen.add(c.slug);
  }
  for (const k of Object.keys(demos)) if (!cursors.some(c => c.key === k)) errors.push(`demo ${k} has no entry in data/cursors.json`);
  if (errors.length) fail('Data check failed:\n  ' + errors.join('\n  '));
}

export function build() {
  const t0 = Date.now();
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // 1. Copy the pages and assets.
  for (const f of COPY) cpSync(join(ROOT, f), join(DIST, f), { recursive: true });

  // Inline the shared data into the main page, so it needs no extra request.
  const data = { groups: JSON.parse(read('data/groups.json')), cursors: JSON.parse(read('data/cursors.json')) };
  validate(data);
  const index = read('index.html');
  if (!index.includes(DATA_TAG)) fail(`index.html: missing ${DATA_TAG}`);
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  writeFileSync(join(DIST, 'index.html'), index.replace(DATA_TAG, `<script type="application/json" id="cursory-data">${json}</script>`));

  // 2–3, 5. Value pages, share images and the Bangla version plug in here (steps 2.1, 2.2 and 2.4).

  // 4. Sitemap and robots.txt.
  const today = new Date().toISOString().slice(0, 10);
  const urls = ['', 'builder.html', 'lint.html'];
  writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
  writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);

  console.log(`Built dist/ in ${Date.now() - t0} ms: ${data.cursors.length} values in ${data.groups.length} groups.`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

export function serve(port = 8000) {
  createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(DIST, path));
    if (!file.startsWith(DIST + sep) && file !== DIST) { res.writeHead(403).end(); return }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
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
  build();
  if (process.argv.includes('--serve')) serve();
}
