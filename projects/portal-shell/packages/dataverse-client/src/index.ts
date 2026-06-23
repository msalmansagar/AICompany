// @portal/dataverse-client — public API

export { DataverseClient } from './DataverseClient.js';
export { DataverseError, DataverseNotFoundError, DataverseAuthError } from './DataverseError.js';
export type {
  DataverseClientConfig,
  ODataQueryOptions,
  ODataListResult,
  ODataError,
  RequestOptions,
  BatchOperation,
} from './types.js';
