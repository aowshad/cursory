// Renders share images (1200 × 630 PNG) with Playwright and Chromium.
// Fonts load from scripts/fonts/, never from Google Fonts, so builds are reproducible.
// Images are cached in .cache/og/ by a hash of everything that affects them, so unchanged ones are reused.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(ROOT, '.cache', 'og');
const MAX_BYTES = 150 * 1024;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// items: [{ slug, name, chip, art }] where art is an SVG string. Writes <outDir>/<slug>.png.
export async function renderOg(items, outDir) {
  const template = readFileSync(join(ROOT, 'templates/og.html'), 'utf8');
  const font = f => 'data:font/ttf;base64,' + readFileSync(join(ROOT, 'scripts/fonts', f)).toString('base64');
  const fonts = { fontSans: font('InstrumentSans.ttf'), fontMono: font('JetBrainsMono.ttf') };
  const base = createHash('sha256').update(template).update(fonts.fontSans).update(fonts.fontMono).digest('hex');
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const todo = [];
  let reused = 0;
  for (const it of items) {
    const hash = createHash('sha256').update(base).update(JSON.stringify([it.name, it.chip, it.art])).digest('hex').slice(0, 16);
    const cached = join(CACHE, `${it.slug}.${hash}.png`);
    if (existsSync(cached)) { copyFileSync(cached, join(outDir, `${it.slug}.png`)); reused++ }
    else todo.push({ ...it, cached });
  }

  if (todo.length) {
    let chromium;
    try { ({ chromium } = await import('playwright')) } catch { throw new Error('Share images need Playwright: run npm install') }
    let browser;
    try { browser = await chromium.launch() }
    catch (err) { throw new Error(`Couldn't start Chromium for share images. Run: npx playwright install chromium\n${err.message}`) }
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
      for (const it of todo) {
        const html = template.replace(/\{\{(\w+)\}\}/g, (m, k) =>
          k in fonts ? fonts[k] : k === 'art' ? it.art : k === 'name' ? esc(it.name) : k === 'chip' ? esc(it.chip) : m);
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const fit = await page.evaluate(() => window.fit());
        const loaded = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family));
        if (!loaded.some(f => f.includes('Instrument Sans'))) throw new Error(`${it.slug}: Instrument Sans didn't load`);
        if (fit.name > fit.max || fit.chip > fit.max) throw new Error(`${it.slug}: text overflows (${JSON.stringify(fit)})`);
        const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
        if (png.length > MAX_BYTES) throw new Error(`${it.slug}: ${Math.round(png.length / 1024)} KB, over the 150 KB target`);
        writeFileSync(it.cached, png);
        copyFileSync(it.cached, join(outDir, `${it.slug}.png`));
      }
    } finally { await browser.close() }
  }
  return { rendered: todo.length, reused };
}
