/**
 * @mss/dataverse-metadata — public entry.
 * Import the contract from here; pick a runtime implementation from ./node or
 * ./browser. See ../../README.md for the two-runtime rule.
 */
export * from './contract.js';
export { CrmMetadataService } from './node/CrmMetadataService.js';
export type { TokenProvider, CrmMetadataServiceOptions } from './node/CrmMetadataService.js';
