import { fileURLToPath } from 'node:url';
const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
// Drives the ported layout renderer with a realistic result and checks each type produces markup
// rather than throwing or returning nothing.
import { loadEngine } from './engine-harness.mjs';

// esc is a viewer global the renderer relies on; supply the same implementation.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Helpers the renderer needs are lifted REAL rather than stubbed, and discovered rather than
// listed: a stub answers for code the browser never runs, and a hand-kept list is exactly how this
// suite rotted. renderLayout catches everything and returns "" so a broken layout falls back to the
// grid instead of costing the user their data — right in production, blinding in a test — so an
// empty return is treated here as failure, never as "nothing to draw". It was: buildPreviewBody
// read a free variable `layout` and every one of the 27 layouts silently became a grid.
const { api } = loadEngine({
  enginePath: ENGINE,
  section: ['/* ---------------- layout rendering', '/* ---------------- self-check'],
  exports: ['renderLayout', 'toRenderModel', 'inferColumnType', 'buildPreviewBody'],
  globals: { esc },
  smoke: built => built.buildPreviewBody('Grouped Report',
    [{ key: 'k', name: 'K', label: 'K', type: 'Text' }], [{ k: 'a' }], { grandTotal: true })
});

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const result = {
  reportName: 'Facilities by Branch',
  rowCount: 4,
  columns: [
    { alias: 'branch', label: 'Branch', isVisible: true },
    { alias: 'customer', label: 'Customer', isVisible: true },
    { alias: 'amount', label: 'Amount', isVisible: true },
    { alias: 'opened', label: 'Opened', isVisible: true }
  ],
  rows: [
    ['Doha Main', 'Al Khalij', 125000.5, '2026-01-15'],
    ['Doha Main', 'QNB', 98000, '2026-02-02'],
    ['Al Wakrah', 'Mukesh', 41000, '2026-02-20'],
    ['Al Wakrah', 'QDB Enterprise', 76000.25, '2026-03-09']
  ].map(([branch, customer, amount, opened]) => ({
    cells: {
      branch: { value: branch, text: branch }, customer: { value: customer, text: customer },
      amount: { value: amount, text: String(amount) }, opened: { value: opened, text: opened }
    }
  }))
};

console.log('column type inference');
check('repeated text is a choice (groupable)', api.inferColumnType('branch', result.rows) === 'Option set');
check('unique text stays text', api.inferColumnType('customer', result.rows) === 'Text');
check('decimals are numeric', api.inferColumnType('amount', result.rows) === 'Decimal');
check('iso dates are dates', api.inferColumnType('opened', result.rows) === 'Date/Time');

console.log('\nrender model');
const model = api.toRenderModel(result);
check('one entry per visible column', model.cols.length === 4);
check('rows keyed by alias', model.rows[0].branch === 'Doha Main');
check('numeric keeps its raw value', model.rows[0].amount === 125000.5);

console.log('\nevery designed layout renders');
const LAYOUTS = ['Tabular Report','Grouped Report','Master-Detail Report','Matrix (Cross Tab)','Summary Report',
  'Dashboard Report','Chart Report','Info Cards','Card Layout','Form Layout','Label Layout','Invoice Layout',
  'Statement Layout','Certificate Layout','Letter Layout','Multi-Column Layout','Timeline Layout','Calendar Layout',
  'Gantt Layout','Tree Layout','Org Chart','Kanban Layout','Pivot Report','Drill-down Report','Comparison Report',
  'Nested Report','Book Layout'];

let rendered = 0, empty = [];
for (const type of LAYOUTS) {
  let html = '';
  try { html = api.renderLayout(result, { type, groupBy: 'branch', chartType: 'Column', cardIcon: 'money' }); }
  catch (error) { check(type, false, error.message); continue; }
  if (html && html.length > 20) rendered++; else empty.push(type);
}
check(`${rendered}/${LAYOUTS.length} layouts produced markup`, empty.length === 0, 'empty: ' + empty.join(', '));

console.log('\ngrouping and totals');
const grouped = api.renderLayout(result, { type: 'Grouped Report', groupBy: 'branch', grandTotal: true });
check('groups by the category column', grouped.includes('Doha Main') && grouped.includes('Al Wakrah'));
check('emits a grand total row', /grand-total/.test(grouped));

console.log('\nsafety');
check('no rows renders nothing (grid takes over)', api.renderLayout({ ...result, rows: [], rowCount: 0 }, { type: 'Tabular Report' }) === '');
check('unknown layout falls back to empty', typeof api.renderLayout(result, { type: 'Nope Layout' }) === 'string');
const xss = JSON.parse(JSON.stringify(result));
xss.rows[0].cells.customer = { value: '<img src=x onerror=alert(1)>', text: '<img src=x onerror=alert(1)>' };
check('cell values are escaped', !api.renderLayout(xss, { type: 'Tabular Report' }).includes('<img src=x'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
