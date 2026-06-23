import { env } from '../config/env.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, SolutionRecord } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const SOLUTION_UNIQUE_NAME = 'QdbDxpPlatform';
const SOLUTION_FRIENDLY_NAME = 'QDB DXP Platform';
const SOLUTION_VERSION = '1.3.0.0';
const SOLUTION_DESCRIPTION = 'QDB Digital Experience Platform — theme token system and portal runtime';

export class SolutionProvisioner {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async ensureSolutionExists(publisherId: string): Promise<StepResult> {
    console.log('[Phase 4] Ensuring solution exists...');

    const existing = await this.http.get<ODataCollectionResponse<SolutionRecord>>(
      'solutions',
      {
        filter: `uniquename eq '${SOLUTION_UNIQUE_NAME}'`,
        select: ['solutionid', 'uniquename', 'version'],
        top: 1,
      },
    );

    if (existing?.value?.length) {
      const solution = existing.value[0]!;
      console.log(`  [SKIP] Solution '${SOLUTION_UNIQUE_NAME}' already exists (${solution.solutionid})`);
      return { name: SOLUTION_UNIQUE_NAME, status: 'skipped', id: solution.solutionid };
    }

    if (env.DRY_RUN) {
      console.log(`  [DRY-RUN] Would create solution '${SOLUTION_UNIQUE_NAME}'`);
      return { name: SOLUTION_UNIQUE_NAME, status: 'dry-run' };
    }

    console.log(`  [CREATE] Creating solution '${SOLUTION_UNIQUE_NAME}'...`);

    const response = await this.http.postAdminRaw('solutions', {
      uniquename: SOLUTION_UNIQUE_NAME,
      friendlyname: SOLUTION_FRIENDLY_NAME,
      version: SOLUTION_VERSION,
      description: SOLUTION_DESCRIPTION,
      'publisherid@odata.bind': `/publishers(${publisherId})`,
    });

    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = entityId.match(/\(([^)]+)\)$/);
    const solutionId = match?.[1] ?? entityId;

    console.log(`  [OK] Solution created: ${solutionId}`);
    return { name: SOLUTION_UNIQUE_NAME, status: 'created', id: solutionId };
  }
}
