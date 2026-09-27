/**
 * discover-template-options.mts
 * Reads the option values on `qdb_communicationtemplate` from the organisation.
 *
 * Read-only, and run before any template code is written. A choice value is a number whose meaning
 * lives only in metadata: writing `100000000` because it looks like a first option is exactly the
 * class of confident guess that produced KI-52 and KI-74. The values printed here are the only ones
 * the workspace is allowed to use.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/discover-template-options.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const CHOICE_COLUMNS = ['qdb_channel', 'qdb_language', 'qdb_approvalstatus'];

interface OptionRow {
  Value: number;
  Label?: { UserLocalizedLabel?: { Label?: string } };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) throw new Error(`Refusing to run: connected to ${host}`);
  console.log(`=== qdb_communicationtemplate choices on ${host} ===\n`);

  const token = await acquireToken(cfg);

  for (const column of CHOICE_COLUMNS) {
    const metadata = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='qdb_communicationtemplate')/Attributes(LogicalName='${column}')`
      + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName'
      + '&$expand=OptionSet($select=Options)');

    const options = (metadata?.OptionSet?.Options ?? []) as OptionRow[];
    console.log(`  ${column}`);
    for (const option of options) {
      console.log(`    ${option.Value}  ${option.Label?.UserLocalizedLabel?.Label ?? '(no label)'}`);
    }
    console.log('');
  }

  // Booleans matter too: which value means "yes" is not always 1 on a custom two-option column.
  for (const column of ['qdb_freetextallowed', 'qdb_editingallowed', 'qdb_isactive', 'qdb_approvalrequired']) {
    const metadata = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='qdb_communicationtemplate')/Attributes(LogicalName='${column}')`
      + '/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=LogicalName,DefaultValue');
    console.log(`  ${column}: two-option, default ${metadata?.DefaultValue}`);
  }

  const rows = await apiGet(cfg, token, SOLUTION_NAME,
    '/qdb_communicationtemplates?$select=qdb_code,qdb_name&$top=10&$count=true');
  console.log(`\n  Existing template rows: ${rows?.['@odata.count'] ?? 0}`);
  for (const row of (rows?.value ?? [])) console.log(`    ${row.qdb_code} — ${row.qdb_name}`);
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
