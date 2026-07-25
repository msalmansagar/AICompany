'use strict';

/**
 * add-sla-fields.js  —  DP-2 SLA / Escalation schema on process steps.
 *
 * Provisions, idempotently, on the LIVE org, the SLA/escalation config schema on
 * qdb_work_item_steps:
 *   - 4 GLOBAL option sets (qdb_sladurationunit, qdb_slabasis,
 *     qdb_escalationaction, qdb_escalationtargettype)
 *   - 11 fields (2 boolean, 2 integer, 4 global picklist, 3 lookup)
 *
 * The schema SHAPE lives in sla-schema-lib.js — shared with the SOP-step variant
 * (add-sla-sopstep-fields.js) so the two entities never drift. Option-set integer
 * codes MUST match src/types/WorkflowTypes.ts (via sla-option-codes.js).
 * Config-only — nothing here enforces SLAs; these fields are the CWFD-005
 * runtime contract.
 *
 * Usage (identity from the environment — see crm-api-client.js):
 *   $env:AZURE_TENANT_ID="…"; $env:AZURE_CLIENT_ID="…";
 *   $env:AZURE_CLIENT_SECRET="…"; $env:DATAVERSE_URL="https://org…dynamics.com";
 *   node scripts/add-sla-fields.js
 */

const { loadCrmConfig, getToken } = require('./crm-api-client');
const { provisionSlaSchema } = require('./sla-schema-lib');

const ENTITY = 'qdb_work_item_steps';
const RELATIONSHIP_SUFFIX = 'workitemstep';

async function run() {
  console.log('\n══ DP-2 — Provision SLA/escalation schema on qdb_work_item_steps ══\n');
  const config = loadCrmConfig();
  const token = await getToken(config);
  console.log('  token acquired\n');

  await provisionSlaSchema(config, token, ENTITY, RELATIONSHIP_SUFFIX);

  console.log('\n══ Done. Publish customizations in the org to expose the new fields. ══\n');
}

run().catch((err) => {
  console.error('\n[FATAL]', err.message ?? err);
  process.exit(1);
});
