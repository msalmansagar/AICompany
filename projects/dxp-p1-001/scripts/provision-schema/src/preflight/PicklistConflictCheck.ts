import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { GlobalOptionSetRecord } from '../types/DataverseMetadata.js';

const OPTION_SET_NAME = 'qdb_component_category';

export async function runPicklistConflictCheck(http: DataverseHttpClient): Promise<void> {
  console.log(`[PHASE-2b] Checking for existing GlobalOptionSet '${OPTION_SET_NAME}'...`);

  const existing = await http.get<GlobalOptionSetRecord>(
    `GlobalOptionSetDefinitions(Name='${OPTION_SET_NAME}')`,
  );

  if (existing !== null) {
    // Already exists — idempotent, this is fine. The OptionSet provisioner will skip it.
    console.log(`[PHASE-2b] [INFO] GlobalOptionSet '${OPTION_SET_NAME}' already exists — will be skipped during provisioning.`);
    return;
  }

  console.log(`[PHASE-2b] [PASS] No conflict: '${OPTION_SET_NAME}' does not yet exist.`);
}
