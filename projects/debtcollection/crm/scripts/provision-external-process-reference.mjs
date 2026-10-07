/**
 * provision-external-process-reference.mjs — the schema transition approved 2026-09-29
 * (docs/ExternalProcessReference.md), in two separately-run stages.
 *
 *   --add      Adds qdb_relatedrecordorganization and qdb_relatedrecordnumber to
 *              qdb_collectionactivity (definitions in lib/qdb-entity-defs.mjs). Idempotent.
 *   --retire   Removes the same-organisation lookups qdb_complaintcaseid and qdb_legalrequestid —
 *              ONLY after proving, at run time, that no row holds a value in either and that nothing
 *              but a system form depends on them. Run provision-dcp-app-ux.mjs --only=qdb_collectionactivity
 *              first so the regenerated form no longer carries them. Refuses otherwise; destroys no data.
 *   --dry-run  Reports what would happen and writes nothing.
 *
 * Sandbox only (org5869857f). Publishes once at the end.
 */
import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';
import { ensureAttribute } from './lib/entities.mjs';
import { QDB_ENTITY_DEFS } from './lib/qdb-entity-defs.mjs';

const SOLUTION_NAME = 'qdb_debtcollection';
const AUTHORISED_ORG = 'org5869857f';
const ENTITY = 'qdb_collectionactivity';
const NEW_COLUMNS = ['qdb_relatedrecordorganization', 'qdb_relatedrecordnumber'];
const RETIRED_LOOKUPS = ['qdb_complaintcaseid', 'qdb_legalrequestid'];
const SYSTEM_FORM_COMPONENT = 60;
const isDryRun = process.argv.includes('--dry-run');

const cfg = loadConfig();
if (!cfg.orgUrl.includes(AUTHORISED_ORG)) { console.error(`Refusing: ${cfg.orgUrl} is not ${AUTHORISED_ORG}`); process.exit(1); }
const token = await acquireToken(cfg);

async function addColumns() {
  const definition = QDB_ENTITY_DEFS.find(d => d.LogicalName === ENTITY);
  for (const name of NEW_COLUMNS) {
    const attribute = definition.Attributes.find(a => a.LogicalName === name);
    if (!attribute) throw new Error(`${name} is not defined in qdb-entity-defs.mjs`);
    if (isDryRun) { console.log(`  [DRY] would ensure ${ENTITY}.${name}`); continue; }
    const outcome = await ensureAttribute(cfg, token, SOLUTION_NAME, { entityName: ENTITY, attribute });
    if (outcome === 'skipped') console.log(`  [SKIP] ${ENTITY}.${name} exists`);
  }
}

/** Proves a lookup can go: no values, and no dependency other than a system form that no longer shows it. */
async function proveRetirable(lookup) {
  const count = await apiGet(cfg, token, null, `/qdb_collectionactivities?$select=activityid&$top=1&$count=true&$filter=_${lookup}_value ne null`);
  if (count['@odata.count'] !== 0) throw new Error(`${lookup}: ${count['@odata.count']} row(s) hold a value — migrate before retiring`);
  const meta = await apiGet(cfg, token, null, `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${lookup}')?$select=MetadataId`);
  const dependencies = await apiGet(cfg, token, null, `/RetrieveDependenciesForDelete(ObjectId=${meta.MetadataId},ComponentType=2)`);
  const blocking = dependencies.value.filter(d => d.dependentcomponenttype !== SYSTEM_FORM_COMPONENT);
  const forms = dependencies.value.length - blocking.length;
  if (blocking.length > 0) throw new Error(`${lookup}: non-form dependencies ${blocking.map(d => d.dependentcomponenttype).join(',')}`);
  if (forms > 0) throw new Error(`${lookup}: still on ${forms} form(s) — run provision-dcp-app-ux.mjs --only=${ENTITY} first`);
  console.log(`  [PROVED] ${lookup}: 0 values, no dependencies`);
  return meta.MetadataId;
}

async function retireLookups() {
  for (const lookup of RETIRED_LOOKUPS) {
    const exists = await apiGet(cfg, token, null, `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes?$select=LogicalName&$filter=LogicalName eq '${lookup}'`);
    if (exists.value.length === 0) { console.log(`  [SKIP] ${lookup} already retired`); continue; }
    await proveRetirable(lookup);
    if (isDryRun) { console.log(`  [DRY] would delete ${ENTITY}.${lookup}`); continue; }
    const response = await fetch(`${cfg.apiBase}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${lookup}')`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'MSCRM.SolutionUniqueName': SOLUTION_NAME },
    });
    if (!response.ok) throw new Error(`delete ${lookup} → ${response.status}: ${(await response.text()).slice(0, 300)}`);
    console.log(`  [RETIRED] ${ENTITY}.${lookup}`);
  }
}

if (process.argv.includes('--add')) await addColumns();
if (process.argv.includes('--retire')) await retireLookups();
if (!isDryRun && (process.argv.includes('--add') || process.argv.includes('--retire'))) {
  await apiPost(cfg, token, SOLUTION_NAME, '/PublishXml', { ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>` });
  console.log('  [PUBLISHED] qdb_collectionactivity');
}
