// Regression suite for lint-engine.js. Run with: node tests/lint.test.mjs
// css-tree and linkedom are dev-only dependencies (npm install); the site itself loads css-tree from a pinned CDN build.
import { readFileSync } from 'node:fs';
import * as csstree from 'css-tree';
import { DOMParser } from 'linkedom';
import { lint, fixAll, detect, applyFixes, RULES } from '../lint-engine.js';

const cases = JSON.parse(readFileSync(new URL('./lint-cases.json', import.meta.url), 'utf8'));
const opts = { csstree, DOMParser };
const failures = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const c of cases) {
  try {
    const issues = lint(c.input, opts);
    const ids = issues.map(i => i.id);
    if (!eq(ids, c.expect)) failures.push(`${c.name}\n    expected ${JSON.stringify(c.expect)}\n    got      ${JSON.stringify(ids)}`);
    for (const i of issues) {
      if (!i.title || !i.message || !i.learnMore || !(i.line >= 1) || !(i.column >= 1)) failures.push(`${c.name}: incomplete issue ${JSON.stringify(i)}`);
      if (i.fix && !(i.fix.start >= 0 && i.fix.end >= i.fix.start && i.fix.end <= c.input.length && i.fix.label)) failures.push(`${c.name}: bad fix ${JSON.stringify(i.fix)}`);
    }
    applyFixes(c.input, issues);
    if ('fixed' in c) {
      const out = fixAll(c.input, opts);
      if (out !== c.fixed) failures.push(`${c.name}: Fix all output differs\n    expected ${JSON.stringify(c.fixed)}\n    got      ${JSON.stringify(out)}`);
    }
    const d = detect(c.input);
    if ((c.note || null) !== d.unsupported) failures.push(`${c.name}: expected note ${c.note || 'none'}, got ${d.unsupported || 'none'}`);
  } catch (err) {
    failures.push(`${c.name}: threw ${err && err.stack || err}`);
  }
}

// Every rule needs at least one positive case and one negative case.
for (const r of RULES) {
  const pos = cases.some(c => c.expect.includes(r.id));
  const neg = cases.some(c => !c.expect.includes(r.id) && c.name.startsWith(r.id));
  if (!pos || !neg) failures.push(`${r.id} ${r.rule}: needs a positive and a negative case (positive: ${pos}, negative: ${neg})`);
}

// A large, clean stylesheet (Bootstrap-sized) must lint quickly and without false alarms.
const big = Array.from({ length: 6000 }, (_, i) =>
  `/* block ${i} */\n.c${i}, .c${i}:hover { color: var(--c${i % 9}); margin: 0 auto !important; background: image-set("a.png" 1x) no-repeat; }\n` +
  `.b${i}:disabled { cursor: not-allowed; } .l${i} { cursor: ${['pointer', 'var(--cursor)', 'url(a.svg) 4 4, auto', 'text !important'][i % 4]}; }\n` +
  `@media (min-width: ${i}px) { .m${i} { cursor: default; } }`).join('\n');
lint(big, opts);
const t0 = performance.now(), bigIssues = lint(big, opts), ms = performance.now() - t0;
if (bigIssues.length) failures.push(`large stylesheet: expected no issues, got ${bigIssues.length} (${bigIssues[0].id} at line ${bigIssues[0].line})`);
if (ms > 300) failures.push(`large stylesheet: took ${ms.toFixed(0)} ms (limit 300)`);

const kb = (big.length / 1024).toFixed(0);
if (failures.length) {
  console.error(`✗ ${failures.length} failure(s)\n\n` + failures.map(f => '  • ' + f).join('\n\n'));
  process.exit(1);
}
console.log(`✓ ${cases.length} cases passed, ${RULES.length} rules covered, ${kb} KB stylesheet linted in ${ms.toFixed(0)} ms`);
