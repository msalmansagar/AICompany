import { CrmHttpStatusError } from './CrmApiError.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Executes `fn` with exponential backoff and full jitter on transient failures.
 * Retries on network errors and retryable HTTP statuses (429, 502, 503, 504).
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
      if (!isRetryable(error) || attempt === maxRetries) {
        throw error;
      }
      await sleep(jitter(baseDelayMs * Math.pow(2, attempt)));
    }
  }

  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof CrmHttpStatusError) {
    return RETRYABLE_STATUSES.has(error.status);
  }
  // Network-level errors (ECONNRESET, ETIMEDOUT, fetch TypeError, etc.)
  return error instanceof TypeError;
}

/** Full jitter: random value in [0, cap]. Prevents thundering herd. */
function jitter(cap: number): number {
  return Math.random() * cap;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
