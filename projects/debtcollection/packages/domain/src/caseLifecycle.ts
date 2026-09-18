/**
 * Collection Case lifecycle — the status vocabulary and the transition matrix.
 *
 * A Collection Case is one delinquent facility for one delinquency episode. Its lifecycle is code,
 * not configuration (appendix §B.1): which moves are legal is a property of the model, and the plugin
 * `StatusTransitionValidator` enforces exactly this matrix on the organisation. This file is the
 * TypeScript mirror; `StatusTransitionMatrixParity.test.ts` reads the C# source and fails the build
 * if the two ever disagree.
 *
 * The integers are the values publisher `qdb` assigned when the schema was provisioned
 * (2026-09-17). They are read back by `verify-qdb-schema.mjs`, never assumed.
 */

export const CaseStatus = {
  New: 'New',
  Assigned: 'Assigned',
  InProgress: 'InProgress',
  PendingCustomerResponse: 'PendingCustomerResponse',
  PtpActive: 'PtpActive',
  PtpBroken: 'PtpBroken',
  RestructureReview: 'RestructureReview',
  Restructured: 'Restructured',
  EscalatedToSupervisor: 'EscalatedToSupervisor',
  PendingLegalReview: 'PendingLegalReview',
  ReferredToLegal: 'ReferredToLegal',
  UnderLegalAction: 'UnderLegalAction',
  DeceasedInsuranceReview: 'DeceasedInsuranceReview',
  Settled: 'Settled',
  Closed: 'Closed',
  WrittenOff: 'WrittenOff',
  Reopened: 'Reopened',
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

/** `statuscode` values on `qdb_collectioncase`, as provisioned. */
export const CASE_STATUS_CODES: Readonly<Record<CaseStatus, number>> = {
  New: 100000600,
  Assigned: 100000601,
  InProgress: 100000602,
  PendingCustomerResponse: 100000603,
  PtpActive: 100000604,
  PtpBroken: 100000605,
  RestructureReview: 100000606,
  Restructured: 100000607,
  EscalatedToSupervisor: 100000608,
  PendingLegalReview: 100000609,
  ReferredToLegal: 100000610,
  UnderLegalAction: 100000611,
  DeceasedInsuranceReview: 100000612,
  Settled: 100000613,
  Closed: 100000614,
  WrittenOff: 100000615,
  Reopened: 100000616,
};

/** Terminal statuses carry `statecode = 1`; everything else is Active (`statecode = 0`). */
export const TERMINAL_CASE_STATUSES: readonly CaseStatus[] = ['Closed', 'WrittenOff'];

/**
 * Statuses that can be reached from every non-terminal state.
 *
 * Deceased/Insurance Review was the first (decision 3, 2026-09-16): a death notice must be honoured
 * whatever the case was doing. Settled is the second (Phase 2, 2026-09-18): a cure arrives from MIS
 * whenever the customer pays, and a case that is In Progress or Escalated when that happens still
 * has to be able to close. Without this, a cured case in most working states had no legal path to
 * Closed at all — the matrix reached Settled only from PTP Active, Restructured, Under Legal Action
 * and Deceased/Insurance Review.
 */
export const UNIVERSAL_TARGETS: readonly CaseStatus[] = ['DeceasedInsuranceReview', 'Settled'];

const SPECIFIC_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  New: ['Assigned'],
  Assigned: ['InProgress', 'EscalatedToSupervisor'],
  InProgress: ['PendingCustomerResponse', 'PtpActive', 'RestructureReview', 'PendingLegalReview', 'EscalatedToSupervisor'],
  PendingCustomerResponse: ['InProgress', 'PtpActive'],
  PtpActive: ['PtpBroken', 'InProgress'],
  PtpBroken: ['InProgress', 'EscalatedToSupervisor', 'PendingLegalReview'],
  RestructureReview: ['Restructured', 'InProgress'],
  Restructured: ['InProgress'],
  EscalatedToSupervisor: ['InProgress', 'PendingLegalReview'],
  PendingLegalReview: ['ReferredToLegal', 'InProgress'],
  ReferredToLegal: ['UnderLegalAction', 'InProgress'],
  Reopened: ['InProgress'],
  // Terminal or already-there: the universal targets do not apply below this line.
  UnderLegalAction: ['Settled', 'WrittenOff'],
  DeceasedInsuranceReview: ['Settled', 'WrittenOff'],
  Settled: ['Closed'],
  Closed: ['Reopened'],
  WrittenOff: ['Reopened'],
};

/** States the universal targets are NOT added to: terminal, or already one of the targets. */
const UNIVERSAL_EXCLUDED: readonly CaseStatus[] = [
  'UnderLegalAction', 'DeceasedInsuranceReview', 'Settled', 'Closed', 'WrittenOff',
];

function buildTransitions(): Readonly<Record<CaseStatus, readonly CaseStatus[]>> {
  const entries = Object.entries(SPECIFIC_TRANSITIONS).map(([from, targets]) => {
    const status = from as CaseStatus;
    const withUniversal = UNIVERSAL_EXCLUDED.includes(status)
      ? targets
      : [...targets, ...UNIVERSAL_TARGETS.filter(t => !targets.includes(t))];
    return [status, withUniversal] as const;
  });
  return Object.fromEntries(entries) as Record<CaseStatus, readonly CaseStatus[]>;
}

/** The complete allowed-transition matrix. */
export const CASE_TRANSITIONS = buildTransitions();

export function isCaseTransitionAllowed(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_TRANSITIONS[from].includes(to);
}

export function isTerminalCaseStatus(status: CaseStatus): boolean {
  return TERMINAL_CASE_STATUSES.includes(status);
}

/**
 * "Active" for the one-active-case-per-facility rule means `statecode = 0`: a Settled case is still
 * the current episode until it is Closed, so a re-delinquency in that window updates it rather than
 * starting a new episode.
 */
export function isActiveCaseStatus(status: CaseStatus): boolean {
  return !isTerminalCaseStatus(status);
}

/** Resolves a provisioned `statuscode` back to its name, or `undefined` for a foreign value. */
export function caseStatusFromCode(code: number): CaseStatus | undefined {
  return (Object.keys(CASE_STATUS_CODES) as CaseStatus[]).find(s => CASE_STATUS_CODES[s] === code);
}

/**
 * Contact-bearing statuses: a transition into one is what the contact-hold guard blocks.
 * Mirrors `StatusTransitionMatrix.ContactBearingStates`.
 */
export const CONTACT_BEARING_STATUSES: readonly CaseStatus[] = [
  'New', 'Assigned', 'InProgress', 'PendingCustomerResponse',
  'PtpActive', 'PtpBroken', 'EscalatedToSupervisor', 'Reopened',
];
