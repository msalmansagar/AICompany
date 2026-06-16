import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// SD-004: Minimum widget config from BRD Section 10 SD-004.
// Field names from BRD FR-SCHEMA-006 / widgets.ts DataverseWidgetConfig interface.
const WIDGET_TYPE = 'my-requests-summary';

const SEED_RECORD = {
  qdb_widget_type: WIDGET_TYPE,
  qdb_title: 'My Requests',
  qdb_display_order: 1,
  qdb_column_span: 2,
  qdb_config: '{}',
};

export async function seedWidgetConfig(
  http: DataverseHttpClient,
): Promise<StepResult> {
  console.log('[PHASE-8] [SD-004] Checking widget config seed record...');

  const existing = await http.get<ODataCollectionResponse<{ qdb_portal_widget_configsid: string }>>(
    'qdb_portal_widget_configses',
    {
      filter: `qdb_widget_type eq '${WIDGET_TYPE}'`,
      select: ['qdb_portal_widget_configsid'],
      top: 1,
    },
  );

  const existingRecords = existing?.value ?? [];

  if (existingRecords.length > 0) {
    console.log('[PHASE-8] [SKIP] [SD-004] Widget config seed record already exists.');
    return { name: 'SD-004 widget config', status: 'skipped' };
  }

  if (env.DRY_RUN) {
    console.log('[PHASE-8] [DRY-RUN SKIP] [SD-004] Would seed widget config record.');
    return { name: 'SD-004 widget config', status: 'dry-run' };
  }

  await http.post('qdb_portal_widget_configses', SEED_RECORD);
  console.log('[PHASE-8] [PASS] [SD-004] Widget config seeded.');
  return { name: 'SD-004 widget config', status: 'created' };
}
