/**
 * provision-qdb-schema.mjs
 * Provisions the Phase 1 `qdb_` foundation schema, roles and queues.
 *
 * Create-new-then-migrate: this script ADDS `qdb_` components. It never deletes, disables or
 * modifies any `msst_` component, the legacy DA module, `qdb_crmlogs`, QDB masters or shared
 * configuration entities. Retirement is a separate, separately-authorised step.
 *
 * Idempotent: every step skips components that already exist, so a partial run can be resumed.
 *
 * Run:
 *   QDB_OPTION_VALUE_PREFIX=10000 node --env-file="<path>/.env" \
 *     projects/debtcollection/crm/scripts/provision-qdb-schema.mjs
 *
 * Required env: DV_DATAVERSE_URL, DV_API_VERSION, DV_CLIENT_ID, DV_CLIENT_SECRET,
 *               DV_AUTH_MODE (+ DV_TENANT_ID for entra), QDB_OPTION_VALUE_PREFIX
 */

import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';
import { getRootBuId } from './lib/solution.mjs';
import { getQdbPublisherId, ensureQdbSolution, ensureCustomerLookup, ensureAltKey } from './lib/qdb-solution.mjs';
import { buildQdbOptionSetDefs, resolveQdbOptionValueBase } from './lib/qdb-option-set-defs.mjs';
import { ensureOptionSet } from './lib/option-sets.mjs';
import {
  QDB_ENTITY_DEFS, QDB_CONDITIONAL_ENTITY_DEFS, QDB_CUSTOMER_LOOKUPS, QDB_LOOKUPS, QDB_ALT_KEYS,
} from './lib/qdb-entity-defs.mjs';

/** Every DCP-owned qdb_ entity, provisioned or conditional — used to tell ours from system tables. */
const QDB_ALL_DCP_ENTITIES = new Set(
  [...QDB_ENTITY_DEFS, ...QDB_CONDITIONAL_ENTITY_DEFS].map(d => d.LogicalName),
);
import { ensureEntity } from './lib/entities.mjs';
import { ensureRelationship } from './lib/relationships.mjs';
import { buildQdbStatusCodes } from './lib/qdb-status-codes.mjs';
import { statusValueExists, insertStatusValue } from './lib/status-codes.mjs';
import { QDB_ROLE_DEFS } from './lib/qdb-role-defs.mjs';
import { ensureRole, applyRolePrivileges } from './lib/roles.mjs';
import { PHASE1_QUEUES, ensureQueue } from './lib/queues.mjs';

const SOLUTION_NAME = 'qdb_debtcollection';
/** Sandbox this run is authorised for. Any other organisation aborts before the first write. */
const AUTHORISED_ORG_HOST_SEGMENT = 'org5869857f';

const counts = { created: 0, skipped: 0, failed: 0 };
const tally = s => { s === 'created' ? counts.created++ : counts.skipped++; };

async function run(label, fn) {
  try { tally(await fn()); }
  catch (err) { counts.failed++; console.error(`  [FAIL] ${label}: ${err.message}`); }
}

/** Refuses to write to any organisation other than the authorised sandbox. */
function assertAuthorisedOrg(cfg) {
  const host = cfg.orgUrl.replace(/^https?:\/\//, '');
  const segment = host.split('.')[0];
  if (segment !== AUTHORISED_ORG_HOST_SEGMENT) {
    throw new Error(
      `REFUSING TO WRITE. Provisioning is authorised only for '${AUTHORISED_ORG_HOST_SEGMENT}'; ` +
      `this connection targets '${host}'. No production, on-premises, HL or BFD organisation may be modified.`,
    );
  }
  console.log(`  Organisation guard: ${host} — authorised sandbox.`);
}

// ── steps ─────────────────────────────────────────────────────────────────────

async function provisionOptionSets(cfg, token, optionSetDefs) {
  console.log('\n─── Global Option Sets ──────────────────────────────────────');
  for (const def of optionSetDefs) await run(def.name, () => ensureOptionSet(cfg, token, SOLUTION_NAME, def));
}

async function provisionEntities(cfg, token) {
  console.log('\n─── Entities ────────────────────────────────────────────────');
  for (const def of QDB_ENTITY_DEFS) await run(def.LogicalName, () => ensureEntity(cfg, token, SOLUTION_NAME, def));
}

async function provisionCustomerLookups(cfg, token) {
  console.log('\n─── Customer lookups (contact + account) ────────────────────');
  const provisioned = new Set(QDB_ENTITY_DEFS.map(d => d.LogicalName));
  for (const def of QDB_CUSTOMER_LOOKUPS) {
    const referencing = def.body?.OneToManyRelationships?.[0]?.ReferencingEntity;
    const name = def.body?.Lookup?.LogicalName ?? 'customer lookup';
    // qdb_consent is a CONDITIONAL entity and is not provisioned in Phase 1, so its lookup is skipped
    // rather than attempted against a table that does not exist.
    if (!provisioned.has(referencing)) {
      console.log(`  [SKIP] Customer lookup ${referencing}.${name} — ${referencing} is not provisioned in Phase 1`);
      counts.skipped++;
      continue;
    }
    await run(name, () => ensureCustomerLookup(cfg, token, SOLUTION_NAME, def));
  }
}

async function provisionRelationships(cfg, token) {
  console.log('\n─── Relationships ───────────────────────────────────────────');
  const provisioned = new Set(QDB_ENTITY_DEFS.map(d => d.LogicalName));
  const isQdbDcp = name => name.startsWith('qdb_') && QDB_ALL_DCP_ENTITIES.has(name);
  for (const def of QDB_LOOKUPS) {
    // Skip relationships whose ends include a DCP entity we are not provisioning in Phase 1
    // (qdb_consent is conditional). System entities such as team/systemuser are always present.
    const ends = [def.ReferencingEntity, def.ReferencedEntity];
    const missing = ends.filter(e => isQdbDcp(e) && !provisioned.has(e));
    if (missing.length) {
      console.log(`  [SKIP] Relationship ${def.SchemaName} — ${missing.join(', ')} not provisioned in Phase 1`);
      counts.skipped++;
      continue;
    }
    await run(def.SchemaName, () => ensureRelationship(cfg, token, SOLUTION_NAME, def));
  }
}

async function provisionStatusCodes(cfg, token, statusCodes) {
  console.log('\n─── Status codes ────────────────────────────────────────────');
  for (const { entity, values } of statusCodes) {
    for (const entry of values) {
      await run(`${entity} ${entry.label}`, async () => {
        if (await statusValueExists(cfg, token, SOLUTION_NAME, entity, entry.value)) {
          console.log(`  [SKIP] ${entity} statuscode ${entry.value} (${entry.label})`);
          return 'skipped';
        }
        await insertStatusValue(cfg, token, SOLUTION_NAME, entity, entry);
        console.log(`  [CREATED] ${entity} statuscode ${entry.value} (${entry.label})`);
        return 'created';
      });
    }
  }
}

async function provisionAltKeys(cfg, token) {
  console.log('\n─── Alternate keys ──────────────────────────────────────────');
  for (const key of QDB_ALT_KEYS) await run(key.schemaName, () => ensureAltKey(cfg, token, SOLUTION_NAME, key));
}

async function provisionRoles(cfg, token, rootBuId) {
  console.log('\n─── Security roles ──────────────────────────────────────────');
  for (const roleDef of QDB_ROLE_DEFS) {
    await run(roleDef.name, async () => {
      const { roleId, status } = await ensureRole(cfg, token, SOLUTION_NAME, roleDef.name, rootBuId);
      await applyRolePrivileges(cfg, token, SOLUTION_NAME, roleId, roleDef.privileges);
      return status;
    });
  }
}

async function provisionQueues(cfg, token) {
  console.log('\n─── Queues ──────────────────────────────────────────────────');
  for (const name of PHASE1_QUEUES) await run(`queue ${name}`, () => ensureQueue(cfg, token, SOLUTION_NAME, name));
}

async function publishAll(cfg, token) {
  console.log('\n─── Publish all customizations ──────────────────────────────');
  // A failed publish can exit without surfacing; retry and report explicitly.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await apiPost(cfg, token, SOLUTION_NAME, '/PublishAllXml', {});
      console.log('  Published.');
      return;
    } catch (err) {
      console.warn(`  [WARN] PublishAllXml attempt ${attempt} failed: ${err.message}`);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function verify(cfg, token) {
  console.log('\n─── Verification ────────────────────────────────────────────');
  const result = await apiGet(cfg, token, SOLUTION_NAME, '/EntityDefinitions?$select=LogicalName,IsValidForQueue');
  const all = result?.value ?? [];
  const qdbDcp = all.filter(e => QDB_ENTITY_DEFS.some(d => d.LogicalName === e.LogicalName));
  console.log(`  qdb_ DCP entities present: ${qdbDcp.length}/${QDB_ENTITY_DEFS.length}`);
  qdbDcp.sort((a, b) => a.LogicalName.localeCompare(b.LogicalName))
    .forEach(e => console.log(`    ${e.LogicalName}${e.LogicalName === 'qdb_collectioncase' ? `  IsValidForQueue=${e.IsValidForQueue?.Value ?? e.IsValidForQueue}` : ''}`));

  // Untouched-baseline re-check (checks 5–7 of the pre-provisioning safety check).
  const msst = all.filter(e => e.LogicalName.startsWith('msst_dcp')).length;
  const crmlogs = await apiGet(cfg, token, SOLUTION_NAME, "/EntityDefinitions(LogicalName='qdb_crmlogs')/Attributes?$select=LogicalName");
  const crmlogsQdbCols = (crmlogs?.value ?? []).filter(a => a.LogicalName.startsWith('qdb_')).length;
  console.log(`  Baseline re-check — msst_dcp* entities: ${msst} (expect 11); qdb_crmlogs qdb_ columns: ${crmlogsQdbCols} (expect 12, unextended)`);
  return { qdbCount: qdbDcp.length, msst, crmlogsQdbCols };
}

// ── entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log('DCP Phase 1 — qdb_ Foundation Provisioning');
  console.log('===========================================');

  const cfg = loadConfig();
  console.log(`\nOrg: ${cfg.orgUrl}  (Web API v${cfg.apiVersion}, auth=${cfg.authMode})`);
  assertAuthorisedOrg(cfg);

  const base = resolveQdbOptionValueBase();
  console.log(`  Option-value base: ${base} (QDB_OPTION_VALUE_PREFIX)`);
  const optionSetDefs = buildQdbOptionSetDefs(base);
  const statusCodes = buildQdbStatusCodes(base);

  const token = await acquireToken(cfg);
  console.log('  Token acquired.');

  const publisherId = await getQdbPublisherId(cfg, token, SOLUTION_NAME);
  const rootBuId = await getRootBuId(cfg, token, SOLUTION_NAME);
  await ensureQdbSolution(cfg, token, SOLUTION_NAME, publisherId);

  await provisionOptionSets(cfg, token, optionSetDefs);
  await provisionEntities(cfg, token);
  await provisionCustomerLookups(cfg, token);
  await provisionRelationships(cfg, token);
  await provisionStatusCodes(cfg, token, statusCodes);
  await provisionAltKeys(cfg, token);
  await provisionRoles(cfg, token, rootBuId);
  await provisionQueues(cfg, token);
  await publishAll(cfg, token);
  const v = await verify(cfg, token);

  console.log('\n===========================================');
  console.log(`Created: ${counts.created}  Skipped: ${counts.skipped}  Failed: ${counts.failed}`);
  if (v.msst !== 11) console.error(`[ERROR] msst_ baseline changed: expected 11 entities, found ${v.msst}`);
  if (v.crmlogsQdbCols !== 12) console.error(`[ERROR] qdb_crmlogs was modified: expected 12 qdb_ columns, found ${v.crmlogsQdbCols}`);
  if (counts.failed > 0 || v.qdbCount < QDB_ENTITY_DEFS.length) {
    console.log('\nIncomplete — re-run to resume (the script is idempotent).');
    process.exit(1);
  }
  console.log('\nProvisioning complete.');
}

main().catch(err => { console.error(`[FATAL] ${err.message}`); process.exit(1); });
