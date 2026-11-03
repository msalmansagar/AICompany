import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { GlobalOptionSetPayload, LocalizedLabelSet, OptionMetadata } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const COMPONENT_CATEGORY_OPTION_SET: GlobalOptionSetPayload = buildOptionSet(
  'qdb_component_category',
  'Component Category',
  [
    { value: 860004001, label: 'Dashboard Widget' },
    { value: 860004002, label: 'Form Component' },
    { value: 860004003, label: 'Navigation Element' },
    { value: 860004004, label: 'Data Display' },
    { value: 860004005, label: 'Action Button' },
  ],
);

export async function provisionAllGlobalOptionSets(
  http: DataverseHttpClient,
): Promise<readonly StepResult[]> {
  console.log('[PHASE-4] Provisioning global option sets...');
  const result = await provisionSingleOptionSet(http, COMPONENT_CATEGORY_OPTION_SET);
  const status = result.status === 'created' ? 'created' : 'skipped';
  console.log(`[PHASE-4] Complete: ${status === 'created' ? 1 : 0} created, ${status === 'skipped' ? 1 : 0} skipped.`);
  return [result];
}

async function provisionSingleOptionSet(
  http: DataverseHttpClient,
  payload: GlobalOptionSetPayload,
): Promise<StepResult> {
  const existing = await http.get(`GlobalOptionSetDefinitions(Name='${payload.Name}')`);

  if (existing !== null) {
    console.log(`[PHASE-4] [SKIP] GlobalOptionSet '${payload.Name}' already exists.`);
    return { name: payload.Name, status: 'skipped' };
  }

  if (env.DRY_RUN) {
    console.log(`[PHASE-4] [DRY-RUN SKIP] Would create GlobalOptionSet '${payload.Name}'.`);
    return { name: payload.Name, status: 'dry-run' };
  }

  await http.post('GlobalOptionSetDefinitions', payload);
  console.log(`[PHASE-4] [PASS] Created GlobalOptionSet '${payload.Name}'.`);
  return { name: payload.Name, status: 'created' };
}

function label(text: string): LocalizedLabelSet {
  return { LocalizedLabels: [{ Label: text, LanguageCode: 1033 }] };
}

function buildOptionSet(
  name: string,
  displayName: string,
  options: ReadonlyArray<{ value: number; label: string }>,
): GlobalOptionSetPayload {
  const builtOptions: OptionMetadata[] = options.map((o) => ({
    Value: o.value,
    Label: label(o.label),
  }));

  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
    Name: name,
    DisplayName: label(displayName),
    Description: label(`Global option set for ${displayName}`),
    IsGlobal: true,
    OptionSetType: 'Picklist',
    Options: builtOptions,
  };
}
