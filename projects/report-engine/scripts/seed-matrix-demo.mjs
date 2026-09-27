/* Creates an AUTHORED-MATRIX report (D4): contacts counted by account × job title. The query is the
 * engine's existing aggregate mode (a Count measure turns every other column into a group-by); the
 * matrix arrangement rides in the layout JSON, composed exactly as the designer would compose it.
 *
 * Idempotent — re-running replaces the report it created. Remove it with --remove.
 *
 * Usage: node seed-matrix-demo.mjs <path-to-.env> [--remove]
 */
import { connect } from './lib/dataverse.mjs';

const REPORT_NAME = 'Matrix demo — Contacts by account and job title';
const STATUS_PUBLISHED = 100000001;
const AGG_COUNT = 100000002;

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

async function seed(dv) {
  const report = await create(dv, 'qdb_reportdefinitions', {
    qdb_name: REPORT_NAME,
    qdb_description: 'D4: authored row group (account), column group (job title), Count value.',
    qdb_mainentitylogicalname: 'contact',
    qdb_status: STATUS_PUBLISHED,
    qdb_ispublished: true,
    qdb_rowlimit: 5000
  });
  const reportId = report.qdb_reportdefinitionid;
  console.log(`  created report  ${reportId}`);

  const source = await create(dv, 'qdb_reportdatasources', {
    qdb_name: 'Contacts', qdb_isprimary: true, qdb_executionorder: 1, qdb_sourcealias: 't',
    'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${reportId})`
  });
  const mapping = await create(dv, 'qdb_reportentitymappings', {
    qdb_name: 'contact', qdb_entitylogicalname: 'contact', qdb_entityalias: 't', qdb_depth: 0,
    'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${source.qdb_reportdatasourceid})`
  });

  const columns = [
    { logical: 'parentcustomerid', display: 'Account', order: 1, groupOrder: 1 },
    { logical: 'jobtitle', display: 'Job title', order: 2, groupOrder: 2 },
    { logical: 'contactid', display: 'Contacts', order: 3, aggregate: AGG_COUNT }
  ];
  for (const column of columns) {
    await create(dv, 'qdb_reportcolumns', {
      qdb_name: column.display,
      qdb_columnlogicalname: column.logical,
      qdb_outputalias: column.logical,
      qdb_sortorder: column.order,
      qdb_grouporder: column.groupOrder,
      qdb_aggregatefunction: column.aggregate,
      qdb_isvisible: true,
      'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${mapping.qdb_reportentitymappingid})`
    });
  }
  console.log('  created columns account (group 1) × job title (group 2), Count(contactid) measure');

  // The layout JSON exactly as the designer composes it: the arrangement plus an authored Sum
  // under the value column, so the matrix carries a grand row of total contacts.
  await create(dv, 'qdb_reportlayouts', {
    qdb_name: 'Layout',
    qdb_layoutjson: JSON.stringify({
      type: 'Matrix (Cross Tab)',
      matrix: { rowGroups: ['parentcustomerid'], columnGroups: ['jobtitle'], values: ['contactid'] },
      totals: { contactid: 'Sum' }
    }),
    'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${reportId})`
  });
  console.log('  created layout  Matrix (Cross Tab) + authored arrangement + Sum grand row');

  return reportId;
}

async function remove(dv) {
  const existing = await findExistingReport(dv);
  if (!existing) { console.log('  Nothing to remove.'); return; }
  await dv.fetchJson(`qdb_reportdefinitions(${existing.qdb_reportdefinitionid})`, { method: 'DELETE' });
  console.log(`  removed "${existing.qdb_name}".`);
}

async function main() {
  const dv = await connect(process.argv[2]);
  console.log(`Matrix demo on ${dv.baseUrl}\n`);

  if (process.argv.includes('--remove')) { await remove(dv); return; }

  const existing = await findExistingReport(dv);
  if (existing) {
    await dv.fetchJson(`qdb_reportdefinitions(${existing.qdb_reportdefinitionid})`, { method: 'DELETE' });
    console.log('  removed the previous copy');
  }

  const reportId = await seed(dv);
  console.log(`\nDone. Run "${REPORT_NAME}" in the viewer — accounts down, job titles across.`);
  console.log(`Report id ${reportId}`);
}

await main();
