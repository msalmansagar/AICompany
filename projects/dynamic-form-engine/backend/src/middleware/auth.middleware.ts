import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { JwtPayload } from '../utils/correlation.js';

const JWKS_URI = `https://login.microsoftonline.com/${config.AZURE_TENANT_ID}/discovery/v2.0/keys`;

const jwks = createRemoteJWKSet(new URL(JWKS_URI));

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (config.SKIP_AUTH && config.NODE_ENV !== 'production') {
    req.user = {
      oid: '00000000-0000-0000-0000-000000000001',
      sub: 'dev-user',
      name: 'Dev User',
      preferred_username: 'dev@local.dev',
      roles: ['CRMAdmin'],
      aud: 'dev',
      iss: 'dev',
      exp: 9_999_999_999,
    } as unknown as JwtPayload;
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: config.AZURE_AD_AUDIENCE,
      issuer: [
        `https://login.microsoftonline.com/${config.AZURE_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${config.AZURE_TENANT_ID}/`,
      ],
    });

    req.user = payload as unknown as JwtPayload;
    next();
  } catch (error) {
    logger.warn({ correlationId: req.correlationId, error }, 'Token validation failed');
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
