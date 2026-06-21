/**
 * TokenErrors — typed error classes for the DXP-P1-003 Theme Token System.
 *
 * Each error carries `code` (for the API error response body) and `statusCode`
 * (for the HTTP response status). The existing global error handler in app.ts
 * reads `err.statusCode` and `err.code` — so these errors are picked up
 * automatically without any additional error handler changes.
 */

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

/** Base for all token domain errors. Carries code and HTTP status. */
abstract class TokenError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    // Restore prototype chain broken by TypeScript when extending built-in classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// 404 errors
// ---------------------------------------------------------------------------

/** Thrown when a requested token definition does not exist or is inactive. */
export class TokenNotFoundError extends TokenError {
  readonly code = 'token_definition_not_found';
  readonly statusCode = 404;

  constructor(slug: string) {
    super(`Token definition '${slug}' not found`);
    this.name = 'TokenNotFoundError';
  }
}

/** Thrown when a requested token value does not exist or is inactive. */
export class TokenValueNotFoundError extends TokenError {
  readonly code = 'token_value_not_found';
  readonly statusCode = 404;

  constructor(id: string) {
    super(`Token value '${id}' not found`);
    this.name = 'TokenValueNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// 409 errors
// ---------------------------------------------------------------------------

/** Thrown when attempting to create a definition with a slug that already exists. */
export class TokenDuplicateSlugError extends TokenError {
  readonly code = 'duplicate_token_slug';
  readonly statusCode = 409;

  constructor(slug: string) {
    super(`A token definition with slug '${slug}' already exists`);
    this.name = 'TokenDuplicateSlugError';
  }
}

/** Thrown when a token value with the same context already exists for a definition. */
export class TokenDuplicateContextError extends TokenError {
  readonly code = 'duplicate_token_value_context';
  readonly statusCode = 409;

  constructor(definitionSlug: string) {
    super(
      `An active token value with the same context already exists for definition '${definitionSlug}'`,
    );
    this.name = 'TokenDuplicateContextError';
  }
}

// ---------------------------------------------------------------------------
// 422 errors
// ---------------------------------------------------------------------------

/** Thrown when the active definition count has reached the configured ceiling. */
export class TokenDefinitionLimitError extends TokenError {
  readonly code = 'token_definition_limit_reached';
  readonly statusCode = 422;

  constructor(message: string) {
    super(message);
    this.name = 'TokenDefinitionLimitError';
  }
}

// ---------------------------------------------------------------------------
// 403 errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a service-owner attempts to write a token value for a service
 * slug that does not match their JWT-derived service slug.
 */
export class TokenServiceSlugMismatchError extends TokenError {
  readonly code = 'service_slug_mismatch';
  readonly statusCode = 403;

  constructor(expected: string) {
    super(`Service slug mismatch — you may only manage tokens for service '${expected}'`);
    this.name = 'TokenServiceSlugMismatchError';
  }
}

/**
 * Thrown when a service-owner's role slug contains no service slug suffix.
 * Role slug must be in the form 'service-owner:<slug>'.
 */
export class TokenNoServiceSlugError extends TokenError {
  readonly code = 'no_service_slug';
  readonly statusCode = 403;

  constructor() {
    super(
      "Your role does not carry a service slug. Role must be in the form 'service-owner:<slug>'.",
    );
    this.name = 'TokenNoServiceSlugError';
  }
}

// ---------------------------------------------------------------------------
// 429 errors
// ---------------------------------------------------------------------------

/** Thrown when a publish operation is already in progress (lock held). */
export class TokenPublishInProgressError extends TokenError {
  readonly code = 'publish_in_progress';
  readonly statusCode = 429;

  constructor() {
    super('A publish operation is already in progress — try again in a moment');
    this.name = 'TokenPublishInProgressError';
  }
}

/** Thrown when a publish request arrives within the minimum interval. */
export class TokenPublishRateLimitedError extends TokenError {
  readonly code = 'publish_rate_limited';
  readonly statusCode = 429;
  /** Remaining time in milliseconds before the next publish is permitted. */
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    super(`Publish rate limited — please wait ${retryAfterSec}s before publishing again`);
    this.name = 'TokenPublishRateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Validation error (CSS value sanitisation)
// ---------------------------------------------------------------------------

/** Thrown when a CSS value fails sanitisation checks. */
export class TokenCssValueValidationError extends TokenError {
  readonly code = 'invalid_css_value';
  readonly statusCode = 400;

  constructor(reason: string) {
    super(`Invalid CSS value: ${reason}`);
    this.name = 'TokenCssValueValidationError';
  }
}
