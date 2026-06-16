// ---------------------------------------------------------------------------
// Exponential-backoff retry helper
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;
const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  correlationId?: string;
}

/**
 * Executes `fn` with exponential backoff on transient failures.
 * Only retries on network errors or HTTP statuses in RETRYABLE_HTTP_STATUSES.
 *
 * @param fn - Async factory that creates and executes the fetch request
 * @param options - Retry configuration overrides
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = isRetryableError(error);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      await sleep(delayMs);
    }
  }

  // This line is unreachable but satisfies TypeScript's control flow analysis
  throw lastError;
}

/**
 * Determines whether a caught error warrants a retry attempt.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof DataverseHttpError) {
    return RETRYABLE_HTTP_STATUSES.has(error.status);
  }
  // Network-level errors (ECONNRESET, ETIMEDOUT, etc.)
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lightweight error wrapper used only inside the retry logic to carry the
 * HTTP status code before the response body is parsed.
 */
export class DataverseHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DataverseHttpError';
  }
}
