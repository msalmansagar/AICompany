/**
 * audit-test-quality.mjs
 * Looks for tests that pass without proving anything.
 *
 * This exists because two of them shipped. During the Phase 5 spike a lookup assertion ran against a
 * table that is empty between smoke runs, and a second contained a literal `|| true`. Both were
 * green. Neither proved a thing.
 *
 * A green suite is not evidence on its own, so this scans for the patterns that make green cheap:
 * unconditional truth, loops that assert nothing when empty, catch blocks that turn failure into
 * success, and tests with no assertion at all.
 *
 * It reports rather than blocks. Some findings are legitimate — a loop over a constant table, an
 * expectation inside a helper — and a human decides. What it prevents is *not noticing*.
 *
 * Usage: node crm/scripts/audit-test-quality.mjs [glob-root]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ?? '.';
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|mjs|js)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage']);

/** Each rule says what it looks for and why that pattern makes a test worthless. */
const RULES = [
  {
    id: 'unconditional-true',
    severity: 'high',
    why: 'An assertion ORed with true can never fail.',
    test: line => /\|\|\s*true\s*[,)]/.test(line) || /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/.test(line),
  },
  {
    id: 'swallowed-failure',
    severity: 'high',
    why: 'A catch that does nothing turns a thrown assertion into a pass.',
    test: line => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(line),
  },
  {
    id: 'assert-nothing-when-empty',
    severity: 'medium',
    why: 'A for-of over a possibly-empty collection asserts nothing when it is empty. Assert the population first.',
    test: line => /^\s*for\s*\(const\s+\w+\s+of\s+/.test(line),
    needsContext: true,
  },
  {
    id: 'optional-chain-in-assertion',
    severity: 'medium',
    why: 'expect(x?.y) passes as undefined when x is absent, which is usually not what was meant.',
    // Only where the matcher could PASS on undefined. `expect(x?.y).toBe(3)` still fails when x is
    // absent, so flagging it is noise; `toBeUndefined`, `toBeFalsy` and `not.toBe` are the risky ones.
    test: line => /expect\([^)]*\?\./.test(line) && /(toBeUndefined|toBeFalsy|toBeNull|not\.toBe)/.test(line),
  },
  {
    id: 'empty-array-equality',
    severity: 'low',
    why: 'Asserting an empty array passes when the query silently returned nothing.',
    test: line => /\.toEqual\(\s*\[\s*\]\s*\)/.test(line),
  },
  {
    id: 'truthy-only',
    severity: 'low',
    why: 'toBeTruthy on a collection passes for an empty array, which is truthy in JavaScript.',
    test: line => /expect\([^)]*(rows|items|results|entities|records|list)[^)]*\)\.toBeTruthy\(\)/i.test(line),
  },
];

function testFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...testFiles(path));
    else if (TEST_FILE.test(entry)) out.push(path);
  }
  return out;
}

/**
 * Splits a file into `it(...)` blocks so a test with no assertion can be found.
 *
 * The body is found by matching braces from the callback, not by searching for the next `})`. An
 * earlier version did the latter and reported fifty false positives: every test containing an inline
 * object — `app.inject({ … })` — was truncated before its assertions and declared assertion-free.
 * An audit that cries wolf is worse than no audit, because people stop reading it.
 */
function testBlocks(source) {
  const blocks = [];
  const re = /\b(it|test)\s*(\.\w+)?\s*\(\s*(['"`])((?:\\.|(?!\3)[\s\S])*)\3/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const bodyStart = source.indexOf('{', re.lastIndex);
    if (bodyStart < 0) continue;
    const end = matchBrace(source, bodyStart);
    blocks.push({
      name: match[4].replace(/\s+/g, ' ').trim(),
      body: source.slice(bodyStart, end),
      line: source.slice(0, match.index).split('\n').length,
    });
  }
  return blocks;
}

/**
 * Finds the brace that closes the one at `start`, ignoring braces inside strings and comments.
 *
 * A naive counter reported a test as assertion-free because its body contained `indexOf('}')` — the
 * brace in that string literal closed the block early. Quote and comment awareness is the difference
 * between an audit worth reading and one worth ignoring.
 */
function matchBrace(source, start) {
  let depth = 0;
  let quote = null;
  let comment = null;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (comment) {
      if (comment === 'line' && ch === '\n') comment = null;
      else if (comment === 'block' && ch === '*' && next === '/') { comment = null; i++; }
      continue;
    }
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }

    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return source.length;
}

const findings = [];
const files = testFiles(ROOT);

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return; // a comment describing the pattern is not the pattern
    for (const rule of RULES) {
      if (!rule.test(line)) continue;
      if (rule.needsContext) {
        // A loop is only a finding when nothing nearby asserts the collection is populated.
        const before = lines.slice(Math.max(0, i - 6), i).join('\n');
        if (/toHaveLength|toBeGreaterThan|length\)\.toBe|expect\(.*length/.test(before)) continue;
      }
      findings.push({ file: rel, line: i + 1, rule: rule.id, severity: rule.severity, why: rule.why, text: line.trim().slice(0, 96) });
    }
  });

  for (const block of testBlocks(source)) {
    if (!/expect\s*\(|assert|\.rejects|\.resolves/.test(block.body)) {
      findings.push({
        file: rel, line: block.line, rule: 'no-assertion', severity: 'high',
        why: 'A test that asserts nothing cannot fail, and must not count as evidence.',
        text: block.name.slice(0, 96),
      });
    }
  }
}

const bySeverity = s => findings.filter(f => f.severity === s);
console.log(`=== Test-quality audit — ${files.length} test file(s) scanned ===\n`);

for (const severity of ['high', 'medium', 'low']) {
  const group = bySeverity(severity);
  if (group.length === 0) continue;
  console.log(`── ${severity.toUpperCase()} (${group.length})`);
  for (const f of group) {
    console.log(`   ${f.file}:${f.line}  [${f.rule}]`);
    console.log(`      ${f.text}`);
    console.log(`      why: ${f.why}`);
  }
  console.log('');
}

if (findings.length === 0) {
  console.log('No vacuous-assertion patterns found.');
} else {
  console.log(`${findings.length} finding(s). Each needs a human decision: a loop over a constant table is`);
  console.log('fine, a loop over a query result is not. The point is that none of them goes unnoticed.');
}

// Reports; does not block. Deciding which findings matter is the reviewer's job, not a regex's.
process.exitCode = 0;
