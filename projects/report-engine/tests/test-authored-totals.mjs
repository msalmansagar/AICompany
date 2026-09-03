import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

// D3 — the authored totals row. The author picks a function PER COLUMN and nothing else ever
// appears: the previews used to print a fabricated "Tax (10%)" on real data, and this suite is the
// guarantee that a totals row now says only what was asked of the real rows.
//
// It drives the SHIPPED functions out of report-engine-core.js rather than a copy.

const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
const html = readFileSync(ENGINE, 'utf8');

const NEEDED = [
  'NUMERIC', 'plural', 'truncationChip',
  'datasetsOf', 'rootDatasetOf',
  'TOTAL_LABELS', 'authoredTotalsFor', 'totalsRowOf', 'totalsRowLabel', 'totalCellOf',
  'reduceTotal', 'numericCellValue', 'formatTotalNumber', 'totalsRowHtml',
  'datasetBody', 'datasetRow', 'tableOf', 'exportDefinition'
];

const api = new Function('esc',
  `${NEEDED.map(name => liftDeclaration(html, name)).join('\n')}
   return { authoredTotalsFor, totalsRowOf, totalCellOf, numericCellValue, datasetBody, tableOf };`
)(value => String(value == null ? '' : value));

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const cell = (value, text) => ({ value, text: text ?? String(value) });
const dataset = (over = {}) => ({
  role: 'standalone', alias: 'b1', name: 'Facilities',
  columns: [{ alias: 'qdb_facilitytype', label: 'Facility type' }, { alias: 'qdb_amount', label: 'Amount' }],
  rows: [
    { cells: { qdb_facilitytype: cell('Term loan'), qdb_amount: cell(1000000, 'QAR 1,000,000.00') } },
    { cells: { qdb_facilitytype: cell('Overdraft'), qdb_amount: cell(250000, 'QAR 250,000.00') } },
    { cells: { qdb_facilitytype: cell(null, ''), qdb_amount: cell(null, '') } }
  ],
  rowCount: 3, truncated: false, elapsedMs: 5,
  ...over
});

console.log('totals come only from what was authored');
{
  check('no authoring means no row', api.totalsRowOf(null, dataset()) === null);
  check('all-None means no row', api.totalsRowOf({ qdb_amount: 'None' }, dataset()) === null);

  const cells = api.totalsRowOf({ qdb_amount: 'Sum' }, dataset());
  check('a Sum sums the typed values', cells[1].text === '1,250,000', JSON.stringify(cells));
  check('the label lands in the un-totalled column', cells[0].text === 'Total' && cells[0].isLabel === true, JSON.stringify(cells[0]));
}

console.log('every function answers from the real rows');
{
  const rows = dataset().rows;
  check('Avg divides by the numeric values only, not the blank row',
    api.totalCellOf('Avg', { alias: 'qdb_amount' }, rows).text === '625,000', api.totalCellOf('Avg', { alias: 'qdb_amount' }, rows).text);
  check('Min', api.totalCellOf('Min', { alias: 'qdb_amount' }, rows).text === '250,000');
  check('Max', api.totalCellOf('Max', { alias: 'qdb_amount' }, rows).text === '1,000,000');
  check('Count counts non-blank values, so the blank row is not one',
    api.totalCellOf('Count', { alias: 'qdb_facilitytype' }, rows).text === '2');
  check('nothing numeric is an em dash, never a fabricated zero',
    api.totalCellOf('Sum', { alias: 'qdb_facilitytype' }, rows).text === '—');
}

console.log('formatted text is a fallback, and only when it is genuinely a number');
{
  check('a typed number wins', api.numericCellValue(cell(42, 'forty-two')) === 42);
  check('currency text parses', api.numericCellValue({ text: 'QAR 1,250.50' }) === 1250.5);
  check('plain text contributes nothing', api.numericCellValue({ text: 'Term loan' }) === null);
}

console.log('the row addresses the right dataset');
{
  const def = { layout: { totals: { a: 'Sum' }, datasetTotals: { b1: { qdb_amount: 'Sum' } } } };
  check('the root reads layout.totals', api.authoredTotalsFor(def, { role: 'root' }).a === 'Sum');
  check('a block reads its alias entry', api.authoredTotalsFor(def, dataset()).qdb_amount === 'Sum');
  check('a block with no alias gets nothing', api.authoredTotalsFor(def, dataset({ alias: null })) === null);
  check('a legacy single-shape result counts as the root', api.authoredTotalsFor(def, { role: 'root', alias: null }).a === 'Sum');
}

console.log('the row reaches the screen and every export the same way');
{
  const totals = api.totalsRowOf({ qdb_amount: 'Sum' }, dataset());
  const bodyHtml = api.datasetBody(dataset(), null, () => '', totals);
  check('the table carries the totals row', /totals-row/.test(bodyHtml), bodyHtml.slice(-220));
  check('with the computed sum', bodyHtml.includes('1,250,000'));

  // tableOf reads the open report's definition; the harness provides one the way the viewer does.
  globalThis.state = { current: { def: { layout: { datasetTotals: { b1: { qdb_amount: 'Sum' } } } } } };
  const exported = api.tableOf(dataset());
  check('the export body ends with the same row', exported.body[exported.body.length - 1].join('|') === 'Total|1,250,000',
    JSON.stringify(exported.body[exported.body.length - 1]));
  delete globalThis.state;
  const untouched = api.tableOf(dataset());
  check('no authoring, no extra row in the export', untouched.body.length === 3);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
