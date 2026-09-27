/* Adds a STANDALONE dataset to an existing report so ADD-002 Phase A can be tested in the org.
 *
 * The block queries `contact` while the report's root queries something else, which is the point:
 * a standalone dataset has its own entity, its own columns and its own rows, and appears as its own
 * table rather than joining the root.
 *
 * Idempotent — it will not add a second copy. Undo with --remove, which deletes only what this
 * script created.
 *
 * Usage: node seed-multi-dataset-demo.mjs <path-to-.env> [--report "<name>"] [--remove]
 */
import { connect } from './lib/dataverse.mjs';

const BLOCK_NAME = 'Contacts (standalone block)';
const COMPOSITION_STANDALONE = 100000001;
const DEFAULT_REPORT = 'Demo — everything at once';

const COLUMNS = [
  { logical: 'fullname', display: 'Full name', order: 1 },
  { logical: 'emailaddress1', display: 'Email', order: 2 },
  { logical: 'jobtitle', display: 'Job title', order: 3 }
];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : null;
}

async function findReport(dv, name) {
  const escaped = name.replace(/'/g, "''");
  const found = await dv.fetchJson(
    `qdb_reportdefinitions?$select=qdb_reportdefinitionid,qdb_name&$filter=qdb_name eq '${encodeURIComponent(escaped)}'`);
  if (found.value.length) return found.value[0];

  const all = await dv.fetchJson('qdb_reportdefinitions?$select=qdb_name&$top=50');
  throw new Error(`No report named "${name}". Available:\n    ` + all.value.map(r => r.qdb_name).join('\n    '));
}

async function findBlock(dv, reportId) {
  const found = await dv.fetchJson(
    `qdb_reportdatasources?$select=qdb_reportdatasourceid,qdb_name`
    + `&$filter=_qdb_reportdefinitionid_value eq ${reportId} and qdb_name eq '${encodeURIComponent(BLOCK_NAME)}'`);
  return found.value[0] || null;
}

const create = (dv, set, body) => dv.fetchJson(set, {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify(body)
});

async function seed(dv, report) {
  if (await findBlock(dv, report.qdb_reportdefinitionid)) {
    console.log(`  The block already exists on "${report.qdb_name}" — nothing to do.`);
    return;
  }

  /* The binding property is Qdb_reportdefinitionid with a CAPITAL Q. The lower-case form is silently
     not a navigation property and the create fails in a way that reads like a missing table. */
  const source = await create(dv, 'qdb_reportdatasources', {
    qdb_name: BLOCK_NAME,
    qdb_executionorder: 2,
    qdb_isprimary: false,
    qdb_compositionmode: COMPOSITION_STANDALONE,
    'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${report.qdb_reportdefinitionid})`
  });
  console.log(`  created data source  ${source.qdb_reportdatasourceid}  (Standalone)`);

  const mapping = await create(dv, 'qdb_reportentitymappings', {
    qdb_name: 'contact',
    qdb_entitylogicalname: 'contact',
    qdb_depth: 0,
    'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${source.qdb_reportdatasourceid})`
  });
  console.log(`  created entity mapping  contact`);

  // Columns hang off the ENTITY MAPPING, not the report — filtering them by report id returns a 400.
  for (const column of COLUMNS) {
    await create(dv, 'qdb_reportcolumns', {
      qdb_name: column.display,
      qdb_columnlogicalname: column.logical,
      qdb_sortorder: column.order,
      qdb_isvisible: true,
      'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${mapping.qdb_reportentitymappingid})`
    });
    console.log(`  created column  ${column.logical}`);
  }
}

async function remove(dv, report) {
  const block = await findBlock(dv, report.qdb_reportdefinitionid);
  if (!block) {
    console.log('  No seeded block found — nothing to remove.');
    return;
  }

  // Cascade takes the mappings and columns with it; deleting the source alone is enough.
  await dv.fetchJson(`qdb_reportdatasources(${block.qdb_reportdatasourceid})`, { method: 'DELETE' });
  console.log(`  removed the standalone block from "${report.qdb_name}".`);
}

async function main() {
  const dv = await connect(process.argv[2]);
  const report = await findReport(dv, argValue('--report') || DEFAULT_REPORT);
  console.log(`Report "${report.qdb_name}" (${report.qdb_reportdefinitionid})\n`);

  if (process.argv.includes('--remove')) {
    await remove(dv, report);
    return;
  }

  await seed(dv, report);
  console.log('\nRun the report in the runtime viewer. It should now draw TWO tables:');
  console.log('  the root block, then a second headed "Contacts (standalone block)".');
  console.log('Undo with: node seed-multi-dataset-demo.mjs <env> --remove');
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
