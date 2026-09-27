/**
 * The Collection Activity — the single operational action record, including promise to pay.
 *
 * What is NOT here is the point: no message body, no channel, no recipient. Communications are
 * native `fax` / `email` / letter records. An activity may *correlate* to one through
 * `relatedRecord`, which is a reference, so the unified Communication History can navigate
 * Case ↔ Activity ↔ native record without a second copy of the message ever existing.
 */

import { z } from 'zod';
import { ActivityStatus, ACTIVITY_STATUS_CODES, PtpStatus, PTP_STATUS_CODES } from './activityLifecycle.js';

export const ActivityStatusSchema = z.enum(Object.keys(ACTIVITY_STATUS_CODES) as [ActivityStatus, ...ActivityStatus[]]);
export const PtpStatusSchema = z.enum(Object.keys(PTP_STATUS_CODES) as [PtpStatus, ...PtpStatus[]]);

/** Labels of `qdb_promise_type`. */
export const PromiseTypeSchema = z.enum(['Full', 'Partial']);

/**
 * A reference to the native record an activity correlates with. The entity is whatever the
 * communication phase confirms (`fax`, `email`, a document); the activity does not interpret it.
 */
export const RelatedRecordRefSchema = z.object({
  entity: z.string().min(1),
  id: z.string().uuid(),
});
export type RelatedRecordRef = z.infer<typeof RelatedRecordRefSchema>;

/** The promise-to-pay facts an activity carries when its type is a promise. */
export const PromiseToPaySchema = z.object({
  ptpDate: z.string(),
  promisedAmount: z.number().positive(),
  promiseType: PromiseTypeSchema.optional(),
  status: PtpStatusSchema,
  amountReceived: z.number().nonnegative().optional(),
  paymentReceivedDate: z.string().optional(),
  brokenDate: z.string().optional(),
  brokenReason: z.string().optional(),
  rescheduleCount: z.number().int().nonnegative().optional(),
  previousPtpDate: z.string().optional(),
});
export type PromiseToPay = z.infer<typeof PromiseToPaySchema>;

export const CollectionActivitySchema = z.object({
  id: z.string().uuid().optional(),
  caseId: z.string().uuid(),
  /** `qdb_code` of the `qdb_collectionactivitytype` row — reference data QDB maintains, matched by code, never by GUID. */
  activityTypeCode: z.string().min(1),
  subject: z.string().optional(),
  activityDate: z.string(),
  status: ActivityStatusSchema,
  followUpDate: z.string().optional(),
  amount: z.number().optional(),
  outcomeCode: z.string().optional(),
  promise: PromiseToPaySchema.optional(),
  relatedRecord: RelatedRecordRefSchema.optional(),
  correlationId: z.string().optional(),
});
export type CollectionActivity = z.infer<typeof CollectionActivitySchema>;

/** True when the activity is a promise to pay: it carries promise facts. */
export function isPromiseToPay(activity: Pick<CollectionActivity, 'promise'>): activity is CollectionActivity & { promise: PromiseToPay } {
  return activity.promise !== undefined;
}

/** Builds a new promise-to-pay activity in its opening states. */
export function openPromiseToPay(input: {
  caseId: string;
  activityTypeCode: string;
  activityDate: string;
  ptpDate: string;
  promisedAmount: number;
  promiseType?: PromiseToPay['promiseType'];
}): CollectionActivity {
  return {
    caseId: input.caseId,
    activityTypeCode: input.activityTypeCode,
    activityDate: input.activityDate,
    status: 'Open',
    promise: {
      ptpDate: input.ptpDate,
      promisedAmount: input.promisedAmount,
      ...(input.promiseType !== undefined ? { promiseType: input.promiseType } : {}),
      status: 'Active',
    },
  };
}
