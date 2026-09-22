// ---------------------------------------------------------------------------
// Typed error hierarchy for all Dataverse / OData call failures
// ---------------------------------------------------------------------------

/** Base error for any failure returned by the Dataverse Web API. */
export class CrmApiError extends Error {
  /** OData error code returned by Dataverse (e.g. '0x80040217'). */
  readonly odataCode: string;
  /** HTTP status code of the failed response. */
  readonly httpStatus: number;

  constructor(message: string, odataCode: string, httpStatus: number) {
    super(message);
    this.name = 'CrmApiError';
    this.odataCode = odataCode;
    this.httpStatus = httpStatus;
  }
}

/** The record addressed by GUID or alternate key was not found (HTTP 404). */
export class CrmNotFoundError extends CrmApiError {
  constructor(entity: string, key: string) {
    super(`${entity} record '${key}' not found`, '0x80040217', 404);
    this.name = 'CrmNotFoundError';
  }
}

/** The service principal token was rejected (HTTP 401). */
export class CrmAuthError extends CrmApiError {
  constructor(detail: string) {
    super(`Dataverse authentication failed: ${detail}`, 'auth_error', 401);
    this.name = 'CrmAuthError';
  }
}

/**
 * Lightweight carrier used inside the retry logic to preserve the HTTP status
 * before the error body is parsed into a richer CrmApiError.
 * Extends CrmApiError so that exhausted-retry callers see a CrmApiError instance.
 * @internal
 */
export class CrmHttpStatusError extends CrmApiError {
  constructor(readonly status: number, message: string) {
    super(message, 'http_error', status);
    this.name = 'CrmHttpStatusError';
  }
}
