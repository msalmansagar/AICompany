import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { GlobalOptionSetPayload, LocalizedLabelSet } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// 9 global option sets defined per architecture Section 9 and BRD Section 5.
// Values are authoritative from the BRD code (not the brief).
const GLOBAL_OPTION_SETS: ReadonlyArray<GlobalOptionSetPayload> = [
  buildOptionSet('qdb_preferred_language', 'Preferred Language', [
    { value: 860001001, label: 'English' },
    { value: 860001002, label: 'Arabic' },
  ]),
  buildOptionSet('qdb_nav_layout', 'Navigation Layout', [
    { value: 860000001, label: 'Sidebar' },
    { value: 860000002, label: 'Top Navigation' },
  ]),
  buildOptionSet('qdb_sidebar_default_state', 'Sidebar Default State', [
    { value: 860000001, label: 'Expanded' },
    { value: 860000002, label: 'Collapsed' },
  ]),
  buildOptionSet('qdb_auth_provider', 'Authentication Provider', [
    { value: 860000001, label: 'Azure AD B2C' },
    { value: 860000002, label: 'Entra External ID' },
    { value: 860000003, label: 'Custom' },
  ]),
  buildOptionSet('qdb_badge_source', 'Badge Source', [
    { value: 860000001, label: 'None' },
    { value: 860000002, label: 'Static' },
    { value: 860000003, label: 'Query' },
  ]),
  buildOptionSet('qdb_request_status', 'Request Status', [
    { value: 860000001, label: 'Submitted' },
    { value: 860000002, label: 'Under Review' },
    { value: 860000003, label: 'Approved' },
    { value: 860000004, label: 'Rejected' },
    { value: 860000005, label: 'Pending Documents' },
  ]),
  buildOptionSet('qdb_notification_type', 'Notification Type', [
    { value: 860000001, label: 'Info' },
    { value: 860000002, label: 'Success' },
    { value: 860000003, label: 'Warning' },
    { value: 860000004, label: 'Error' },
  ]),
  buildOptionSet('qdb_cms_content_type', 'CMS Content Type', [
    { value: 860002001, label: 'Blog' },
    { value: 860002002, label: 'News' },
    { value: 860002003, label: 'Announcement' },
    { value: 860002004, label: 'Page' },
  ]),
  buildOptionSet('qdb_cms_status', 'CMS Status', [
    { value: 860003001, label: 'Draft' },
    { value: 860003002, label: 'Published' },
    { value: 860003003, label: 'Archived' },
  ]),
];

export async function provisionAllGlobalOptionSets(
  http: DataverseHttpClient,
): Promise<readonly StepResult[]> {
  console.log('[PHASE-4] Provisioning 9 global option sets...');
  const results: StepResult[] = [];

  for (const optionSet of GLOBAL_OPTION_SETS) {
    const result = await provisionSingleOptionSet(http, optionSet);
    results.push(result);
  }

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  console.log(`[PHASE-4] Complete: ${created} created, ${skipped} skipped.`);

  return results;
}

async function provisionSingleOptionSet(
  http: DataverseHttpClient,
  payload: GlobalOptionSetPayload,
): Promise<StepResult> {
  const existing = await http.get(
    `GlobalOptionSetDefinitions(Name='${payload.Name}')`,
  );

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

// ── Builder helpers ────────────────────────────────────────────────────────────

function label(text: string): LocalizedLabelSet {
  return { LocalizedLabels: [{ Label: text, LanguageCode: 1033 }] };
}

function buildOptionSet(
  name: string,
  displayName: string,
  options: ReadonlyArray<{ value: number; label: string }>,
): GlobalOptionSetPayload {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
    Name: name,
    DisplayName: label(displayName),
    Description: label(`Global option set for ${displayName}`),
    IsGlobal: true,
    OptionSetType: 'Picklist',
    Options: options.map((o) => ({
      Value: o.value,
      Label: label(o.label),
    })),
  };
}
