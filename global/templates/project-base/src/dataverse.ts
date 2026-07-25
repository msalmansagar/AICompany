/**
 * Canonical Dataverse wiring — inherited by every project.
 *
 * Composes the two global services: a token provider feeds the metadata
 * service, and the lookup service delegates option-sets to metadata. Supply
 * your project's own TokenProvider (your auth) and you have metadata + lookup
 * ready, without writing either.
 *
 * The imports resolve to the vendored copies under ./global (see GLOBAL-VERSION).
 */

import { CrmMetadataService } from './global/dataverse-metadata/node/CrmMetadataService.js';
import { CrmLookupService } from './global/dataverse-lookup/node/CrmLookupService.js';

export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export interface DataverseConfig {
  dataverseUrl: string;
  tokenProvider: TokenProvider;
}

/** Build the wired metadata + lookup services for this project. */
export function createDataverse(config: DataverseConfig): {
  metadata: CrmMetadataService;
  lookup: CrmLookupService;
} {
  const metadata = new CrmMetadataService({
    dataverseUrl: config.dataverseUrl,
    tokenProvider: config.tokenProvider,
  });
  const lookup = new CrmLookupService({
    dataverseUrl: config.dataverseUrl,
    tokenProvider: config.tokenProvider,
    metadata,
  });
  return { metadata, lookup };
}
