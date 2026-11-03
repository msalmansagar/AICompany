import { z } from 'zod';

export const ExceptionReasonSchema = z.enum([
  'missing',
  'duplicate',
  'one-org-only',
]);

export type ExceptionReason = z.infer<typeof ExceptionReasonSchema>;

/**
 * Unresolved-identity queue entry (msst_dcpidentityexception).
 * Created when a MIS record arrives with a missing or duplicate QID (FR-007).
 */
export const IdentityExceptionSchema = z.object({
  msst_dcpidentityexceptionid: z.string().uuid(),
  msst_qid: z.string().optional(),
  msst_reason: ExceptionReasonSchema,
  msst_status: z.string(),
  msst_reviewedby: z.string().optional(),
  createdon: z.string().optional(), // FIXED: Dataverse uses createdon (no underscore)
});

export type IdentityException = z.infer<typeof IdentityExceptionSchema>;
