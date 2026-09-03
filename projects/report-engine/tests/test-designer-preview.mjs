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
  'isStandalone', 'isCrmViewSource', 'isStaticSource', 'isBlockConfigSource', 'isExternalSourceType', 'RAIL_PANELS', 'sourceProblems',
  'joinedSourceProblems', 'brokenFetchXmlProblem', 'staticSourceProblems', 'staticRowsProblem',
  'standaloneSourceProblems',
  'previewKey', 'previewCellValue', 'previewRawValue', 'toPreviewRow', 'previewCellText',
  'previewBlocksOf', 'describePreviewBlock', 'blockSourceKind', 'blockPreviewCols', 'isScopedBlock',
  'parentScopeValue', 'queryFingerprint', 'blockCacheKey', 'blockQueryBase', 'blockPreviewRows',
  'blockPreviewFetchXml', 'scopeCondition', 'scopedAuthoredFetchXml', 'resolveStaticBlock',
  'resolvePreviewBlock', 'previewDatasetsHtml', 'previewMultiRecordNotice',
  'previewDatasetHeader', 'previewDatasetBlock', 'previewDatasetTable',
  'previewRows', 'reportPreviewCols', 'canvasDatasetBlocks', 'canvasRootShapeNote', 'runExport',
  'fieldsFromFetchXml', 'datasetFieldsOf', 'staticFieldsOf', 'datasetKindChip', 'wizardDatasetShim',
  'PREVIEW_FETCH_OPERATORS', 'PREVIEW_VALUELESS_OPERATORS', 'PREVIEW_MULTIVALUE_OPERATORS',
  'reportFilterXml', 'previewFilterCondition', 'previewFilterValue', 'previewWildcards',
  'rootRowsCacheKey', 'reportRootRows', 'isReportRootLoading'
];

const EXPORTED = [
  'previewBlocksOf', 'blockPreviewCols', 'parentScopeValue', 'blockCacheKey', 'blockPreviewRows',
  'blockPreviewFetchXml', 'resolvePreviewBlock', 'previewDatasetsHtml', 'previewKey',
  'toPreviewRow', 'previewCellText', 'PREVIEW_ROW_LIMIT', 'PREVIEW_RAW',
  'reportPreviewCols', 'canvasDatasetBlocks', 'canvasRootShapeNote', 'runExport',
  'blockQueryBase', 'sourceProblems',
  'reportFilterXml', 'previewFilterCondition', 'reportRootRows', 'rootRowsCacheKey', 'isReportRootLoading', 'RAIL_PANELS',
  'fieldsFromFetchXml', 'datasetFieldsOf', 'datasetKindChip', 'blockPreviewCols', 'wizardDatasetShim'
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
/* Saved views by entity, as the designer's metadata store would hold them. */
const views = {
  qdb_requestedfacility: [{
    name: 'Open Facilities',
    fetchXml: '<fetch top="5000"><entity name="qdb_requestedfacility"><attribute name="qdb_facilitytype"/>'
      + '<filter><condition attribute="qdb_isopen" operator="eq" value="1"/></filter></entity></fetch>'
  }]
};

const api = new Function(
  'esc', 'money', 'loadingNote', 'isBlankCell', 'EMPTY_CELL', 'attributesOf', 'previewData', 'loadPreviewRows',
  'ic', 'beginBusy', 'endBusy', 'Blob', 'document', 'URL', 'toast', 'viewsOf',
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
  message => { toasts.push(message); },
  entity => views[entity] || []
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

/* MDS-FR-001 — a block runs ITS OWN query, and the preview must run the same one. The engine side
   is pinned by StandaloneDatasetTests; these pin the designer side of the same contract. */
console.log('a block with its own FetchXML previews that query, scoped and capped');
{
  const authored = '<fetch top="5000"><entity name="qdb_requestedfacility">'
    + '<attribute name="qdb_facilitytype"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>';
  const [block] = api.previewBlocksOf(report([facilities({ type: 'FetchXML', query: authored })]));
  check('the block knows its kind', block.kind === 'fetch');

  const base = api.blockQueryBase(block);
  check('the authored query is the base', base === authored);

  const fetchXml = api.blockPreviewFetchXml(block, TERMSHEET_ID, base);
  check('the authored filter survives', fetchXml.includes('statecode'), fetchXml);
  check('the parent scope is added to it', fetchXml.includes(`value="${TERMSHEET_ID}"`), fetchXml);
  check('the author top is replaced by the preview cap', !fetchXml.includes('top="5000"') && fetchXml.includes(`top="${api.PREVIEW_ROW_LIMIT}"`), fetchXml);
  check('a different query is a different cache key',
    api.blockCacheKey(block, TERMSHEET_ID, base) !== api.blockCacheKey(block, TERMSHEET_ID, ''), 'keys collided');
}

console.log('a view block previews the view of its OWN table');
{
  const [block] = api.previewBlocksOf(report([facilities({ type: 'CRM View', query: 'Open Facilities' })]));
  check('the block knows its kind', block.kind === 'view');
  const base = api.blockQueryBase(block);
  check('the view fetchxml is the base', /qdb_isopen/.test(base || ''), String(base));

  const missing = api.blockQueryBase({ ...block, query: 'No Such View' });
  check('an unresolved view is distinct from "generate"', missing === null, String(missing));
}

console.log('a static block renders its inline rows, columns derived like the engine does');
{
  const rows = '[{"metric":"LTV","value":62},{"metric":"DSCR","value":1.8}]';
  const [block] = api.previewBlocksOf(report([{
    name: 'Key Ratios', primary: false, composition: 'Standalone', type: 'Static Dataset', query: rows, enabled: true
  }]));
  check('a static block needs no table to survive the save', block.problem === null, String(block.problem));

  const resolved = api.resolvePreviewBlock(block, [{ [api.PREVIEW_RAW]: {} }]);
  check('the rows are the pasted rows', resolved.rows.length === 2 && resolved.rows[0].metric === 'LTV', JSON.stringify(resolved.rows));
  check('columns come from the row keys', resolved.cols.map(c => c.key).join('|') === 'metric|value', JSON.stringify(resolved.cols));

  const scoped = api.sourceProblems({ name: 'Key Ratios', composition: 'Standalone', type: 'Static Dataset', query: rows, joinFromKey: 'x', joinToKey: 'y' }, 'Key Ratios', []);
  check('join keys on static rows are refused — the engine cannot scope them', /cannot be filtered to a parent/.test(scoped[0] || ''), JSON.stringify(scoped));

  const invalid = api.resolvePreviewBlock({ ...block, query: 'not json', problem: null }, []);
  check('broken JSON says so instead of an empty table', /not valid JSON/.test(invalid.notice), invalid.notice);
}

console.log('a FetchXML payload that is not XML is refused, not silently ignored');
{
  const [block] = api.previewBlocksOf(report([facilities({ type: 'FetchXML', query: 'My Active Facilities' })]));
  check('the save sentence names the fallback', /quietly run the generated query/.test(block.problem || ''), String(block.problem));

  check('a joined non-primary with a query is still refused',
    /never executed/.test((api.sourceProblems({ name: 'J', composition: 'Joined', query: '<fetch/>' }, 'J', [])[0]) || ''), 'joined query slipped through');
}

/* A saved report OPENS on the canvas, so its rail card is where an author actually meets the
   multiple-datasets option. The card offered Name/Read via/Query/Primary and nothing else — the
   Standalone choice existed only on a screen the canvas never links to. */
console.log('the canvas rail card can author a dataset block');
{
  const fields = api.RAIL_PANELS.dataSources.fields;
  const visible = source => fields.filter(f => !f.when || f.when(source)).map(f => f.k);

  check('the primary source hides composition and block fields',
    !visible({ primary: true }).some(k => ['composition', 'entity', 'columns', 'joinFromKey', 'joinToKey', 'rowLimit'].includes(k)),
    visible({ primary: true }).join(','));
  check('a joined source offers composition but no block fields',
    visible({ composition: 'Joined' }).includes('composition') && !visible({ composition: 'Joined' }).includes('entity'),
    visible({ composition: 'Joined' }).join(','));
  check('a standalone source offers table, columns, keys and limit',
    ['entity', 'columns', 'joinFromKey', 'joinToKey', 'rowLimit'].every(k => visible({ composition: 'Standalone' }).includes(k)),
    visible({ composition: 'Standalone' }).join(','));
  check('a static standalone source hides them again — inline rows have no table',
    !visible({ composition: 'Standalone', type: 'Static Dataset' }).includes('entity'),
    visible({ composition: 'Standalone', type: 'Static Dataset' }).join(','));
}

/* The preview always sampled the main table UNFILTERED — tolerable until blocks scoped themselves
   to the root's first row, at which point the preview confidently showed a DIFFERENT parent's
   children than the run would return. The translation mirrors ReportQueryBuilder.BuildCondition. */
console.log("the report's filters reach the root the blocks scope from");
{
  const filtered = report([facilities()]);
  filtered.filters = [{ attribute: 'accountid', operator: 'Equals', value: TERMSHEET_ID, param: '', andor: 'And' }];

  const xml = api.reportFilterXml(filtered);
  check('an equals filter becomes its condition',
    xml === `<filter type="and"><condition attribute="accountid" operator="eq" value="${TERMSHEET_ID}"/></filter>`, xml);

  api.reportRootRows(filtered);
  const rootQuery = issued[issued.length - 1];
  check('the root preview query carries the filter', rootQuery.fetchXml.includes(`value="${TERMSHEET_ID}"`), rootQuery.fetchXml);
  check('under a filter-fingerprinted cache key, so the unfiltered cache cannot answer',
    rootQuery.key !== api.previewKey('qdb_termsheet', api.reportPreviewCols(filtered)), rootQuery.key);
  check('and an empty answer while loading reads as loading', api.isReportRootLoading(filtered) === true);

  const unfiltered = report([facilities()]);
  check('no filters means the ordinary sampling query', api.reportFilterXml(unfiltered) === '');
}

console.log('the translation matches the engine case for case');
{
  const condition = (filter, parameters) => api.previewFilterCondition(filter, parameters);
  check('contains gets both wildcards',
    condition({ attribute: 'name', operator: 'Contains', value: 'bank' }).includes('value="%bank%"'),
    condition({ attribute: 'name', operator: 'Contains', value: 'bank' }));
  check('begins-with gets the trailing one',
    condition({ attribute: 'name', operator: 'Begins with', value: 'Q' }).includes('value="Q%"'));
  check('is-null carries no value at all',
    condition({ attribute: 'name', operator: 'Is null' }) === '<condition attribute="name" operator="null"/>');
  check('in splits its list into value elements',
    condition({ attribute: 'statecode', operator: 'In', value: '0, 1' }) ===
      '<condition attribute="statecode" operator="in"><value>0</value><value>1</value></condition>');
  check('an unfilled prompt drops the condition, exactly as the engine does',
    condition({ attribute: 'accountid', operator: 'Equals', value: '', param: 'Account' }, [{ name: 'Account', def: '' }]) === '');
  check('a prompt with a default filters on the default',
    condition({ attribute: 'accountid', operator: 'Equals', value: '', param: 'Account' }, [{ name: 'Account', def: 'abc' }]).includes('value="abc"'));

  const orReport = { filters: [
    { attribute: 'a', operator: 'Equals', value: '1', andor: 'Or' },
    { attribute: 'b', operator: 'Equals', value: '2', andor: 'Or' }
  ] };
  check('the group type follows the first filter', api.reportFilterXml(orReport).startsWith('<filter type="or">'), api.reportFilterXml(orReport));
}

console.log('an empty filtered root says so, instead of scoping to a record that is not there');
{
  const filtered = report([facilities()]);
  filtered.filters = [{ attribute: 'accountid', operator: 'Equals', value: 'no-such-id', param: '', andor: 'And' }];
  previewData.byKey[api.rootRowsCacheKey(filtered, api.reportPreviewCols(filtered), api.reportFilterXml(filtered))] = [];

  const [block] = api.previewBlocksOf(filtered);
  const resolved = api.resolvePreviewBlock(block, api.reportRootRows(filtered));
  check('the scoped block explains, mirroring ScopeToNothing', /no parent to scope to/.test(resolved.notice), resolved.notice);
  check('and the canvas banner names the filters', /filters return no records/.test(api.canvasRootShapeNote(filtered, [])), api.canvasRootShapeNote(filtered, []));
}

/* D1 — the Report Data tree and the Dataset properties dialog. The tree lists what each dataset
   RETURNS, and "Fields from query" derives the column list from the authored FetchXML instead of
   asking the author to retype what the query already says. */
console.log('the tree knows what each dataset returns');
{
  const withBlock = report([facilities({ columnLabels: { qdb_amount: 'Amount (QAR)' } })]);
  const primaryFields = api.datasetFieldsOf(withBlock.dataSources[0], withBlock);
  check('the primary lists the report columns', primaryFields.map(f => f.logical).join('|') === 'qdb_name|qdb_termsheetid', JSON.stringify(primaryFields));

  const blockFields = api.datasetFieldsOf(withBlock.dataSources[1], withBlock);
  check('a block lists its own columns', blockFields.map(f => f.logical).join('|') === 'qdb_facilitytype|qdb_amount', JSON.stringify(blockFields));
  check('an authored display name wins over the table label', blockFields[1].label === 'Amount (QAR)', JSON.stringify(blockFields[1]));
  check('a metadata label fills where none was authored', blockFields[0].label === 'Facility type', JSON.stringify(blockFields[0]));

  const staticFields = api.datasetFieldsOf({ type: 'Static Dataset', query: '[{"metric":"LTV","value":62}]' }, withBlock);
  check('a static dataset derives fields from row keys', staticFields.map(f => f.logical).join('|') === 'metric|value', JSON.stringify(staticFields));
}

console.log('"Fields from query" reads what the FetchXML actually selects');
{
  const fetchXml = '<fetch><entity name="contact"><attribute name="fullname"/><attribute name="jobtitle"/>'
    + '<link-entity name="account"><attribute name="fullname"/></link-entity></entity></fetch>';
  check('attributes come back in order, deduplicated', api.fieldsFromFetchXml(fetchXml).join('|') === 'fullname|jobtitle', api.fieldsFromFetchXml(fetchXml).join('|'));
  check('a non-XML payload yields nothing', api.fieldsFromFetchXml('My Active View').length === 0);
}

console.log('the wizard hands the dialog its draft, in the report shape');
{
  const draft = { mainEntity: 'qdb_termsheet', columns: ['qdb_name', 'qdb_termsheetid'], extraDatasets: [facilities()] };
  const shim = api.wizardDatasetShim(draft);
  check('draft columns become attribute objects, so the parent-key check works',
    shim.columns.map(c => c.attribute).join('|') === 'qdb_name|qdb_termsheetid', JSON.stringify(shim.columns));
  check('the SAME array backs dataSources, so the dialog Remove reaches the draft',
    shim.dataSources === draft.extraDatasets);
  check('the parent-key validation sees the wizard columns',
    api.sourceProblems(facilities(), 'F', shim.columns.map(c => c.attribute)).length === 0,
    JSON.stringify(api.sourceProblems(facilities(), 'F', shim.columns.map(c => c.attribute))));
}

console.log('the tree chip tells the truth about how a dataset runs');
{
  check('primary', /Primary/.test(api.datasetKindChip({ primary: true })));
  check('a standalone block', /Block/.test(api.datasetKindChip(facilities())));
  check('static rows', /Static/.test(api.datasetKindChip({ composition: 'Standalone', type: 'Static Dataset' })));
  const external = api.datasetKindChip({ composition: 'Standalone', type: 'External REST API — stored, not applied yet' });
  check('an external dataset says PHASE B, never that it runs', /Phase B/.test(external), external);
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
