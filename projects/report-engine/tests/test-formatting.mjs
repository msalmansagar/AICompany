import { fileURLToPath } from 'node:url';
const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
// Checks conditional-formatting rules evaluate correctly and reach the right cells.
import { readFileSync } from 'node:fs';

const html = readFileSync(ENGINE, 'utf8');
// The evaluator lives above, the formatting code below it — take both.
const source = html.slice(html.indexOf('const FORMULA_FUNCTIONS'), html.indexOf('/* ---------------- layout rendering'));
const api = new Function(`${source}; return { evaluateFormatting, compileFormatting, FORMATTING_STYLES };`)();

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const result = {
  columns: [
    { alias: 'customer', label: 'Customer' },
    { alias: 'amount', label: 'Requested Amount' },
    { alias: 'status', label: 'Status' }
  ],
  rows: [
    ['Al Khalij', 2500000, 'Overdue'],
    ['QNB', 900000, 'Current'],
    ['Mukesh', 3100000, 'Current']
  ].map(([customer, amount, status]) => ({
    cells: {
      customer: { value: customer, text: customer },
      amount: { value: amount, text: String(amount) },
      status: { value: status, text: status }
    }
  }))
};

console.log('rule evaluation');
let styles = api.evaluateFormatting(result, [{ column: 'amount', condition: 'value > 2000000', style: 'Bold, red text' }]);
check('matches row 0', styles[0].amount === 'cf-bold cf-red');
check('skips row 1', styles[1].amount === undefined);
check('matches row 2', styles[2].amount === 'cf-bold cf-red');

console.log('\ncolumn naming');
styles = api.evaluateFormatting(result, [{ column: 'Requested Amount', condition: 'value > 2000000', style: 'Bold' }]);
check('a rule may name the label instead of the alias', styles[0].amount === 'cf-bold');

console.log('\nother columns are in scope');
styles = api.evaluateFormatting(result, [{ column: 'customer', condition: "status == 'Overdue'", style: 'Amber highlight' }]);
check('condition can reference another column', styles[0].customer === 'cf-amber' && styles[1].customer === undefined);

console.log('\nstyle mapping');
for (const [label, expected] of Object.entries(api.FORMATTING_STYLES)) {
  const s = api.evaluateFormatting(result, [{ column: 'amount', condition: 'value > 0', style: label }]);
  check(`"${label}"`, s[0].amount === expected);
}

console.log('\nrobustness');
check('no rules returns null', api.evaluateFormatting(result, []) === null);
check('unparsable condition is dropped', api.compileFormatting([{ column: 'amount', condition: 'value >', style: 'Bold' }]).length === 0);
check('rule naming a missing column is ignored',
  Object.keys(api.evaluateFormatting(result, [{ column: 'nope', condition: 'value > 0', style: 'Bold' }])[0]).length === 0);
check('an unknown style still marks the cell',
  api.evaluateFormatting(result, [{ column: 'amount', condition: 'value > 0', style: 'Rainbow' }])[0].amount === 'cf-bold');

console.log('\nSECURITY — conditions are expressions, not code');
globalThis.__cfBreach = false;
const attack = api.evaluateFormatting(result, [{ column: 'amount', condition: "constructor.constructor('globalThis.__cfBreach=true')()", style: 'Bold' }]);
check('no code executed', globalThis.__cfBreach === false);
// It never even parses, so the rule is discarded and no rules remain to evaluate.
check('malicious rule is discarded at compile time', attack === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
