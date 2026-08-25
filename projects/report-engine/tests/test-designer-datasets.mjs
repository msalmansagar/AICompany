import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

// The designer's Data Sources tab has offered "Join key L" and "Join key R" boxes since it was
// written, and dataSourcesOf threw both away on save — a report configured as master-detail came
// back unconfigured, with no error anywhere. This suite exists so that cannot happen again to the
// fields that replaced them.
//
// It drives the SHIPPED mapper out of report-designer.html rather than a copy.

const DESIGNER = fileURLToPath(new URL('../prototype/report-designer.html', import.meta.url));
const html = readFileSync(DESIGNER, 'utf8');

const NEEDED = [
  'COMPOSITIONS', 'compositionByLabel', 'compositionByCode', 'isStandalone', 'compositionCoded',
  'SOURCES', 'sourceByLabel', 'blockEntityOf', 'blockColumnsOf', 'blockMappingsOf', 'dataSourcesOf',
  'externalSourcesOf', 'EXTERNAL_MAPPING_KEY', 'EXTERNAL_SOURCE_LABEL'
];

const api = new Function('newGuid', 'coded', `
  ${NEEDED.map(name => liftDeclaration(html, name)).join('\n')}
  return { dataSourcesOf, blockEntityOf, blockColumnsOf, isStandalone, compositionCoded };
`)(() => '00000000-0000-0000-0000-000000000000', (code, label) => code == null ? null : { code, label });

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const ROOT_COLUMNS = [{ id: 'c1', columnLogicalName: 'qdb_name', sortOrder: 1, isVisible: true }];

/** A term sheet with one child block, as the tab would hold it. */
const termsheet = (over = {}) => ({
  dataSources: [
    { name: 'Termsheet', type: 'FetchXML', primary: true, composition: 'Joined' },
    {
      name: 'Requested Facilities', type: 'FetchXML', primary: false,
      composition: 'Standalone', entity: 'qdb_requestedfacility',
      columns: 'qdb_facilitytype, qdb_amount, qdb_tenor',
      joinFromKey: 'qdb_termsheetid', joinToKey: 'qdb_termsheetid',
      ...over
    }
  ]
});

const mapped = report => api.dataSourcesOf(report, 'ts', 'qdb_termsheet', ROOT_COLUMNS, []);

console.log('the block survives a save');
{
  const [root, block] = mapped(termsheet());
  check('the root stays primary', root.isPrimary === true);
  check('and is always joined', root.composition === 'Joined', root.composition);
  check('the block is standalone', block.composition === 'Standalone', block.composition);
  check('its child key is kept', block.joinFromKey === 'qdb_termsheetid', String(block.joinFromKey));
  check('its parent key is kept', block.joinToKey === 'qdb_termsheetid', String(block.joinToKey));
}

console.log('the block carries its own table and columns');
{
  const block = mapped(termsheet())[1];
  const mapping = block.entityMappings[0];
  check('it has an entity mapping', !!mapping, JSON.stringify(block.entityMappings));
  check('naming its own table', mapping.entityLogicalName === 'qdb_requestedfacility', mapping.entityLogicalName);
  check('with its columns in order',
    mapping.columns.map(c => c.columnLogicalName).join(',') === 'qdb_facilitytype,qdb_amount,qdb_tenor',
    mapping.columns.map(c => c.columnLogicalName).join(','));
  check('numbered from one', mapping.columns[0].sortOrder === 1 && mapping.columns[2].sortOrder === 3);
  check('and all visible', mapping.columns.every(c => c.isVisible));
}

console.log('a block with no entity gets no mapping at all');
{
  // An empty mapping names no table, and the engine would fall back to the report's main entity —
  // the root's rows again under a second heading.
  const block = mapped(termsheet({ entity: '' }))[1];
  check('no mapping is invented', block.entityMappings.length === 0, JSON.stringify(block.entityMappings));
}

console.log('the primary source can never be a block');
{
  const report = { dataSources: [{ name: 'Termsheet', type: 'FetchXML', primary: true, composition: 'Standalone' }] };
  const root = mapped(report)[0];
  check('it is forced back to joined', root.composition === 'Joined', root.composition);
  check('and carries no join keys', root.joinFromKey === null && root.joinToKey === null);
  check('but keeps the report columns', root.entityMappings[0].columns === ROOT_COLUMNS);
}

console.log('a source saved before this feature is unchanged');
{
  const report = { dataSources: [{ name: 'Primary', type: 'FetchXML', primary: true }] };
  const root = mapped(report)[0];
  check('absent composition means joined', root.composition === 'Joined', String(root.composition));
}

console.log('the stored form reads back into the tab');
{
  const stored = {
    entityMappings: [{
      entityLogicalName: 'qdb_requestedfacility',
      columns: [
        { columnLogicalName: 'qdb_tenor', sortOrder: 3 },
        { columnLogicalName: 'qdb_facilitytype', sortOrder: 1 },
        { columnLogicalName: 'qdb_amount', sortOrder: 2 }
      ]
    }]
  };
  check('the entity comes back', api.blockEntityOf(stored) === 'qdb_requestedfacility');
  check('the columns come back IN ORDER, not as stored',
    api.blockColumnsOf(stored) === 'qdb_facilitytype, qdb_amount, qdb_tenor', api.blockColumnsOf(stored));
  check('a source with no mappings reads empty', api.blockEntityOf({}) === '' && api.blockColumnsOf({}) === '');
}

console.log('composition is stored as a code, never as null');
{
  check('Standalone', api.compositionCoded('Standalone').code === 100000001);
  check('Joined', api.compositionCoded('Joined').code === 100000000);
  // A null would leave the column empty, which the engine reads as Joined — silently turning a block
  // back into a join.
  check('an unknown label falls back to Joined', api.compositionCoded('nonsense').code === 100000000);
  check('and so does an absent one', api.compositionCoded(undefined).code === 100000000);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
