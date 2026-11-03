import { fileURLToPath } from 'node:url';
const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
// Exercises the transformation pipeline against the config shapes the C# version documented.
// Slices from the formula section, not the transformations one: ConditionalValue and Formula reuse the
// expression evaluator, which sits above them in the viewer and must be in scope here too.
import { readFileSync } from 'node:fs';

const html = readFileSync(ENGINE, 'utf8');
const source = html.slice(html.indexOf('const FORMULA_FUNCTIONS'), html.indexOf('/* ---------------- self-check'));
const { applyTransformations } = new Function(`${source}; return { applyTransformations };`)();

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  ok ? passed++ : failed++;
}

/** Builds a result from {alias: [value, text]} pairs. */
function makeResult(cellSpec) {
  const aliases = Object.keys(cellSpec);
  return {
    columns: aliases.map(alias => ({ alias, label: alias, isVisible: true })),
    rows: [{ cells: Object.fromEntries(aliases.map(a => [a, { value: cellSpec[a][0], text: cellSpec[a][1] }])) }]
  };
}
const run = (cells, type, config, enabled = true) =>
  applyTransformations(makeResult(cells), [{ transformType: type, configJson: JSON.stringify(config), stepOrder: 1, enabled }]);
const textOf = (result, alias) => (result.rows[0].cells[alias] || {}).text;
const labelOf = (result, alias) => result.columns.find(c => c.alias === alias)?.label;

console.log('RenameColumns');
check('renames the label', labelOf(run({ telephone1: ['x', 'x'] }, 'RenameColumns', { renames: { telephone1: 'Phone' } }), 'telephone1'), 'Phone');

console.log('\nNullHandling');
check('per-column default', textOf(run({ a: [null, ''] }, 'NullHandling', { columns: { a: 'n/a' } }), 'a'), 'n/a');
check('global default', textOf(run({ a: [null, ''] }, 'NullHandling', { default: '—' }), 'a'), '—');
check('non-empty untouched', textOf(run({ a: [1, 'kept'] }, 'NullHandling', { default: '—' }), 'a'), 'kept');

console.log('\nMasking');
check('keeps last 3', textOf(run({ acc: ['ACC-1002', 'ACC-1002'] }, 'Masking', { columns: ['acc'], keepLast: 3 }), 'acc'), '*****002');
check('custom mask char', textOf(run({ acc: ['1234', '1234'] }, 'Masking', { columns: ['acc'], keepLast: 2, mask: '#' }), 'acc'), '##34');
check('keepLast >= length is unchanged', textOf(run({ acc: ['12', '12'] }, 'Masking', { columns: ['acc'], keepLast: 5 }), 'acc'), '12');
check('other columns untouched', textOf(run({ acc: ['1', '1'], b: ['2', '2'] }, 'Masking', { columns: ['acc'], keepLast: 0 }), 'b'), '2');

console.log('\nNumberFormat');
check('thousands + 2dp', textOf(run({ n: [1234567.891, '1234567.891'] }, 'NumberFormat', { columns: ['n'], decimals: 2 }), 'n'), '1,234,567.89');
check('no thousands', textOf(run({ n: [1234, '1234'] }, 'NumberFormat', { columns: ['n'], decimals: 0, thousands: false }), 'n'), '1234');
check('negative', textOf(run({ n: [-1234.5, '-1234.5'] }, 'NumberFormat', { columns: ['n'], decimals: 1 }), 'n'), '-1,234.5');

console.log('\nCurrencyFormat');
check('default symbol', textOf(run({ m: [1500, '1500'] }, 'CurrencyFormat', { columns: ['m'] }), 'm'), 'QAR 1,500.00');
check('custom symbol + decimals', textOf(run({ m: [1500, '1500'] }, 'CurrencyFormat', { columns: ['m'], symbol: '$', decimals: 0 }), 'm'), '$ 1,500');

console.log('\nDateFormat');
check('default pattern', textOf(run({ d: ['2026-03-09T00:00:00Z', '2026-03-09'] }, 'DateFormat', { columns: ['d'] }), 'd'), '2026-03-09');
check('custom pattern', textOf(run({ d: ['2026-03-09T00:00:00Z', '2026-03-09'] }, 'DateFormat', { columns: ['d'], format: 'dd MMM yyyy' }), 'd'), '09 Mar 2026');
check('non-date left alone', textOf(run({ d: ['not a date', 'not a date'] }, 'DateFormat', { columns: ['d'] }), 'd'), 'not a date');

console.log('\nMapping');
check('maps by raw value', textOf(run({ s: [0, 'Active'] }, 'Mapping', { column: 's', map: { 0: 'Open', 1: 'Closed' } }), 's'), 'Open');
check('falls back to default', textOf(run({ s: [9, '9'] }, 'Mapping', { column: 's', map: { 0: 'Open' }, default: '?' }), 's'), '?');
check('no default keeps original', textOf(run({ s: [9, '9'] }, 'Mapping', { column: 's', map: { 0: 'Open' } }), 's'), '9');

console.log('\nMergeColumns');
const merged = run({ first: ['Al', 'Al'], last: ['Khalij', 'Khalij'] }, 'MergeColumns', { columns: ['first', 'last'], into: 'full', label: 'Full name' });
check('creates the merged column', textOf(merged, 'full'), 'Al Khalij');
check('uses the given label', labelOf(merged, 'full'), 'Full name');
check('custom separator', textOf(run({ a: ['x', 'x'], b: ['y', 'y'] }, 'MergeColumns', { columns: ['a', 'b'], into: 'j', separator: '-' }), 'j'), 'x-y');

console.log('\nSplitValues');
const split = run({ fullname: ['Al Khalij Bank', 'Al Khalij Bank'] }, 'SplitValues', { column:'fullname', delimiter:' ', into:['first','rest'] });
check('splits into new columns', [textOf(split,'first'), textOf(split,'rest')], ['Al','Khalij']);
check('missing part becomes empty', textOf(run({ a:['x','x'] }, 'SplitValues', { column:'a', delimiter:',', into:['p','q'] }), 'q'), '');

console.log('\nChoiceLabelResolution');
check('promotes the label to the value', textOf(run({ statecode:[0,'Active'] }, 'ChoiceLabelResolution', { columns:['statecode'] }), 'statecode'), 'Active');
const promoted = run({ statecode:[0,'Active'] }, 'ChoiceLabelResolution', { columns:['statecode'] });
check('value now carries the label too', promoted.rows[0].cells.statecode.value, 'Active');

console.log('\nFormula (as a pipeline step)');
check('computes a new column', textOf(run({ amount:[100,'100'] }, 'Formula', { alias:'withTax', expression:'amount * 2' }), 'withTax'), '200');

console.log('\nConditionalValue');
check('replaces when the condition holds', textOf(run({ days:[95,'95'] }, 'ConditionalValue', { column:'days', condition:'value > 90', then:'Overdue', else:'Current' }), 'days'), 'Overdue');
check('uses the else branch otherwise', textOf(run({ days:[10,'10'] }, 'ConditionalValue', { column:'days', condition:'value > 90', then:'Overdue', else:'Current' }), 'days'), 'Current');
check('an unparsable condition changes nothing', textOf(run({ days:[10,'10'] }, 'ConditionalValue', { column:'days', condition:'value >', then:'x' }), 'days'), '10');

console.log('\nJsonFlatten');
const flat = run({ payload:['{"iban":"QA58","branch":"Doha"}', '{"iban":"QA58","branch":"Doha"}'] }, 'JsonFlatten',
  { column:'payload', fields:{ iban:'IBAN', branch:'Branch' } });
check('extracts each named field', [textOf(flat,'iban'), textOf(flat,'branch')], ['QA58','Doha']);
check('labels the new columns', labelOf(flat,'iban'), 'IBAN');
check('unparsable json yields blanks', textOf(run({ payload:['{oops','{oops'] }, 'JsonFlatten', { column:'payload', fields:{ a:'A' } }), 'a'), '');

console.log('\nrobustness — a bad step never breaks the report');
check('disabled step is skipped', textOf(run({ a: [null, ''] }, 'NullHandling', { default: '—' }, false), 'a'), '');
check('unimplemented type passes through', textOf(run({ a: [1, 'v'] }, 'Pivot', {}), 'a'), 'v');
check('malformed json passes through', textOf(applyTransformations(makeResult({ a: [1, 'v'] }), [{ transformType: 'NullHandling', configJson: '{oops', stepOrder: 1, enabled: true }]), 'a'), 'v');
check('missing config passes through', textOf(run({ a: [1, 'v'] }, 'Masking', {}), 'a'), 'v');

console.log('\nordering');
const ordered = applyTransformations(makeResult({ n: [1234.5, '1234.5'] }), [
  { transformType: 'CurrencyFormat', configJson: JSON.stringify({ columns: ['n'], decimals: 0 }), stepOrder: 2, enabled: true },
  { transformType: 'NumberFormat', configJson: JSON.stringify({ columns: ['n'], decimals: 2 }), stepOrder: 1, enabled: true }
]);
check('runs in stepOrder, later wins', textOf(ordered, 'n'), 'QAR 1,235');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
