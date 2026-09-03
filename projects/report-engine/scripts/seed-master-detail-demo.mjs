/* Creates a real master-detail report so ADD-002 Phase A can be exercised end to end in an org that
 * has no Termsheet tables: one ACCOUNT as the parent, its CONTACTS as a scoped child block.
 *
 * It is the same shape as Termsheet → Requested Facilities: one parent record drawn as a header,
 * with a child dataset filtered to it. The account is chosen for having the most contacts, so the
 * block has something to show.
 *
 * Idempotent — re-running replaces the report it created. Remove it with --remove.
 *
 * Usage: node seed-master-detail-demo.mjs <path-to-.env> [--remove]
 */
import { connect } from './lib/dataverse.mjs';

const REPORT_NAME = 'Multi-dataset demo — Account and its Contacts';
const COMPOSITION_STANDALONE = 100000001;
const OPERATOR_EQUALS = 100000000;
const STATUS_PUBLISHED = 100000001;
const SOURCE_TYPE_FETCHXML = 100000001;
const SOURCE_TYPE_STATIC = 100000010;

/* A block that runs its OWN query (MDS-FR-001): same table as the first block, but the authored
   filter keeps only contacts with an email — so the two blocks' differing row counts are the visible
   proof that the authored query ran. The attributes must match the block's columns, or the cells
   arrive blank (the same trap saved views have). */
const AUTHORED_BLOCK_FETCHXML =
  '<fetch><entity name="contact">'
  + '<attribute name="fullname"/><attribute name="emailaddress1"/><attribute name="jobtitle"/>'
  + '<filter><condition attribute="emailaddress1" operator="not-null"/></filter>'
  + '</entity></fetch>';

/* Inline rows never touch Dataverse; the engine derives the columns from the row keys. */
const STATIC_BLOCK_ROWS = JSON.stringify([
  { metric: 'Loan-to-value', value: '62%' },
  { metric: 'Debt service cover', value: '1.8x' },
  { metric: 'Facility utilisation', value: '74%' }
]);

/* The parent key MUST be among the report's own columns: the engine reads it off the root row to
   scope the block, and fails the block by name when the report does not return it. */
const ROOT_COLUMNS = [
  { logical: 'name', display: 'Account', order: 1 },
  { logical: 'accountnumber', display: 'Account number', order: 2 },
  { logical: 'accountid', display: 'Account id', order: 3 }
];

const BLOCK_COLUMNS = [
  { logical: 'fullname', display: 'Full name', order: 1 },
  { logical: 'emailaddress1', display: 'Email', order: 2 },
  { logical: 'jobtitle', display: 'Job title', order: 3 }
];

const create = (dv, set, body) => dv.fetchJson(set, {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify(body)
});

async function findExistingReport(dv) {
  const found = await dv.fetchJson(
    `qdb_reportdefinitions?$select=qdb_reportdefinitionid,qdb_name&$filter=qdb_name eq '${encodeURIComponent(REPORT_NAME)}'`);
  return found.value[0] || null;
}

/** The account with the most contacts, so the child block is not empty. */
async function busiestAccount(dv) {
  const contacts = await dv.fetchJson(
    'contacts?$select=contactid,_parentcustomerid_value&$filter=_parentcustomerid_value ne null&$top=5000');
  const counts = new Map();
  for (const contact of contacts.value) {
    const parent = contact._parentcustomerid_value;
    counts.set(parent, (counts.get(parent) || 0) + 1);
  }

  if (!counts.size) throw new Error('No contact in this organisation has a parent account to scope to.');

  const [accountId, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const account = await dv.fetchJson(`accounts(${accountId})?$select=accountid,name`);
  return { id: account.accountid, name: account.name, contacts: count };
}

async function writeColumns(dv, mappingId, columns) {
  for (const column of columns) {
    await create(dv, 'qdb_reportcolumns', {
      qdb_name: column.display,
      qdb_columnlogicalname: column.logical,
      qdb_outputalias: column.logical,
      qdb_sortorder: column.order,
      qdb_isvisible: true,
      'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${mappingId})`
    });
  }
}

async function seed(dv) {
  const account = await busiestAccount(dv);
  console.log(`  parent account: ${account.name} (${account.contacts} contacts)\n`);

  const report = await create(dv, 'qdb_reportdefinitions', {
    qdb_name: REPORT_NAME,
    qdb_description: 'ADD-002 Phase A: one parent record as a header, with a scoped child dataset.',
    qdb_mainentitylogicalname: 'account',
    qdb_status: STATUS_PUBLISHED,
    qdb_ispublished: true,
    qdb_rowlimit: 100
  });
  const reportId = report.qdb_reportdefinitionid;
  console.log(`  created report ${reportId}`);

  // Filtering to one account is what makes the root a single record — and so a header rather than a
  // one-row table.
  await create(dv, 'qdb_reportfilters', {
    qdb_name: 'accountid',
    qdb_fieldalias: 'accountid',
    qdb_operator: OPERATOR_EQUALS,
    qdb_value: account.id,
    qdb_sequence: 1,
    'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${reportId})`
  });
  console.log('  created filter  accountid = the parent account');

  const root = await create(dv, 'qdb_reportdatasources', {
    qdb_name: 'Account', qdb_isprimary: true, qdb_executionorder: 1, qdb_sourcealias: 't',
    'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${reportId})`
  });
  const rootMapping = await create(dv, 'qdb_reportentitymappings', {
    qdb_name: 'account', qdb_entitylogicalname: 'account', qdb_entityalias: 't', qdb_depth: 0,
    'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${root.qdb_reportdatasourceid})`
  });
  await writeColumns(dv, rootMapping.qdb_reportentitymappingid, ROOT_COLUMNS);
  console.log('  created root    account + 3 columns');

  const block = await create(dv, 'qdb_reportdatasources', {
    qdb_name: 'Contacts at this account',
    qdb_isprimary: false, qdb_executionorder: 2, qdb_sourcealias: 'b1',
    qdb_compositionmode: COMPOSITION_STANDALONE,
    // Child key is the attribute on the CONTACT; parent key is the column the ROOT returns.
    qdb_joinfromkey: 'parentcustomerid',
    qdb_jointokey: 'accountid',
    'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${reportId})`
  });
  const blockMapping = await create(dv, 'qdb_reportentitymappings', {
    qdb_name: 'contact', qdb_entitylogicalname: 'contact', qdb_entityalias: 'b1', qdb_depth: 0,
    'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${block.qdb_reportdatasourceid})`
  });
  await writeColumns(dv, blockMapping.qdb_reportentitymappingid, BLOCK_COLUMNS);
  console.log('  created block   contact + 3 columns, scoped parentcustomerid = accountid');

  // The same table under a block that runs ITS OWN FetchXML (MDS-FR-001): the authored filter keeps
  // only contacts with an email, and the parent scope is merged on top of the authored query — the
  // row count differing from the block above is the observable proof both happened.
  const authored = await create(dv, 'qdb_reportdatasources', {
    qdb_name: 'Contacts with an email (own FetchXML)',
    qdb_isprimary: false, qdb_executionorder: 3, qdb_sourcealias: 'b2',
    qdb_compositionmode: COMPOSITION_STANDALONE,
    qdb_sourcetype: SOURCE_TYPE_FETCHXML,
    qdb_querypayload: AUTHORED_BLOCK_FETCHXML,
    qdb_joinfromkey: 'parentcustomerid',
    qdb_jointokey: 'accountid',
    'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${reportId})`
  });
  const authoredMapping = await create(dv, 'qdb_reportentitymappings', {
    qdb_name: 'contact', qdb_entitylogicalname: 'contact', qdb_entityalias: 'b2', qdb_depth: 0,
    'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${authored.qdb_reportdatasourceid})`
  });
  await writeColumns(dv, authoredMapping.qdb_reportentitymappingid, BLOCK_COLUMNS);
  console.log('  created block   contact via AUTHORED FetchXML, scoped + filtered to has-email');

  // Inline rows: no table, no mapping, no query against the org at all.
  await create(dv, 'qdb_reportdatasources', {
    qdb_name: 'Key ratios (static rows)',
    qdb_isprimary: false, qdb_executionorder: 4, qdb_sourcealias: 'b3',
    qdb_compositionmode: COMPOSITION_STANDALONE,
    qdb_sourcetype: SOURCE_TYPE_STATIC,
    qdb_querypayload: STATIC_BLOCK_ROWS,
    'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${reportId})`
  });
  console.log('  created block   3 static rows, columns derived from the row keys');

  return reportId;
}

async function remove(dv) {
  const existing = await findExistingReport(dv);
  if (!existing) {
    console.log('  Nothing to remove.');
    return;
  }

  await dv.fetchJson(`qdb_reportdefinitions(${existing.qdb_reportdefinitionid})`, { method: 'DELETE' });
  console.log(`  removed "${existing.qdb_name}".`);
}

async function main() {
  const dv = await connect(process.argv[2]);
  console.log(`Master-detail demo on ${dv.baseUrl}\n`);

  if (process.argv.includes('--remove')) {
    await remove(dv);
    return;
  }

  // Replace rather than duplicate: the report is a fixture, not data worth keeping.
  const existing = await findExistingReport(dv);
  if (existing) {
    await dv.fetchJson(`qdb_reportdefinitions(${existing.qdb_reportdefinitionid})`, { method: 'DELETE' });
    console.log('  removed the previous copy');
  }

  const reportId = await seed(dv);
  console.log(`\nDone. Open the runtime viewer and run "${REPORT_NAME}".`);
  console.log('Expect: the account as a HEADER, then one table of its contacts.');
  console.log(`Verify from here: node scripts/verify-multi-dataset-run.mjs <env> --report "${REPORT_NAME}"`);
  console.log(`Report id ${reportId}`);
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
