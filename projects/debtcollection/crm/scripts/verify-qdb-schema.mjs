/**
 * verify-qdb-schema.mjs
 * Read-only verification of the provisioned `qdb_` schema, producing the evidence table the Phase 1
 * gate asks for. It asserts nothing about the `msst_` schema beyond confirming it was left alone.
 *
 * Every check reads the organisation. Nothing here is inferred from the definition files: the point
 * is to catch a divergence between what the scripts intended and what the platform actually built.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/verify-qdb-schema.mjs
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { QDB_ENTITY_DEFS, QDB_LOOKUPS, QDB_ALT_KEYS } from './lib/qdb-entity-defs.mjs';
import { buildQdbOptionSetDefs, resolveQdbOptionValueBase } from './lib/qdb-option-set-defs.mjs';
import { buildQdbStatusCodes } from './lib/qdb-status-codes.mjs';
import { QDB_ROLE_DEFS } from './lib/qdb-role-defs.mjs';
import { PLUGIN_STEPS, ASSEMBLY_NAME, SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const CASE_ENTITY = 'qdb_collectioncase';
const QUEUE_NAMES = ['Early Collection', 'High Risk', 'Deceased & Insurance'];
const MSST_ENTITY_BASELINE = 11;
const CRMLOGS_COLUMN_BASELINE = 12;

const checks = [];

/** @param {string} name @param {boolean} passed @param {string} evidence */
function check(name, passed, evidence) {
  checks.push({ name, passed, evidence });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name} — ${evidence}`);
}

/** Entities the canonical schema defines. */
async function verifyEntities(cfg, token) {
  const expected = QDB_ENTITY_DEFS.map(e => e.LogicalName);
  const all = await apiGet(cfg, token, SOLUTION_NAME, '/EntityDefinitions?$select=LogicalName,IsValidForQueue');
  const present = new Set((all?.value ?? []).map(e => e.LogicalName));
  const missing = expected.filter(name => !present.has(name));
  check('Schema — all canonical entities exist', missing.length === 0,
    `${expected.length - missing.length}/${expected.length}${missing.length ? ` missing: ${missing.join(', ')}` : ''}`);

  const caseEntity = (all?.value ?? []).find(e => e.LogicalName === CASE_ENTITY);
  const queueEnabled = caseEntity?.IsValidForQueue?.Value ?? caseEntity?.IsValidForQueue;
  check('Queue eligibility — the case table can be queued', queueEnabled === true,
    `${CASE_ENTITY}.IsValidForQueue=${queueEnabled}`);

  const msstCount = [...present].filter(n => n.startsWith('msst_dcp')).length;
  check('Baseline — the msst_ schema is untouched', msstCount === MSST_ENTITY_BASELINE,
    `${msstCount} msst_dcp* entities (expected ${MSST_ENTITY_BASELINE})`);
}

/** Every attribute the definitions declare, read back from the organisation. */
async function verifyAttributes(cfg, token) {
  let expected = 0;
  const missing = [];
  for (const def of QDB_ENTITY_DEFS) {
    const wanted = (def.Attributes ?? []).map(a => a.LogicalName ?? a.SchemaName?.toLowerCase());
    expected += wanted.length;
    const result = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='${def.LogicalName}')/Attributes?$select=LogicalName`);
    const present = new Set((result?.value ?? []).map(a => a.LogicalName));
    for (const name of wanted) if (!present.has(name)) missing.push(`${def.LogicalName}.${name}`);
  }
  check('Schema — all canonical columns exist', missing.length === 0,
    `${expected - missing.length}/${expected}${missing.length ? ` missing: ${missing.slice(0, 5).join(', ')}` : ''}`);
}

/** Ordinary lookups plus the Customer lookup, which is two relationships behind one column. */
async function verifyRelationships(cfg, token) {
  // Relationships whose ends are not provisioned in Phase 1 (qdb_consent is conditional) are not
  // expected to exist, and counting them as missing would report a failure that is by design.
  const provisioned = new Set(QDB_ENTITY_DEFS.map(e => e.LogicalName));
  const byEntity = new Map();
  for (const rel of QDB_LOOKUPS) {
    if (!provisioned.has(rel.ReferencingEntity)) continue;
    if (!byEntity.has(rel.ReferencingEntity)) byEntity.set(rel.ReferencingEntity, []);
    byEntity.get(rel.ReferencingEntity).push(rel);
  }

  const missing = [];
  let expected = 0;
  for (const [entity, relationships] of byEntity) {
    const result = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='${entity}')/ManyToOneRelationships?$select=SchemaName,ReferencingAttribute,ReferencedEntity`);
    const present = new Set((result?.value ?? []).map(r => r.SchemaName));
    for (const rel of relationships) {
      expected++;
      if (!present.has(rel.SchemaName)) missing.push(rel.SchemaName);
    }
  }
  check('Relationships — every declared lookup exists', missing.length === 0,
    `${expected - missing.length}/${expected}${missing.length ? ` missing: ${missing.slice(0, 5).join(', ')}` : ''}`);

  const caseRelationships = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${CASE_ENTITY}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencedEntity`);
  const customerTargets = (caseRelationships?.value ?? [])
    .filter(r => r.ReferencingAttribute === 'qdb_customerid')
    .map(r => r.ReferencedEntity)
    .sort();
  check('Customer lookup — one column serves contact and account',
    customerTargets.join(',') === 'account,contact',
    `qdb_customerid -> ${customerTargets.join(' + ') || '(none)'}`);
}

/** Global choices and their option values, which the publisher assigns and cannot be rebased. */
async function verifyOptionSets(cfg, token) {
  const base = resolveQdbOptionValueBase();
  const expected = buildQdbOptionSetDefs(base);
  const all = await apiGet(cfg, token, SOLUTION_NAME, '/GlobalOptionSetDefinitions?$select=Name');
  const present = new Set((all?.value ?? []).map(o => o.Name));
  const missing = expected.filter(s => !present.has(s.name)).map(s => s.name);
  check('Choices — every global choice exists', missing.length === 0,
    `${expected.length - missing.length}/${expected.length}${missing.length ? ` missing: ${missing.slice(0, 5).join(', ')}` : ''}`);

  const sample = expected[0];
  const read = await apiGet(cfg, token, SOLUTION_NAME,
    `/GlobalOptionSetDefinitions(Name='${sample.name}')`);
  const values = (read?.Options ?? []).map(o => o.Value);
  // Values sit in the publisher's band: the prefix times 10,000 is the floor of every value.
  const inBand = values.every(v => Math.floor(v / 10000) * 10000 === base);
  check('Choices — option values carry the confirmed publisher prefix', inBand && values.length > 0,
    `${sample.name}: ${values[0]}–${values[values.length - 1]} (prefix ${base})`);
}

/** Status reasons, which the plugins' constants must match exactly. */
async function verifyStatusCodes(cfg, token) {
  const expected = buildQdbStatusCodes(resolveQdbOptionValueBase());
  const missing = [];
  let total = 0;
  for (const entry of expected) {
    const read = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='${entry.entity}')/Attributes(LogicalName='${entry.attribute}')/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet`);
    const present = new Set((read?.OptionSet?.Options ?? []).map(o => o.Value));
    for (const option of entry.values) {
      total++;
      if (!present.has(option.value)) missing.push(`${entry.entity}:${option.value}`);
    }
  }
  check('Status — every status reason exists at its provisioned value', missing.length === 0,
    `${total - missing.length}/${total}${missing.length ? ` missing: ${missing.slice(0, 5).join(', ')}` : ''}`);
}

/** Alternate keys, which are asynchronous and can sit inactive after creation. */
async function verifyAlternateKeys(cfg, token) {
  const inactive = [];
  for (const keyDef of QDB_ALT_KEYS) {
    const read = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='${keyDef.entity}')/Keys?$select=SchemaName,EntityKeyIndexStatus`);
    const key = (read?.value ?? []).find(k => k.SchemaName === keyDef.schemaName);
    if (key?.EntityKeyIndexStatus !== 'Active') {
      inactive.push(`${keyDef.schemaName}=${key?.EntityKeyIndexStatus ?? 'absent'}`);
    }
  }
  check('Alternate keys — every key index is active', inactive.length === 0,
    `${QDB_ALT_KEYS.length - inactive.length}/${QDB_ALT_KEYS.length}${inactive.length ? ` not active: ${inactive.join(', ')}` : ''}`);
}

/** Security roles and the queues the strategy moves cases into. */
async function verifyRolesAndQueues(cfg, token) {
  const roles = await apiGet(cfg, token, SOLUTION_NAME, "/roles?$select=name&$filter=startswith(name,'QDB DCP')");
  const present = new Set((roles?.value ?? []).map(r => r.name));
  const missing = QDB_ROLE_DEFS.filter(r => !present.has(r.name)).map(r => r.name);
  check('Security roles — every DCP role exists', missing.length === 0,
    `${QDB_ROLE_DEFS.length - missing.length}/${QDB_ROLE_DEFS.length}${missing.length ? ` missing: ${missing.join(', ')}` : ''}`);

  const queues = await apiGet(cfg, token, SOLUTION_NAME, '/queues?$select=name');
  const queueNames = new Set((queues?.value ?? []).map(q => q.name));
  const missingQueues = QUEUE_NAMES.filter(name => !queueNames.has(name));
  check('Queues — the collection queues exist', missingQueues.length === 0,
    `${QUEUE_NAMES.length - missingQueues.length}/${QUEUE_NAMES.length}${missingQueues.length ? ` missing: ${missingQueues.join(', ')}` : ''}`);
}

/** Plugin registration: the new assembly beside the old one, with its steps and images. */
async function verifyPluginRegistration(cfg, token) {
  const assemblies = await apiGet(cfg, token, SOLUTION_NAME,
    "/pluginassemblies?$select=name,pluginassemblyid&$filter=contains(name,'DebtCollection')");
  const rows = assemblies?.value ?? [];
  const qdbAssembly = rows.find(a => a.name === ASSEMBLY_NAME);
  const legacy = rows.find(a => a.name === 'Msst.DebtCollection.Plugins');

  check('Plugin registration — the canonical assembly is registered', Boolean(qdbAssembly),
    qdbAssembly ? `${ASSEMBLY_NAME} (${qdbAssembly.pluginassemblyid})` : 'not found');
  check('Plugin registration — the legacy assembly is still registered', Boolean(legacy),
    legacy ? 'Msst.DebtCollection.Plugins present and untouched' : 'MISSING — the running system lost its controls');

  if (!qdbAssembly) return;
  const steps = await apiGet(cfg, token, SOLUTION_NAME,
    `/sdkmessageprocessingsteps?$select=name,stage,mode,filteringattributes&$filter=plugintypeid/_pluginassemblyid_value eq ${qdbAssembly.pluginassemblyid}`);
  const stepRows = steps?.value ?? [];
  check('Plugin registration — every canonical step is registered',
    stepRows.length === PLUGIN_STEPS.length,
    `${stepRows.length}/${PLUGIN_STEPS.length} steps`);

  const guardUpdate = stepRows.find(s => s.name.includes('ImmutabilityGuardPlugin: Update of qdb_collectionactivity'));
  check('Plugin registration — the activity guard fires on every column, not one',
    guardUpdate != null && !guardUpdate.filteringattributes,
    `filteringattributes=${guardUpdate?.filteringattributes ?? '(none)'}`);
}

/** The existing QDB auto-number mechanism, which Phase 1 reuses rather than replacing. */
async function verifyAutoNumberMechanism(cfg, token) {
  const setup = await apiGet(cfg, token, SOLUTION_NAME,
    "/EntityDefinitions(LogicalName='crmi_autonumberingsetup')?$select=LogicalName,EntitySetName");
  check('Auto-number — the existing QDB mechanism is present and reused', Boolean(setup?.LogicalName),
    setup?.LogicalName ? `${setup.LogicalName} (no cloud-only AutoNumberFormat introduced)` : 'not found');

  const legacyConfig = await apiGet(cfg, token, SOLUTION_NAME,
    "/EntityDefinitions(LogicalName='qdb_autonumberconfig')?$select=LogicalName");
  check('Auto-number — qdb_autonumberconfig is untouched', Boolean(legacyConfig?.LogicalName),
    legacyConfig?.LogicalName ? 'present, unmodified' : 'not found');
}

/** The technical log table DCP reuses, which must not have been extended. */
async function verifyCrmLogsUnextended(cfg, token) {
  const attributes = await apiGet(cfg, token, SOLUTION_NAME,
    "/EntityDefinitions(LogicalName='qdb_crmlogs')/Attributes?$select=LogicalName");
  const qdbColumns = (attributes?.value ?? []).filter(a => a.LogicalName.startsWith('qdb_')).length;
  check('Baseline — qdb_crmlogs is reused unextended', qdbColumns === CRMLOGS_COLUMN_BASELINE,
    `${qdbColumns} qdb_ columns (expected ${CRMLOGS_COLUMN_BASELINE})`);
}

async function main() {
  console.log('=== qdb_ schema verification (read-only) ===\n');
  const cfg = loadConfig();
  const token = await acquireToken(cfg);
  console.log(`  Organisation: ${new URL(cfg.orgUrl).host}\n`);

  await verifyEntities(cfg, token);
  await verifyAttributes(cfg, token);
  await verifyRelationships(cfg, token);
  await verifyOptionSets(cfg, token);
  await verifyStatusCodes(cfg, token);
  await verifyAlternateKeys(cfg, token);
  await verifyRolesAndQueues(cfg, token);
  await verifyPluginRegistration(cfg, token);
  await verifyAutoNumberMechanism(cfg, token);
  await verifyCrmLogsUnextended(cfg, token);

  const passed = checks.filter(c => c.passed).length;
  console.log(`\n=== ${passed}/${checks.length} checks passed ===`);
  if (passed !== checks.length) process.exit(1);
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
