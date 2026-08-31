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
  'previewDatasetHeader', 'previewDatasetBlock', 'previewDatasetTable',
  'previewRows', 'reportPreviewCols', 'canvasDatasetBlocks', 'canvasRootShapeNote', 'runExport'
];

const EXPORTED = [
  'previewBlocksOf', 'blockPreviewCols', 'parentScopeValue', 'blockCacheKey', 'blockPreviewRows',
  'blockPreviewFetchXml', 'resolvePreviewBlock', 'previewDatasetsHtml', 'previewKey',
  'toPreviewRow', 'previewCellText', 'PREVIEW_ROW_LIMIT', 'PREVIEW_RAW',
  'reportPreviewCols', 'canvasDatasetBlocks', 'canvasRootShapeNote', 'runExport'
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
const exported = [];
const toasts = [];

const api = new Function(
  'esc', 'money', 'loadingNote', 'isBlankCell', 'EMPTY_CELL', 'attributesOf', 'previewData', 'loadPreviewRows',
  'ic', 'beginBusy', 'endBusy', 'Blob', 'document', 'URL', 'toast',
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
  (key, entity, cols, fetchXml) => { issued.push({ key, entity, fetchXml }); },
  name => `<icon:${name}>`,
  () => {},
  () => {},
  // The CSV export writes a real file, so the download is intercepted rather than performed.
  function Blob(parts) { exported.push(parts.join('')); },
  { createElement: () => ({ click() {} }) },
  { createObjectURL: () => 'blob:test' },
  message => { toasts.push(message); }
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
  mainEntity: 'qdb_termsheet',
  design: { tables: [{ id: 't1', role: 'master', displayAs: 'table', columns: [] }] },
  columns: columns || [
    { name: 'Name', attribute: 'qdb_name', type: 'Text', visible: true },
    { name: 'Term sheet', attribute: 'qdb_termsheetid', type: 'Text', visible: true }
  ],
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
  check('and the canvas adds nothing', api.canvasDatasetBlocks(report([])) === '');
}

/* designFromColumns builds ONE section out of the report's columns, so the canvas drew a term sheet
   and no facilities — the surface an author lands on when they open a saved report was the surface
   that knew least about what the report does. */
console.log('the canvas shows the blocks too, read-only');
{
  const withBlock = report([facilities()]);
  const rootCols = api.reportPreviewCols(withBlock);
  previewData.byKey[api.previewKey('qdb_termsheet', rootCols)] = [
    { qdb_name: 'TS-0001', qdb_termsheetid: TERMSHEET_ID, [api.PREVIEW_RAW]: { qdb_termsheetid: TERMSHEET_ID } }
  ];
  const [block] = api.previewBlocksOf(withBlock);
  previewData.byKey[api.blockCacheKey(block, TERMSHEET_ID)] = [{ qdb_facilitytype: 'Overdraft', qdb_amount: 750000 }];

  const canvas = api.canvasDatasetBlocks(withBlock);
  check('the block is drawn', canvas.includes('Requested Facilities'), canvas.slice(0, 200));
  check('with its own scoped rows', canvas.includes('Overdraft'), canvas);
  check('it is marked as configured elsewhere', /configured under Data sources/.test(canvas));
  check('and offers no drop target', !canvas.includes('data-drop'), canvas.slice(0, 300));
  check('nor any editable field', !canvas.includes('data-selfield') && !canvas.includes('data-selcol'));
}

console.log('the canvas says what the engine will do with the root, rather than differing in silence');
{
  const withBlock = report([facilities()]);
  const oneRecord = [{ [api.PREVIEW_RAW]: {} }];
  const asTable = api.canvasRootShapeNote(withBlock, oneRecord);
  check('a single-record root is told it runs as a header', /runs\s+as a header/.test(asTable), asTable);

  const asHeader = report([facilities()]);
  asHeader.design.tables[0].displayAs = 'header';
  check('and says nothing once the section is a header', api.canvasRootShapeNote(asHeader, oneRecord) === '');

  const many = api.canvasRootShapeNote(withBlock, [{}, {}, {}]);
  check('a multi-record root gets the first-row notice instead', /3 records returned/.test(many), many);
}

/* A CSV that silently arrives one table short is the same quiet disagreement between the file and
   the screen that the runtime's exports were fixed for (MDS-FR-023). */
console.log('the preview CSV names the datasets it cannot carry');
{
  const withBlock = report([facilities()]);
  api.runExport('CSV', withBlock);
  const csv = exported[exported.length - 1];
  check('the omission is written into the file', /Not included/.test(csv), csv);
  check('and the block is named', /Requested Facilities/.test(csv), csv);
  check('the toast says so too', /without Requested Facilities/.test(toasts[toasts.length - 1]), toasts[toasts.length - 1]);

  api.runExport('CSV', report([]));
  const plain = exported[exported.length - 1];
  check('a report with no blocks gets no note', !/Not included/.test(plain), plain);
  check('and the plain confirmation', /downloaded/.test(toasts[toasts.length - 1]), toasts[toasts.length - 1]);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
