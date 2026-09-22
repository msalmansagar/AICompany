import { uuidV5 } from './communicationIdentity.js';
import type { ActivityOrigin } from './strategyAutomation.js';

/**
 * Handing a qualified Legal Recommendation to QDB's existing Legal process.
 *
 * **DCP integrates with Legal; it does not implement Legal.** `qdb_qdblegal` — Litigation Request —
 * carries 25 status reasons through Draft, the courts, settlement and closure, and its automation
 * runs on-premises. Nothing here models any of that. This decides one thing only: whether a
 * Litigation Request should be raised for a recommendation, and under what identity.
 *
 * Three refusals are deliberate, and each exists because the alternative would be worse than
 * doing nothing:
 *
 * **It refuses when the customer cannot be resolved.** `qdb_qdblegal` names its customer as an
 * `account`. A Housing Loan case's customer is a `contact`, and no authoritative mechanism maps
 * one to the other (**KI-108**) — the canonical `customerBusinessId` is a government id on one
 * side and an account number on the other. Inventing a match, or creating an account to satisfy
 * the hand-off, would attach litigation to the wrong company.
 *
 * **It refuses when nothing says the recommendation qualifies.** An approval mechanism exists,
 * but nothing states that an approved recommendation is what permits litigation (**KI-109**). So
 * qualification is configuration, and *unconfigured means refused* rather than permitted. Raising
 * litigation is irreversible and outward-facing; a default of "allowed" is not a safe default.
 *
 * **It never treats an Activity Type of "Legal" as permission.** Being a Legal Recommendation is
 * what makes a hand-off *possible*, never what makes it *due* — the separation §6 requires, and
 * the same mistake KI-71 recorded one level up.
 */

// ── Outcomes ─────────────────────────────────────────────────────────────────

/**
 * Every way a hand-off can end, named for what actually happened.
 *
 * Deliberately not success/failure. A cross-CRM hand-off that reports only "it didn't work"
 * cannot tell an operator whether to retry, to fix configuration, or to find a customer record —
 * and those need three different people.
 */
export type LegalHandoffOutcome =
  /** Everything needed is present; the Litigation Request has not been raised yet. */
  | 'ReadyForLegalHandoff'
  /** A Litigation Request was raised by this attempt. */
  | 'LegalHandoffCreated'
  /** One already exists for this recommendation. Not an error — the retry-safe answer. */
  | 'AlreadyHandedOff'
  /** Another writer holds the same derived identity right now. */
  | 'HandoffInProgress'
  /** No authoritative BFD account could be resolved (KI-108). */
  | 'CustomerResolutionRequired'
  /** Nothing states what qualifies a recommendation for litigation (KI-109). */
  | 'QualificationNotConfigured'
  /** Qualification is configured, and this recommendation does not meet it. */
  | 'NotQualified'
  /** The recommendation is completed, cancelled, or not a Legal Recommendation. */
  | 'RecommendationNotActionable'
  /** The Legal creation mechanism is unavailable — the adapter could not be reached. */
  | 'LegalEntryPointUnavailable'
  /** Transient. Worth another attempt. */
  | 'RetryableFailure'
  /** Not worth retrying without a change. */
  | 'PermanentFailure';

/** Outcomes after which another attempt could reasonably succeed. */
const WORTH_RETRYING: ReadonlySet<LegalHandoffOutcome> = new Set([
  'RetryableFailure', 'HandoffInProgress', 'LegalEntryPointUnavailable',
]);

/**
 * Outcomes that leave the recommendation available to try again later.
 *
 * A customer that cannot be resolved today may be resolvable once QDB answers KI-108, and a
 * qualification nobody has configured may be configured tomorrow. Neither is a dead end, and
 * neither may be retried automatically — they need a person.
 */
const AWAITING_SOMETHING: ReadonlySet<LegalHandoffOutcome> = new Set([
  'CustomerResolutionRequired', 'QualificationNotConfigured',
]);

export function worthRetrying(outcome: LegalHandoffOutcome): boolean {
  return WORTH_RETRYING.has(outcome);
}

/** Whether the recommendation stays open for a later attempt rather than being settled. */
export function remainsAvailable(outcome: LegalHandoffOutcome): boolean {
  return AWAITING_SOMETHING.has(outcome) || WORTH_RETRYING.has(outcome)
    || outcome === 'ReadyForLegalHandoff';
}

// ── Identity ─────────────────────────────────────────────────────────────────

/** This module's own namespace, so no Litigation Request id can collide with strategy work's. */
const LEGAL_NAMESPACE = '6b3f1d84-0c27-4e95-8a71-3d9f2c6b0e57';

/**
 * The id a Litigation Request will take for a given Legal Recommendation.
 *
 * **One component, deliberately.** The recommendation activity is the stable source intent (§8),
 * and it is already unique — for strategy-generated work its own id is derived from case, episode
 * and action, so all of that is inherited rather than repeated. Adding the case or the customer
 * would mean a corrected customer produced a *second* Litigation Request for the same
 * recommendation, which is the duplicate this exists to prevent.
 *
 * Nothing time-based and nothing random takes part. `qdb_qdblegal` has **no alternate key**, so a
 * retry can only be made safe by writing to a known id with `If-None-Match: *`: the second attempt
 * is refused with 412 by the platform rather than by a query this code ran first. "Look for one,
 * then create if absent" cannot survive two concurrent workers, and is not used.
 */
export function litigationRequestId(recommendationActivityId: string): string {
  return uuidV5(`litigation|${recommendationActivityId.toLowerCase()}`, LEGAL_NAMESPACE);
}

// ── Customer resolution ──────────────────────────────────────────────────────

/** Which table the collection case's customer actually points at, as the platform reports it. */
export type CustomerTable = 'account' | 'contact';

export type LegalCustomerResolution =
  | { resolved: true; accountId: string }
  | { resolved: false; reason: string };

/**
 * The account a Litigation Request will name, or a refusal.
 *
 * Decided from **which table the case's customer lookup targets**, read from the platform's own
 * `lookuplogicalname` annotation — not from an organisation code, which would encode an
 * assumption about which book uses which customer model.
 *
 * A contact-backed case refuses. That is KI-108, and it is the correct answer until QDB names an
 * authoritative crosswalk: there is no column on `account` that holds a government id, and
 * matching on name, mobile or email is forbidden precisely because it would sometimes be right.
 */
export function resolveLegalCustomer(customer: {
  table?: CustomerTable;
  id?: string;
}): LegalCustomerResolution {
  if (!customer.id || !customer.table) {
    return { resolved: false, reason: 'This case records no customer.' };
  }
  if (customer.table === 'account') return { resolved: true, accountId: customer.id };
  return {
    resolved: false,
    reason: 'This customer is held as a person, and a Litigation Request names a company. '
      + 'Nothing links the two automatically.',
  };
}

// ── Qualification ────────────────────────────────────────────────────────────

/**
 * What QDB has configured about raising litigation. Every field is optional, and absence refuses.
 *
 * The three picklists are the ones `qdb_qdblegal` requires on create, and their values are QDB's
 * legal taxonomy — `qdb_casetype` is Criminal or Civil, `qdb_caseinitiatedby` distinguishes
 * Housing Loan from Collection (BFD Programs). Hard-coding any of them would be this build
 * deciding how QDB categorises its own litigation.
 */
export interface LegalQualificationPolicy {
  /** The approval status that permits a hand-off. Unset means nothing does (KI-109). */
  qualifyingApprovalStatus?: number;
  caseType?: number;
  caseAgainst?: number;
  caseInitiatedBy?: number;
}

/** The recommendation being considered, as the platform holds it. */
export interface LegalRecommendation {
  activityId: string;
  /** Open work only. A completed or cancelled recommendation is history. */
  lifecycle: 'Open' | 'Completed' | 'Cancelled';
  /** Whether this activity is a Legal Recommendation at all. */
  isLegalRecommendation: boolean;
  approvalStatus?: number;
  /** Carried through for traceability. It never affects whether a hand-off is permitted. */
  origin?: ActivityOrigin;
  /** Set once a Litigation Request has been linked. */
  litigationRequestId?: string;
}

export interface LegalHandoffDecision {
  outcome: LegalHandoffOutcome;
  /** The business reason, in language an operator can act on. Never a platform message. */
  reason: string;
  /** Present only when the hand-off may proceed. */
  request?: { litigationRequestId: string; accountId: string; policy: Required<LegalQualificationPolicy> };
}

/**
 * Whether this recommendation should become a Litigation Request, and under what identity.
 *
 * Answers; writes nothing. The caller is handed `request` or it is not, so a decision that should
 * not produce litigation has no way to produce it.
 *
 * Order matters. What already happened is settled first, then whether the work is actionable at
 * all, then configuration, then the customer — so a hand-off that is already done never reports a
 * configuration problem, and a case whose customer cannot be resolved is not also told its
 * qualification is missing. One answer, and the most useful one.
 */
export function decideLegalHandoff(input: {
  recommendation: LegalRecommendation;
  customer: { table?: CustomerTable; id?: string };
  policy: LegalQualificationPolicy;
}): LegalHandoffDecision {
  const { recommendation, policy } = input;

  if (recommendation.litigationRequestId) {
    return decision('AlreadyHandedOff',
      'A Litigation Request has already been raised for this recommendation.');
  }
  if (!recommendation.isLegalRecommendation) {
    return decision('RecommendationNotActionable', 'This is not a Legal Recommendation.');
  }
  if (recommendation.lifecycle !== 'Open') {
    return decision('RecommendationNotActionable',
      'This recommendation is no longer open, so it cannot be handed to Legal.');
  }

  const configuration = completePolicy(policy);
  if (!configuration) {
    return decision('QualificationNotConfigured',
      'Nobody has configured what qualifies a recommendation for litigation, '
      + 'so none can be raised yet.');
  }
  if (recommendation.approvalStatus !== configuration.qualifyingApprovalStatus) {
    return decision('NotQualified',
      'This recommendation has not been approved for legal action.');
  }

  const customer = resolveLegalCustomer(input.customer);
  if (!customer.resolved) return decision('CustomerResolutionRequired', customer.reason);

  return {
    outcome: 'ReadyForLegalHandoff',
    reason: 'This recommendation is approved and its customer is known.',
    request: {
      litigationRequestId: litigationRequestId(recommendation.activityId),
      accountId: customer.accountId,
      policy: configuration,
    },
  };
}

/** Every field, or nothing. A partly configured policy is not a policy. */
function completePolicy(policy: LegalQualificationPolicy): Required<LegalQualificationPolicy> | null {
  const { qualifyingApprovalStatus, caseType, caseAgainst, caseInitiatedBy } = policy;
  if (qualifyingApprovalStatus === undefined || caseType === undefined
    || caseAgainst === undefined || caseInitiatedBy === undefined) {
    return null;
  }
  return { qualifyingApprovalStatus, caseType, caseAgainst, caseInitiatedBy };
}

const decision = (outcome: LegalHandoffOutcome, reason: string): LegalHandoffDecision =>
  ({ outcome, reason });

/**
 * What a write attempt's HTTP status means for a hand-off.
 *
 * **412 is the good case**, not a failure: the derived id was already taken, so a previous attempt
 * — or a concurrent one — created the Litigation Request. Reporting it as an error would invite a
 * caller to retry until it produced a duplicate, which is exactly what the derived id prevents.
 */
export function interpretHandoffWrite(status: number): LegalHandoffOutcome {
  if (status >= 200 && status < 300) return 'LegalHandoffCreated';
  if (status === 412) return 'AlreadyHandedOff';
  if (status === 404) return 'LegalEntryPointUnavailable';
  if (status === 429 || status >= 500) return 'RetryableFailure';
  return 'PermanentFailure';
}
