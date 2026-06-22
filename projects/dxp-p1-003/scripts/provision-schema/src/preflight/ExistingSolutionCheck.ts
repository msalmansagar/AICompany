import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, SolutionRecord } from '../types/DataverseMetadata.js';
import type { ExistingSolutionSnapshot } from '../types/ProvisioningResult.js';

const SOLUTION_UNIQUE_NAME = 'QdbDxpPlatform';

interface SolutionComponentRecord {
  readonly solutioncomponentid: string;
}

export class ExistingSolutionCheck {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async captureSnapshot(): Promise<ExistingSolutionSnapshot | null> {
    console.log('[Phase 2] Checking existing solution...');

    const result = await this.http.get<ODataCollectionResponse<SolutionRecord>>(
      'solutions',
      {
        filter: `uniquename eq '${SOLUTION_UNIQUE_NAME}'`,
        select: ['solutionid', 'uniquename', 'version'],
        top: 1,
      },
    );

    if (!result?.value?.length) {
      console.log(`  [INFO] Solution '${SOLUTION_UNIQUE_NAME}' does not exist yet — will be created.`);
      return null;
    }

    const solution = result.value[0]!;

    const components = await this.http.fetchAllPages<SolutionComponentRecord>(
      'solutioncomponents',
      {
        filter: `_solutionid_value eq ${solution.solutionid}`,
        select: ['solutioncomponentid'],
      },
    );

    const snapshot: ExistingSolutionSnapshot = {
      solutionId: solution.solutionid,
      uniqueName: solution.uniquename,
      version: solution.version,
      componentCount: components.length,
    };

    console.log(`  [INFO] Existing solution found: v${snapshot.version}, ${snapshot.componentCount} components`);
    return snapshot;
  }
}
