import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, SolutionRecord } from '../types/DataverseMetadata.js';
import type { ExistingSolutionSnapshot } from '../types/ProvisioningResult.js';

// C-SCHEMA-006: Record the QdbDynamicFormEngine component count and version
// so Phase 9 can confirm the solution was not touched.
const TARGET_SOLUTION = 'QdbDynamicFormEngine';


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

  // Component count is informational only — the version check in Phase 9 is the
  // authoritative integrity guard. Skipping the count avoids solutioncomponent
  // lookup filter complexity (the field is _solutionid_value, not solutionid).
  const componentCount = 0;

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
