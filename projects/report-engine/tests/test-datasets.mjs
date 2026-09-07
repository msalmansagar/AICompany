import { fileURLToPath } from 'node:url';
import { loadEngine } from './engine-harness.mjs';

// ADR-RPT-012 §2: the plugin emits ONE of two shapes. A report with a single dataset serialises
// exactly as it always has; only a report that declares a second one gets `datasets`. Every consumer
// — four exports, every layout, drilldown, the dashboard — reads the result through this normaliser
// so none of them has to know which shape arrived.
//
// The risk this suite exists for is a normaliser that quietly returns nothing for one of the two
// shapes: the renderer would draw an empty report and look like a query that matched no rows, which
// is the silent-failure class this project keeps being bitten by.

const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));

const { api } = loadEngine({
  enginePath: ENGINE,
  section: null,
  seed: ['datasetsOf'],
  exports: ['datasetsOf'],
  globals: {},
  smoke: built => built.datasetsOf({ columns: [], rows: [] })
});

const { datasetsOf } = api;

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const COLUMNS = [{ alias: 'name', label: 'Name', isVisible: true }];
const ROWS = [{ cells: { name: { value: null, text: 'Acme' } } }];

/** The shape every deployed report returns today. */
const singleShape = () => ({
  reportId: 'r1', reportName: 'Active Accounts',
  columns: COLUMNS, rows: ROWS, rowCount: 1, truncated: false
});

/** The shape a report returns once it declares a second dataset. */
const collectionShape = () => ({
  reportId: 'r1', reportName: 'Portfolio review',
  datasets: [
    { id: 'r1', name: 'Accounts', role: 'root', columns: COLUMNS, rows: ROWS, rowCount: 1, truncated: false, elapsedMs: 12, status: 'ok', error: null },
    { id: 'd2', name: 'Overdue', role: 'standalone', columns: [{ alias: 'code', label: 'Code' }], rows: [], rowCount: 0, truncated: false, elapsedMs: 8, status: 'ok', error: null }
  ]
});

console.log('a single-dataset result normalises to one dataset');
{
  const datasets = datasetsOf(singleShape());
  check('exactly one dataset', datasets.length === 1, `got ${datasets.length}`);
  check('it is the root', datasets[0].role === 'root', datasets[0].role);
  check('it keeps the columns', datasets[0].columns === COLUMNS);
  check('it keeps the rows', datasets[0].rows === ROWS);
  check('it keeps the row count', datasets[0].rowCount === 1);
  check('it keeps truncation', datasets[0].truncated === false);
  check('it is named after the report', datasets[0].name === 'Active Accounts');
  check('and it is not a failure', datasets[0].status === 'ok');
}

console.log('\na collection result is returned as it arrived');
{
  const datasets = datasetsOf(collectionShape());
  check('every dataset is present', datasets.length === 2, `got ${datasets.length}`);
  check('the root comes first', datasets[0].role === 'root');
  check('the standalone block keeps its own columns',
    datasets[1].columns[0].alias === 'code', JSON.stringify(datasets[1].columns));
  check('and its own name', datasets[1].name === 'Overdue');
}

console.log('\nthe normaliser does not damage what it is given');
{
  const result = singleShape();
  const before = JSON.stringify(result);
  datasetsOf(result);
  check('the result is not mutated', JSON.stringify(result) === before);
  check('no datasets property is grafted on', result.datasets === undefined);
}

console.log('\na failed dataset stays identifiable');
{
  const result = collectionShape();
  result.datasets[1] = { ...result.datasets[1], status: 'failed', error: 'endpoint timed out' };
  const datasets = datasetsOf(result);
  check('the failure survives normalising', datasets[1].status === 'failed');
  check('with its reason', datasets[1].error === 'endpoint timed out');
  check('and the healthy dataset is untouched', datasets[0].status === 'ok');
}

console.log('\nnothing usable in, nothing pretending to be data out');
{
  // A normaliser that throws here takes the whole render down; one that invents a row is worse.
  check('a null result yields no datasets', datasetsOf(null).length === 0);
  check('an empty object yields one empty root', datasetsOf({}).length === 1);
  check('with no rows', datasetsOf({}).length === 1 && datasetsOf({}).rows === undefined);
  check('an empty datasets array yields none', datasetsOf({ datasets: [] }).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
