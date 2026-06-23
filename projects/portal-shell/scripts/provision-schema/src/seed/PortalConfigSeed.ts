import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

interface PortalConfigRecord {
  readonly qdb_portal_configsid: string;
}

// SD-001: Minimum portal config record for the API to boot.
// Field names use the actual Dataverse-derived logical names (SchemaName lowercased).
// Dataverse ignores explicit LogicalName in attribute creation payloads.
const SEED_RECORD = {
  qdb_portalname: 'Portal Shell (Staging)',
  qdb_primarycolor: '#1A73E8',
  qdb_accentcolor: '#FBBC04',
  qdb_navlayout: 860000001,              // sidebar
  qdb_sidebardefaultstate: 860000001,   // expanded
  qdb_authprovider: 860000003,           // custom
  qdb_rtlenabled: false,
  qdb_headershownotifications: true,
  qdb_notificationpollintervalseconds: 30,
  qdb_landingpage: '/dashboard',
};

const IDEMPOTENCY_FILTER = `qdb_portalname eq 'Portal Shell (Staging)'`;

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
