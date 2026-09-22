/**
 * provision-schema.mjs
 * Provisions the DCP Phase 1 CRM schema and security roles on the sandbox.
 * Idempotent: re-running skips existing components and reports counts.
 * Targets on-prem D365 CE 9.x and Dataverse (no cloud-only features).
 *
 * Run:
 *   node --env-file="<path>/.env" projects/debtcollection/crm/scripts/provision-schema.mjs
 *
 * Required env vars: DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET, DV_DATAVERSE_URL
 */

import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';
import { getPublisherId, getRootBuId, ensureSolution } from './lib/solution.mjs';
import { OPTION_SET_DEFS } from './lib/option-set-defs.mjs';
import { ensureOptionSet } from './lib/option-sets.mjs';
import { ENTITY_DEFS } from './lib/entity-defs.mjs';
import { ensureEntity } from './lib/entities.mjs';
import { ensureCaseStatusCodes, ensurePtpStatusCodes } from './lib/status-codes.mjs';
import { PHASE1_QUEUES, ensureQueue } from './lib/queues.mjs';
import { RELATIONSHIP_DEFS } from './lib/relationship-defs.mjs';
import { ensureRelationship } from './lib/relationships.mjs';
import { ensureQidAltKey } from './lib/alt-keys.mjs';
import { ROLE_DEFS, PII_COLUMNS } from './lib/role-defs.mjs';
import { ensureRole, applyRolePrivileges } from './lib/roles.mjs';
import { ensureFieldSecProfile, ensureFieldPermission } from './lib/field-security.mjs';

// Architecture document named this MsstDebtCollection but Dataverse uniquename validation
// requires the exact publisher prefix (msst) in lowercase at the start — so msst_debtcollection.
// MssCmsEngine is a grandfathered name; new solutions must start with msst_ (lowercase).
const SOLUTION_NAME = 'msst_debtcollection';

/** @type {{ created: number, skipped: number, failed: number }} */
const counts = { created: 0, skipped: 0, failed: 0 };

/** @param {'created'|'skipped'} status */
function tally(status) { status === 'created' ? counts.created++ : counts.skipped++; }

/** @param {string} label @param {() => Promise<'created'|'skipped'>} fn */
async function run(label, fn) {
  try { tally(await fn()); }
  catch (err) { counts.failed++; console.error(`  [FAIL] ${label}: ${err.message}`); }
}

// ── Phase steps ───────────────────────────────────────────────────────────────

async function provisionOptionSets(cfg, token) {
  console.log('\n─── Global Option Sets ─────────────────────────────────────');
  for (const def of OPTION_SET_DEFS) {
    await run(def.name, () => ensureOptionSet(cfg, token, SOLUTION_NAME, def));
  }
}

async function provisionEntities(cfg, token) {
  console.log('\n─── Entities ────────────────────────────────────────────────');
  for (const def of ENTITY_DEFS) {
    await run(def.LogicalName, () => ensureEntity(cfg, token, SOLUTION_NAME, def));
  }
}

async function provisionStatusCodes(cfg, token) {
  console.log('\n─── Status Codes ────────────────────────────────────────────');
  for (const ensure of [ensureCaseStatusCodes, ensurePtpStatusCodes]) {
    try { const { created } = await ensure(cfg, token, SOLUTION_NAME); counts.created += created; }
    catch (err) { counts.failed++; console.error(`  [FAIL] status codes: ${err.message}`); }
  }
}

async function provisionRelationships(cfg, token) {
  console.log('\n─── Relationships ───────────────────────────────────────────');
  for (const def of RELATIONSHIP_DEFS) {
    await run(def.SchemaName, () => ensureRelationship(cfg, token, SOLUTION_NAME, def));
  }
}

async function provisionAltKeys(cfg, token) {
  console.log('\n─── Alternate Keys ──────────────────────────────────────────');
  await run('msst_dcpcustomer QID alternate key', () => ensureQidAltKey(cfg, token, SOLUTION_NAME));
}

async function provisionRoles(cfg, token, rootBuId) {
  console.log('\n─── Security Roles ──────────────────────────────────────────');
  for (const roleDef of ROLE_DEFS) {
    const { roleId, status } = await ensureRole(cfg, token, SOLUTION_NAME, roleDef.name, rootBuId);
    tally(status);
    if (roleId) {
      try { await applyRolePrivileges(cfg, token, SOLUTION_NAME, roleId, roleDef.privileges); }
      catch (err) { console.error(`  [WARN] Privileges for ${roleDef.name}: ${err.message}`); }
    }
  }
}

async function provisionQueues(cfg, token) {
  console.log('\n─── Queues ──────────────────────────────────────────────────');
  for (const name of PHASE1_QUEUES) {
    await run(`queue ${name}`, () => ensureQueue(cfg, token, SOLUTION_NAME, name));
  }
}

async function provisionFieldSecurity(cfg, token) {
  console.log('\n─── Field Security ──────────────────────────────────────────');
  let profileId;
  try {
    profileId = await ensureFieldSecProfile(cfg, token, SOLUTION_NAME);
    tally(profileId ? 'created' : 'skipped');
  } catch (err) { counts.failed++; console.error(`  [FAIL] Field security profile: ${err.message}`); return; }
  for (const { entity, attribute } of PII_COLUMNS) {
    await run(`${entity}.${attribute}`, () => ensureFieldPermission(cfg, token, SOLUTION_NAME, profileId, entity, attribute));
  }
}

const PUBLISH_ATTEMPTS = 3;

/** PublishAllXml is retried because a mid-publish connection reset recurs on this org. */
async function publishAll(cfg, token) {
  console.log('\n─── Publishing customizations ───────────────────────────────');
  for (let attempt = 1; attempt <= PUBLISH_ATTEMPTS; attempt++) {
    try {
      await apiPost(cfg, token, SOLUTION_NAME, '/PublishAllXml', {});
      console.log(`  PublishAllXml succeeded (attempt ${attempt})`);
      return;
    } catch (err) {
      console.warn(`  PublishAllXml attempt ${attempt} failed: ${err.message}`);
      if (attempt === PUBLISH_ATTEMPTS) throw err;
    }
  }
}

async function verifyEntities(cfg, token) {
  console.log('\n─── Verification ────────────────────────────────────────────');
  const result = await apiGet(cfg, token, SOLUTION_NAME, '/EntityDefinitions?$select=LogicalName,MetadataId');
  const entities = (result?.value ?? []).filter(e => e.LogicalName.startsWith('msst_dcp')).sort((x, y) => x.LogicalName.localeCompare(y.LogicalName));
  console.log(`  Entities matching msst_dcp*: ${entities.length}`);
  entities.forEach(e => console.log(`    ${e.LogicalName}  (${e.MetadataId})`));
  return entities;
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  console.log('DCP Phase 1 — Schema Provisioning');
  console.log('==================================');

  const cfg = loadConfig();
  console.log(`\nOrg: ${cfg.orgUrl}`);
  const token = await acquireToken(cfg);
  console.log('Token acquired.');

  const publisherId = await getPublisherId(cfg, token, SOLUTION_NAME);
  const rootBuId    = await getRootBuId(cfg, token, SOLUTION_NAME);
  await ensureSolution(cfg, token, SOLUTION_NAME, publisherId);

  await provisionOptionSets(cfg, token);
  await provisionEntities(cfg, token);
  await provisionStatusCodes(cfg, token);
  await provisionRelationships(cfg, token);
  await provisionAltKeys(cfg, token);
  await provisionRoles(cfg, token, rootBuId);
  await provisionQueues(cfg, token);
  await provisionFieldSecurity(cfg, token);
  await publishAll(cfg, token);
  const entities = await verifyEntities(cfg, token);

  console.log('\n==================================');
  console.log(`Created: ${counts.created}  Skipped: ${counts.skipped}  Failed: ${counts.failed}`);
  if (counts.failed > 0) process.exit(1);
  if (entities.length < 11) {
    console.warn(`\n[WARN] Expected 11 msst_dcp* entities but found ${entities.length}. Re-run or inspect errors above.`);
    process.exit(1);
  }
  console.log('\nProvisioning complete.');
}

main().catch(err => { console.error(`[FATAL] ${err.message}`); process.exit(1); });
