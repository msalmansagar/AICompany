import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// SD-002: 3 default nav items from BRD Section 10 SD-002.
// Field names use the actual Dataverse-derived logical names (SchemaName lowercased).
// Dataverse ignores explicit LogicalName in attribute creation payloads.

interface NavSeedRecord {
  readonly qdb_label: string;
  readonly qdb_labelar: string;
  readonly qdb_pagecode: string;
  readonly qdb_icon: string;
  readonly qdb_displayorder: number;
  readonly qdb_isvisible: boolean;
  readonly qdb_badgesource: number;
  readonly qdb_badgevalue?: string;
}

const NAV_SEEDS: readonly NavSeedRecord[] = [
  {
    qdb_label: 'Dashboard',
    qdb_labelar: 'لوحة التحكم',
    qdb_pagecode: 'dashboard',
    qdb_icon: 'home',
    qdb_displayorder: 1,
    qdb_isvisible: true,
    qdb_badgesource: 860000001,  // none
  },
  {
    qdb_label: 'My Requests',
    qdb_labelar: 'طلباتي',
    qdb_pagecode: 'my-requests',
    qdb_icon: 'file-text',
    qdb_displayorder: 2,
    qdb_isvisible: true,
    qdb_badgesource: 860000003,  // query
    qdb_badgevalue: 'qdb_portal_requests?$filter=qdb_requeststatus eq 860000001',
  },
  {
    qdb_label: 'Services',
    qdb_labelar: 'الخدمات',
    qdb_pagecode: 'services',
    qdb_icon: 'grid',
    qdb_displayorder: 3,
    qdb_isvisible: true,
    qdb_badgesource: 860000001,  // none
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
      filter: `qdb_pagecode eq '${record.qdb_pagecode}'`,
      select: ['qdb_portal_nav_itemsid'],
      top: 1,
    },
  );

  const existingRecords = existing?.value ?? [];

  if (existingRecords.length > 0) {
    console.log(`[PHASE-8] [SKIP] [SD-002] Nav item '${record.qdb_pagecode}' already exists.`);
    return { name: `SD-002 nav:${record.qdb_pagecode}`, status: 'skipped' };
  }

  if (env.DRY_RUN) {
    console.log(`[PHASE-8] [DRY-RUN SKIP] [SD-002] Would seed nav item '${record.qdb_pagecode}'.`);
    return { name: `SD-002 nav:${record.qdb_pagecode}`, status: 'dry-run' };
  }

  await http.post('qdb_portal_nav_itemses', record);
  console.log(`[PHASE-8] [PASS] [SD-002] Nav item '${record.qdb_pagecode}' seeded.`);
  return { name: `SD-002 nav:${record.qdb_pagecode}`, status: 'created' };
}
