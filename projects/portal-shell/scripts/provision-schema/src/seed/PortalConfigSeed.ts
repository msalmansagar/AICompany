import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

interface PortalConfigRecord {
  readonly qdb_portal_configsid: string;
}

// SD-001: Minimum portal config record for the API to boot.
// Field names are from BRD FR-SCHEMA-004 / PortalConfigService.ts selectFields().
const SEED_RECORD = {
  qdb_portal_name: 'Portal Shell (Staging)',
  qdb_primary_color: '#1A73E8',
  qdb_accent_color: '#FBBC04',
  qdb_nav_layout: 860000001,              // sidebar
  qdb_sidebar_default_state: 860000001,   // expanded
  qdb_auth_provider: 860000003,           // custom
  qdb_rtl_enabled: false,
  qdb_header_show_notifications: true,
  qdb_notification_poll_interval_seconds: 30,
  qdb_landing_page: '/dashboard',
};

const IDEMPOTENCY_FILTER = `qdb_portal_name eq 'Portal Shell (Staging)'`;

export async function seedPortalConfig(
  http: DataverseHttpClient,
): Promise<StepResult & { portalConfigId: string }> {
  console.log('[PHASE-8] [SD-001] Checking portal config seed record...');

  const existing = await http.get<ODataCollectionResponse<PortalConfigRecord>>(
    'qdb_portal_configses',
    {
      filter: IDEMPOTENCY_FILTER,
      select: ['qdb_portal_configsid'],
      top: 1,
    },
  );

  const existingRecords = existing?.value ?? [];

  if (existingRecords.length > 0) {
    const existingRecord = existingRecords[0];
    if (!existingRecord) throw new Error('[PHASE-8] SD-001: config record query returned empty element.');
    console.log('[PHASE-8] [SKIP] [SD-001] Portal config seed record already exists.');
    return { name: 'SD-001 portal config', status: 'skipped', portalConfigId: existingRecord.qdb_portal_configsid };
  }

  if (env.DRY_RUN) {
    console.log('[PHASE-8] [DRY-RUN SKIP] [SD-001] Would seed portal config record.');
    return { name: 'SD-001 portal config', status: 'dry-run', portalConfigId: '' };
  }

  const createResponse = await http.postRaw('qdb_portal_configses', SEED_RECORD);
  const entityIdHeader = createResponse.headers.get('OData-EntityId') ?? '';
  const idMatch = entityIdHeader.match(/\(([^)]+)\)/);
  const portalConfigId = idMatch?.[1] ?? '';

  console.log(`[PHASE-8] [PASS] [SD-001] Portal config seeded (${portalConfigId}).`);
  return { name: 'SD-001 portal config', status: 'created', id: portalConfigId, portalConfigId };
}
