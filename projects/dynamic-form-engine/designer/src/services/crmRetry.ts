// Retry utility for Xrm.WebApi calls.
// Implements exponential backoff with up to 3 retries.
// All service layer functions use this wrapper — never call Xrm.WebApi directly.

import { ConcurrencyConflictError } from './concurrency/ConcurrencyConflictError';

const BASE_DELAY_MS = 500;
const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 4xx errors are deterministic client mistakes — retrying won't help.
function isClientError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const msg = String((error as Record<string, unknown>).message ?? '');
  return /\(4\d{2}\)/.test(msg);
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

      // ConcurrencyConflictError is a deliberate domain signal, not a transient failure.
      // Retrying a 412 would produce the same result — rethrow immediately.
      if (error instanceof ConcurrencyConflictError) throw error;

      if (isClientError(error)) break;

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
