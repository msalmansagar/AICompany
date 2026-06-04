// Retry utility for Xrm.WebApi calls.
// Implements exponential backoff with up to 3 retries.
// All service layer functions use this wrapper — never call Xrm.WebApi directly.

const BASE_DELAY_MS = 500;
const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class CrmApiError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CrmApiError';
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt);
        await delay(backoffMs);
      }
    }
  }

  // Xrm.WebApi throws plain objects { errorCode, message } — normalise to Error
  const xrmMsg =
    lastError != null && typeof lastError === 'object' && 'message' in lastError
      ? String((lastError as { message: unknown }).message)
      : null;

  throw new CrmApiError(
    `Operation '${operationName}' failed after ${MAX_RETRIES} retries${xrmMsg ? `: ${xrmMsg}` : ''}`,
    operationName,
    lastError
  );
}
