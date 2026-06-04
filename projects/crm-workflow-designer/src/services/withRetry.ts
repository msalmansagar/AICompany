const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 300;

/**
 * Retries an async operation up to MAX_ATTEMPTS times with exponential backoff.
 * Non-retryable errors (4xx except 429) are thrown immediately.
 */
export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (isNonRetryable(error)) throw error;

      if (attempt < MAX_ATTEMPTS) {
        await delay(BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }
  }

  throw lastError;
}

function isNonRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  // 4xx errors except 429 (rate limit) are non-retryable
  const match = /HTTP (\d{3})/.exec(message);
  if (!match) return false;
  const status = parseInt(match[1] ?? '0', 10);
  return status >= 400 && status < 500 && status !== 429;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
