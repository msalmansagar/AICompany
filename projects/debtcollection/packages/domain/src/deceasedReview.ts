import { uuidV5 } from './communicationIdentity.js';
import { type CollectionEffects, hasAnyEffect } from './disputeComplaint.js';

/**
 * The QCB deceased indication, and the Collection-side review of it.
 *
 * **An indication is not a death.** `qdb_isdeceasedperqcb` arrives from the Qatar Central Bank
 * through the MIS extract and is set on 724 of 4,373 snapshots. Nothing establishes whether it
 * means verified death, reported death, an operational flag, an insurance status or a historical
 * marker (KI-124). So this module models it as *something to verify*, never as a fact about a
 * person — and the vocabulary is enforced by tests, because the difference between
 * "deceased customer" and "deceased indication" is the difference between a system that dunned a
 * living customer's family and one that did not.
 *
 * **There is no insurance here, at all.** WP15 found no credit-life, death-benefit or
 * mortgage-protection capability anywhere; the claims entities that exist are partial credit
 * guarantees and export/trade insurance, a different product family (KI-125). Nothing in this file
 * names a policy, an insurer, a claim or an eligibility, and a test asserts it stays that way.
 *
 * **Recording a review changes nothing.** Not collection, not communication, not Legal, not the
 * case, and never MIS. Every one of those is an open QDB policy question (KI-127, KI-79), and the
 * effect contract below exists so the absence can be tested rather than assumed.
 */

// ── The indication ───────────────────────────────────────────────────────────

/** Where a deceased indication came from. Only one source exists today, and it is named. */
export type IndicationSource = 'QcbViaMis';

const SOURCE_LABEL: Readonly<Record<IndicationSource, string>> = {
  QcbViaMis: 'Qatar Central Bank, via the MIS extract',
};

export interface DeceasedIndication {
  present: boolean;
  source?: IndicationSource;
  /** The snapshot this was observed in. An indication is always *as of* a date, never timeless. */
  asOf?: string;
  facilityNumber?: string;
}

/**
 * The officer-facing description. Deliberately never "deceased customer".
 *
 * The wording QDB specified, and the wording the tests enforce: an indication requiring
 * verification. Nothing here asserts that anyone has died.
 */
export const INDICATION_LABEL = 'QCB deceased indication — verification required';
export const NO_INDICATION_LABEL = 'No deceased indication';

export function describeIndication(indication: DeceasedIndication): string {
  return indication.present ? INDICATION_LABEL : NO_INDICATION_LABEL;
}

export function describeIndicationSource(source: IndicationSource | undefined): string {
  return source ? SOURCE_LABEL[source] : 'Source not recorded';
}

// ── What an indication does: nothing ─────────────────────────────────────────

const NO_EFFECTS: CollectionEffects = {
  pausesCollection: false,
  pausesStrategy: false,
  suppressedChannels: [],
  blocksLegal: false,
  stopsEscalation: false,
  altersDelinquency: false,
  closesCase: false,
  createsComplaintCase: false,
};

/**
 * What a QCB deceased indication does to collection. **Nothing.**
 *
 * Reuses the effect contract WP13 established rather than defining a second one — the question is
 * identical and a second model would drift. KI-127: no policy states what a deceased indication
 * does to dunning, to any channel, to Legal, to escalation, to delinquency or to the case, and
 * each is a separate decision with real consequences in both directions. Continuing to dun a
 * deceased customer's family is a serious harm; silently stopping collection on a debt that is
 * owed is a different one.
 */
export function effectsOfIndication(): CollectionEffects {
  return NO_EFFECTS;
}

/** What *starting a review* does. Also nothing — it records that someone is looking. */
export function effectsOfStartingReview(): CollectionEffects {
  return NO_EFFECTS;
}

export { hasAnyEffect };

/**
 * How many review activities an indication should generate by itself. **Zero.**
 *
 * The 724 historical indications are data, not a work queue, and bulk-creating an activity for
 * each would manufacture 724 tasks nobody asked for against real customer records. Whether future
 * MIS ingestion should generate one — on first indication only, per episode, per facility, per
 * customer, or reopening after a prior review — is an unestablished policy (**KI-129**), and a
 * function that returned anything but zero would be choosing an answer to it.
 */
export function reviewsToGenerateFrom(indications: readonly DeceasedIndication[]): number {
  void indications;
  return 0;
}

// ── The review ───────────────────────────────────────────────────────────────

/** This module's own namespace, so no review id collides with a Litigation Request or Complaint. */
const REVIEW_NAMESPACE = '4a1e6c37-9b82-4d05-bf16-7e3a2c9d5084';

/**
 * The id a Deceased Review activity takes for one facility on one case.
 *
 * Derived so a retry, a double-click or two concurrent workers write to the same place and the
 * platform refuses the second with 412 — the contract proven for strategy work, Litigation
 * Requests and Complaints. It deliberately does **not** include a date or an attempt number: a
 * fresh id per attempt is exactly how duplicate open reviews appear.
 *
 * It also does not encode a generation policy. Whether a *second* review may follow a completed
 * one is KI-129, and answering it here would settle by implementation a question QDB has not been
 * asked.
 */
export function deceasedReviewId(caseId: string, facilityNumber: string): string {
  const name = ['deceased-review', caseId.toLowerCase(), facilityNumber.toLowerCase()].join('|');
  return uuidV5(name, REVIEW_NAMESPACE);
}

/** A review, as DCP holds it — a Collection Activity and nothing more. */
export interface DeceasedReview {
  activityId: string;
  /** The activity's own status, from configuration. Never a death-verification status. */
  status?: string;
  /** The activity's own outcome, where configuration supplied one. */
  outcome?: string;
  recordedOn?: string;
  ownerName?: string;
  notes?: string;
}

export type DeceasedReviewState =
  /** No indication, and nothing to review. */
  | 'NoIndication'
  /** An indication exists and nobody has looked at it yet. */
  | 'AwaitingReview'
  /** A review activity exists and is open. */
  | 'UnderReview'
  /** The review activity has been settled. What it concluded is the activity's own outcome. */
  | 'ReviewRecorded';

const STATE_LABEL: Readonly<Record<DeceasedReviewState, string>> = {
  NoIndication: '—',
  AwaitingReview: 'Awaiting review',
  UnderReview: 'Under review',
  // Deliberately not "Confirmed" or "Verified" — DCP records that a review happened, not what
  // is true about a person. The conclusion is the activity's own outcome, shown beside it.
  ReviewRecorded: 'Review recorded',
};

export interface DeceasedReviewRow {
  state: DeceasedReviewState;
  /** The state, in an officer's words. */
  label: string;
  /** The indication itself, described as requiring verification. */
  indication: string;
  source: string;
  asOf: string;
  /** The review activity's own status or outcome, where one exists. */
  reviewOutcome: string;
  ownerName: string;
  /** Whether an officer may start a review now. False once one exists. */
  canStartReview: boolean;
  /**
   * The facility the indication belongs to.
   *
   * Carried because the review's identity is derived from it, so a caller that can start one
   * has what it needs without re-reading the snapshot and risking a different answer.
   */
  facilityNumber?: string;
}

const NOT_RECORDED = 'Not recorded';

/**
 * Composes what an officer reads for one facility's deceased indication.
 *
 * Takes the formatter rather than importing one, so the domain stays free of locale.
 */
export function toDeceasedReviewRow(input: {
  indication: DeceasedIndication;
  review?: DeceasedReview;
  formatDate: (iso: string) => string;
}): DeceasedReviewRow {
  const { indication, review } = input;
  const state = resolveState(indication, review);

  return {
    state,
    label: STATE_LABEL[state],
    indication: describeIndication(indication),
    source: describeIndicationSource(indication.source),
    asOf: indication.asOf ? input.formatDate(indication.asOf) : NOT_RECORDED,
    reviewOutcome: review?.outcome ?? review?.status ?? '—',
    ownerName: review?.ownerName ?? 'Nobody yet',
    // A review can only be started where there is something to review and nothing already open.
    canStartReview: state === 'AwaitingReview',
    ...(indication.facilityNumber !== undefined
      ? { facilityNumber: indication.facilityNumber } : {}),
  };
}

function resolveState(
  indication: DeceasedIndication,
  review: DeceasedReview | undefined,
): DeceasedReviewState {
  if (!indication.present && !review) return 'NoIndication';
  if (!review) return 'AwaitingReview';
  return review.outcome ? 'ReviewRecorded' : 'UnderReview';
}
