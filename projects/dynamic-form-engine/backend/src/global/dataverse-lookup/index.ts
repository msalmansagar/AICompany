/**
 * @mss/dataverse-lookup — public entry.
 * Import the contract from here; pick a runtime implementation from ./node or
 * ./browser. Compose the Node service with @mss/dataverse-metadata for
 * option-set resolution. See ../../README.md for the two-runtime rule.
 */
export * from './contract.js';
export { CrmLookupService } from './node/CrmLookupService.js';
export type {
  TokenProvider,
  OptionSetResolver,
  CrmLookupServiceOptions,
} from './node/CrmLookupService.js';
