import { fileURLToPath } from 'node:url';
const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
// Extracts the formula evaluator out of report-engine-core.js and exercises it, including the cases
// that matter most: that it computes correctly, and that it cannot be made to execute code.
import { readFileSync } from 'node:fs';

const html = readFileSync(ENGINE, 'utf8');
const start = html.indexOf('const FORMULA_FUNCTIONS');
const end = html.indexOf('/* ---------------- self-check');
if (start < 0 || end < 0) throw new Error('formula section not found');

const source = html.slice(start, end);
const api = new Function(`${source}; return { applyFormulas, tokenizeFormula, parseFormula, evaluateFormula };`)();

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  ok ? passed++ : failed++;
}

/** Runs one formula over a single row and returns the computed cell text. */
function compute(expression, cells = {}) {
  const result = {
    columns: Object.keys(cells).map(alias => ({ alias, isVisible: true })),
    rows: [{ cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { value: v, text: String(v) }])) }]
  };
  api.applyFormulas(result, [{ formulaAlias: 'out', expression, evaluationOrder: 1 }]);
  return result.rows[0].cells.out.value;
}

console.log('arithmetic and precedence');
check('1+1', compute('1+1'), 2);
check('precedence', compute('2+3*4'), 14);
check('parentheses', compute('(2+3)*4'), 20);
check('unary minus', compute('-5+2'), -3);
check('divide by zero is blank, not Infinity', compute('10/0'), null);

console.log('\ncolumn references');
check('column value', compute('revenue*2', { revenue: 150 }), 300);
check('numeric text is coerced', compute('amount+1', { amount: '1,250' }), 1251);
check('missing column', compute('nope+1'), 1);

console.log('\nlogic and functions');
check('if true', compute("if(revenue>100,'big','small')", { revenue: 150 }), 'big');
check('if false', compute("if(revenue>100,'big','small')", { revenue: 50 }), 'small');
check('and short-circuits', compute('x != 0 && 10/x > 1', { x: 0 }), false);
check('round', compute('round(3.14159, 2)'), 3.14);
check('concat', compute("concat(first,' ',last)", { first: 'Al', last: 'Khalij' }), 'Al Khalij');
check('coalesce', compute('coalesce(missing, 7)'), 7);
check('text + is concatenation', compute("'a' + 'b'"), 'ab');
check('formatted currency adds', compute('amount+fee', { amount: 'QAR 1,250', fee: 50 }), 1300);

console.log('\nformulas can reference earlier formulas');
const chained = {
  columns: [{ alias: 'qty', isVisible: true }],
  rows: [{ cells: { qty: { value: 4, text: '4' } } }]
};
api.applyFormulas(chained, [
  { formulaAlias: 'doubled', expression: 'qty*2', evaluationOrder: 1 },
  { formulaAlias: 'plusOne', expression: 'doubled+1', evaluationOrder: 2 }
]);
check('later formula sees earlier', chained.rows[0].cells.plusOne.value, 9);

console.log('\nan empty cell compares as empty, not as "null"');
// Found by running a real report: `if(email != '', 'yes', 'no')` said "yes" for every blank email,
// because String(null) is "null", which is not ''. Testing a field for emptiness is the single most
// common thing a formula does, so this had to be exact.
check('blank is equal to empty string', compute("if(email == '', 'none', 'has')", { email: null }), 'none');
check('blank is not unequal to empty string', compute("if(email != '', 'has', 'none')", { email: null }), 'none');
check('empty string behaves the same', compute("if(email != '', 'has', 'none')", { email: '' }), 'none');
check('a real value still compares as itself', compute("if(email != '', 'has', 'none')", { email: 'a@b.c' }), 'has');

console.log('\nbad input degrades to blank, never throws');
check('unknown function', compute('bogus(1)'), null);
check('unbalanced parens', compute('(1+2'), null);
check('trailing garbage', compute('1+2)'), null);
check('empty', compute(''), null);

console.log('\nSECURITY — expressions must not become code');
globalThis.__breach = false;
for (const attack of [
  "constructor.constructor('globalThis.__breach=true')()",
  "globalThis.__breach=true",
  "process.exit(1)",
  "require('fs')",
  "[].constructor",
  "__proto__",
  "alert(1)",
  "this.constructor"
]) {
  const value = compute(attack);
  check(`blocked: ${attack.slice(0, 34)}`, value === null || typeof value !== 'function', true);
}
check('no global was written', globalThis.__breach, false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
