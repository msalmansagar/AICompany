import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// SD-002: 3 default nav items from BRD Section 10 SD-002.
// Field names from BRD FR-SCHEMA-005 / NavService.ts DataverseNavItem interface.

interface NavSeedRecord {
  readonly qdb_label: string;
  readonly qdb_label_ar: string;
  readonly qdb_page_code: string;
  readonly qdb_icon: string;
  readonly qdb_display_order: number;
  readonly qdb_is_visible: boolean;
  readonly qdb_badge_source: number;
  readonly qdb_badge_value?: string;
}

const NAV_SEEDS: readonly NavSeedRecord[] = [
  {
    qdb_label: 'Dashboard',
    qdb_label_ar: 'لوحة التحكم',
    qdb_page_code: 'dashboard',
    qdb_icon: 'home',
    qdb_display_order: 1,
    qdb_is_visible: true,
    qdb_badge_source: 860000001,  // none
  },
  {
    qdb_label: 'My Requests',
    qdb_label_ar: 'طلباتي',
    qdb_page_code: 'my-requests',
    qdb_icon: 'file-text',
    qdb_display_order: 2,
    qdb_is_visible: true,
    qdb_badge_source: 860000003,  // query
    qdb_badge_value: 'qdb_portal_requests?$filter=qdb_status eq 860000001',
  },
  {
    qdb_label: 'Services',
    qdb_label_ar: 'الخدمات',
    qdb_page_code: 'services',
    qdb_icon: 'grid',
    qdb_display_order: 3,
    qdb_is_visible: true,
    qdb_badge_source: 860000001,  // none
  },
];

export async function seedNavItems(
  http: DataverseHttpClient,
): Promise<readonly StepResult[]> {
  console.log('[PHASE-8] [SD-002] Seeding navigation items...');
  const results: StepResult[] = [];

  for (const navSeed of NAV_SEEDS) {
    const result = await seedSingleNavItem(http, navSeed);
    results.push(result);
  }

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  console.log(`[PHASE-8] [SD-002] Complete: ${created} created, ${skipped} skipped.`);

  return results;
}

async function seedSingleNavItem(
  http: DataverseHttpClient,
  record: NavSeedRecord,
): Promise<StepResult> {
  const existing = await http.get<ODataCollectionResponse<{ qdb_portal_nav_itemsid: string }>>(
    'qdb_portal_nav_itemses',
    {
      filter: `qdb_page_code eq '${record.qdb_page_code}'`,
      select: ['qdb_portal_nav_itemsid'],
      top: 1,
    },
  );

  const existingRecords = existing?.value ?? [];

  if (existingRecords.length > 0) {
    console.log(`[PHASE-8] [SKIP] [SD-002] Nav item '${record.qdb_page_code}' already exists.`);
    return { name: `SD-002 nav:${record.qdb_page_code}`, status: 'skipped' };
  }

  if (env.DRY_RUN) {
    console.log(`[PHASE-8] [DRY-RUN SKIP] [SD-002] Would seed nav item '${record.qdb_page_code}'.`);
    return { name: `SD-002 nav:${record.qdb_page_code}`, status: 'dry-run' };
  }

  await http.post('qdb_portal_nav_itemses', record);
  console.log(`[PHASE-8] [PASS] [SD-002] Nav item '${record.qdb_page_code}' seeded.`);
  return { name: `SD-002 nav:${record.qdb_page_code}`, status: 'created' };
}
