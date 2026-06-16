import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, SolutionRecord } from '../types/DataverseMetadata.js';
import type { ExistingSolutionSnapshot } from '../types/ProvisioningResult.js';

// C-SCHEMA-006: Record the QdbDynamicFormEngine component count and version
// so Phase 9 can confirm the solution was not touched.
const TARGET_SOLUTION = 'QdbDynamicFormEngine';

interface SolutionComponentCountResponse {
  readonly value: number;
}

export async function runExistingSolutionCheck(
  http: DataverseHttpClient,
): Promise<ExistingSolutionSnapshot | null> {
  console.log(`[PHASE-2c] Checking existing solution '${TARGET_SOLUTION}'...`);

  const solutionResponse = await http.get<ODataCollectionResponse<SolutionRecord>>(
    'solutions',
    {
      filter: `uniquename eq '${TARGET_SOLUTION}'`,
      select: ['solutionid', 'uniquename', 'version'],
    },
  );

  const solutions = solutionResponse?.value ?? [];

  if (solutions.length === 0) {
    console.log(
      `[PHASE-2c] [WARN] Solution '${TARGET_SOLUTION}' not found in this environment. ` +
        'Continuing — no baseline snapshot available.',
    );
    return null;
  }

  const solution = solutions[0];
  if (!solution) {
    throw new Error('[PHASE-2c] Solution query returned empty array element.');
  }

  const componentCountResponse = await http.get<SolutionComponentCountResponse>(
    `solutions(${solution.solutionid})/solutioncomponents/$count`,
  );

  const componentCount = componentCountResponse?.value ?? 0;

  const snapshot: ExistingSolutionSnapshot = {
    solutionId: solution.solutionid,
    uniqueName: solution.uniquename,
    version: solution.version,
    componentCount,
  };

  console.log(
    `[PHASE-2c] [PASS] Snapshot recorded: ${TARGET_SOLUTION} v${solution.version}, ` +
      `${componentCount} component(s).`,
  );

  return snapshot;
}
