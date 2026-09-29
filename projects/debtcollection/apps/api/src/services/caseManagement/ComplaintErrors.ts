/**
 * Why a Case Management complaint could not be raised. Each carries the HTTP status and code the
 * route returns, so the route maps errors without knowing which step failed.
 */
export abstract class ComplaintError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;
}

/** The Case Management target is not configured, or a required record is missing or ambiguous. */
export class ComplaintConfigurationError extends ComplaintError {
  readonly httpStatus = 503;
  readonly code = 'case_management_configuration';
  constructor(message: string) {
    super(message);
    this.name = 'ComplaintConfigurationError';
  }
}

/** The collection context cannot support an HL complaint (wrong source, missing mobile, …). */
export class ComplaintContextError extends ComplaintError {
  readonly httpStatus = 422;
  readonly code = 'complaint_context_invalid';
  constructor(message: string) {
    super(message);
    this.name = 'ComplaintContextError';
  }
}

/** CRM refused the user, in HL CRM (the Collection Case) or in Case Management (the complaint). */
export class ComplaintAccessError extends ComplaintError {
  readonly httpStatus = 403;
  readonly code = 'complaint_access_denied';
  constructor(message: string) {
    super(message);
    this.name = 'ComplaintAccessError';
  }
}

/** The Collection Case does not exist, or is not visible to this user. */
export class CollectionCaseNotFoundError extends ComplaintError {
  readonly httpStatus = 404;
  readonly code = 'collection_case_not_found';
  constructor(collectionCaseId: string) {
    super(`Collection Case ${collectionCaseId} was not found`);
    this.name = 'CollectionCaseNotFoundError';
  }
}
