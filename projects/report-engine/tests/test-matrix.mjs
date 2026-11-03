import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

// D4 — the authored matrix. Row groups, column groups and values are what the designer STORED;
// nothing is inferred, and the old cross-tab (which guessed its categories and invented
// "Personal/Corporate/SME" when it found none) survives only as the un-authored fallback.
//
// The renderers are deliberately duplicated between the runtime and the designer; the last block
// here fails the build if the two copies drift by a byte.

const CORE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
const DESIGNER = fileURLToPath(new URL('../prototype/report-designer.html', import.meta.url));
const core = readFileSync(CORE, 'utf8');
const designer = readFileSync(DESIGNER, 'utf8');

const NEEDED = [
  'EMPTY_CELL', 'TOTAL_LABELS', 'reduceTotal',
  'MATRIX_KEY_SEPARATOR', 'MATRIX_LABEL_SEPARATOR',
  'matrixModel', 'matrixGrandRow', 'matrixGrandLabel', 'matrixCellText', 'matrixTableHtml', 'matrixTableFor'
];

const api = new Function('esc',
  `${NEEDED.map(name => liftDeclaration(core, name)).join('\n')}
   return { matrixModel, matrixTableHtml, matrixTableFor };`
)(value => String(value == null ? '' : value));

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const COLS = [
  { key: 'branch', name: 'Branch' },
  { key: 'product', name: 'Product' },
  { key: 'amount', name: 'Amount' }
];
const ROWS = [
  { branch: 'Doha', product: 'Loans', amount: 100 },
  { branch: 'Doha', product: 'Deposits', amount: 40 },
  { branch: 'Wakra', product: 'Loans', amount: 25 }
];
const MATRIX = { rowGroups: ['branch'], columnGroups: ['product'], values: ['amount'] };

console.log('the authored arrangement is the arrangement');
{
  const model = api.matrixModel(COLS, ROWS, MATRIX, null);
  check('column groups pivot across the top', model.head.join('|') === 'Branch|Deposits|Loans', model.head.join('|'));
  check('row groups keep first-appearance order', model.body.map(r => r[0]).join('|') === 'Doha|Wakra');
  check('each cell is its measure', model.body[0].join('|') === 'Doha|40|100', model.body[0].join('|'));
  check('a combination with no data is empty, not zero', model.body[1][1] === null, String(model.body[1][1]));
  check('an incomplete arrangement is refused, not guessed',
    api.matrixModel(COLS, ROWS, { rowGroups: [], columnGroups: ['product'], values: ['amount'] }, null) === null);
}

console.log('a blank group value is a real group with a real header');
{
  const blanks = ROWS.concat([{ branch: 'Doha', product: '', amount: 7 }]);
  const model = api.matrixModel(COLS, blanks, MATRIX, null);
  check('the blank group is labelled, never an empty header', model.head.includes('(blank)'), model.head.join('|'));
}

console.log('pivoting rows that share a cell adds numbers and invents nothing');
{
  const doubled = ROWS.concat([{ branch: 'Doha', product: 'Loans', amount: 11 }]);
  const model = api.matrixModel(COLS, doubled, MATRIX, null);
  check('numeric duplicates accumulate', model.body[0][2] === 111, String(model.body[0][2]));
}

console.log('the grand row follows the D3 rule: authored or absent');
{
  check('no authored total, no grand row', api.matrixModel(COLS, ROWS, MATRIX, null).grandRow === null);
  const model = api.matrixModel(COLS, ROWS, MATRIX, { amount: 'Sum' });
  check('an authored Sum totals each pivot column', model.grandRow.join('|') === 'Total|40|125', model.grandRow.join('|'));
  const html = api.matrixTableHtml(model);
  check('and renders as the totals row', /totals-row/.test(html));
  check('empty cells render as the em dash', html.includes('—'));
}

console.log('exports carry the pivot only where the pivot is the screen');
{
  const dataset = {
    role: 'root',
    columns: COLS.map(c => ({ alias: c.key, label: c.name, isVisible: true })),
    rows: ROWS.map(r => ({ cells: { branch: { value: r.branch, text: r.branch }, product: { value: r.product, text: r.product }, amount: { value: r.amount, text: String(r.amount) } } }))
  };
  const def = { layout: { type: 'Matrix (Cross Tab)', matrix: MATRIX, totals: { amount: 'Sum' } } };
  const pivot = api.matrixTableFor(dataset, def);
  check('the export table is the pivoted table', pivot.head.join('|') === 'Branch|Deposits|Loans', pivot.head.join('|'));
  check('with the grand row last', pivot.body[pivot.body.length - 1].join('|') === 'Total|40|125');
  check('a standalone block stays flat', api.matrixTableFor({ ...dataset, role: 'standalone' }, def) === null);
  check('another layout type stays flat', api.matrixTableFor(dataset, { layout: { type: 'Tabular Report', matrix: MATRIX } }) === null);
}

console.log('the two copies of the renderer have not drifted');
{
  for (const name of ['matrixModel', 'matrixGrandRow', 'matrixGrandLabel', 'matrixCellText', 'matrixTableHtml']) {
    check(`${name} is byte-identical in the designer`,
      liftDeclaration(core, name) === liftDeclaration(designer, name));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
