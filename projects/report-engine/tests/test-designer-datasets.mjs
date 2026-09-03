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
  'SOURCES', 'sourceByLabel', 'blockEntityOf', 'blockColumnsOf', 'blockColumnLabelsOf', 'blockMappingsOf', 'dataSourcesOf',
  'externalSourcesOf', 'EXTERNAL_MAPPING_KEY', 'EXTERNAL_SOURCE_LABEL', 'datasetProblems', 'sourceProblems',
  'joinedSourceProblems', 'brokenFetchXmlProblem', 'staticSourceProblems', 'staticRowsProblem',
  'standaloneSourceProblems', 'isCrmViewSource', 'isStaticSource', 'isStandaloneDefinitionSource'
];

const api = new Function('newGuid', 'coded', `
  ${NEEDED.map(name => liftDeclaration(html, name)).join('\n')}
  return { dataSourcesOf, blockEntityOf, blockColumnsOf, blockColumnLabelsOf, isStandalone, compositionCoded, datasetProblems, isStandaloneDefinitionSource };
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

console.log('an authored display name survives the save and reads back');
{
  // qdb_reportcolumn.qdb_name is written from displayName; absent, the writer falls back to the
  // alias — so only chosen names travel, and a logical name never masquerades as an authored one.
  const block = mapped(termsheet({ columnLabels: { qdb_amount: 'Amount (QAR)' } }))[1];
  const columns = block.entityMappings[0].columns;
  check('the chosen label rides on its column',
    columns.find(c => c.columnLogicalName === 'qdb_amount').displayName === 'Amount (QAR)');
  check('an unlabelled column carries none',
    columns.find(c => c.columnLogicalName === 'qdb_tenor').displayName === undefined);

  const stored = { entityMappings: [{ entityLogicalName: 'qdb_requestedfacility', columns: [
    { columnLogicalName: 'qdb_amount', displayName: 'Amount (QAR)', sortOrder: 1 },
    { columnLogicalName: 'qdb_tenor', displayName: 'qdb_tenor', sortOrder: 2 }
  ] }] };
  const labels = api.blockColumnLabelsOf(stored);
  check('the label reads back keyed by logical name', labels.qdb_amount === 'Amount (QAR)', JSON.stringify(labels));
  check('a name equal to the logical is not an authored label', !('qdb_tenor' in labels), JSON.stringify(labels));
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

// MDS-FR-009. The designer's job here is to refuse what the engine will silently not do. Every case
// below is something that used to save cleanly and then quietly not happen at run time.
console.log('\nthe designer refuses what the engine will not execute');

const problemsFor = over => api.datasetProblems({
  columns: [{ attribute: 'qdb_termsheetid' }, { attribute: 'qdb_name' }],
  dataSources: [
    { name: 'Termsheet', type: 'FetchXML', primary: true },
    Object.assign({
      name: 'Requested Facilities', type: 'FetchXML', primary: false, composition: 'Standalone',
      entity: 'qdb_requestedfacility', columns: 'qdb_amount',
      joinFromKey: 'qdb_termsheetid', joinToKey: 'qdb_termsheetid'
    }, over)
  ]
});

const complains = (over, about) => problemsFor(over).some(problem => problem.includes(about));

{
  check('a correctly configured block is accepted', problemsFor({}).length === 0, problemsFor({}).join(' | '));
  check('a block naming no table is refused', complains({ entity: '' }, 'names no table'), problemsFor({ entity: '' }).join(' | '));
  check('a block with no columns is refused', complains({ columns: '' }, 'no columns'));
  check('a child key with no parent key is refused', complains({ joinToKey: '' }, 'parent key'));
  check('a parent key with no child key is refused', complains({ joinFromKey: '' }, 'child key'));
  // The engine fails this block at run time; catching it at save is the difference between a report
  // that cannot be saved wrong and one that fails when someone runs it.
  check('a parent key the report does not return is refused',
    complains({ joinToKey: 'qdb_missing' }, 'does not return'), problemsFor({ joinToKey: 'qdb_missing' }).join(' | '));
  check('and the reason names the column', complains({ joinToKey: 'qdb_missing' }, 'qdb_missing'));
  check('the problem names the dataset', complains({ entity: '' }, 'Requested Facilities'));
}

{
  // Only the primary source's query is executed — a payload on any other source is discarded in
  // silence, which is exactly the class of defect this requirement exists to end.
  const carriesQuery = api.datasetProblems({
    columns: [],
    dataSources: [
      { name: 'Termsheet', type: 'FetchXML', primary: true },
      { name: 'Second', type: 'CRM View', primary: false, composition: 'Joined', query: 'Active Accounts' }
    ]
  });
  check('a joined source carrying a query is refused',
    carriesQuery.some(p => p.includes('never executed')), carriesQuery.join(' | '));
}

{
  const none = api.datasetProblems({ columns: [], dataSources: [{ name: 'A', primary: false }] });
  check('a report with no primary source is refused', none.some(p => p.includes('Primary')), none.join(' | '));
  const two = api.datasetProblems({ columns: [], dataSources: [{ name: 'A', primary: true }, { name: 'B', primary: true }] });
  check('two primary sources are refused', two.some(p => p.includes('Primary')), two.join(' | '));
}

{
  // A report that predates all of this must still save.
  check('an ordinary single-source report is accepted',
    api.datasetProblems({ columns: [], dataSources: [{ name: 'Primary', type: 'FetchXML', primary: true }] }).length === 0);
  check('and so is a report with no sources at all',
    api.datasetProblems({ columns: [], dataSources: [] }).length === 0);
}

// Reported from the org: opening the master-detail report in the designer showed ONE grid of six
// columns — the account's three and the contact's three merged — with no header and no separate
// contacts table. The loader swept every data source's columns into the report's own list, so a
// block's columns arrived as though the root returned them.
console.log('\na block\'s columns stay with the block when the report is opened');

const storedDefinition = () => ({
  mainEntityLogicalName: 'account',
  dataSources: [
    {
      isPrimary: true, name: 'Account', sourceAlias: 't',
      entityMappings: [{
        entityLogicalName: 'account',
        columns: [
          { columnLogicalName: 'name', displayName: 'Account', outputAlias: 'name', sortOrder: 1, isVisible: true },
          { columnLogicalName: 'accountid', displayName: 'Account id', outputAlias: 'accountid', sortOrder: 2, isVisible: true }
        ]
      }]
    },
    {
      isPrimary: false, name: 'Contacts at this account', sourceAlias: 'b1',
      composition: { code: 100000001 },
      joinFromKey: 'parentcustomerid', joinToKey: 'accountid',
      entityMappings: [{
        entityLogicalName: 'contact',
        columns: [
          { columnLogicalName: 'fullname', displayName: 'Full name', outputAlias: 'fullname', sortOrder: 1, isVisible: true },
          { columnLogicalName: 'jobtitle', displayName: 'Job title', outputAlias: 'jobtitle', sortOrder: 2, isVisible: true }
        ]
      }]
    }
  ]
});

{
  check('a stored block is recognised as one',
    api.isStandaloneDefinitionSource(storedDefinition().dataSources[1]) === true);
  check('and the primary source never is',
    api.isStandaloneDefinitionSource(storedDefinition().dataSources[0]) === false);
  // The primary source of a report saved before this feature carries no composition at all.
  check('nor does a source with no composition',
    api.isStandaloneDefinitionSource({ isPrimary: false, entityMappings: [] }) === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
