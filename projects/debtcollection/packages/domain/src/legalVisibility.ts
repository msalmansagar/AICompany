import type { LegalHandoffOutcome } from './legalHandoff.js';

/**
 * What a Collection Officer is told about Legal, and nothing more.
 *
 * This is a **read model**. It reports what the Legal process already decided; it decides nothing
 * about Legal itself, offers no lifecycle transition, and holds no status of its own.
 *
 * The distinction it exists to preserve is between **knowing something is absent** and **not being
 * able to see it**. Those look identical on a screen that reports both as "no Litigation Request",
 * and they are opposites: one means Legal has not been involved, the other means it may well have
 * been and this officer cannot tell. Collapsing them would let a case be worked as though no
 * litigation existed while litigation was under way.
 *
 * Two things are deliberately absent:
 *
 * **No DCP Legal status.** `qdb_qdblegal` carries 25 status reasons and an on-premises process
 * that moves between them. Copying those into an enum here would create a second state machine
 * that drifts the first time Legal adds a stage. The status an officer reads is the platform's own
 * formatted label, passed through.
 *
 * **No hand-off action.** WP9 proved the hand-off is technically possible; nothing has established
 * what qualifies a recommendation for litigation. A control that raises litigation would settle
 * that question by shipping, so there is none — and where qualification is unconfigured the state
 * is reported as pending rather than as something the officer can resolve.
 */

// ── What the read produced ───────────────────────────────────────────────────

/** The Legal fields Collections actually needs. Deliberately a small subset of 158. */
export interface LitigationSummary {
  /** The Legal process's own reference for the request. */
  reference: string;
  /**
   * The authoritative status, as the platform formatted it.
   *
   * A label, never a code, and never mapped through a table here — `statuscode` has 25 reasons
   * that belong to Legal. Absent when the platform sent no formatted value.
   */
  status?: string;
  createdOn?: string;
  customerName?: string;
  /** Present only where Legal recorded one; Collections shows it for context, never edits it. */
  outstandingAmount?: number;
  lawyerName?: string;
}

/**
 * The outcome of trying to read the linked Litigation Request.
 *
 * Four outcomes, because four different things must be said to the officer. A boolean, or a
 * `LitigationSummary | null`, would erase exactly the distinction this module exists for.
 */
export type LegalRecordFetch =
  | { kind: 'found'; record: LitigationSummary }
  /** The officer is not permitted to read it. It exists; its contents are not visible. */
  | { kind: 'forbidden' }
  /** The link points at a record the organisation does not hold. */
  | { kind: 'notFound' }
  /** The read failed for a reason that may not persist. */
  | { kind: 'unavailable' };

// ── The state an officer is shown ────────────────────────────────────────────

export type LegalTraceState =
  /** This activity is not a Legal Recommendation at all. */
  | 'NotLegal'
  /** Recommended; no Litigation Request, and nothing identified as blocking one. */
  | 'RecommendationOnly'
  /** No Litigation Request, because the customer could not be resolved. */
  | 'CustomerResolutionRequired'
  /** No Litigation Request, because what qualifies one is not established or not met. */
  | 'QualificationPending'
  /** A Litigation Request exists and was read. */
  | 'LitigationVisible'
  /** A Litigation Request exists; this officer cannot see its details. */
  | 'LitigationNotVisible'
  /** A Litigation Request is recorded but the organisation does not hold it. */
  | 'LitigationLinkBroken'
  /** A Litigation Request exists; reading it failed in a way that may be temporary. */
  | 'LitigationUnavailable';

/**
 * Officer-facing wording.
 *
 * None of it names a column, an option value, a known issue, or the shape of the failure. An
 * officer needs to know what is true of their case and who can move it forward — not why the
 * platform said no.
 */
const STATE_LABEL: Readonly<Record<LegalTraceState, string>> = {
  NotLegal: '—',
  RecommendationOnly: 'Recommended — no Legal request raised',
  // The wording QDB specified. It names the next step without implying the officer can take it.
  CustomerResolutionRequired: 'Customer resolution required before Legal hand-off',
  QualificationPending: 'Awaiting legal authorisation',
  LitigationVisible: 'Legal request raised',
  // Says the request exists. An officer must never read this as "there is no litigation".
  LitigationNotVisible: 'Legal request raised — you do not have access to its details',
  LitigationLinkBroken: 'Legal request recorded, but it could not be found',
  LitigationUnavailable: 'Legal request raised — its details could not be loaded just now',
};

/** Whether the state asserts that no Litigation Request exists. Only three of eight do. */
export function assertsNoLitigation(state: LegalTraceState): boolean {
  return state === 'RecommendationOnly'
    || state === 'CustomerResolutionRequired'
    || state === 'QualificationPending';
}

/** Whether a Litigation Request is known to exist, whether or not it could be read. */
export function litigationExists(state: LegalTraceState): boolean {
  return state === 'LitigationVisible' || state === 'LitigationNotVisible'
    || state === 'LitigationUnavailable' || state === 'LitigationLinkBroken';
}

export interface LegalTrace {
  state: LegalTraceState;
  /** The officer-facing sentence. Never a platform message. */
  label: string;
  /** Present only when the Litigation Request was actually read. */
  litigation?: LitigationSummary;
  /**
   * Whether this belongs in an officer's current work.
   *
   * Collection episode state and Legal lifecycle state are independent: an active Litigation
   * Request does **not** pull a cured episode's recommendation back into the current queue, and a
   * closed one does not remove a current episode's recommendation from it.
   */
  isCurrent: boolean;
}

export interface LegalTraceInput {
  isLegalRecommendation: boolean;
  /** Set when a hand-off has been recorded against the recommendation. */
  legalRequestId?: string;
  /** The read attempt. Absent when there was no link to read. */
  fetch?: LegalRecordFetch;
  /**
   * Why no hand-off has happened, where WP9 could say.
   *
   * Only consulted when no link exists — an outcome can never contradict a Litigation Request
   * that demonstrably exists.
   */
  handoffOutcome?: LegalHandoffOutcome;
  /** Decided by the collection episode alone. */
  episodeIsCurrent: boolean;
}

/**
 * What to show for one Legal Recommendation.
 *
 * The link is consulted before the hand-off outcome, always. A recorded Litigation Request is
 * evidence that something happened; a stale outcome is only evidence of what a decision function
 * last concluded, and letting it override the link would report "customer resolution required"
 * over a litigation that had already been raised.
 */
export function describeLegalTrace(input: LegalTraceInput): LegalTrace {
  if (!input.isLegalRecommendation) return trace('NotLegal', input.episodeIsCurrent);

  if (input.legalRequestId) {
    return fromFetch(input.fetch, input.episodeIsCurrent);
  }
  return trace(fromOutcome(input.handoffOutcome), input.episodeIsCurrent);
}

function fromFetch(fetch: LegalRecordFetch | undefined, episodeIsCurrent: boolean): LegalTrace {
  // A link with no read attempt is not evidence of absence — it is evidence of nothing yet.
  if (!fetch) return trace('LitigationUnavailable', episodeIsCurrent);

  if (fetch.kind === 'found') {
    return { ...trace('LitigationVisible', episodeIsCurrent), litigation: fetch.record };
  }
  if (fetch.kind === 'forbidden') return trace('LitigationNotVisible', episodeIsCurrent);
  if (fetch.kind === 'notFound') return trace('LitigationLinkBroken', episodeIsCurrent);
  return trace('LitigationUnavailable', episodeIsCurrent);
}

/**
 * Why there is no Litigation Request.
 *
 * Anything other than the two known blockers is reported as a plain recommendation. Inventing a
 * more specific reason from an outcome this screen cannot verify would state a cause nobody
 * established.
 */
function fromOutcome(outcome: LegalHandoffOutcome | undefined): LegalTraceState {
  if (outcome === 'CustomerResolutionRequired') return 'CustomerResolutionRequired';
  if (outcome === 'QualificationNotConfigured' || outcome === 'NotQualified') {
    return 'QualificationPending';
  }
  return 'RecommendationOnly';
}

/**
 * Currency is the collection episode's to decide, and only the episode's.
 *
 * A Litigation Request that is still running in Legal says nothing about whether the arrears
 * episode that recommended it is the one an officer is working now.
 */
const trace = (state: LegalTraceState, episodeIsCurrent: boolean): LegalTrace => ({
  state,
  label: STATE_LABEL[state],
  isCurrent: episodeIsCurrent && state !== 'NotLegal',
});

/**
 * Turns an HTTP status from reading the Legal record into a fetch outcome.
 *
 * **403 and 404 must not be merged.** 403 means the record exists and is withheld; 404 means the
 * organisation does not hold it. On this organisation 403 is the *expected* answer for a real
 * Collection Officer, because no DCP role holds read permission on the Legal entity — so treating
 * it as "not found" would tell every officer that no litigation exists.
 */
export function interpretLegalRead(status: number): LegalRecordFetch['kind'] {
  if (status >= 200 && status < 300) return 'found';
  if (status === 403 || status === 401) return 'forbidden';
  if (status === 404) return 'notFound';
  return 'unavailable';
}
