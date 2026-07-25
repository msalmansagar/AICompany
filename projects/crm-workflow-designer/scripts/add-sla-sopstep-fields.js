'use strict';

/**
 * add-sla-sopstep-fields.js  —  DP-2b SLA / Escalation schema on SOP steps.
 *
 * Provisions, idempotently, on the LIVE org, the identical SLA/escalation config
 * schema that DP-2 added to process steps — this time on qdb_sopstep:
 *   - reuses the 4 existing GLOBAL option sets (qdb_sladurationunit, qdb_slabasis,
 *     qdb_escalationaction, qdb_escalationtargettype) — no new option sets
 *   - 11 fields on qdb_sopstep (same logical + schema names as on
 *     qdb_work_item_steps; attribute schema names are entity-scoped)
 *   - 3 NEW one-to-many relationships with distinct schema names
 *     (qdb_escalationuser_sopstep, qdb_escalationteam_sopstep,
 *      qdb_escalationrole_sopstep) — relationship schema names are global.
 *
 * Config-only. These fields let an author set SLA/escalation on a SOP template
 * step; deriveProcessFromSop snapshots them onto each derived process step.
 *
 * Usage (identity from the environment — see crm-api-client.js):
 *   $env:AZURE_TENANT_ID="…"; $env:AZURE_CLIENT_ID="…";
 *   $env:AZURE_CLIENT_SECRET="…"; $env:DATAVERSE_URL="https://org…dynamics.com";
 *   node scripts/add-sla-sopstep-fields.js
 */

const { loadCrmConfig, getToken } = require('./crm-api-client');
const { provisionSlaSchema } = require('./sla-schema-lib');

const ENTITY = 'qdb_sopstep';
const RELATIONSHIP_SUFFIX = 'sopstep';

async function run() {
  console.log('\n══ DP-2b — Provision SLA/escalation schema on qdb_sopstep ══\n');
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
