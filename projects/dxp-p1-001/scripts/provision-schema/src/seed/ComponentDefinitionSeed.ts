import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { StepResult } from '../types/ProvisioningResult.js';
import type { ODataCollectionResponse } from '../types/DataverseMetadata.js';

interface SeedDefinition {
  readonly name: string;
  readonly displayName: string;
  readonly displayNameAr: string;
  readonly category: number;
  readonly renderTargets: string;
}

interface ExistingDefinition {
  readonly qdb_component_definitionsid: string;
  readonly qdb_name: string;
}

const SEED_DEFINITIONS: readonly SeedDefinition[] = [
  {
    name: 'my-requests-summary',
    displayName: 'My Requests Summary',
    displayNameAr: 'ملخص طلباتي',
    category: 860004001,
    renderTargets: JSON.stringify(['portal']),
  },
  {
    name: 'recent-activity',
    displayName: 'Recent Activity',
    displayNameAr: 'النشاط الأخير',
    category: 860004001,
    renderTargets: JSON.stringify(['portal']),
  },
  {
    name: 'announcements',
    displayName: 'Announcements',
    displayNameAr: 'الإعلانات',
    category: 860004001,
    renderTargets: JSON.stringify(['portal']),
  },
  {
    name: 'quick-actions',
    displayName: 'Quick Actions',
    displayNameAr: 'الإجراءات السريعة',
    category: 860004001,
    renderTargets: JSON.stringify(['portal']),
  },
  {
    name: 'statistics',
    displayName: 'Statistics',
    displayNameAr: 'الإحصاءات',
    category: 860004001,
    renderTargets: JSON.stringify(['portal']),
  },
];

export async function seedComponentDefinitions(
  http: DataverseHttpClient,
): Promise<readonly StepResult[]> {
  console.log(`[PHASE-8] Seeding ${SEED_DEFINITIONS.length} component definitions...`);
  const results: StepResult[] = [];

  for (const def of SEED_DEFINITIONS) {
    const result = await upsertDefinition(http, def);
    results.push(result);
  }

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  console.log(`[PHASE-8] Complete: ${created} upserted, ${skipped} skipped.`);

  return results;
}

async function upsertDefinition(
  http: DataverseHttpClient,
  def: SeedDefinition,
): Promise<StepResult> {
  if (env.DRY_RUN) {
    console.log(`[PHASE-8] [DRY-RUN SKIP] Would upsert definition '${def.name}'.`);
    return { name: def.name, status: 'dry-run' };
  }

  // Check by name filter — robust to alternate key indexing delay.
  // Actual logical names derived from SchemaName by Dataverse (ignores explicit LogicalName):
  //   qdb_DisplayName → qdb_displayname, qdb_RenderTargets → qdb_rendertargets, etc.
  const existing = await http.get<ODataCollectionResponse<ExistingDefinition>>(
    'qdb_component_definitionses',
    {
      filter: `qdb_name eq '${def.name.replace(/'/g, "''")}'`,
      select: ['qdb_component_definitionsid', 'qdb_name'],
      top: 1,
    },
  );

  if ((existing?.value.length ?? 0) > 0) {
    console.log(`[PHASE-8] [SKIP] Definition '${def.name}' already exists.`);
    return { name: def.name, status: 'skipped' };
  }

  await http.post<unknown>('qdb_component_definitionses', {
    qdb_name: def.name,
    qdb_displayname: def.displayName,
    qdb_displaynamear: def.displayNameAr,
    qdb_category: def.category,
    qdb_rendertargets: def.renderTargets,
  });

  console.log(`[PHASE-8] [PASS] Created definition '${def.name}'.`);
  return { name: def.name, status: 'created' };
}
