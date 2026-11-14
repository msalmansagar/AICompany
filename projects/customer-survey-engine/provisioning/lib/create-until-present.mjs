/**
 * Retries a metadata create through transient Dataverse failures without ever duplicating it.
 * Metadata creates on a busy org often time out on the server (503, SQL timeout) after the
 * change has in fact been committed, so before every retry the component is looked up again.
 *
 * @module survey-provisioning/create-until-present
 */
import { DataverseRequestError } from './dataverse-client.mjs';

const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const DEFAULT_ATTEMPTS = 5;
const DEFAULT_WAIT_MS = 30000;

/**
 * Answers whether an error is a transient server-side failure worth retrying.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTransientFailure(error) {
  return error instanceof DataverseRequestError && TRANSIENT_STATUSES.has(error.status);
}

/**
 * Runs `create` until `isPresent` answers true. A non-transient error is rethrown at once.
 *
 * @param {{ create: () => Promise<unknown>, isPresent: () => Promise<boolean>, onRetry?: (attempt: number, error: Error) => void }} operation
 * @param {{ attempts?: number, waitMs?: number }} [options]
 * @returns {Promise<'created' | 'present after timeout'>}
 */
export async function createUntilPresent(operation, options = {}) {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (lastError && await operation.isPresent()) return 'present after timeout';
    try {
      await operation.create();
      return 'created';
    } catch (error) {
      if (!isTransientFailure(error)) throw error;
      lastError = error;
      operation.onRetry?.(attempt, error);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  if (await operation.isPresent()) return 'present after timeout';
  throw lastError;
}
