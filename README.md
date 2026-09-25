# Cursory

An interactive reference for the CSS `cursor` property. Each value runs inside a working interface, next to the exact line of CSS you need.

**Live:** https://aowshad.github.io/cursory/

![Cursory](og.png)

## What's inside

- **All 36 cursor keywords plus `url()`.** Values are grouped the way the CSS UI Level 4 spec groups them, and each one has a live, real-world demo and a one-click copy.
- **Cursor Studio** (`builder.html`). A full-page editor for custom cursors, with settings panels inspired by macOS. Start from a 14-cursor library or upload an SVG, PNG, JPG or WebP and crop it. Adjust size, fill and outline colors, rotation, flip and drop shadow, and click a pixel to set the hotspot. Test the cursor on light, dark, photo and interface backgrounds, then export CSS, a Tailwind class or an inline data URI, or download it as SVG or PNG. Shortcuts: `r` rotates, `f` flips, and `[` and `]` change the size.
- **Cursor Lint** (`lint.html`). Paste CSS or HTML and get every cursor mistake explained: invalid values, `cursor: hand`, vendor prefixes, `url()` without a fallback, oversized hotspots, pointer on disabled controls, a global pointer, `grab` without `grabbing`, clickable `<div>`s and more. Most issues fix in one click and undo with Cmd/Ctrl+Z. You can copy a Markdown report or a share link, and your code never leaves the browser.
- **Across systems.** Notes on how the same value renders differently on Windows, macOS, Linux and touch devices. It also detects the visitor's browser and OS.
- **Light and dark themes.** Uses the visitor's system theme on the first visit and remembers their choice.
- **Search and deep links.** Press `/` to search. Every card has its own URL, for example `/#grab`.

The published site has no runtime dependencies. Card text lives once in `data/`, demos once in `assets/demos.js`, and a small Node build puts the pages together into `dist/`. Cursor Lint loads [css-tree](https://github.com/csstree/csstree) from a pinned jsDelivr build. Fonts load from Google Fonts: Instrument Sans for text, JetBrains Mono for CSS.

## Run locally

```bash
git clone https://github.com/aowshad/cursory.git
cd cursory
npm install
npm run dev
# open http://localhost:8000
```

`npm run build` writes the site to `dist/` without serving it. The unbuilt source also works from any static server, because `index.html` reads `data/` directly when the data isn't inlined.

## Test

```bash
npm test
```

This runs the Cursor Lint regression suite. The dev-only packages (css-tree, linkedom and Playwright) never reach the published site.

## Deploy

Every push to `main` runs `.github/workflows/pages.yml`: it installs dependencies, runs the tests, builds `dist/` and deploys it to GitHub Pages. In the repo settings, **Pages → Source** must be set to **GitHub Actions**.

To use a custom domain instead, replace `https://aowshad.github.io/cursory/` in the `canonical`, `og:url`, `og:image` and `twitter:image` tags, and `SITE` in `scripts/build.mjs`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The reference site. Its cards are built from `data/` and `assets/demos.js` |
| `builder.html` | Cursor Studio, the full-page editor |
| `lint.html` | Cursor Lint, the CSS and HTML checker |
| `lint-engine.js` | Cursor Lint's rule engine, shared by the page and the tests |
| `data/cursors.json` | Every value's text: description, hint and search terms |
| `data/groups.json` | Group ids, titles and descriptions |
| `assets/demos.js` | Every demo's markup and behavior, plus the compact view's mini previews |
| `assets/site.css` | Design tokens, components and demo styles for the main page |
| `assets/site.js` | Shared helpers: theme, clipboard, copy formats and the toast |
| `assets/zoom.webp` | Photo used in the `zoom-in` and `zoom-out` demos |
| `scripts/build.mjs` | Builds `dist/`, inlines the data, writes the sitemap and robots.txt. `--serve` serves it |
| `tests/` | Regression cases for the rule engine (`lint-cases.json`) and the runner |
| `og.png` | 1200 × 630 share image for LinkedIn, X and Slack |
| `favicon.svg` | Standalone favicon (an inline copy is embedded in `index.html`) |

## Credits

Designed and built by [Al Aowshad Himel](https://aowshad.com).
Zoom demo photo from [Pexels](https://www.pexels.com/).
[LinkedIn](https://www.linkedin.com/in/aowshad-himel-65394a1a1) · [X](https://x.com/aowshadhimel) · [YouTube](https://www.youtube.com/@aowshad4130) · [GitHub](https://github.com/aowshad)

## License

MIT
