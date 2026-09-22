import { decideLegalHandoff, type LegalQualificationPolicy, type LegalRecommendation } from './legalHandoff.js';
import {
  describeLegalTrace, type LegalRecordFetch, type LegalTrace, type LegalTraceState,
} from './legalVisibility.js';
import type { CustomerTable } from './legalHandoff.js';

/**
 * The Collection-side Legal picture, derived from evidence rather than passed in.
 *
 * WP10 could render a trace from a hand-off outcome somebody else had worked out. This closes that
 * gap: the outcome is now **computed from the same facts the hand-off itself would use** — the
 * recommendation, the customer, and QDB's qualification policy — so what an officer reads and what
 * the system would actually do can never drift apart.
 *
 * **`ReadyForHandoff` is unreachable until QDB configures a qualification rule, by construction.**
 * It is produced only when `decideLegalHandoff` returns `ReadyForLegalHandoff`, which requires a
 * complete policy — and no policy exists (KI-109). Nothing here infers readiness from activity
 * completion, an approval status, a strategy action, an overdue deadline, days past due or an
 * arrears amount. Raising litigation is irreversible and outward-facing; "probably allowed" is not
 * a state this system is willing to hold.
 *
 * The consequence is deliberate and should not be mistaken for an omission: on this organisation
 * every unlinked Legal Recommendation resolves to *awaiting legal authorisation*, and no officer
 * is offered a hand-off. That is the correct answer until QDB supplies the rule.
 */

/** Everything the trace needs, from the records themselves. */
export interface LegalWorkInput {
  recommendation: LegalRecommendation;
  /** The collection case's customer, as the platform reports its table. */
  customer: { table?: CustomerTable; id?: string };
  /**
   * QDB's qualification policy. **Empty today**, and empty means refused (KI-109).
   *
   * Passed in rather than read here so the domain holds no configuration, and so a test can prove
   * what happens on the day it is finally supplied.
   */
  policy: LegalQualificationPolicy;
  /** The read attempt against the linked Litigation Request, where there was a link to read. */
  fetch?: LegalRecordFetch;
  /** Decided by the collection episode alone — Legal's lifecycle has no say in it. */
  episodeIsCurrent: boolean;
}

/** The trace, plus the one state WP10 could not express. */
export type LegalWorkStateName = LegalTraceState | 'ReadyForHandoff';

export interface LegalWorkState extends Omit<LegalTrace, 'state'> {
  state: LegalWorkStateName;
  /**
   * Whether an officer may act on this now.
   *
   * Always `false` while qualification is unconfigured, which is what keeps the UI fail-closed
   * without the UI having to know why.
   */
  handoffAvailable: boolean;
}

const READY_LABEL = 'Ready for legal hand-off';

/**
 * Works out what to show for one Legal Recommendation.
 *
 * The link is consulted first, exactly as WP10 established: a recorded Litigation Request is
 * evidence that something happened, and a policy conclusion must never be shown over it.
 */
export function describeLegalWork(input: LegalWorkInput): LegalWorkState {
  const decision = decideLegalHandoff({
    recommendation: input.recommendation,
    customer: input.customer,
    policy: input.policy,
  });

  const trace = describeLegalTrace({
    isLegalRecommendation: input.recommendation.isLegalRecommendation,
    ...(input.recommendation.litigationRequestId !== undefined
      ? { legalRequestId: input.recommendation.litigationRequestId } : {}),
    ...(input.fetch !== undefined ? { fetch: input.fetch } : {}),
    handoffOutcome: decision.outcome,
    episodeIsCurrent: input.episodeIsCurrent,
  });

  /*
   * Readiness is only ever promoted from a real `ReadyForLegalHandoff` decision, and only when
   * nothing has been raised yet. Both conditions matter: the first keeps it fail-closed, the
   * second stops an already-handed-off recommendation offering a second hand-off.
   */
  if (trace.state === 'RecommendationOnly' && decision.outcome === 'ReadyForLegalHandoff') {
    return { ...trace, state: 'ReadyForHandoff', label: READY_LABEL, handoffAvailable: true };
  }
  return { ...trace, handoffAvailable: false };
}

/**
 * The queue buckets an operational list filters by.
 *
 * Derived from Collection-side state and the authoritative downstream status — **not** a parallel
 * Legal status taxonomy. There is no bucket here that Legal owns; "what stage is the litigation at"
 * is answered by reading `qdb_qdblegal`, never by a value DCP maintains.
 */
export type LegalQueueBucket =
  | 'LegalRecommendations'
  | 'CustomerResolutionRequired'
  | 'QualificationRequired'
  | 'LitigationRaised'
  | 'LegalDetailsInaccessible';

const BUCKET_BY_STATE: Readonly<Partial<Record<LegalWorkStateName, LegalQueueBucket>>> = {
  RecommendationOnly: 'LegalRecommendations',
  ReadyForHandoff: 'LegalRecommendations',
  CustomerResolutionRequired: 'CustomerResolutionRequired',
  QualificationPending: 'QualificationRequired',
  LitigationVisible: 'LitigationRaised',
  LitigationNotVisible: 'LegalDetailsInaccessible',
  LitigationUnavailable: 'LegalDetailsInaccessible',
  LitigationLinkBroken: 'LegalDetailsInaccessible',
};

export function queueBucketFor(state: LegalWorkStateName): LegalQueueBucket | null {
  return BUCKET_BY_STATE[state] ?? null;
}

/**
 * Whether this belongs in an officer's **current** queue.
 *
 * Episode currency decides it, and only episode currency. A Litigation Request still running in
 * Legal does not pull a cured episode's recommendation back into current work, and a closed one
 * does not retire a current episode's recommendation. Historical work stays readable and stays out
 * of the queue — it is never deleted to achieve that.
 */
export function isCurrentLegalWork(state: LegalWorkState): boolean {
  return state.isCurrent;
}
