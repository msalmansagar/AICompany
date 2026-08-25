import { fileURLToPath } from 'node:url';
import { loadEngine } from './engine-harness.mjs';

// ADD-002 Phase A, MDS-FR-021: a multi-dataset report renders each dataset as its own block.
//
// Two failures matter more than the layout. A standalone block that renders nothing looks exactly
// like a report whose query matched no rows — and a FAILED block that renders as an empty table is
// the same lie with a worse cause. Both are asserted here against the shipped renderer.
//
// The single-dataset markup is asserted to be unchanged, because that is the compatibility promise
// ADR-RPT-012 §2 rests on.

const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

let rendered = '';
const attributes = {};
const host = {
  set innerHTML(v) { rendered = v; }, get innerHTML() { return rendered; },
  setAttribute(name, value) { attributes[name] = value; },
  getAttribute(name) { return attributes[name] ?? null; },
  querySelectorAll: () => [], querySelector: () => null, addEventListener() {}
};
globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
const state = { current: { def: { relationships: [], layout: null } } };

const cells = value => ({ cells: { name: { value: null, text: value } } });

const { api } = loadEngine({
  enginePath: ENGINE,
  section: null,
  exports: ['renderGrid'],
  seed: ['renderGrid'],
  globals: {
    esc,
    state: new Proxy({}, { get: (_, k) => state[k] }),
    $: () => host,
    NUMERIC: /^-?[\d.,]+$/
  },
  /* The smoke call is what drives dependency resolution, so it must exercise EVERY path the suite
     uses — the resolver only lifts what it sees run. An empty column list never reached the
     per-column font lookup, and rendering only the single-dataset shape never reached the block
     builder; both surfaced as a ReferenceError from inside a test instead of being lifted. */
  smoke: built => {
    const one = { alias: 'name', label: 'Name' };
    built.renderGrid({ reportName: 'smoke', rowCount: 1, columns: [one], rows: [cells('x')] });
    // A single-record root (header path) …
    built.renderGrid({
      reportName: 'smoke',
      datasets: [
        { id: 'a', name: 'A', role: 'root', columns: [one], rows: [cells('x')], rowCount: 1, status: 'ok' },
        { id: 'b', name: 'B', role: 'standalone', columns: [one], rows: [], rowCount: 0, status: 'failed', error: 'why' }
      ]
    });
    // … and a multi-record one, which takes the table-plus-notice path instead.
    built.renderGrid({
      reportName: 'smoke',
      datasets: [
        { id: 'a', name: 'A', role: 'root', columns: [one], rows: [cells('x'), cells('y')], rowCount: 2, status: 'ok' },
        { id: 'b', name: 'B', role: 'standalone', columns: [one], rows: [cells('z')], rowCount: 1, status: 'ok' }
      ]
    });
  }
});

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


const singleShape = () => ({
  reportId: 'r1', reportName: 'Accounts', rowCount: 1, truncated: false, elapsedMs: 5,
  columns: [{ alias: 'name', label: 'Name', isVisible: true }],
  rows: [cells('Acme')]
});

const dataset = (over = {}) => ({
  id: 'd2', name: 'Overdue facilities', role: 'standalone',
  columns: [{ alias: 'ref', label: 'Reference', isVisible: true }],
  rows: [{ cells: { ref: { value: null, text: 'F-1182' } } }],
  rowCount: 1, truncated: false, elapsedMs: 8, status: 'ok', error: null,
  ...over
});

const multiShape = (...extra) => ({
  reportId: 'r1', reportName: 'Portfolio review',
  datasets: [
    {
      id: 'r1', name: 'Accounts', role: 'root',
      columns: [{ alias: 'name', label: 'Name', isVisible: true }],
      rows: [cells('Acme')], rowCount: 1, truncated: false, elapsedMs: 5, status: 'ok', error: null
    },
    ...extra
  ]
});

console.log('a single-dataset report renders exactly as it did');
{
  const html = gridHtml(singleShape());
  check('it still renders a table', html.includes('<table class="res">'));
  check('with its column header', html.includes('>Name</th>'));
  check('and its row', html.includes('>Acme</td>'));
  check('and no block heading is introduced', !html.includes('dataset-block'), html.slice(0, 120));
}

console.log('\na multi-dataset report renders every dataset');
{
  const html = gridHtml(multiShape(dataset()));
  check('the root record is rendered', html.includes('Acme'));
  check('the standalone block is rendered', html.includes('>F-1182</td>'));
  check('each block is named', html.includes('Overdue facilities'), html.slice(0, 200));
  check('the root keeps its own columns', html.includes('Name'));
  check('the block keeps its own columns', html.includes('>Reference</th>'));
}

// MDS-FR-021: a term sheet is one parent record with its child tables underneath. Rendering that
// parent as a one-row table is what makes the output read as three stacked grids instead of a
// document, so a single-record root becomes a header of label/value pairs.
console.log('\na single-record root renders as a header, not a one-row table');
{
  const html = gridHtml(multiShape(dataset()));
  check('the root is a header', html.includes('dataset-header'), html.slice(0, 200));
  check('its field label is shown', html.includes('Name'));
  check('its value is shown', html.includes('Acme'));
  check('only the block draws a table', (html.match(/<table class="res">/g) || []).length === 1,
    String((html.match(/<table class="res">/g) || []).length));
  check('the block still draws one', html.includes('>F-1182</td>'));
}

console.log('\na multi-record root stays a table, and says what the blocks are scoped to');
{
  // The engine scopes each block to the root's FIRST row. Rendering a header here would hide the
  // other rows; saying nothing would hide the assumption. So: table, plus a notice.
  const many = multiShape(dataset());
  many.datasets[0] = { ...many.datasets[0], rowCount: 2, rows: [cells('Acme'), cells('Globex')] };
  const html = gridHtml(many);
  check('the root is still a table', (html.match(/<table class="res">/g) || []).length === 2,
    String((html.match(/<table class="res">/g) || []).length));
  check('both root rows are shown', html.includes('Acme') && html.includes('Globex'));
  check('and the scope is stated', /first/i.test(html), html.slice(0, 300));
  check('it is not called a header', !html.includes('dataset-header'));
}

console.log('\nheader values are escaped');
{
  const one = multiShape(dataset());
  one.datasets[0] = { ...one.datasets[0], rows: [cells('<img src=x onerror=alert(1)>')] };
  const html = gridHtml(one);
  check('the value is escaped', !html.includes('<img src=x'), html.slice(0, 200));
}

console.log('\na failed dataset is named, not drawn as an empty table');
{
  const html = gridHtml(multiShape(dataset({ status: 'failed', error: 'The platform refused the query.', rows: [], rowCount: 0 })));
  check('the reason is shown', html.includes('The platform refused the query.'), html.slice(-300));
  check('the block is still named', html.includes('Overdue facilities'));
  check('it does not claim there were no rows',
    !/Overdue facilities[\s\S]*No rows\./.test(html));
  check('and the healthy root still rendered', html.includes('Acme'));
}

console.log('\nan empty dataset is distinguishable from a failed one');
{
  const html = gridHtml(multiShape(dataset({ rows: [], rowCount: 0 })));
  check('an empty block says so', html.includes('No rows.'));
  check('and carries no error text', !html.includes('refused'));
}

console.log('\nauthor-supplied names are escaped');
{
  const html = gridHtml(multiShape(dataset({ name: '<img src=x onerror=alert(1)>' })));
  check('the name is escaped', !html.includes('<img src=x'), html.slice(0, 200));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
