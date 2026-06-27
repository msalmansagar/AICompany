import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors.js';

const SECRET_HEADER = 'x-internal-cache-secret';

// Constant-time comparison that is also safe across differing lengths.
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Authorises a request via the shared `x-internal-cache-secret` header. Used to protect the
 * internal cache-invalidation endpoint for non-browser callers (e.g. a Dataverse command-bar
 * web resource) that cannot present a user JWT.
 */
export function requireInternalSecret(expectedSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const provided = req.header(SECRET_HEADER);
    if (!provided || !secretsMatch(provided, expectedSecret)) {
      throw new UnauthorizedError('Invalid or missing internal cache secret');
    }
    next();
  };
}
