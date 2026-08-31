import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

// The Preview tab rendered the report's own columns over its main entity and nothing else, which
// stopped being the whole report the day standalone blocks shipped: a term sheet with its facilities
// and its conditions previewed as the term sheet alone — no header, no child tables, no explanation.
//
// This suite drives the SHIPPED preview functions out of report-designer.html rather than a copy.
// The assertion that matters most is the scoping one: a block scoped on a lookup's LABEL rather than
// its id matches nothing, and comes back looking exactly like a query that legitimately found none.

const DESIGNER = fileURLToPath(new URL('../prototype/report-designer.html', import.meta.url));
const html = readFileSync(DESIGNER, 'utf8');

const NEEDED = [
  'FORMATTED_SUFFIX', 'PREVIEW_ROW_LIMIT', 'PREVIEW_RAW',
  'isStandalone', 'sourceProblems',
  'previewKey', 'previewCellValue', 'previewRawValue', 'toPreviewRow', 'previewCellText',
  'previewBlocksOf', 'describePreviewBlock', 'blockPreviewCols', 'isScopedBlock',
  'parentScopeValue', 'blockCacheKey', 'blockPreviewRows', 'blockPreviewFetchXml',
  'resolvePreviewBlock', 'previewDatasetsHtml', 'previewMultiRecordNotice',
  'previewDatasetHeader', 'previewDatasetBlock', 'previewDatasetTable'
];

const EXPORTED = [
  'previewBlocksOf', 'blockPreviewCols', 'parentScopeValue', 'blockCacheKey', 'blockPreviewRows',
  'blockPreviewFetchXml', 'resolvePreviewBlock', 'previewDatasetsHtml', 'previewKey',
  'toPreviewRow', 'previewCellText', 'PREVIEW_ROW_LIMIT', 'PREVIEW_RAW'
];

/* The org the preview reads, and the queries it issued — the fakes stand in for Dataverse so the
   suite can assert WHICH FetchXML a block would send, which is the whole question for scoping. */
const catalog = {
  qdb_requestedfacility: [
    { a: 'qdb_facilitytype', n: 'Facility type', t: 'Text' },
    { a: 'qdb_amount', n: 'Amount', t: 'Currency' }
  ],
  qdb_termsheetcondition: [{ a: 'qdb_condition', n: 'Condition', t: 'Text' }]
};

const previewData = { byKey: {}, pending: {}, errorByKey: {} };
const issued = [];

const api = new Function(
  'esc', 'money', 'loadingNote', 'isBlankCell', 'EMPTY_CELL', 'attributesOf', 'previewData', 'loadPreviewRows',
  `${NEEDED.map(name => liftDeclaration(html, name)).join('\n')}
   return { ${EXPORTED.join(', ')} };`
)(
  value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  amount => 'QAR ' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  text => `<loading>${text}</loading>`,
  value => value === null || value === undefined || value === '',
  '—',
  entity => catalog[entity] || [],
  previewData,
  (key, entity, cols, fetchXml) => { issued.push({ key, entity, fetchXml }); }
);

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const TERMSHEET_ID = '5cf2c3f0-9b0b-4a3f-9d2a-1b3c4d5e6f70';

const facilities = (over = {}) => ({
  name: 'Requested Facilities', primary: false, composition: 'Standalone',
  entity: 'qdb_requestedfacility', columns: 'qdb_facilitytype, qdb_amount',
  joinFromKey: 'qdb_termsheetid', joinToKey: 'qdb_termsheetid', enabled: true, ...over
});

const report = (sources, columns) => ({
  name: 'Term sheet',
  columns: columns || [{ attribute: 'qdb_name' }, { attribute: 'qdb_termsheetid' }],
  dataSources: [{ name: 'Termsheet', primary: true, composition: 'Joined' }, ...sources]
});

console.log('only the datasets the engine would actually run become blocks');
{
  const blocks = api.previewBlocksOf(report([
    facilities(),
    { name: 'Joined lookup', primary: false, composition: 'Joined', entity: 'qdb_x' },
    facilities({ name: 'Switched off', enabled: false })
  ]));
  check('the primary source is never a block', !blocks.some(b => b.name === 'Termsheet'));
  check('a joined source is never a block', !blocks.some(b => b.name === 'Joined lookup'));
  check('a disabled dataset is not previewed', !blocks.some(b => b.name === 'Switched off'), JSON.stringify(blocks.map(b => b.name)));
  check('the enabled standalone block is', blocks.length === 1 && blocks[0].name === 'Requested Facilities');
}

console.log('a block carries its own table, columns and limit');
{
  const [block] = api.previewBlocksOf(report([facilities({ rowLimit: '3' })]));
  check('it names its own table', block.entity === 'qdb_requestedfacility');
  check('its columns are resolved to display names', block.cols.map(c => c.name).join('|') === 'Facility type|Amount', JSON.stringify(block.cols));
  check('a currency column is right-aligned', block.cols[1].right === true);
  check('its own row limit is honoured', block.top === 3, String(block.top));

  const [unlimited] = api.previewBlocksOf(report([facilities()]));
  check('no row limit falls back to the preview limit', unlimited.top === api.PREVIEW_ROW_LIMIT, String(unlimited.top));

  const unknown = api.blockPreviewCols('qdb_requestedfacility', 'qdb_notinmetadata');
  check('a column metadata has not loaded keeps its logical name', unknown[0].name === 'qdb_notinmetadata');
}

console.log('a scoped block filters on the parent id, not the label it displays');
{
  // What Dataverse returns for a lookup: the id under _x_value, the label in the annotation.
  const rootRow = api.toPreviewRow(
    {
      qdb_name: 'Qatar National Bank',
      '_qdb_termsheetid_value': TERMSHEET_ID,
      [`_qdb_termsheetid_value${'@OData.Community.Display.V1.FormattedValue'}`]: 'TS-0001 Qatar National Bank'
    },
    [{ key: 'qdb_name' }, { key: 'qdb_termsheetid' }]
  );
  check('the preview still shows the label', rootRow.qdb_termsheetid === 'TS-0001 Qatar National Bank', String(rootRow.qdb_termsheetid));

  const [block] = api.previewBlocksOf(report([facilities()]));
  const parentValue = api.parentScopeValue(block, [rootRow]);
  check('but the scope value is the id', parentValue === TERMSHEET_ID, String(parentValue));

  const fetchXml = api.blockPreviewFetchXml(block, parentValue);
  check('the filter names the child key', fetchXml.includes('attribute="qdb_termsheetid"'), fetchXml);
  check('and matches on the id', fetchXml.includes(`value="${TERMSHEET_ID}"`), fetchXml);
  check('never on the label', !fetchXml.includes('Qatar National Bank'), fetchXml);
  check('over the block table', fetchXml.includes('<entity name="qdb_requestedfacility">'), fetchXml);
}

console.log('an unscoped block queries its table with no filter');
{
  const [block] = api.previewBlocksOf(report([facilities({ joinFromKey: '', joinToKey: '' })]));
  const fetchXml = api.blockPreviewFetchXml(block, api.parentScopeValue(block, [{}]));
  check('no filter element is emitted', !fetchXml.includes('<filter>'), fetchXml);
  check('the columns are still asked for', fetchXml.includes('<attribute name="qdb_amount"/>'), fetchXml);
}

console.log('a scoped block does not share the cache with an unscoped one');
{
  const [block] = api.previewBlocksOf(report([facilities()]));
  const scoped = api.blockCacheKey(block, TERMSHEET_ID);
  const unscoped = api.blockCacheKey(block, null);
  check('the parent is part of the key', scoped !== unscoped);
  check('an unscoped key is exactly what previewKey has always produced',
    unscoped === api.previewKey('qdb_requestedfacility', block.cols), unscoped);
  check('a different parent is a different key', scoped !== api.blockCacheKey(block, 'other-id'));
}

console.log('a block the engine would refuse says why, instead of drawing an empty table');
{
  const noTable = api.previewBlocksOf(report([facilities({ entity: '' })]))[0];
  const resolved = api.resolvePreviewBlock(noTable, [{ [api.PREVIEW_RAW]: {} }]);
  check('it carries the refusal sentence', /names no table/.test(resolved.notice), resolved.notice);
  check('and no rows', resolved.rows.length === 0);

  const unreturnedKey = api.previewBlocksOf(
    report([facilities()], [{ attribute: 'qdb_name' }])
  )[0];
  const missing = api.resolvePreviewBlock(unreturnedKey, [{ [api.PREVIEW_RAW]: {} }]);
  check('a parent key the report does not return is named', /qdb_termsheetid/.test(missing.notice), missing.notice);
}

console.log('a scoped block whose parent row carries no value says so');
{
  const [block] = api.previewBlocksOf(report([facilities()]));
  const resolved = api.resolvePreviewBlock(block, [{ [api.PREVIEW_RAW]: { qdb_termsheetid: undefined } }]);
  check('it does not query unscoped by accident', !issued.some(q => q.fetchXml && !q.fetchXml.includes('<filter>') && q.entity === 'qdb_requestedfacility' && q.key.includes('|')), 'an unscoped query was issued');
  check('it explains rather than showing an empty table', /nothing to scope/.test(resolved.notice), resolved.notice);
}

console.log('a block still loading says so rather than reading as no rows');
{
  const [block] = api.previewBlocksOf(report([facilities()]));
  const resolved = api.resolvePreviewBlock(block, [{ [api.PREVIEW_RAW]: { qdb_termsheetid: TERMSHEET_ID } }]);
  check('the query was started', issued.some(q => q.entity === 'qdb_requestedfacility'));
  check('and the block says it is reading', /<loading>/.test(resolved.notice), resolved.notice);
}

console.log('a single-record root renders as a header, a multi-record root keeps its table');
{
  const [block] = api.previewBlocksOf(report([facilities()]));
  const rootCols = [{ name: 'Name', label: 'Term sheet', key: 'qdb_name', type: 'Text' }];
  const rootRow = { qdb_name: 'TS-0001', [api.PREVIEW_RAW]: { qdb_termsheetid: TERMSHEET_ID } };
  previewData.byKey[api.blockCacheKey(block, TERMSHEET_ID)] = [
    { qdb_facilitytype: 'Term loan', qdb_amount: 2500000 }
  ];

  const single = api.previewDatasetsHtml(report([facilities()]), rootCols, [rootRow], [block]);
  check('the root becomes a header region', single.includes('dataset-block dataset-header'), single.slice(0, 120));
  check('its authored label is used, not the column name', single.includes('Term sheet'), single.slice(0, 200));
  check('the block is drawn below it', single.includes('Requested Facilities'));
  check('with its own rows', single.includes('Term loan'), single);
  check('formatted as the report will print them', single.includes('QAR 2,500,000.00'), single);
  check('and no multi-record notice', !single.includes('records returned'));

  const many = api.previewDatasetsHtml(report([facilities()]), rootCols, [rootRow, { qdb_name: 'TS-0002', [api.PREVIEW_RAW]: {} }], [block]);
  check('two records keep the root as a table', !many.includes('dataset-header'), many.slice(0, 120));
  check('and say the blocks belong to the first row', /2 records returned/.test(many), many.slice(0, 400));
}

console.log('a report with no blocks produces no dataset markup at all');
{
  check('nothing standalone means no blocks', api.previewBlocksOf(report([])).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
