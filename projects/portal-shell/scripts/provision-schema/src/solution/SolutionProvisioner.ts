import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse, SolutionRecord } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const SOLUTION_UNIQUE_NAME = 'QdbPortalShell';
const SOLUTION_FRIENDLY_NAME = 'QDB Portal Shell';
const SOLUTION_VERSION = '1.0.0.0';

export async function provisionSolution(
  http: DataverseHttpClient,
  publisherId: string,
): Promise<StepResult & { solutionId: string }> {
  console.log(`[PHASE-3] Checking for solution '${SOLUTION_UNIQUE_NAME}'...`);

  const existing = await http.get<ODataCollectionResponse<SolutionRecord>>(
    'solutions',
    {
      filter: `uniquename eq '${SOLUTION_UNIQUE_NAME}'`,
      select: ['solutionid', 'uniquename', 'version'],
    },
  );

  const existingSolutions = existing?.value ?? [];

  if (existingSolutions.length > 0) {
    const solution = existingSolutions[0];
    if (!solution) {
      throw new Error('[PHASE-3] Solution query returned empty array element.');
    }
    console.log(
      `[PHASE-3] [SKIP] Solution '${SOLUTION_UNIQUE_NAME}' already exists (v${solution.version}).`,
    );
    return {
      name: SOLUTION_UNIQUE_NAME,
      status: 'skipped',
      id: solution.solutionid,
    };
  }

  if (env.DRY_RUN) {
    console.log(
      `[PHASE-3] [DRY-RUN SKIP] Would create solution '${SOLUTION_UNIQUE_NAME}' v${SOLUTION_VERSION}.`,
    );
    return {
      name: SOLUTION_UNIQUE_NAME,
      status: 'dry-run',
      id: '',
      solutionId: '',
    };
  }

  console.log(`[PHASE-3] Creating solution '${SOLUTION_UNIQUE_NAME}'...`);

  // postAdminRaw: solution creation must NOT carry MSCRM.SolutionUniqueName header —
  // Dataverse rejects it because the solution doesn't exist yet.
  const createResponse = await http.postAdminRaw('solutions', {
    uniquename: SOLUTION_UNIQUE_NAME,
    friendlyname: SOLUTION_FRIENDLY_NAME,
    version: SOLUTION_VERSION,
    'publisherid@odata.bind': `/publishers(${publisherId})`,
  });

  const entityIdHeader = createResponse.headers.get('OData-EntityId') ?? '';
  const solutionIdMatch = entityIdHeader.match(/\(([^)]+)\)/);
  const solutionId = solutionIdMatch?.[1] ?? '';

  console.log(`[PHASE-3] [PASS] Solution created: ${SOLUTION_UNIQUE_NAME} v${SOLUTION_VERSION} (${solutionId})`);

  return {
    name: SOLUTION_UNIQUE_NAME,
    status: 'created',
    id: solutionId,
    solutionId,
  };
}
