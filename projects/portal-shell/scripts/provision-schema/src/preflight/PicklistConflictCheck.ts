import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { GlobalOptionSetRecord } from '../types/DataverseMetadata.js';
import type { CheckResult } from '../types/ProvisioningResult.js';

// All integer values the provisioning script plans to create.
// Grouped by option set name for diagnostic output on conflict.
const PLANNED_OPTION_SETS: ReadonlyMap<string, readonly number[]> = new Map([
  ['qdb_preferred_language', [100000001, 100000002]],
  ['qdb_nav_layout', [860000001, 860000002]],
  ['qdb_sidebar_default_state', [860000001, 860000002]],
  ['qdb_auth_provider', [860000001, 860000002, 860000003]],
  ['qdb_badge_source', [860000001, 860000002, 860000003]],
  ['qdb_request_status', [860000001, 860000002, 860000003, 860000004, 860000005]],
  ['qdb_notification_type', [860000001, 860000002, 860000003, 860000004]],
  ['qdb_cms_content_type', [100000001, 100000002, 100000003, 100000004]],
  ['qdb_cms_status', [100000001, 100000002, 100000003]],
]);

export interface ConflictEntry {
  readonly plannedOptionSet: string;
  readonly value: number;
  readonly existingOptionSet: string;
}

export class PicklistConflictError extends Error {
  constructor(public readonly conflicts: readonly ConflictEntry[]) {
    super(
      `[PHASE-2b] Picklist conflict detected: ${conflicts.length} value(s) already exist in other option sets.`,
    );
    this.name = 'PicklistConflictError';
  }
}

// CHALLENGE 1 resolution: uses fetchAllPages to follow @odata.nextLink for
// large orgs with many global option sets.
export async function runPicklistConflictCheck(
  http: DataverseHttpClient,
): Promise<CheckResult> {
  console.log('[PHASE-2b] Enumerating all GlobalOptionSetDefinitions (paginated)...');

  const allOptionSets = await http.fetchAllPages<GlobalOptionSetRecord>(
    'GlobalOptionSetDefinitions',
    { select: ['Name', 'Options'] },
  );

  console.log(`[PHASE-2b] Retrieved ${allOptionSets.length} global option set(s).`);

  // Build conflict index: value -> option set name (excluding our own planned sets)
  const existingValueIndex = buildExistingValueIndex(allOptionSets);

  const conflicts = detectConflicts(existingValueIndex);

  if (conflicts.length > 0) {
    logConflicts(conflicts);
    throw new PicklistConflictError(conflicts);
  }

  console.log('[PHASE-2b] [PASS] No picklist conflicts found. Proceeding.');
  return { passed: true, message: 'No picklist conflicts detected.' };
}

export function buildExistingValueIndex(
  optionSets: readonly GlobalOptionSetRecord[],
): Map<number, string> {
  const index = new Map<number, string>();

  for (const optionSet of optionSets) {
    // Skip option sets we plan to create — they won't conflict with themselves
    if (PLANNED_OPTION_SETS.has(optionSet.Name)) continue;

    for (const option of optionSet.Options) {
      index.set(option.Value, optionSet.Name);
    }
  }

  return index;
}

export function detectConflicts(existingValueIndex: Map<number, string>): readonly ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];

  for (const [plannedName, plannedValues] of PLANNED_OPTION_SETS) {
    for (const value of plannedValues) {
      const existingOwner = existingValueIndex.get(value);
      if (existingOwner !== undefined) {
        conflicts.push({
          plannedOptionSet: plannedName,
          value,
          existingOptionSet: existingOwner,
        });
      }
    }
  }

  return conflicts;
}

function logConflicts(conflicts: readonly ConflictEntry[]): void {
  console.error('[PHASE-2b] [ERROR] Picklist value conflicts detected:');
  for (const conflict of conflicts) {
    console.error(
      `  Value ${conflict.value} — planned for '${conflict.plannedOptionSet}' ` +
        `already exists in '${conflict.existingOptionSet}'`,
    );
  }
}
