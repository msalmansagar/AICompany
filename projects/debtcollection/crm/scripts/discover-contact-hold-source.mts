/**
 * discover-contact-hold-source.mts
 * Asks the organisation whether an authoritative Contact Hold source is configured (KI-79).
 *
 * The Phase 7 authorisation is explicit: Contact Hold must be server-side authoritative, and where
 * the source cannot be established the communication path fails closed. Before deciding that it
 * cannot be established, the organisation is asked — `qdb_platformconfiguration` carries
 * `qdb_contactholdrulesetcode`, which is exactly the pointer such a source would be named by.
 *
 * Read-only.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/discover-contact-hold-source.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) throw new Error(`Refusing to run: connected to ${host}`);
  console.log(`=== Contact Hold source on ${host} ===\n`);

  const token = await acquireToken(cfg);

  const configurations = await apiGet(cfg, token, SOLUTION_NAME,
    '/qdb_platformconfigurations?$select=qdb_name,qdb_platformtype,qdb_organizationcode,'
    + 'qdb_contactholdrulesetcode,qdb_eligibilityrulesetcode,qdb_isactive&$top=20');

  const rows = configurations?.value ?? [];
  console.log(`  ${rows.length} platform configuration row(s):`);
  for (const row of rows) {
    console.log(`    ${row.qdb_name} — active=${row.qdb_isactive}`
      + ` contactHoldRuleset=${JSON.stringify(row.qdb_contactholdrulesetcode)}`
      + ` eligibilityRuleset=${JSON.stringify(row.qdb_eligibilityrulesetcode)}`);
  }

  // The other candidate the discovery named: a privilege-marker table is not a hold source, but its
  // presence or absence is part of the same picture (KI-82).
  const privileges = await apiGet(cfg, token, SOLUTION_NAME,
    '/qdb_privsendsms?$select=qdb_privsendsmsid&$top=1&$count=true').catch(() => null);
  console.log(`\n  qdb_privsendsms rows: ${privileges?.['@odata.count'] ?? 'entity not readable'}`);
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
