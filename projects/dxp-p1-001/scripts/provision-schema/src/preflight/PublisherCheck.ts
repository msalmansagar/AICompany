import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse, PublisherRecord } from '../types/DataverseMetadata.js';
import type { PublisherCheckResult } from '../types/ProvisioningResult.js';

const MOCK_PUBLISHER_ID = '00000000-0000-0000-0000-000000000001';
const PUBLISHER_PREFIX = 'qdb';

export async function runPublisherCheck(
  http: DataverseHttpClient,
): Promise<PublisherCheckResult> {
  console.log(`[PHASE-2a] Checking for publisher with prefix '${PUBLISHER_PREFIX}'...`);

  const response = await http.get<ODataCollectionResponse<PublisherRecord>>(
    'publishers',
    {
      filter: `customizationprefix eq '${PUBLISHER_PREFIX}'`,
      select: ['publisherid', 'friendlyname', 'customizationprefix'],
    },
  );

  const publishers = response?.value ?? [];

  if (publishers.length > 0) {
    const publisher = publishers[0];
    if (!publisher) throw new Error('[PHASE-2a] Publisher query returned empty array element.');
    console.log(`[PHASE-2a] [PASS] Publisher found: ${publisher.friendlyname} (${publisher.publisherid})`);
    return { found: true, publisherId: publisher.publisherid, prefix: publisher.customizationprefix };
  }

  console.log(`[PHASE-2a] Publisher '${PUBLISHER_PREFIX}' not found.`);

  if (env.DRY_RUN) {
    console.log(
      `[PHASE-2a] [DRY-RUN] Publisher qdb_ not found. Would create. ` +
        `Using mock publisherId ${MOCK_PUBLISHER_ID} for dry-run continuation.`,
    );
    return { found: false, created: false, dryRun: true, mockPublisherId: MOCK_PUBLISHER_ID };
  }

  console.log(`[PHASE-2a] Creating publisher 'qdb_'...`);
  const createResponse = await http.postRaw('publishers', {
    friendlyname: 'QDB Portal',
    uniquename: 'QdbPortal',
    customizationprefix: PUBLISHER_PREFIX,
    customizationoptionvalueprefix: 86000,
    description: 'Publisher for Maqsad AI DXP platform components',
  });

  const entityIdHeader = createResponse.headers.get('OData-EntityId') ?? '';
  const publisherIdMatch = entityIdHeader.match(/\(([^)]+)\)/);
  const publisherId = publisherIdMatch?.[1];

  if (!publisherId) {
    throw new Error(
      `[PHASE-2a] [ERROR] Publisher POST succeeded but OData-EntityId header was missing. ` +
        `Header value: '${entityIdHeader}'`,
    );
  }

  console.log(`[PHASE-2a] [PASS] Publisher created with ID: ${publisherId}`);
  return { found: false, created: true, publisherId };
}
