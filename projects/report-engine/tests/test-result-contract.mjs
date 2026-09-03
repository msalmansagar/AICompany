import { fileURLToPath } from 'node:url';
const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
// The condition C-3 asks for in one sentence: "a report returns its rows with the columns
// configured" must fail loudly. Every defect this suite guards against was found by opening the org
// rather than by a test, so each assertion here is written against a way the contract has actually
// broken, not against the happy path.
//
// It drives the SHIPPED renderers out of report-engine-core.js. Helpers are lifted real rather than
// stubbed, because a stub answers for code the browser never runs.
import { loadEngine } from './engine-harness.mjs';


const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

// renderGrid writes into the page rather than returning markup, so the host element is captured.
// Anything it then queries for event binding answers empty — this suite is about what was rendered.
let rendered = '';
const attributes = {};
const host = {
  set innerHTML(v) { rendered = v; }, get innerHTML() { return rendered; },
  setAttribute(name, value) { attributes[name] = value; },
  getAttribute(name) { return attributes[name] ?? null; },
  querySelectorAll: () => [], querySelector: () => null, addEventListener() {}
};
// renderGrid binds drill handlers after writing; nothing to bind here, so answer empty.
globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
let state = { current: { def: { relationships: [], layout: null } } };

const { api } = loadEngine({
  enginePath: ENGINE,
  section: ['/* ---------------- layout rendering', '/* ---------------- self-check'],
  exports: ['renderGrid', 'toRenderModel', 'renderLayout', 'truncationChip'],
  seed: ['fontCss', 'designFontLookup', 'drillLabel', 'renderGrid', 'truncationChip'],
  globals: {
    esc,
    state: new Proxy({}, { get: (_, k) => state[k] }),
    $: () => host,
    NUMERIC: /^-?[\d.,]+$/
  },
  /* The smoke must exercise a column AND a row: the resolver only lifts what it sees run, so an
     empty result left the per-column and per-row helpers unresolved until a real test hit them. */
  smoke: built => built.renderGrid({
    reportName: 'smoke', rowCount: 1,
    columns: [{ alias: 'name', label: 'Name' }],
    rows: [{ cells: { name: { value: null, text: 'x' } } }]
  })
});

/** Runs the shipped renderGrid and returns the markup it put on the page. */
function gridHtml(result) {
  rendered = '';
  api.renderGrid(result);
  return rendered;
}

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

/** A result shaped exactly as the plugin returns one. */
function resultWith(columns, rows) {
  return {
    reportName: 'Contract', rowCount: rows.length, columns,
    rows: rows.map(cells => ({
      cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { value: v, text: String(v) }]))
    }))
  };
}

const COLUMNS = [
  { alias: 'name', label: 'Account Name', isVisible: true },
  { alias: 'accountnumber', label: 'Account no.', isVisible: true },
  { alias: 'statecode', label: 'Status', isVisible: true }
];
const ROWS = [
  { name: 'Qatar National Bank', accountnumber: '*****004', statecode: 'Active' },
  { name: 'Al Khalij Commercial Bank', accountnumber: '*****001', statecode: 'Active' }
];

// `<th[^>]*>` also matches `<thead>`, which quietly folds the whole header row into one "column".
// Requiring whitespace or an immediate close keeps it to real cells.
const headersOf = html => [...html.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map(m => m[1]);
const bodyRowsOf = html => [...html.matchAll(/<tr[^>]*>((?:\s*<td[\s\S]*?<\/td>\s*)+)<\/tr>/g)]
  .map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1]));

console.log('the configured columns are the columns rendered');
const grid = gridHtml(resultWith(COLUMNS, ROWS));
const headers = headersOf(grid);
check('every configured column has a header', COLUMNS.every(c => headers.includes(c.label)),
  `got: ${headers.join(' | ')}`);
check('headers keep the configured order', headers.join('|').startsWith(COLUMNS.map(c => c.label).join('|')),
  `got: ${headers.join(' | ')}`);
check('no extra columns invented', headers.length === COLUMNS.length, `got ${headers.length}`);

console.log('\nthe rows are the rows, under the right headers');
const body = bodyRowsOf(grid);
check('one row rendered per row returned', body.length === ROWS.length, `got ${body.length}`);
check('first row values land in configured order',
  body[0] && body[0][0] === 'Qatar National Bank' && body[0][1] === '*****004' && body[0][2] === 'Active',
  `got: ${JSON.stringify(body[0])}`);
check('a masked value is rendered as stored, not unmasked',
  grid.includes('*****004') && !grid.includes('ACC-1004'));

console.log('\nthe ways this contract has actually broken');
// A column the report asks for that the engine did not return must show as empty, not vanish and
// silently shift every later value one header to the left.
const missingCell = gridHtml(resultWith(COLUMNS, [{ name: 'Only name', statecode: 'Active' }]));
const shifted = bodyRowsOf(missingCell)[0];
check('a column missing from the data still occupies its cell',
  shifted && shifted.length === COLUMNS.length && shifted[1] === '',
  `got: ${JSON.stringify(shifted)}`);
check('later values do not shift left into it', shifted && shifted[2] === 'Active',
  `got: ${JSON.stringify(shifted)}`);

// isVisible:false is a configuration choice, and the renderer must honour it.
const hidden = api.toRenderModel(resultWith(
  [...COLUMNS.slice(0, 2), { alias: 'statecode', label: 'Status', isVisible: false }], ROWS));
check('a hidden column is excluded from the render model', hidden.cols.length === 2,
  `got ${hidden.cols.length}`);
check('hiding one column does not drop the others',
  hidden.cols.map(c => c.key).join(',') === 'name,accountnumber', hidden.cols.map(c => c.key).join(','));

// renderLayout swallows every error and returns "" so a broken layout falls back to the grid.
// That is deliberate, and it once hid a ReferenceError that killed all 27 layouts in production.
// An empty return therefore has to be treated as failure here, never as "nothing to draw".
console.log('\nlayouts render rather than silently falling back to the grid');
const laidOut = api.renderLayout(resultWith(COLUMNS, ROWS), { type: 'Tabular Report' });
check('a designed layout produces markup', !!laidOut && laidOut.length > 20,
  laidOut === '' ? 'empty — renderLayout caught something and fell back' : `len ${laidOut && laidOut.length}`);

console.log('\nzero rows is a result, not a failure');
const none = gridHtml(resultWith(COLUMNS, []));
check('headers still render with no rows', headersOf(none).length === COLUMNS.length);
// An explicit empty state, not a blank table and not a fabricated row. "0 rows" is a legitimate
// answer a report must be able to give — report Test gives it, and it is correct there.
check('an explicit empty state is shown', /No rows\./.test(none));
check('no data row is invented', bodyRowsOf(none).every(cells => cells.length !== COLUMNS.length));

console.log('\ntruncation tells the truth about what was returned');
// The engine caps at one FetchXML page, so a report configured for 50,000 returns 5,000. The chip
// used to name the configured limit, which was not the limit applied.
const capped = { ...resultWith(COLUMNS, ROWS), truncated: true, rowCount: 5000 };
const chip = api.truncationChip ? api.truncationChip(capped) : '';
check('says how many rows were returned', /5000/.test(chip), chip || '(no chip)');
check('does not claim a configured row limit', !/row limit/i.test(chip), chip);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
