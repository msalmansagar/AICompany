// @dcp/dataverse-client — public API

export { DataverseClient } from './DataverseClient.js';
export {
  CrmApiError,
  CrmNotFoundError,
  CrmAuthError,
  CrmHttpStatusError,
} from './CrmApiError.js';
export type {
  DataverseClientConfig,
  ODataQueryOptions,
  ODataListResult,
  ODataError,
  RequestOptions,
  BatchOperation,
  AlternateKeyOptions,
} from './types.js';

export { DataverseCrmAdapter } from './DataverseCrmAdapter.js';
