import { fileURLToPath } from 'node:url';
import { loadEngine } from './engine-harness.mjs';

// The defect this suite was written for, reported from the organisation:
//
//   "I ran the report Demo — everything at once and it gives
//    Cannot read properties of undefined (reading 'push')"
//
// Formulas and transformations run in the browser after the plugin returns (ADR-RPT-011). They
// mutate result.columns and result.rows — which a MULTI-DATASET result does not have, because its
// tables live under result.datasets. The renderer had been migrated to the new shape and this
// pipeline had not, so any multi-dataset report with a formula died before rendering.
//
// Formulas belong to the ROOT dataset: they are authored against the report's own columns, and a
// standalone block has its own. Running them over a block would evaluate expressions against columns
// it does not have and then graft the empty results on as new columns.

const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

const cell = (value, text) => ({ value, text: text === undefined ? String(value) : text });

const table = () => ({
  columns: [{ alias: 'revenue', label: 'Revenue', isVisible: true }],
  rows: [{ cells: { revenue: cell(150) } }],
  rowCount: 1
});

const singleShape = () => ({ reportId: 'r1', reportName: 'Accounts', ...table() });

const multiShape = () => ({
  reportId: 'r1', reportName: 'Portfolio review',
  datasets: [
    { id: 'r1', name: 'Accounts', role: 'root', status: 'ok', truncated: false, elapsedMs: 5, ...table() },
    {
      id: 'd2', name: 'Overdue', role: 'standalone', status: 'ok', truncated: false, elapsedMs: 8,
      columns: [{ alias: 'ref', label: 'Reference', isVisible: true }],
      rows: [{ cells: { ref: cell('F-1182', 'F-1182') } }], rowCount: 1
    }
  ]
});

const DOUBLE = [{ formulaAlias: 'doubled', expression: 'revenue*2', evaluationOrder: 1 }];

/* The formula section is included WHOLESALE rather than lifted declaration by declaration.
   applyFormulas swallows a failed parse into a null cell, so a helper the resolver had not lifted
   produced an empty result instead of a ReferenceError — the suite reported "computed = null" and
   looked like a product defect. A silent catch defeats lift-on-demand, so take the whole section. */
const { api } = loadEngine({
  enginePath: ENGINE,
  section: ['const FORMULA_FUNCTIONS', '/* ---------------- self-check'],
  exports: ['applyReportPipeline'],
  seed: ['applyReportPipeline', 'datasetsOf', 'isMultiDataset'],
  globals: { esc },
  // Exercise BOTH shapes with a real formula: the resolver only lifts what it sees run.
  smoke: built => {
    built.applyReportPipeline(singleShape(), { formulas: DOUBLE, transformations: [] });
    built.applyReportPipeline(multiShape(), { formulas: DOUBLE, transformations: [] });
  }
});

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const aliases = t => (t.columns || []).map(c => c.alias);

console.log('a single-dataset report is unchanged');
{
  const out = api.applyReportPipeline(singleShape(), { formulas: DOUBLE, transformations: [] });
  check('the formula column is added', aliases(out).includes('doubled'), aliases(out).join(','));
  check('and computed', out.rows[0].cells.doubled.value === 300, JSON.stringify(out.rows[0].cells.doubled));
  check('no datasets envelope is introduced', out.datasets === undefined);
}

console.log('\na multi-dataset report no longer throws');
{
  let threw = null;
  try { api.applyReportPipeline(multiShape(), { formulas: DOUBLE, transformations: [] }); }
  catch (error) { threw = error.message; }
  check('it completes', threw === null, String(threw));
}

console.log('\nformulas apply to the root dataset only');
{
  const out = api.applyReportPipeline(multiShape(), { formulas: DOUBLE, transformations: [] });
  const [root, block] = out.datasets;
  check('the root gains the formula column', aliases(root).includes('doubled'), aliases(root).join(','));
  check('and it is computed', root.rows[0].cells.doubled.value === 300);
  check('the standalone block does NOT', !aliases(block).includes('doubled'), aliases(block).join(','));
  check('and keeps its own column', aliases(block).includes('ref'));
  check('and keeps its rows', block.rows.length === 1);
}

console.log('\nthe envelope survives');
{
  const out = api.applyReportPipeline(multiShape(), { formulas: DOUBLE, transformations: [] });
  check('both datasets are still present', out.datasets.length === 2);
  check('the root keeps its identity', out.datasets[0].role === 'root' && out.datasets[0].name === 'Accounts');
  check('the block keeps its identity', out.datasets[1].role === 'standalone' && out.datasets[1].name === 'Overdue');
  check('the block keeps its status', out.datasets[1].status === 'ok');
  check('the report name survives', out.reportName === 'Portfolio review');
}

console.log('\na report with no formulas is left alone');
{
  const out = api.applyReportPipeline(multiShape(), { formulas: [], transformations: [] });
  check('the datasets are intact', out.datasets.length === 2);
  check('with no invented columns', aliases(out.datasets[0]).join(',') === 'revenue');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
