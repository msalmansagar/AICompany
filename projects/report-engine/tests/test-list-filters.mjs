import { fileURLToPath } from 'node:url';
const DESIGNER = fileURLToPath(new URL('../prototype/report-designer.html', import.meta.url));
// The execution log's filter clause and the CSV writer behind Export to Excel.
//
// Both are pure and both are the kind of thing that fails at the boundary rather than in the
// middle: a malformed $filter is a 400 the user sees as "couldn't read from Dataverse", and a CSV
// that does not escape its quotes corrupts silently in Excel, which is worse.
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

const source = readFileSync(DESIGNER, 'utf8');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const catalog = { filters: {} };
const executionLogFilter = new Function('executionLogCatalog',
  `${liftDeclaration(source, 'executionLogFilter')}; return executionLogFilter;`)(catalog);
const csvCell = new Function(`${liftDeclaration(source, 'csvCell')}; return csvCell;`)();

const clauseOf = query => decodeURIComponent(query.replace('&$filter=', ''));

console.log('no filter is no clause');
catalog.filters = {};
check('empty filter adds nothing to the query', executionLogFilter() === '', executionLogFilter());

console.log('\neach filter alone');
catalog.filters = { reportId: '2b7c6528-928b-f111-ab10-000d3abd8313' };
check('report filters on the lookup value',
  clauseOf(executionLogFilter()) === '_qdb_reportdefinitionid_value eq 2b7c6528-928b-f111-ab10-000d3abd8313',
  clauseOf(executionLogFilter()));

catalog.filters = { outcome: 'failed' };
check('failed means an error code exists', clauseOf(executionLogFilter()) === 'qdb_errorcode ne null');
catalog.filters = { outcome: 'success' };
check('succeeded means it does not', clauseOf(executionLogFilter()) === 'qdb_errorcode eq null');
catalog.filters = { outcome: '' };
check('"any outcome" adds no clause', executionLogFilter() === '', executionLogFilter());

catalog.filters = { days: '7' };
const since = clauseOf(executionLogFilter());
check('period compares startedon', /^qdb_startedon ge \d{4}-\d{2}-\d{2}T/.test(since), since);
check('period is in the past', new Date(since.replace('qdb_startedon ge ', '')) < new Date());
check('seven days is roughly seven days back', (() => {
  const days = (Date.now() - new Date(since.replace('qdb_startedon ge ', '')).getTime()) / 86400000;
  return days > 6.9 && days < 7.1;
})(), since);

console.log('\nfilters combine');
catalog.filters = { reportId: 'abc', outcome: 'failed', days: '1' };
const all = clauseOf(executionLogFilter());
check('joined with and', (all.match(/ and /g) || []).length === 2, all);
check('every clause present',
  all.includes('_qdb_reportdefinitionid_value eq abc') && all.includes('qdb_errorcode ne null')
  && all.includes('qdb_startedon ge'), all);
// A raw clause in a URL breaks on the spaces and the colons in the timestamp.
check('the clause is percent-encoded in the query', !/ /.test(executionLogFilter()),
  executionLogFilter().slice(0, 60));
check('it is appended, not a whole query', executionLogFilter().startsWith('&$filter='));

console.log('\nCSV escaping');
check('plain value is quoted', csvCell('Success') === '"Success"');
check('a comma cannot split the row', csvCell('Doha, Qatar') === '"Doha, Qatar"');
check('embedded quotes are doubled', csvCell('say "hi"') === '"say ""hi"""');
check('null becomes empty, not the word null', csvCell(null) === '""');
check('undefined becomes empty', csvCell(undefined) === '""');
check('zero survives', csvCell(0) === '"0"');
check('arabic passes through', csvCell('أحمد الكواري') === '"أحمد الكواري"');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
