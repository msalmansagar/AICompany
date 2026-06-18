// ---------------------------------------------------------------------------
// OData / Dataverse client-level types (internal to this package)
// ---------------------------------------------------------------------------

export interface DataverseClientConfig {
  /** e.g. https://org5869857f.crm4.dynamics.com */
  orgUrl: string;
  /** MSAL token provider injected at construction time */
  getAccessToken: () => Promise<string>;
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

/** Options accepted by every mutating request */
export interface RequestOptions {
  /** Propagated from Fastify request context */
  correlationId?: string;
}

/** A single operation within an OData $batch changeSet */
export interface BatchOperation {
  method: 'PATCH' | 'POST' | 'DELETE';
  entity: string;
  /** GUID of the record — required for PATCH and DELETE */
  id?: string;
  body?: Record<string, unknown>;
}
