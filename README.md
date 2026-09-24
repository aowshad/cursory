# Cursory

An interactive reference for the CSS `cursor` property. Each value runs inside a working interface, next to the exact line of CSS you need.

**Live:** https://aowshad.github.io/cursory/

![Cursory](og.png)

## What's inside

- **All 36 cursor keywords plus `url()`.** Values are grouped the way the CSS UI Level 4 spec groups them, and each one has a live, real-world demo and a one-click copy.
- **Cursor Studio** (`builder.html`). A full-page editor for custom cursors, with settings panels inspired by macOS. Start from a 14-cursor library or upload an SVG, PNG, JPG or WebP and crop it. Adjust size, fill and outline colors, rotation, flip and drop shadow, and click a pixel to set the hotspot. Test the cursor on light, dark, photo and interface backgrounds, then export CSS, a Tailwind class or an inline data URI, or download it as SVG or PNG. Shortcuts: `r` rotates, `f` flips, and `[` and `]` change the size.
- **Across systems.** Notes on how the same value renders differently on Windows, macOS, Linux and touch devices. It also detects the visitor's browser and OS.
- **Light and dark themes.** Uses the visitor's system theme on the first visit and remembers their choice.
- **Search and deep links.** Press `/` to search. Every card has its own URL, for example `/#grab`.

It's one self-contained `index.html` with no build step and no dependencies. Fonts load from Google Fonts: Instrument Sans for text, JetBrains Mono for CSS.

## Run locally

```bash
git clone https://github.com/aowshad/cursory.git
cd cursory
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

```bash
gh repo create aowshad/cursory --public --source=. --push
gh api -X POST repos/aowshad/cursory/pages -f "source[branch]=main" -f "source[path]=/"
```

To use a custom domain instead, replace `https://aowshad.github.io/cursory/` in the `canonical`, `og:url`, `og:image` and `twitter:image` tags in `index.html`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The reference site |
| `builder.html` | Cursor Studio, the full-page editor |
| `og.png` | 1200 × 630 share image for LinkedIn, X and Slack |
| `favicon.svg` | Standalone favicon (an inline copy is embedded in `index.html`) |

## Credits

Designed and built by [Al Aowshad Himel](https://aowshad.com).
[LinkedIn](https://www.linkedin.com/in/aowshad-himel-65394a1a1) · [X](https://x.com/aowshadhimel) · [YouTube](https://www.youtube.com/@aowshad4130) · [GitHub](https://github.com/aowshad)

## License

MIT
