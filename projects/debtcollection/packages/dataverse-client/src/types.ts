import type { OrgTarget } from '@dcp/types';

// ---------------------------------------------------------------------------
// OData / Dataverse client types (internal to this package)
// ---------------------------------------------------------------------------

export interface DataverseClientConfig {
  /** Which org this client is wired to. */
  org: OrgTarget;
  /**
   * Token provider — called before every request so tokens stay fresh.
   * The org key is provided so multi-org setups can use per-org credentials.
   */
  getAccessToken: (orgKey: string) => Promise<string>;
}

export interface ODataQueryOptions {
  select?: string[];
  filter?: string;
  top?: number;
  skip?: number;
  orderBy?: string;
  expand?: string[];
  count?: boolean;
}

export interface ODataListResult<T> {
  value: T[];
  '@odata.count'?: number;
  '@odata.nextLink'?: string;
}

/** Typed OData error from Dataverse */
export interface ODataError {
  error: {
    code: string;
    message: string;
    innererror?: {
      message: string;
      type: string;
      stacktrace: string;
    };
  };
}

export interface RequestOptions {
  /** Propagated from the incoming request for end-to-end tracing. */
  correlationId?: string;
  /**
   * The CRM user (systemuserid) the call is made on behalf of. Sent as `MSCRMCallerID`, which
   * cloud and on-prem 9.x both honour, so CRM security decides what that user may read or write.
   * The service identity must hold the delegate privilege for this to be accepted.
   */
  callerId?: string;
}

export interface BatchOperation {
  method: 'PATCH' | 'POST' | 'DELETE';
  entity: string;
  /** GUID of the record — required for PATCH and DELETE. */
  id?: string;
  body?: Record<string, unknown>;
}

export interface AlternateKeyOptions {
  keyName: string;
  keyValue: string;
}
