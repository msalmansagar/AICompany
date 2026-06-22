import { env } from '../config/env.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, PublisherRecord } from '../types/DataverseMetadata.js';
import type { PublisherCheckResult } from '../types/ProvisioningResult.js';

const PUBLISHER_UNIQUE_NAME = 'qdb';
const PUBLISHER_FRIENDLY_NAME = 'QDB Portal Solutions';
const PUBLISHER_DESCRIPTION = 'QDB Digital Experience Platform publisher';
const CUSTOMIZATION_PREFIX = 'qdb';
const CUSTOMIZATION_OPTION_VALUE_PREFIX = 860005;

export class PublisherCheck {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async ensurePublisherExists(): Promise<PublisherCheckResult> {
    console.log('[Phase 1] Checking publisher...');

    const existing = await this.http.get<ODataCollectionResponse<PublisherRecord>>(
      'publishers',
      {
        filter: `uniquename eq '${PUBLISHER_UNIQUE_NAME}'`,
        select: ['publisherid', 'friendlyname', 'customizationprefix'],
        top: 1,
      },
    );

    if (existing?.value?.length) {
      const publisher = existing.value[0]!;
      console.log(`  [SKIP] Publisher '${PUBLISHER_UNIQUE_NAME}' already exists (${publisher.publisherid})`);
      return { found: true, publisherId: publisher.publisherid, prefix: publisher.customizationprefix };
    }

    if (env.DRY_RUN) {
      console.log(`  [DRY-RUN] Would create publisher '${PUBLISHER_UNIQUE_NAME}'`);
      return { found: false, created: false, dryRun: true, mockPublisherId: '00000000-0000-0000-0000-000000000001' };
    }

    console.log(`  [CREATE] Creating publisher '${PUBLISHER_UNIQUE_NAME}'...`);

    const response = await this.http.postAdminRaw('publishers', {
      uniquename: PUBLISHER_UNIQUE_NAME,
      friendlyname: PUBLISHER_FRIENDLY_NAME,
      description: PUBLISHER_DESCRIPTION,
      customizationprefix: CUSTOMIZATION_PREFIX,
      customizationoptionvalueprefix: CUSTOMIZATION_OPTION_VALUE_PREFIX,
    });

    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = entityId.match(/\(([^)]+)\)$/);
    const publisherId = match?.[1] ?? entityId;

    console.log(`  [OK] Publisher created: ${publisherId}`);
    return { found: false, created: true, publisherId };
  }
}
