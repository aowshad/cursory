// Cursor Lint rule engine.
// Pure ES module: no DOM access except a DOMParser passed in, so it runs in the browser and in Node tests.
//   lint(source, { csstree, DOMParser }) -> Issue[]
//   applyFixes(source, issues) -> string
// Issue: { id, rule, severity: 'error'|'warning'|'tip', line, column, title, message, learnMore, fix?: { start, end, text, label } }
// Offsets are measured in the original source.

export const KEYWORDS = ['auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress', 'wait', 'cell', 'crosshair',
  'text', 'vertical-text', 'alias', 'copy', 'move', 'no-drop', 'not-allowed', 'grab', 'grabbing', 'all-scroll', 'col-resize',
  'row-resize', 'n-resize', 'e-resize', 's-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize', 'ew-resize',
  'ns-resize', 'nesw-resize', 'nwse-resize', 'zoom-in', 'zoom-out'];
const WIDE = ['inherit', 'initial', 'unset', 'revert', 'revert-layer'];
const VENDOR = {
  '-webkit-grab': 'grab', '-webkit-grabbing': 'grabbing', '-moz-grab': 'grab', '-moz-grabbing': 'grabbing',
  '-webkit-zoom-in': 'zoom-in', '-webkit-zoom-out': 'zoom-out', '-moz-zoom-in': 'zoom-in', '-moz-zoom-out': 'zoom-out'
};

export const RULES = [
  { id: 'L01', rule: 'invalid-value', severity: 'error', label: 'Invalid values' },
  { id: 'L02', rule: 'legacy-hand', severity: 'error', label: 'cursor: hand' },
  { id: 'L03', rule: 'vendor-prefix', severity: 'warning', label: 'Vendor prefixes' },
  { id: 'L04', rule: 'url-no-fallback', severity: 'error', label: 'Missing fallback' },
  { id: 'L05', rule: 'url-large-hotspot', severity: 'warning', label: 'Oversized hotspot' },
  { id: 'L06', rule: 'pointer-on-disabled', severity: 'warning', label: 'Pointer on disabled' },
  { id: 'L07', rule: 'global-pointer', severity: 'warning', label: 'Global pointer' },
  { id: 'L08', rule: 'grab-without-grabbing', severity: 'tip', label: 'grab without grabbing' },
  { id: 'L09', rule: 'clickable-non-interactive', severity: 'warning', label: 'Clickable divs' },
  { id: 'L10', rule: 'cursor-none', severity: 'tip', label: 'cursor: none' },
  { id: 'L11', rule: 'duplicate-cursor', severity: 'tip', label: 'Duplicates' },
  { id: 'L12', rule: 'url-default-hotspot', severity: 'tip', label: 'Default hotspot' }
];
const RULE = Object.fromEntries(RULES.map(r => [r.id, r]));
const card = k => 'index.html#' + k.replace(/[()]/g, '');

/* ---------- small helpers ---------- */
const blank = s => s.replace(/[^\r\n]/g, ' ');

function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return off => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1 }
    return { line: lo + 1, column: off - starts[lo] + 1 };
  };
}

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function closest(word) {
  let best = null, dist = 3;
  for (const k of KEYWORDS) { const n = levenshtein(word, k); if (n < dist) { dist = n; best = k } }
  return best;
}

// Split at top-level commas, keeping offsets relative to the input.
function splitTop(text) {
  const out = []; let depth = 0, quote = null, from = 0;
  const push = to => {
    const raw = text.slice(from, to), lead = raw.length - raw.trimStart().length;
    out.push({ text: raw.trim(), start: from + lead, end: from + lead + raw.trim().length });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { push(i); from = i + 1 }
  }
  push(text.length);
  return out;
}
const isImage = t => /^(?:-webkit-)?(?:url|image-set)\(/i.test(t);
// var(), env() and preprocessor variables ($scss, @less) can't be checked statically.
const isDynamic = t => /\b(?:var|env)\(|(?:^|[\s,(])[$@][a-z_-]/i.test(t);
const isKeyword = t => KEYWORDS.includes(t) || WIDE.includes(t);

// Remove a declaration plus its semicolon; drop the whole line if it stood alone.
function removalRange(src, s, e) {
  let a = s, b = e;
  while (b < src.length && /[ \t]/.test(src[b])) b++;
  if (src[b] === ';') b++;
  while (b < src.length && /[ \t]/.test(src[b])) b++;
  let ls = a; while (ls > 0 && /[ \t]/.test(src[ls - 1])) ls--;
  if ((ls === 0 || src[ls - 1] === '\n') && (b === src.length || src[b] === '\n' || src[b] === '\r')) {
    a = ls; if (src[b] === '\r') b++; if (src[b] === '\n') b++;
  }
  return [a, b];
}

/* ---------- input detection ---------- */
const MARKUP_RE = /<!--[\s\S]*?(?:-->|$)|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>|<\/[a-zA-Z][\w:-]*\s*>/g;
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function scan(src) {
  const tags = [], styles = []; let first = -1, last = -1, m;
  MARKUP_RE.lastIndex = 0;
  while ((m = MARKUP_RE.exec(src))) {
    if (first < 0) first = m.index;
    last = m.index + m[0].length;
    if (!m[1]) continue;
    const name = m[1].toLowerCase(), tag = { name, start: m.index, end: last, attrs: [] };
    const base = m.index + 1 + m[1].length; let a;
    ATTR_RE.lastIndex = 0;
    while ((a = ATTR_RE.exec(m[2]))) {
      const value = a[2] ?? a[3] ?? a[4] ?? null, quoted = a[2] != null || a[3] != null;
      const valueStart = value == null ? -1 : base + a.index + a[0].length - value.length - (quoted ? 1 : 0);
      tag.attrs.push({ name: a[1].toLowerCase(), value, valueStart, valueEnd: valueStart + (value ? value.length : 0), start: base + a.index });
    }
    tags.push(tag);
    if (name === 'style' || name === 'script') {
      const close = new RegExp('</' + name + '\\s*>', 'ig'); close.lastIndex = tag.end;
      const c = close.exec(src), stop = c ? c.index : src.length;
      if (name === 'style') styles.push([tag.end, stop]);
      MARKUP_RE.lastIndex = c ? c.index + c[0].length : src.length;
      last = MARKUP_RE.lastIndex;
    }
  }
  return { tags, styles, first, last };
}

const UNSUPPORTED = [
  ['JSX', /style=\{\{|className=/],
  ['CSS-in-JS', /\bstyled(?:\.[a-z]+|\()|\bcss`/],
  ['SCSS', /^\s*\$[\w-]+\s*:|@mixin\b|@include\b|&:|&\.|#\{/m],
  ['Less', /^\s*@[\w-]+\s*:|\.[\w-]+\(\s*\);/m]
];

export function detect(source) {
  const s = scan(source);
  const language = !s.tags.length && s.first < 0 ? 'CSS' : /^\s*</.test(source) ? 'HTML' : 'Mixed';
  const hit = UNSUPPORTED.find(([, re]) => re.test(source));
  const kind = hit && hit[0];
  const note = !kind ? null : kind === 'SCSS' || kind === 'Less'
    ? `Looks like ${kind}. Cursor Lint checks plain CSS and HTML, so nested rules may be skipped.`
    : `Looks like ${kind}. Cursor Lint checks plain CSS and HTML, so style objects in JavaScript are skipped.`;
  return { language, unsupported: kind || null, note };
}

/* ---------- the linter ---------- */
export function lint(source, options = {}) {
  const { csstree, DOMParser } = options;
  if (!csstree) throw new Error('lint() needs css-tree: lint(source, { csstree })');
  const src = String(source ?? '');
  const pos = lineIndex(src), issues = [];
  const add = (id, at, message, fix, learnMore, title) => {
    const { line, column } = pos(at), r = RULE[id];
    issues.push({ id, rule: r.rule, severity: r.severity, line, column, offset: at, title: title || TITLES[id], message, learnMore: learnMore || LEARN[id], ...(fix ? { fix } : {}) });
  };

  const s = scan(src), lang = !s.tags.length && s.first < 0 ? 'CSS' : /^\s*</.test(src) ? 'HTML' : 'Mixed';

  // CSS view: same length as the source, with everything that isn't CSS blanked out.
  let view = src;
  if (lang !== 'CSS') {
    const keep = s.styles.slice();
    if (lang === 'Mixed') { keep.push([0, s.first]); keep.push([s.last, src.length]) }
    keep.sort((a, b) => a[0] - b[0]);
    let out = '', at = 0;
    for (const [a, b] of keep) { if (b <= at) continue; const from = Math.max(a, at); out += blank(src.slice(at, from)) + src.slice(from, b); at = b }
    view = out + blank(src.slice(at));
  }

  const parse = (text, context) => {
    try { return csstree.parse(text, { context, positions: true, parseValue: false, parseRulePrelude: false, parseAtrulePrelude: false, parseCustomProperty: false, onParseError() {} }) }
    catch { return null }
  };
  const declOf = (d, text, base) => ({
    start: base + d.loc.start.offset, end: base + d.loc.end.offset,
    vStart: base + d.value.loc.start.offset, vEnd: base + d.value.loc.end.offset,
    value: text.slice(d.value.loc.start.offset, d.value.loc.end.offset).replace(/\s*!\s*important\s*$/i, ''),
    important: !!d.important
  });

  const rules = [];
  const ast = parse(view, 'stylesheet');
  if (ast) csstree.walk(ast, {
    visit: 'Rule',
    enter(r) {
      if (!r.prelude || !r.prelude.loc || !r.block) return;
      const decls = [];
      r.block.children.forEach(d => { if (d.type === 'Declaration' && d.property.toLowerCase() === 'cursor' && d.value && d.value.loc) decls.push(declOf(d, view, 0)) });
      const sel = view.slice(r.prelude.loc.start.offset, r.prelude.loc.end.offset).replace(/\s+/g, ' ').trim();
      rules.push({ sel, parts: splitTop(sel).map(p => p.text).filter(Boolean), start: r.loc.start.offset, end: r.loc.end.offset, decls });
    }
  });

  // Value checks shared by rules and style attributes. Returns the parsed shape.
  const checkValue = d => {
    const v = d.value.trim(), low = v.toLowerCase();
    if (!v || isDynamic(v)) return { dynamic: true };
    const lead = d.value.length - d.value.trimStart().length, at = d.vStart + lead;
    const items = splitTop(v);
    const word = (it, fallbackCtx) => {
      const t = it.text.toLowerCase(), s0 = at + it.start, e0 = at + it.end;
      if (isKeyword(t)) { if (t === 'none' && !fallbackCtx) add('L10', s0, MSG.L10); return }
      if (t === 'hand') return add('L02', s0, MSG.L02, { start: s0, end: e0, text: 'pointer', label: 'Fix' });
      if (VENDOR[t]) return { vendor: t, start: s0, end: e0 };
      const sug = /^[a-z-]+$/.test(t) ? closest(t) : null;
      add('L01', s0, `“${it.text}” isn’t a cursor value, so browsers ignore the whole declaration.` + (sug ? ` Did you mean ${sug}?` : ' Use one of the 36 keywords, or url() with a keyword fallback.'),
        sug ? { start: s0, end: e0, text: sug, label: 'Fix' } : null, sug ? card(sug) : 'index.html');
    };
    if (items.length === 1 && !isImage(items[0].text)) return { single: low, vendor: word(items[0], false) };
    const lastIt = items[items.length - 1];
    items.slice(0, -1).forEach(it => { if (!isImage(it.text)) add('L01', at + it.start, `Only url() or image-set() can come before the fallback keyword, so “${it.text}” makes the whole declaration invalid.`) });
    items.forEach(it => {
      if (!isImage(it.text)) return;
      let depth = 0, close = -1;
      for (let i = 0; i < it.text.length; i++) { if (it.text[i] === '(') depth++; else if (it.text[i] === ')' && --depth === 0) { close = i; break } }
      const rest = close < 0 ? '' : it.text.slice(close + 1).trim();
      const nums = rest.match(/^(-?\d*\.?\d+)\s+(-?\d*\.?\d+)$/);
      if (nums) {
        const x = +nums[1], y = +nums[2];
        if (x >= 128 || y >= 128) add('L05', at + it.start, `A hotspot of ${x} ${y} means the image is at least ${Math.max(x, y) + 1} px across. Browsers reject cursor images larger than 128 × 128 px, and most systems draw them at 32 × 32.`);
      } else if (!rest) add('L12', at + it.start, MSG.L12);
    });
    if (isImage(lastIt.text)) add('L04', at + lastIt.start, MSG.L04, { start: d.vEnd, end: d.vEnd, text: ', auto', label: 'Fix' });
    else { const w = word(lastIt, true); if (w) add('L03', w.start, vendorMsg(w.vendor, false), { start: w.start, end: w.end, text: VENDOR[w.vendor], label: 'Fix' }, card(VENDOR[w.vendor])) }
    return { list: true };
  };

  // Checks that need the other declarations in the same rule.
  const checkDecls = (decls, rule) => {
    const shapes = decls.map(checkValue);
    decls.forEach((d, i) => {
      const sh = shapes[i];
      if (sh.vendor) {
        const std = VENDOR[sh.vendor.vendor], has = decls.some((o, j) => j !== i && o.value.trim().toLowerCase() === std);
        const fix = has ? (([a, b]) => ({ start: a, end: b, text: '', label: 'Remove' }))(removalRange(src, d.start, d.end))
          : { start: sh.vendor.start, end: sh.vendor.end, text: std, label: 'Fix' };
        add('L03', sh.vendor.start, vendorMsg(sh.vendor.vendor, has), fix, card(std));
      }
      if (rule && sh.single === 'pointer') {
        const lead = d.value.length - d.value.trimStart().length, s0 = d.vStart + lead, e0 = s0 + 7;
        const dis = rule.parts.map(p => isDisabledSel(p));
        if (rule.parts.length && dis.every(Boolean)) add('L06', s0, MSG.L06css, { start: s0, end: e0, text: 'not-allowed', label: 'Fix' });
        else if (dis.some(Boolean)) add('L06', s0, MSG.L06mixed);
        if (rule.parts.length && rule.parts.every(p => /^(?:html|body|\*|:root)$/i.test(p))) add('L07', s0, MSG.L07, { start: s0, end: e0, text: 'auto', label: 'Fix' });
      }
      const next = decls[i + 1];
      if (next && !(d.important && !next.important) && !VENDOR[d.value.trim().toLowerCase()] && !/\b(?:url|image-set|var|env)\(/i.test(next.value)) {
        const [a, b] = removalRange(src, d.start, d.end);
        add('L11', d.start, MSG.L11, { start: a, end: b, text: '', label: 'Remove' });
      }
    });
  };

  rules.forEach(r => checkDecls(r.decls, r));

  // L08: grab needs a matching grabbing rule.
  const low = v => v.trim().toLowerCase();
  const grabbing = rules.filter(r => r.decls.some(d => /^(?:-webkit-|-moz-)?grabbing$/.test(low(d.value)))).flatMap(r => r.parts.map(p => p.toLowerCase()));
  const HELD = /:active|\.is-dragging|\.dragging|\[aria-grabbed\s*=\s*["']?true["']?\s*\]/;
  rules.forEach(r => {
    if (!r.decls.some(d => /^(?:-webkit-|-moz-)?grab$/.test(low(d.value)))) return;
    const open = r.parts.filter(p => !HELD.test(p.toLowerCase()) && !grabbing.some(g => HELD.test(g) && g.includes(p.toLowerCase())));
    if (!open.length) return;
    const ls = src.lastIndexOf('\n', r.start - 1) + 1, indent = src.slice(ls, r.start).match(/^[ \t]*/)[0];
    add('L08', r.start, MSG.L08, { start: r.end, end: r.end, text: `\n${indent}${open.map(p => p + ':active').join(', ')} { cursor: grabbing; }`, label: 'Add :active rule' });
  });

  // HTML: style and class attributes, disabled controls, clickable divs.
  // JSX attribute syntax isn't HTML, so only CSS is checked there.
  if (lang !== 'CSS' && !UNSUPPORTED[0][1].test(src)) {
    let dom = null;
    if (DOMParser) { try { const doc = new DOMParser().parseFromString(src, 'text/html'); dom = {}; doc.querySelectorAll('*').forEach(el => (dom[el.tagName.toLowerCase()] ||= []).push(el)) } catch { dom = null } }
    for (const tag of s.tags) {
      const el = dom && dom[tag.name] ? dom[tag.name].shift() : null;
      const raw = n => tag.attrs.find(a => a.name === n);
      const has = n => el ? el.hasAttribute(n) : !!raw(n);
      const get = n => el ? el.getAttribute(n) : raw(n)?.value;
      const disabled = has('disabled') || String(get('aria-disabled') || '').toLowerCase() === 'true';
      const style = raw('style'), cls = raw('class');
      let styleCursor = false;
      if (style && style.value) {
        const list = parse(style.value, 'declarationList');
        const decls = [];
        if (list) list.children.forEach(d => { if (d.type === 'Declaration' && d.property.toLowerCase() === 'cursor' && d.value && d.value.loc) decls.push(declOf(d, style.value, style.valueStart)) });
        styleCursor = decls.length > 0;
        checkDecls(decls, null);
        if (disabled) decls.forEach(d => {
          if (d.value.trim().toLowerCase() !== 'pointer') return;
          const s0 = d.vStart + (d.value.length - d.value.trimStart().length);
          add('L06', s0, MSG.L06css, { start: s0, end: s0 + 7, text: 'not-allowed', label: 'Fix' });
        });
      }
      const tokens = [];
      if (cls && cls.value) { const re = /\S+/g; let t; while ((t = re.exec(cls.value))) tokens.push({ text: t[0], start: cls.valueStart + t.index }) }
      if (disabled) tokens.filter(t => t.text === 'cursor-pointer').forEach(t =>
        add('L06', t.start, MSG.L06tw, { start: t.start, end: t.start + t.text.length, text: 'cursor-not-allowed', label: 'Fix' }));
      if ((tag.name === 'div' || tag.name === 'span') && (has('onclick') || has('@click') || has('v-on:click')) && !has('role')) {
        const needCursor = !styleCursor && !tokens.some(t => t.text.startsWith('cursor-'));
        const ins = [[1 + tag.name.length, ' role="button"' + (has('tabindex') ? '' : ' tabindex="0"') + (needCursor && !style ? ' style="cursor:pointer"' : '')]];
        if (needCursor && style && style.valueStart >= 0) ins.push([style.valueStart - tag.start, 'cursor:pointer;' + (style.value.trim() ? ' ' : '')]);
        let text = src.slice(tag.start, tag.end);
        ins.sort((a, b) => b[0] - a[0]).forEach(([o, t]) => { text = text.slice(0, o) + t + text.slice(o) });
        add('L09', tag.start, `This <${tag.name}> responds to clicks, but screen readers don’t announce it as a button and the keyboard can’t reach it. A <button> is better. If you keep the <${tag.name}>, add role="button", tabindex="0" and an Enter and Space handler.`,
          { start: tag.start, end: tag.end, text, label: 'Add role and pointer' });
      }
    }
  }

  const order = { error: 0, warning: 1, tip: 2 };
  return issues.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id) || a.offset - b.offset || order[a.severity] - order[b.severity]);
}

function isDisabledSel(sel) {
  const s = sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/gi, '');
  return /:disabled\b|\[\s*disabled\s*\]|\[\s*aria-disabled\s*=\s*["']?true["']?\s*\]|\.[\w-]*(?:disabled|inactive)[\w-]*/i.test(s);
}
const vendorMsg = (v, remove) => `${v} was only needed by old browsers. Every current browser supports ${VENDOR[v]}.` + (remove ? ' This rule already sets it, so the prefixed line can go.' : '');

const TITLES = {
  L01: 'Unknown cursor value', L02: 'cursor: hand is not standard', L03: 'Vendor-prefixed cursor', L04: 'Image cursor without a fallback',
  L05: 'Hotspot outside the image', L06: 'Pointer on a disabled control', L07: 'Pointer on the whole page', L08: 'grab without grabbing',
  L09: 'Clickable element without a role', L10: 'cursor: none hides the pointer', L11: 'Duplicate cursor declaration', L12: 'Hotspot defaults to the top-left corner'
};
const LEARN = {
  L01: 'index.html', L02: card('pointer'), L03: card('grab'), L04: card('url()'), L05: card('url()'), L06: card('not-allowed'), L07: card('auto'),
  L08: card('grabbing'), L09: card('pointer'), L10: card('none'), L11: 'index.html', L12: 'builder.html'
};
const MSG = {
  L02: 'hand only ever worked in old Internet Explorer. Every current browser ignores it. Use pointer.',
  L04: 'A url() or image-set() cursor must end with a keyword such as auto. Without one the whole declaration is invalid and browsers ignore it.',
  L06css: 'Disabled controls can’t be clicked, so pointer promises something that won’t happen. Use not-allowed.',
  L06tw: 'Disabled controls can’t be clicked, so cursor-pointer promises something that won’t happen. Use cursor-not-allowed, or add disabled:cursor-not-allowed so it switches on its own.',
  L06mixed: 'Some selectors in this list target a disabled state. Move them into their own rule with cursor: not-allowed.',
  L07: 'Setting pointer on html, body, * or :root makes plain text and empty space look clickable. Use auto, and set pointer only on links and buttons.',
  L08: 'Nothing switches this to grabbing while it’s held, so the hand never closes. Add an :active rule, unless your JavaScript already swaps the cursor. For drags that can leave the element, set grabbing on the document until pointerup.',
  L10: 'Draw a replacement, and bring the cursor back when the pointer leaves the area or goes idle, or people lose track of it.',
  L11: 'This rule sets cursor again further down, so this line never applies.',
  L12: 'Without x and y numbers the click point is 0 0, the top-left corner of the image. Set it so clicks land where the cursor points. Cursor Studio can find it for you.'
};

/* ---------- fixes ---------- */
// Apply fixes from the end of the source backwards, skipping any that overlap one already applied.
export function applyFixes(source, issues) {
  const fixes = issues.map(i => (i && i.fix) || null).filter(f => f && Number.isInteger(f.start) && Number.isInteger(f.end))
    .sort((a, b) => b.start - a.start || b.end - a.end);
  let out = String(source), floor = Infinity;
  for (const f of fixes) {
    if (f.end > floor || (f.start === f.end && f.start === floor)) continue;
    out = out.slice(0, f.start) + f.text + out.slice(f.end);
    floor = f.start;
  }
  return out;
}

// Fix all: lint, apply, and repeat until nothing fixable remains (at most 5 passes).
export function fixAll(source, options, passes = 5) {
  let out = String(source);
  for (let i = 0; i < passes; i++) {
    const fixable = lint(out, options).filter(x => x.fix);
    if (!fixable.length) break;
    const next = applyFixes(out, fixable);
    if (next === out) break;
    out = next;
  }
  return out;
}

// Before and after lines for a fix, for the diff preview.
export function previewFix(source, fix) {
  const src = String(source), ls = src.lastIndexOf('\n', fix.start - 1) + 1;
  let le = src.indexOf('\n', fix.end); if (le < 0) le = src.length;
  const before = src.slice(ls, le), after = src.slice(ls, fix.start) + fix.text + src.slice(fix.end, le);
  return { before: before.split('\n'), after: after === '' ? [] : after.split('\n') };
}
