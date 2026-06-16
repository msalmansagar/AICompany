// ---------------------------------------------------------------------------
// Typed error class for all Dataverse / OData failures
// ---------------------------------------------------------------------------

export class DataverseError extends Error {
  /** OData error code returned by Dataverse */
  readonly odataCode: string;
  /** HTTP status code of the failed response */
  readonly httpStatus: number;

  constructor(message: string, odataCode: string, httpStatus: number) {
    super(message);
    this.name = 'DataverseError';
    this.odataCode = odataCode;
    this.httpStatus = httpStatus;
  }
}

export class DataverseNotFoundError extends DataverseError {
  constructor(entity: string, id: string) {
    super(`${entity} record '${id}' not found`, '0x80040217', 404);
    this.name = 'DataverseNotFoundError';
  }
}

export class DataverseAuthError extends DataverseError {
  constructor(detail: string) {
    super(`Dataverse authentication failed: ${detail}`, 'auth_error', 401);
    this.name = 'DataverseAuthError';
  }
}
