import type { CommunicationChannel } from './communication.js';

/**
 * Collection Dispute and Customer Complaint — two business concepts, kept apart.
 *
 * QDB has decided these are distinct, and the decision is load-bearing rather than cosmetic:
 *
 * **A Collection Dispute** is DCP's own. A customer contests collection-related information —
 * their arrears, their days past due, a payment they believe was posted, how a payment was
 * allocated. It lives as a `qdb_collectionactivity` and nowhere else. MIS remains authoritative
 * for the financial facts; recording that a customer disagrees does not change them.
 *
 * **A Customer Complaint** is QDB's, and belongs to Case Management: its lifecycle, categories,
 * department resolution, SLA and its escalation ladder to the CEO. DCP may one day link to one
 * and display its authoritative status. DCP never models it.
 *
 * Neither implies the other. A customer can contest a balance without complaining about service,
 * and can complain about how they were treated while owing exactly what the system says. Deriving
 * one from the other would put work in front of the wrong team.
 *
 * **Recording a dispute changes nothing about collection.** That is the single most important
 * property in this file, and `effectsOfRecordingDispute` exists so it can be tested rather than
 * asserted in a comment. No policy anywhere on the organisation says a dispute pauses collection,
 * suppresses a channel, freezes delinquency, blocks Legal or closes a case, so this build does
 * none of it — and the dormant `qdb_collectionpaused` column is left untouched rather than adopted
 * because it happens to be available.
 */

// ── What a customer is contesting ────────────────────────────────────────────

/**
 * The collection information a dispute can be about.
 *
 * Every one of these is a *financial or delinquency* fact owned by MIS. None of them is a service
 * complaint, which is the distinction the type exists to enforce at the boundary.
 */
export type DisputedSubject =
  | 'Arrears'
  | 'DaysPastDue'
  | 'Balance'
  | 'PaymentPosting'
  | 'PaymentAllocation'
  | 'MissedPaymentCalculation'
  | 'OtherDelinquencyInformation';

const DISPUTED_SUBJECT_LABEL: Readonly<Record<DisputedSubject, string>> = {
  Arrears: 'Amount in arrears',
  DaysPastDue: 'Days past due',
  Balance: 'Outstanding balance',
  PaymentPosting: 'A payment the customer says was made',
  PaymentAllocation: 'How a payment was applied',
  MissedPaymentCalculation: 'How a missed payment was calculated',
  OtherDelinquencyInformation: 'Other delinquency information',
};

export function describeDisputedSubject(subject: DisputedSubject): string {
  return DISPUTED_SUBJECT_LABEL[subject];
}

// ── The two concepts, and the wall between them ──────────────────────────────

/**
 * Which business concept a record is. Deliberately a closed union with no "either" member.
 *
 * Phase 6 configuration carries a single activity type labelled `Complaint / Dispute`. That label
 * is display configuration and **must not become the domain model** — this type is what stops it,
 * and `KI-118` records the configuration change QDB still has to make.
 */
export type CollectionConcern = 'CollectionDispute' | 'CustomerComplaint';

/**
 * Whether a dispute implies a complaint, or the reverse. It never does, in either direction.
 *
 * A function rather than a comment so the rule has a test. Both directions are asserted, because
 * the two mistakes are different: turning every dispute into a formal Complaint floods Case
 * Management, and turning every complaint into a dispute tells Collections a debt is contested
 * when it is not.
 */
export function impliesOtherConcern(): false {
  return false;
}

// ── What recording a dispute does to collection: nothing ─────────────────────

/**
 * Everything a downstream effect could be, so that "none of them" is checkable.
 *
 * Listing the effects explicitly — rather than simply not writing the code — is what lets a test
 * prove the absence. A guard that cannot fail is not a guard.
 */
export interface CollectionEffects {
  pausesCollection: boolean;
  pausesStrategy: boolean;
  /** Phase 7's channel type, reused — a second list of channels would drift from the first. */
  suppressedChannels: readonly CommunicationChannel[];
  blocksLegal: boolean;
  stopsEscalation: boolean;
  altersDelinquency: boolean;
  closesCase: boolean;
  createsComplaintCase: boolean;
}

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
 * What recording a Collection Dispute does. **Nothing.**
 *
 * KI-119: no QDB policy establishes any of these consequences, and there are at least six separate
 * decisions inside the question — whether to stop dunning, whether to suppress each channel,
 * whether to hold Legal, whether to freeze days past due, whether to pause the strategy, whether
 * to close the case. Each has regulatory and customer-treatment weight. Guessing any one of them
 * either keeps chasing a customer with a legitimate grievance or quietly stops collecting a debt
 * that is genuinely owed.
 */
export function effectsOfRecordingDispute(): CollectionEffects {
  return NO_EFFECTS;
}

/**
 * What creating a formal Complaint Case does to collection. **Also nothing.**
 *
 * Case Management owns complaint processing; collection strategy is independent unless an
 * authoritative integration rule says otherwise, and none does.
 */
export function effectsOfRaisingComplaint(): CollectionEffects {
  return NO_EFFECTS;
}

/** Whether any effect at all is claimed. Used by tests and by the UI's "nothing changed" wording. */
export function hasAnyEffect(effects: CollectionEffects): boolean {
  return effects.pausesCollection || effects.pausesStrategy || effects.blocksLegal
    || effects.stopsEscalation || effects.altersDelinquency || effects.closesCase
    || effects.createsComplaintCase || effects.suppressedChannels.length > 0;
}

// ── The officer-facing view ──────────────────────────────────────────────────

/** A dispute, as DCP holds it — a Collection Activity and nothing more. */
export interface CollectionDispute {
  activityId: string;
  subject?: DisputedSubject;
  /** The activity's own status, from configuration. Never a complaint status. */
  status?: string;
  outcome?: string;
  recordedOn?: string;
  ownerName?: string;
  notes?: string;
}

/** A formal Complaint, as Case Management holds it. Every field is read, none is decided here. */
export interface ComplaintCaseSummary {
  caseNumber: string;
  /** The platform's own formatted status. DCP maintains no complaint status model (KI-121). */
  status?: string;
  category?: string;
  department?: string;
  createdOn?: string;
}

export interface ConcernRow {
  key: string;
  concern: CollectionConcern;
  /** What the officer reads. Different vocabulary for each concern, deliberately. */
  heading: string;
  detail: string;
  recordedOn: string;
  status: string;
}

const NOT_RECORDED = 'Not recorded';

/**
 * A Collection Dispute as a row. It never shows a Case number or a complaint status.
 */
export function toDisputeRow(
  dispute: CollectionDispute,
  formatDate: (iso: string) => string,
): ConcernRow {
  return {
    key: dispute.activityId,
    concern: 'CollectionDispute',
    heading: dispute.subject ? describeDisputedSubject(dispute.subject) : 'Disputed information',
    detail: dispute.notes ?? '—',
    recordedOn: dispute.recordedOn ? formatDate(dispute.recordedOn) : NOT_RECORDED,
    status: dispute.outcome ?? dispute.status ?? 'Open',
  };
}

/**
 * A formal Complaint as a row, carrying Case Management's own values through untouched.
 */
export function toComplaintRow(
  complaint: ComplaintCaseSummary,
  formatDate: (iso: string) => string,
): ConcernRow {
  return {
    key: complaint.caseNumber,
    concern: 'CustomerComplaint',
    heading: `Complaint ${complaint.caseNumber}`,
    detail: complaint.category ?? 'Category not recorded',
    recordedOn: complaint.createdOn ? formatDate(complaint.createdOn) : NOT_RECORDED,
    status: complaint.status ?? 'Status not recorded',
  };
}
