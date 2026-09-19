/**
 * Collection Activity lifecycle, including the promise-to-pay lifecycle it carries.
 *
 * `qdb_collectionactivity` is the single operational action record. A promise to pay is an activity
 * *type*, so the promise has two lifecycles on one row: the activity's own `statuscode`, and
 * `qdb_ptpstatus` for the promise itself. The plugin `StatusTransitionValidator` enforces the PTP
 * matrix on the organisation; this is its TypeScript mirror, parity-tested against the C# source.
 */

export const ActivityStatus = {
  Open: 'Open',
  InProgress: 'InProgress',
  AwaitingApproval: 'AwaitingApproval',
  Returned: 'Returned',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
} as const;
export type ActivityStatus = (typeof ActivityStatus)[keyof typeof ActivityStatus];

/** `statuscode` values on `qdb_collectionactivity`, as provisioned. */
export const ACTIVITY_STATUS_CODES: Readonly<Record<ActivityStatus, number>> = {
  Open: 100000640,
  InProgress: 100000641,
  AwaitingApproval: 100000642,
  Returned: 100000643,
  Completed: 100000644,
  Cancelled: 100000645,
};

/** Native activity `statecode`: 0 Open, 1 Completed, 2 Cancelled. */
export const ACTIVITY_STATE_CODES: Readonly<Record<ActivityStatus, 0 | 1 | 2>> = {
  Open: 0,
  InProgress: 0,
  AwaitingApproval: 0,
  Returned: 0,
  Completed: 1,
  Cancelled: 2,
};

/** Once completed an activity is immutable (ImmutabilityGuard); the check that matters for callers. */
export function isActivityImmutable(status: ActivityStatus): boolean {
  return status === 'Completed';
}

/**
 * Allowed transitions for the activity's own lifecycle.
 *
 * **Derived rather than invented**, and the derivation is recorded at the C# source of truth in
 * `StatusTransitionMatrix.ActivityAllowed`. Two documented facts constrain it: the field dictionary
 * groups the six statuses by `statecode` — Open, In Progress, Awaiting Approval and Returned are all
 * the Open state; Completed and Cancelled are their own — and `ImmutabilityGuard` already freezes a
 * completed activity on the organisation, so Completed is terminal in fact and this matrix must
 * agree with a guard that is already registered.
 *
 * Permissive inside the documented group, strict at the boundary that matters. The ordering *within*
 * the Open group is QDB policy and is not in evidence (**KI-65**); guessing a stricter rule would
 * block legitimate work, so it is deliberately open there.
 *
 * Awaiting Approval and Returned are reachable but are not Phase 6's to drive: `qdb_approvalstatus`
 * is documented as Process Engine-populated and read-only to the officer.
 *
 * Parity with the plugin is enforced by a test that parses the C# source — the same protection the
 * case and PTP matrices already have, so the two cannot silently diverge.
 */
export const ACTIVITY_TRANSITIONS: Readonly<Record<ActivityStatus, readonly ActivityStatus[]>> = {
  Open: ['InProgress', 'AwaitingApproval', 'Returned', 'Completed', 'Cancelled'],
  InProgress: ['Open', 'AwaitingApproval', 'Returned', 'Completed', 'Cancelled'],
  AwaitingApproval: ['Open', 'InProgress', 'Returned', 'Completed', 'Cancelled'],
  Returned: ['Open', 'InProgress', 'AwaitingApproval', 'Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

/**
 * Whether an activity may move from one status to another.
 *
 * There are no self-transitions, matching the case and PTP matrices: re-sending the status a record
 * already has is refused. Callers send changed fields only.
 */
export function isActivityTransitionAllowed(from: ActivityStatus, to: ActivityStatus): boolean {
  return ACTIVITY_TRANSITIONS[from].includes(to);
}

/** The statuses an activity may still be worked in — the Open `statecode` group. */
export const OPEN_ACTIVITY_STATUSES: readonly ActivityStatus[] =
  (Object.keys(ACTIVITY_STATE_CODES) as ActivityStatus[]).filter(s => ACTIVITY_STATE_CODES[s] === 0);

export const PtpStatus = {
  Active: 'Active',
  Kept: 'Kept',
  PartiallyKept: 'PartiallyKept',
  Broken: 'Broken',
  Rescheduled: 'Rescheduled',
  Cancelled: 'Cancelled',
} as const;
export type PtpStatus = (typeof PtpStatus)[keyof typeof PtpStatus];

/** `qdb_ptpstatus` values (global choice `qdb_ptp_status`), as provisioned. */
export const PTP_STATUS_CODES: Readonly<Record<PtpStatus, number>> = {
  Active: 100000080,
  Kept: 100000081,
  PartiallyKept: 100000082,
  Broken: 100000083,
  Rescheduled: 100000084,
  Cancelled: 100000085,
};

/** Appendix §B.2. Broken → Kept is the documented false-Broken reversal. */
export const PTP_TRANSITIONS: Readonly<Record<PtpStatus, readonly PtpStatus[]>> = {
  Active: ['Kept', 'PartiallyKept', 'Broken', 'Rescheduled', 'Cancelled'],
  Rescheduled: ['Kept', 'PartiallyKept', 'Broken', 'Rescheduled', 'Cancelled'],
  PartiallyKept: ['Broken', 'Kept', 'Cancelled'],
  Broken: ['Kept', 'Cancelled'],
  Kept: [],
  Cancelled: [],
};

export function isPtpTransitionAllowed(from: PtpStatus, to: PtpStatus): boolean {
  return PTP_TRANSITIONS[from].includes(to);
}

export function ptpStatusFromCode(code: number): PtpStatus | undefined {
  return (Object.keys(PTP_STATUS_CODES) as PtpStatus[]).find(s => PTP_STATUS_CODES[s] === code);
}

export function activityStatusFromCode(code: number): ActivityStatus | undefined {
  return (Object.keys(ACTIVITY_STATUS_CODES) as ActivityStatus[]).find(s => ACTIVITY_STATUS_CODES[s] === code);
}
