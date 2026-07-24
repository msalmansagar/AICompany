export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class CrmApiError extends AppError {
  constructor(
    message: string,
    public readonly crmStatusCode?: number,
    public readonly crmErrorCode?: string,
  ) {
    super(message, 502, 'CRM_API_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class FormNotFoundError extends NotFoundError {
  constructor(formCode: string) {
    super(`Form '${formCode}'`);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class FormInactiveError extends AppError {
  constructor(formCode: string) {
    super(`Form '${formCode}' is not active`, 404, 'FORM_INACTIVE');
  }
}

export class FormNotPublishedError extends AppError {
  constructor(formCode: string) {
    super(`Form '${formCode}' has not been published`, 404, 'FORM_NOT_PUBLISHED');
  }
}

export class UnsupportedLanguageError extends AppError {
  public readonly supportedCodes: string[];

  constructor(code: string, supportedCodes: string[]) {
    super(`Language code '${code}' is not supported`, 400, 'INVALID_LANGUAGE_CODE');
    this.supportedCodes = supportedCodes;
  }
}

export class CacheMissError extends AppError {
  constructor(message = 'Render cache miss — no published record found') {
    super(message, 503, 'RENDER_CACHE_MISS');
  }
}

// DFE-APILOOKUP-001: per-endpoint-key + form-code rate limit exceeded.
export class RateLimitError extends AppError {
  constructor(message = 'Too many lookup requests — slow down') {
    super(message, 429, 'RATE_LIMITED');
  }
}
