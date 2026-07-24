import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, SolutionRecord } from '../types/DataverseMetadata.js';
import type { ExistingSolutionSnapshot } from '../types/ProvisioningResult.js';

const SOLUTIONS_TO_SNAPSHOT = ['QdbPortalShell', 'QdbDynamicFormEngine'] as const;

export async function runExistingSolutionCheck(
  http: DataverseHttpClient,
): Promise<readonly (ExistingSolutionSnapshot | null)[]> {
  console.log('[PHASE-2c] Snapshotting existing solutions...');

  const snapshots = await Promise.all(
    SOLUTIONS_TO_SNAPSHOT.map((name) => snapshotSolution(http, name)),
  );

  const found = snapshots.filter(Boolean).length;
  console.log(`[PHASE-2c] [PASS] Snapshotted ${found}/${SOLUTIONS_TO_SNAPSHOT.length} existing solutions.`);

  return snapshots;
}

async function snapshotSolution(
  http: DataverseHttpClient,
  solutionName: string,
): Promise<ExistingSolutionSnapshot | null> {
  const response = await http.get<ODataCollectionResponse<SolutionRecord>>(
    'solutions',
    {
      filter: `uniquename eq '${solutionName}'`,
      select: ['solutionid', 'uniquename', 'version'],
    },
  );

  const solutions = response?.value ?? [];

  if (solutions.length === 0) {
    console.log(`[PHASE-2c] [WARN] Solution '${solutionName}' not found — no baseline snapshot available.`);
    return null;
  }

  const solution = solutions[0];
  if (!solution) throw new Error(`[PHASE-2c] Solution query for '${solutionName}' returned empty array element.`);

  const snapshot: ExistingSolutionSnapshot = {
    solutionId: solution.solutionid,
    uniqueName: solution.uniquename,
    version: solution.version,
    componentCount: 0,
  };

  console.log(`[PHASE-2c] Snapshot: ${solutionName} v${solution.version}`);
  return snapshot;
}
