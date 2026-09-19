import { z } from 'zod';
import {
  ACTIVITY_STATE_CODES, ACTIVITY_STATUS_CODES, PTP_STATUS_CODES,
  isActivityTransitionAllowed, isPtpTransitionAllowed,
  type ActivityStatus, type PtpStatus,
} from './activityLifecycle.js';

/**
 * What a collection officer may ask the system to do, and what makes each request valid.
 *
 * These are **pure decisions**: they take what the user typed and what configuration says, and they
 * answer "is this allowed, and what should be written". They do not touch CRM. That separation is
 * what lets every rule here be tested without an organisation, and what keeps React from composing
 * a Dataverse write — a component calls an operation, the operation returns a plan, and the service
 * layer executes it.
 *
 * **No threshold is written here.** There is no maximum promise amount, no maximum promise period,
 * no limit on active promises, no tolerance and no grace period, because none of those is in
 * evidence and §8 of the Phase 6 authorisation forbids inventing them. What *is* here is arithmetic
 * and lifecycle: an amount must be positive to be an amount at all, a date must parse, and a
 * transition must be one the matrix permits. Where a rule is QDB's, it is a Known Issue instead.
 */

// ── What configuration says about an outcome ─────────────────────────────────

/**
 * The behaviour an outcome drives, read from `qdb_activityoutcome`.
 *
 * Follow-up scheduling and whether notes are mandatory are **configuration, not code**: the outcome
 * record carries `qdb_requiresfollowup`, `qdb_followupdays`, `qdb_requiresnotes` and
 * `qdb_escalationrequired`, and this reads them. Hard-coding "a refusal needs a note" would move a
 * QDB decision into a TypeScript file.
 *
 * The catalogue itself does not exist yet (KI-66); the synthetic `P6-` set exercises the mechanism.
 */
export const ActivityOutcomeConfigSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  requiresFollowUp: z.boolean().default(false),
  followUpDays: z.number().int().nonnegative().optional(),
  requiresNotes: z.boolean().default(false),
  escalationRequired: z.boolean().default(false),
});
export type ActivityOutcomeConfig = z.infer<typeof ActivityOutcomeConfigSchema>;

// ── Results ──────────────────────────────────────────────────────────────────

export interface OperationRefusal {
  /** A stable code a UI can branch on without reading English. */
  code:
    | 'AmountNotPositive' | 'DateMissing' | 'DateMalformed' | 'NotesRequired'
    | 'TransitionNotAllowed' | 'ActivityImmutable' | 'OutcomeRequired'
    | 'FollowUpDateRequired' | 'SubjectRequired' | 'TypeRequired' | 'CaseRequired'
    | 'PromiseTermsSettled' | 'NothingToSave';
  /** What to tell the user. Names the field so a form can put it in the right place. */
  message: string;
  field?: string;
}

export type OperationResult<T> =
  | { ok: true; plan: T }
  | { ok: false; refusals: readonly OperationRefusal[] };

const refuse = (...refusals: OperationRefusal[]): OperationResult<never> => ({ ok: false, refusals });

// ── Creating an activity ─────────────────────────────────────────────────────

export interface CreateActivityRequest {
  caseId: string;
  activityTypeId: string;
  subject: string;
  activityDate?: string;
  followUpDate?: string;
  notes?: string;
}

export interface ActivityWritePlan {
  /** Columns to write. Physical names are the caller's job — this is canonical. */
  fields: Record<string, unknown>;
  /** Lookups to bind, by canonical name; the caller maps each to its navigation property. */
  binds: { lookup: 'case' | 'type' | 'outcome'; id: string }[];
}

/**
 * Validates and plans a new collection activity.
 *
 * Deliberately thin: an activity is a record of something a person did, and refusing to record it
 * for anything other than a missing essential would lose collection history. The status is not set
 * here — `DefaultStatusAssigner` assigns it server-side, and duplicating that would create two
 * places where the opening status is decided.
 */
export function planCreateActivity(request: CreateActivityRequest): OperationResult<ActivityWritePlan> {
  const refusals: OperationRefusal[] = [];
  if (!request.caseId) refusals.push({ code: 'CaseRequired', message: 'An activity must belong to a case.', field: 'caseId' });
  if (!request.activityTypeId) refusals.push({ code: 'TypeRequired', message: 'Choose an activity type.', field: 'activityTypeId' });
  if (!request.subject?.trim()) refusals.push({ code: 'SubjectRequired', message: 'Give the activity a subject.', field: 'subject' });

  const activityDate = readDate(request.activityDate, 'activityDate', refusals, { required: false });
  const followUpDate = readDate(request.followUpDate, 'followUpDate', refusals, { required: false });
  if (refusals.length > 0) return { ok: false, refusals };

  return {
    ok: true,
    plan: {
      fields: {
        subject: request.subject.trim(),
        ...(activityDate ? { activityDate } : { activityDate: new Date().toISOString() }),
        ...(followUpDate ? { followUpDate } : {}),
        ...(request.notes?.trim() ? { notes: request.notes.trim() } : {}),
      },
      binds: [
        { lookup: 'case', id: request.caseId },
        { lookup: 'type', id: request.activityTypeId },
      ],
    },
  };
}

// ── Editing an open activity ─────────────────────────────────────────────────

export interface UpdateActivityRequest {
  currentStatus: ActivityStatus;
  /** Only the fields the user actually changed. An absent field is left alone, not cleared. */
  subject?: string;
  activityDate?: string;
  notes?: string;
}

/**
 * Validates and plans an edit to an activity that is still being worked.
 *
 * **An absent field means "unchanged", not "clear it".** The distinction matters because the form
 * sends only what the user touched: treating an absent note as an instruction to erase the existing
 * one would silently destroy collection history on every unrelated edit. Clearing a follow-up is the
 * one deliberate exception, and it has its own operation (`planFollowUp`) precisely so that erasing
 * is something a caller asks for explicitly rather than something that happens by omission.
 *
 * A completed activity is refused: `ImmutabilityGuard` is registered on the organisation and would
 * refuse the write anyway, so accepting it here would only move the failure later and make it look
 * like a save error rather than a rule.
 */
export function planUpdateActivity(request: UpdateActivityRequest): OperationResult<ActivityWritePlan> {
  if (request.currentStatus === 'Completed') {
    return refuse({ code: 'ActivityImmutable', message: 'This activity is completed and can no longer be edited.' });
  }
  if (request.currentStatus === 'Cancelled') {
    return refuse({ code: 'ActivityImmutable', message: 'This activity is cancelled and can no longer be edited.' });
  }

  const refusals: OperationRefusal[] = [];
  if (request.subject !== undefined && !request.subject.trim()) {
    refusals.push({ code: 'SubjectRequired', message: 'An activity must keep a subject.', field: 'subject' });
  }
  const activityDate = readDate(request.activityDate, 'activityDate', refusals, { required: false });
  if (refusals.length > 0) return { ok: false, refusals };

  const fields: Record<string, unknown> = {
    ...(request.subject !== undefined ? { subject: request.subject.trim() } : {}),
    ...(activityDate ? { activityDate } : {}),
    ...(request.notes !== undefined ? { notes: request.notes.trim() } : {}),
  };
  if (Object.keys(fields).length === 0) {
    // Dataverse elides an unchanged attribute before the plugins run, so an empty write would answer
    // 200 having done nothing. Saying so is more use to the caller than a silent success.
    return refuse({ code: 'NothingToSave', message: 'Nothing has been changed.' });
  }
  return { ok: true, plan: { fields, binds: [] } };
}

// ── Completing an activity, with its outcome ─────────────────────────────────

export interface CompleteActivityRequest {
  currentStatus: ActivityStatus;
  outcome?: ActivityOutcomeConfig;
  notes?: string;
  /** Supplied by the user, or computed from the outcome's configured window when absent. */
  followUpDate?: string;
  /** "Now", injected so the computation is testable and the caller owns the clock. */
  now?: Date;
}

/**
 * The follow-up an outcome's configuration implies, or why it cannot imply one.
 *
 * Extracted so there is exactly **one** implementation of the rule and every caller gets the same
 * answer: `planCompleteActivity` uses it to fill a blank field, and the form uses it to show the
 * officer what will be written *before* they commit. A form that computed its own preview would be a
 * second implementation, free to drift — and it is the version a user sees, so it would be the one
 * they trusted.
 *
 * Three outcomes, deliberately distinguished rather than collapsed into a nullable date:
 *   • `derived`      — configuration says when, and this is the date.
 *   • `askTheUser`   — configuration wants a follow-up but names no window. A default invented here
 *                      would be a scheduling policy nobody agreed to.
 *   • `none`         — configuration does not ask for one.
 */
export type FollowUpDerivation =
  | { kind: 'derived'; date: string; days: number }
  | { kind: 'askTheUser'; reason: string }
  | { kind: 'none' };

export function deriveFollowUpDate(
  outcome: ActivityOutcomeConfig | undefined,
  now: Date = new Date(),
): FollowUpDerivation {
  if (!outcome?.requiresFollowUp) return { kind: 'none' };
  if (outcome.followUpDays === undefined) {
    return {
      kind: 'askTheUser',
      reason: `"${outcome.name}" needs a follow-up date, and no default period is configured.`,
    };
  }
  return {
    kind: 'derived',
    date: new Date(now.getTime() + outcome.followUpDays * DAY_IN_MILLISECONDS).toISOString(),
    days: outcome.followUpDays,
  };
}

const DAY_IN_MILLISECONDS = 86_400_000;

export interface CompleteActivityPlan extends ActivityWritePlan {
  /** True when the outcome's configuration asked for escalation. Phase 6 records it; Phase 8 acts. */
  escalationRequested: boolean;
}

/**
 * Validates and plans the completion of an activity.
 *
 * Three things come from the outcome's **configuration** rather than from code: whether notes are
 * mandatory, whether a follow-up is needed, and how far out it falls. A deployment that decides a
 * refusal needs no note simply configures that, and nothing here changes.
 */
export function planCompleteActivity(
  request: CompleteActivityRequest,
): OperationResult<CompleteActivityPlan> {
  const refusals: OperationRefusal[] = [];

  if (!isActivityTransitionAllowed(request.currentStatus, 'Completed')) {
    return refuse({
      code: request.currentStatus === 'Completed' ? 'ActivityImmutable' : 'TransitionNotAllowed',
      message: request.currentStatus === 'Completed'
        ? 'This activity is already completed and cannot be changed.'
        : `An activity that is ${request.currentStatus} cannot be completed.`,
    });
  }

  const outcome = request.outcome;
  if (outcome?.requiresNotes && !request.notes?.trim()) {
    refusals.push({
      code: 'NotesRequired',
      message: `"${outcome.name}" requires a note explaining what happened.`,
      field: 'notes',
    });
  }

  let followUpDate = readDate(request.followUpDate, 'followUpDate', refusals, { required: false });

  // A date the officer typed wins over the configured window.
  //
  // Whether QDB permits that override at all is **not in evidence** (KI-76). Preserving it is the
  // choice that loses no information: a supervisor can see an officer chose a different date, where
  // silently overwriting what they typed would discard a deliberate decision with no trace.
  if (!followUpDate) {
    const derived = deriveFollowUpDate(outcome, request.now ?? new Date());
    if (derived.kind === 'derived') followUpDate = derived.date;
    if (derived.kind === 'askTheUser') {
      refusals.push({ code: 'FollowUpDateRequired', message: derived.reason, field: 'followUpDate' });
    }
  }

  if (refusals.length > 0) return { ok: false, refusals };

  return {
    ok: true,
    plan: {
      fields: {
        statuscode: ACTIVITY_STATUS_CODES.Completed,
        statecode: ACTIVITY_STATE_CODES.Completed,
        ...(followUpDate ? { followUpDate } : {}),
        ...(request.notes?.trim() ? { notes: request.notes.trim() } : {}),
      },
      binds: outcome ? [{ lookup: 'outcome' as const, id: outcome.id }] : [],
      escalationRequested: outcome?.escalationRequired ?? false,
    },
  };
}

// ── Moving an activity's status ──────────────────────────────────────────────

export function planActivityTransition(
  from: ActivityStatus,
  to: ActivityStatus,
): OperationResult<ActivityWritePlan> {
  if (from === to) {
    // The platform elides an unchanged attribute, so this would be a no-op write rather than a
    // refusal — but planning it is pointless, and saying so is clearer than sending nothing.
    return refuse({ code: 'TransitionNotAllowed', message: `The activity is already ${from}.` });
  }
  if (!isActivityTransitionAllowed(from, to)) {
    return refuse({
      code: from === 'Completed' ? 'ActivityImmutable' : 'TransitionNotAllowed',
      message: `An activity cannot move from ${from} to ${to}.`,
    });
  }
  return {
    ok: true,
    plan: {
      fields: { statuscode: ACTIVITY_STATUS_CODES[to], statecode: ACTIVITY_STATE_CODES[to] },
      binds: [],
    },
  };
}

// ── Follow-up ────────────────────────────────────────────────────────────────

export function planFollowUp(
  currentStatus: ActivityStatus,
  followUpDate: string | undefined,
): OperationResult<ActivityWritePlan> {
  if (currentStatus === 'Completed') {
    return refuse({ code: 'ActivityImmutable', message: 'A completed activity cannot be rescheduled.' });
  }
  const refusals: OperationRefusal[] = [];
  // Clearing a follow-up is legitimate — an officer decides no further contact is needed — so an
  // absent date writes null rather than being refused.
  const parsed = followUpDate === undefined || followUpDate === ''
    ? null
    : readDate(followUpDate, 'followUpDate', refusals, { required: true });
  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, plan: { fields: { followUpDate: parsed }, binds: [] } };
}

// ── The promise ──────────────────────────────────────────────────────────────

export interface CreatePromiseRequest {
  caseId: string;
  activityTypeId: string;
  subject: string;
  promisedAmount: number;
  promiseDate: string;
  promiseType?: 'Full' | 'Partial';
  notes?: string;
  now?: Date;
}

export const PROMISE_TYPE_CODES: Readonly<Record<'Full' | 'Partial', number>> = {
  Full: 100000580, Partial: 100000581,
};

/**
 * Validates and plans a promise to pay.
 *
 * A promise is a **collection activity with a promise on it**, never a second entity, so the plan it
 * returns is an activity plan carrying the promise columns.
 *
 * The validation is arithmetic and calendar only. An amount must be positive — a promise of nothing
 * is not a promise — and a date must parse. What is deliberately **absent**: a maximum amount, a
 * maximum horizon, a limit on how many promises may be open, and any tolerance for partial payment.
 * Every one of those is QDB policy (KI-72), and a number chosen here would become a rule nobody
 * agreed to.
 */
export function planCreatePromise(request: CreatePromiseRequest): OperationResult<ActivityWritePlan> {
  const refusals: OperationRefusal[] = [];
  if (!request.caseId) refusals.push({ code: 'CaseRequired', message: 'A promise must belong to a case.', field: 'caseId' });
  if (!request.activityTypeId) refusals.push({ code: 'TypeRequired', message: 'The promise activity type is missing.', field: 'activityTypeId' });
  if (!request.subject?.trim()) refusals.push({ code: 'SubjectRequired', message: 'Give the promise a subject.', field: 'subject' });

  if (!(request.promisedAmount > 0)) {
    refusals.push({
      code: 'AmountNotPositive',
      message: 'A promised amount must be greater than zero.',
      field: 'promisedAmount',
    });
  }
  const promiseDate = readDate(request.promiseDate, 'promiseDate', refusals, { required: true });
  if (refusals.length > 0) return { ok: false, refusals };

  return {
    ok: true,
    plan: {
      fields: {
        subject: request.subject.trim(),
        activityDate: (request.now ?? new Date()).toISOString(),
        ptpDate: promiseDate,
        promisedAmount: request.promisedAmount,
        ptpStatus: PTP_STATUS_CODES.Active,
        ...(request.promiseType ? { promiseType: PROMISE_TYPE_CODES[request.promiseType] } : {}),
        ...(request.notes?.trim() ? { notes: request.notes.trim() } : {}),
      },
      binds: [
        { lookup: 'case', id: request.caseId },
        { lookup: 'type', id: request.activityTypeId },
      ],
    },
  };
}

/**
 * The promise statuses whose terms may still be edited.
 *
 * A promise that has been given an outcome has become **history**: changing the amount a customer
 * was recorded as having promised, after recording whether they kept it, would rewrite the thing the
 * outcome was judged against. Active and Rescheduled are the two statuses where the promise is still
 * outstanding and no outcome has been recorded, so they are the two where the terms are still a
 * commitment rather than a record.
 *
 * This is the minimal line consistent with the documented matrix rather than a QDB policy, and it is
 * deliberately the **safe direction**: widening it later permits more, which is recoverable, where
 * discovering that settled promises were editable is not.
 */
const EDITABLE_PROMISE_STATUSES: readonly PtpStatus[] = ['Active', 'Rescheduled'];

export interface UpdatePromiseRequest {
  currentStatus: PtpStatus;
  promisedAmount?: number;
  promiseDate?: string;
  promiseType?: 'Full' | 'Partial';
  notes?: string;
}

/**
 * Validates and plans an edit to the terms of an outstanding promise.
 *
 * Same arithmetic as creating one, and the same deliberate absences: no maximum amount, no maximum
 * horizon, no limit on how many promises a case may carry (**KI-72**).
 */
export function planUpdatePromise(request: UpdatePromiseRequest): OperationResult<ActivityWritePlan> {
  if (!EDITABLE_PROMISE_STATUSES.includes(request.currentStatus)) {
    return refuse({
      code: 'PromiseTermsSettled',
      message: `This promise is ${request.currentStatus}. Its terms are part of the record and can no longer be changed.`,
    });
  }

  const refusals: OperationRefusal[] = [];
  if (request.promisedAmount !== undefined && !(request.promisedAmount > 0)) {
    refusals.push({
      code: 'AmountNotPositive',
      message: 'A promised amount must be greater than zero.',
      field: 'promisedAmount',
    });
  }
  const promiseDate = readDate(request.promiseDate, 'promiseDate', refusals, { required: false });
  if (refusals.length > 0) return { ok: false, refusals };

  const fields: Record<string, unknown> = {
    ...(request.promisedAmount !== undefined ? { promisedAmount: request.promisedAmount } : {}),
    ...(promiseDate ? { ptpDate: promiseDate } : {}),
    ...(request.promiseType ? { promiseType: PROMISE_TYPE_CODES[request.promiseType] } : {}),
    ...(request.notes !== undefined ? { notes: request.notes.trim() } : {}),
  };
  if (Object.keys(fields).length === 0) {
    return refuse({ code: 'NothingToSave', message: 'Nothing has been changed.' });
  }
  return { ok: true, plan: { fields, binds: [] } };
}

/**
 * Plans a promise's move to a new status.
 *
 * **A collector's outcome is not a payment verification.** Marking a promise Kept records what the
 * officer believes happened; it does not assert that money arrived, because nothing in the platform
 * can currently assert that — the MIS payment contract does not exist (KI-53). So this writes the
 * promise status and, where the officer entered one, the amount they were told was paid. It does
 * **not** write a verification flag, and it must never be presented as one.
 *
 * Never infer payment from a DPD or bucket movement. A balance falling has many causes.
 */
export function planPromiseTransition(
  from: PtpStatus,
  to: PtpStatus,
  reported?: { amountReceived?: number; paymentDate?: string; brokenReason?: string },
): OperationResult<ActivityWritePlan> {
  if (from === to) {
    return refuse({ code: 'TransitionNotAllowed', message: `The promise is already ${to}.` });
  }
  if (!isPtpTransitionAllowed(from, to)) {
    return refuse({
      code: 'TransitionNotAllowed',
      message: `A promise cannot move from ${from} to ${to}.`,
    });
  }

  const refusals: OperationRefusal[] = [];
  if (reported?.amountReceived !== undefined && !(reported.amountReceived > 0)) {
    refusals.push({
      code: 'AmountNotPositive',
      message: 'A received amount must be greater than zero.',
      field: 'amountReceived',
    });
  }
  const paymentDate = readDate(reported?.paymentDate, 'paymentDate', refusals, { required: false });
  if (refusals.length > 0) return { ok: false, refusals };

  return {
    ok: true,
    plan: {
      fields: {
        ptpStatus: PTP_STATUS_CODES[to],
        ...(reported?.amountReceived !== undefined ? { amountReceived: reported.amountReceived } : {}),
        ...(paymentDate ? { paymentReceivedDate: paymentDate } : {}),
        ...(to === 'Broken' && reported?.brokenReason?.trim()
          ? { brokenReason: reported.brokenReason.trim(), brokenDate: new Date().toISOString() }
          : {}),
      },
      binds: [],
    },
  };
}

/**
 * How a promise's outcome should be described to a user.
 *
 * The distinction the authorisation insists on, in one place so no screen has to remember it: what
 * a collector recorded, versus what has been financially verified. Nothing is verified today, and
 * this returns that plainly rather than letting a green tick imply otherwise.
 */
export function describePromiseVerification(status: PtpStatus): {
  operationalOutcome: PtpStatus;
  financiallyVerified: false;
  note: string;
} {
  return {
    operationalOutcome: status,
    financiallyVerified: false,
    note: 'Recorded by the collection officer. Payment has not been verified against MIS — '
      + 'the payment contract does not exist yet (KI-53).',
  };
}

// ── Shared ───────────────────────────────────────────────────────────────────

function readDate(
  value: string | undefined,
  field: string,
  refusals: OperationRefusal[],
  options: { required: boolean },
): string | undefined {
  if (value === undefined || value === '') {
    if (options.required) refusals.push({ code: 'DateMissing', message: 'A date is required.', field });
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    refusals.push({ code: 'DateMalformed', message: `"${value}" is not a date.`, field });
    return undefined;
  }
  return parsed.toISOString();
}
