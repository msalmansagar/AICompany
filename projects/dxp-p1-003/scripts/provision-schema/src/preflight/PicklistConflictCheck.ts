import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, GlobalOptionSetRecord } from '../types/DataverseMetadata.js';

const REQUIRED_OPTION_SETS: readonly string[] = [
  'qdb_token_type',
  'qdb_token_level',
  'qdb_token_category',
];

export interface PicklistConflictReport {
  readonly alreadyExist: readonly string[];
  readonly missing: readonly string[];
}

export class PicklistConflictCheck {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async detectConflicts(): Promise<PicklistConflictReport> {
    console.log('[Phase 3] Checking for picklist conflicts...');

    const result = await this.http.get<ODataCollectionResponse<GlobalOptionSetRecord>>(
      'GlobalOptionSetDefinitions',
      {
        select: ['MetadataId', 'Name'],
      },
    );

    const existingNames = new Set((result?.value ?? []).map((os) => os.Name));

    const alreadyExist = REQUIRED_OPTION_SETS.filter((name) => existingNames.has(name));
    const missing = REQUIRED_OPTION_SETS.filter((name) => !existingNames.has(name));

    if (alreadyExist.length > 0) {
      console.log(`  [INFO] Option sets already exist (will skip): ${alreadyExist.join(', ')}`);
    }
    if (missing.length > 0) {
      console.log(`  [INFO] Option sets to create: ${missing.join(', ')}`);
    }

    return { alreadyExist, missing };
  }
}
