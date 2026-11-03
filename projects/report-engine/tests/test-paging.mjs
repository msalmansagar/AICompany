import { fileURLToPath } from 'node:url';
const DESIGNER = fileURLToPath(new URL('../prototype/report-designer.html', import.meta.url));
// The paging state machine behind the Execution Log's infinite scroll, driven directly.
//
// Written against the ways paging goes wrong rather than the happy path: a second fetch firing
// while the first is in flight (duplicate rows), paging past the end (a request per scroll event
// forever), a failed page leaving a truncated list that looks complete, and refresh forgetting it
// was half way down.
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

const source = readFileSync(DESIGNER, 'utf8');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

/** Serves `total` synthetic records in pages, and counts how often it was asked. */
function fakeDataverse(total, pageSize) {
  const state = { calls: 0, lastQuery: null };
  state.dvPage = async (entity, query, size) => {
    state.calls++;
    state.lastQuery = query;
    const from = typeof query === 'string' && query.startsWith('next:') ? Number(query.slice(5)) : 0;
    const rows = [];
    for (let i = from; i < Math.min(from + (size || total), total); i++) rows.push({ id: i });
    const next = from + rows.length;
    return { rows, nextLink: next < total ? `next:${next}` : null };
  };
  return state;
}

function makeCatalog(fake, pageSize, renders = []) {
  // Delegates on every call rather than capturing dvPage now, so a test can swap in a failing
  // fetch part-way through — which is the only way to exercise a page that dies mid-scroll.
  const build = new Function('dvPage', 'beginBusy', 'endBusy', 'render',
    `${liftDeclaration(source, 'dataverseCatalog')}; return dataverseCatalog;`)(
      (...args) => fake.dvPage(...args), () => {}, () => {}, () => renders.push(1));
  return build('qdb_reportexecutionlog', '?$orderby=x', row => ({ id: row.id }), { pageSize });
}

console.log('first page');
const fake = fakeDataverse(213, 50);
const renders = [];
const catalog = makeCatalog(fake, 50, renders);
await catalog.load();
check('reads one page, not the lot', catalog.rows.length === 50, `got ${catalog.rows.length}`);
check('knows there is more', catalog.hasMore() === true);
check('paged catalogs declare themselves', catalog.paged === true);
check('first load renders once', renders.length === 1, `got ${renders.length}`);

console.log('\nscrolling on');
const added = await catalog.loadMore();
check('returns only the new rows', added.length === 50, `got ${added.length}`);
check('appends rather than replaces', catalog.rows.length === 100, `got ${catalog.rows.length}`);
check('rows stay in order', catalog.rows[49].id === 49 && catalog.rows[50].id === 50);
// A re-render would rebuild the table and throw the reader back to the top.
check('loadMore does NOT re-render', renders.length === 1, `render count ${renders.length}`);

console.log('\nreaching the end');
while (catalog.hasMore()) await catalog.loadMore();
check('ends with every row', catalog.rows.length === 213, `got ${catalog.rows.length}`);
check('no duplicates', new Set(catalog.rows.map(r => r.id)).size === 213);
check('hasMore is false at the end', catalog.hasMore() === false);
const callsAtEnd = fake.calls;
await catalog.loadMore();
check('loadMore past the end asks for nothing', fake.calls === callsAtEnd,
  `${fake.calls - callsAtEnd} extra request(s)`);

console.log('\ntwo scroll events at once');
const racy = fakeDataverse(500, 50);
const c2 = makeCatalog(racy, 50);
await c2.load();
const before = racy.calls;
// Both fire before either resolves, which is exactly what a fast scroll does.
const [a, b] = await Promise.all([c2.loadMore(), c2.loadMore()]);
check('only one request goes out', racy.calls === before + 1, `${racy.calls - before} requests`);
check('the second returns nothing', b.length === 0 || a.length === 0);
check('no duplicated rows', new Set(c2.rows.map(r => r.id)).size === c2.rows.length,
  `${c2.rows.length} rows, ${new Set(c2.rows.map(r => r.id)).size} unique`);

console.log('\na page that fails');
const flaky = fakeDataverse(500, 50);
const c3 = makeCatalog(flaky, 50);
await c3.load();
flaky.dvPage = async () => { throw new Error('Dataverse said no'); };
const none = await c3.loadMore();
check('returns no rows', none.length === 0);
check('keeps what it already had', c3.rows.length === 50, `got ${c3.rows.length}`);
check('records why', /Dataverse said no/.test(c3.error || ''), c3.error);
// Otherwise every further scroll event fires another doomed request.
check('stops paging instead of retrying forever', c3.hasMore() === false);

console.log('\nrefresh');
const c4 = makeCatalog(fakeDataverse(213, 50), 50);
await c4.load();
await c4.loadMore();
check('is part-way through', c4.rows.length === 100);
await c4.refresh();
check('starts from the first page again', c4.rows.length === 50, `got ${c4.rows.length}`);
check('and can page again', c4.hasMore() === true);

console.log('\nwhat the stubs could not see: the shape Xrm.WebApi accepts');
// Caught in the browser, not here. The state machine was right and the call was wrong: nextLink is
// an absolute URL and Xrm.WebApi rejects anything not starting with "?", so paging failed on the
// SECOND page only — invisible to a test that stubs the fetch.
const asQueryOptions = new Function(`${liftDeclaration(source, 'asQueryOptions')}; return asQueryOptions;`)();
const NEXT = 'https://org5869857f.crm4.dynamics.com/api/data/v9.2/qdb_reportexecutionlogs?$select=qdb_correlationid&$skiptoken=%3Ccookie%3E';
check('an absolute nextLink becomes a query', asQueryOptions(NEXT).startsWith('?'), asQueryOptions(NEXT).slice(0, 40));
check('the skiptoken survives', /\$skiptoken=/.test(asQueryOptions(NEXT)));
check('an ordinary query is left alone', asQueryOptions('?$select=a&$top=5') === '?$select=a&$top=5');
check('a query with no ? is not mangled', asQueryOptions('$select=a') === '$select=a');

console.log('\nunpaged catalogs are untouched');
const plainFake = fakeDataverse(213, 0);
const plain = makeCatalog(plainFake, 0);
await plain.load();
check('still reads everything at once', plain.rows.length === 213, `got ${plain.rows.length}`);
check('never claims more', plain.hasMore() === false);
check('paged flag is false', plain.paged === false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
