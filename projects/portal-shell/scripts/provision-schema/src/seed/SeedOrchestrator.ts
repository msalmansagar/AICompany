import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { seedPortalConfig } from './PortalConfigSeed.js';
import { seedNavItems } from './NavItemSeed.js';
import { seedTestUser } from './TestUserSeed.js';
import { seedWidgetConfig } from './WidgetConfigSeed.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// Runs all 4 seed tasks in order (SD-001 → SD-002 → SD-003 → SD-004).
// SD-002 nav items do NOT need the portal config ID to be bound via lookup
// because qdb_portal_nav_items has no portal config lookup in the BRD.
// (The arch added qdb_portal_config lookup but BRD FR-SCHEMA-005 does not include it;
// BRD field names are authoritative for API compatibility.)
export async function orchestrateSeed(
  http: DataverseHttpClient,
): Promise<readonly StepResult[]> {
  console.log('[PHASE-8] Starting seed data insertion...');

  const configResult = await seedPortalConfig(http);
  const navResults = await seedNavItems(http);
  const userResult = await seedTestUser(http);
  const widgetResult = await seedWidgetConfig(http);

  const allResults: StepResult[] = [configResult, ...navResults, userResult, widgetResult];

  const created = allResults.filter((r) => r.status === 'created').length;
  const skipped = allResults.filter((r) => r.status === 'skipped').length;

  console.log(
    `[PHASE-8] Seed complete: ${created} created, ${skipped} skipped out of ${allResults.length} records.`,
  );

  return allResults;
}
