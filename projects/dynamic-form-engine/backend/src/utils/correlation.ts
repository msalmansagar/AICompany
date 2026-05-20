import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user?: JwtPayload;
    }
  }
}

export interface JwtPayload {
  oid: string;       // Azure AD object ID
  name?: string;
  preferred_username?: string;
  groups?: string[];
  // Azure AD app roles assigned to the user (populated via app role assignments)
  roles?: string[];
  aud: string;
  iss: string;
  exp: number;
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}
