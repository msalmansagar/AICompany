import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The workspace does not decide anything, and this is what holds it to that.
 *
 * The prohibition is easy to state and easy to erode: someone adds "just a small" bucket derivation
 * so a tile can show a colour, and collection policy now lives in two places. The rule is not
 * enforceable by the language, so it is enforced here — over the **whole** of `apps/web/src`, not
 * over one class.
 *
 * What is forbidden is a *decision*, not a word. Views legitimately name `dpd`, `bucket`, `arrears`
 * and `strategy`, because those are the columns they display. What none of them may do is compare a
 * business figure against a threshold, or derive one business figure from another. So the patterns
 * below look for the comparison, not for the noun.
 */

const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Each pattern is a decision the server already makes, expressed in JavaScript. */
const FORBIDDEN: readonly { pattern: RegExp; what: string }[] = [
  {
    pattern: /\bdpd\b[^\n]{0,20}[<>]=?\s*-?\d/i,
    what: 'a days-past-due comparison against a threshold — bucketing and eligibility are the server\'s',
  },
  {
    // The noun may carry a camelCase prefix — `totalArrears`, `currentLoanBalance` — so the boundary
    // goes before the whole identifier rather than before the noun.
    pattern: /\b\w*(arrears|exposure|balance|promisedamount)\w*[^\n]{0,20}[<>]=?\s*-?\d/i,
    what: 'a money figure compared against a threshold — bands live in collection strategy configuration',
  },
  {
    pattern: /\bbucket\s*=[^=][^\n]{0,40}\bdpd\b/i,
    what: 'a bucket derived from a days-past-due value — MIS reports the bucket, DCP does not compute it',
  },
  {
    pattern: /\bis(Eligible|Overdue|Delinquent|Breached|Kept|Broken)\b/,
    what: 'an eligibility, breach or promise outcome decided in the browser',
  },
  {
    pattern: /\bsla\w*[^\n]{0,20}[<>]=?\s*-?\d/i,
    what: 'an SLA threshold — there is no SLA model before Phase 8, and inventing one here would be a second implementation',
  },
];

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      // Tests may name a threshold: asserting a refusal means writing the thing being refused.
      if (entry === '__tests__') continue;
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/** Strips comments, so prose explaining a rule is not mistaken for the rule. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('no collection rule is implemented in the browser', () => {
  const files = sourceFiles(SOURCE_ROOT);

  it('has source files to scan, or the checks below prove nothing', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const { pattern, what } of FORBIDDEN) {
    it(`contains no ${what}`, () => {
      // The population is asserted in this test, not only in the one above: "no offenders" is
      // trivially true of no files, and an empty-array assertion is exactly where that hides.
      expect(files.length, 'no source files were scanned').toBeGreaterThan(20);
      const offenders = files
        .filter(file => pattern.test(code(readFileSync(file, 'utf8'))))
        .map(file => relative(SOURCE_ROOT, file).replace(/\\/g, '/'));
      expect(offenders, `${offenders.join(', ')} appears to decide something`).toEqual([]);
    });
  }

  /**
   * The counterpart to the greps: the patterns must actually match the thing they forbid, or the
   * five tests above are five ways of proving nothing.
   */
  it('recognises the decisions it forbids when they are present', () => {
    const samples = [
      'const overdue = row.dpd > 30;',
      'if (totalArrears >= 5000) escalate();',
      'const bucket = dpd <= 30 ? "1-30" : "31-60";',
      'const isEligible = true;',
      'if (slaHours < 24) warn();',
    ];
    expect(samples).toHaveLength(FORBIDDEN.length);
    for (const sample of samples) {
      expect(
        FORBIDDEN.some(rule => rule.pattern.test(sample)),
        `no rule catches: ${sample}`,
      ).toBe(true);
    }
  });
});
