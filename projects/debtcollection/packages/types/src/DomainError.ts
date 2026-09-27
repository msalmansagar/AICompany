import { z } from 'zod';

export const DOMAIN_ERROR_CODES = [
  'stop_contact',
  'consent_withdrawn',
  'consent_not_established',
  'invalid_transition',
  'identity_unresolved',
  'mis_unavailable',
  'dataverse_unavailable',
  'customer_not_found',
  'record_not_found',
  'validation_error',
  'unauthorized',
  'forbidden',
  'bfd_disabled',
  'org_unresolvable',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export const DomainErrorSchema = z.object({
  code: z.enum(DOMAIN_ERROR_CODES),
  message: z.string(),
  correlationId: z.string().uuid().optional(),
});

/** Stable domain error — always has a code, human message, and optional trace id. */
export type DomainError = z.infer<typeof DomainErrorSchema>;

/** Map a DomainErrorCode to an HTTP status code. */
export function httpStatusForCode(code: DomainErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
    case 'stop_contact':
    case 'consent_withdrawn':
    case 'consent_not_established':
    case 'bfd_disabled':
      return 403;
    case 'customer_not_found':
    case 'record_not_found':
      return 404;
    case 'validation_error':
      return 422;
    case 'invalid_transition':
      return 409;
    case 'mis_unavailable':
    case 'dataverse_unavailable':
      return 503;
    default:
      return 500;
  }
}

export function makeDomainError(
  code: DomainErrorCode,
  message: string,
  correlationId?: string,
): DomainError {
  return correlationId !== undefined
    ? { code, message, correlationId }
    : { code, message };
}
