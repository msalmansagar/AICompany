import { uuidV5 } from './communicationIdentity.js';

/**
 * The formal Customer Complaint contract — resolved from configuration, never written down.
 *
 * QDB's authoritative discriminator is `incident.casetypecode = Complaint`. On `org5869857f` that
 * is currently the value **2**, and this file deliberately does not say so anywhere: the number is
 * resolved by matching the option **label** in live metadata, in one place, so that a renumbering
 * or a further relabelling is a configuration event rather than a code change.
 *
 * That is not hypothetical caution. QDB has already redefined this option set **in place** —
 * `1/2/3` used to mean Question/Problem/Request and now mean Inquiry/Complaint/Suggestion (KI-123).
 * A literal `2` scattered through the codebase would have been silently correct before the change
 * and silently wrong after it, with nothing failing.
 *
 * What this module refuses to do is as important as what it does:
 *
 * **It never infers Complaint from anything else.** Not the global `qdb_casetype` set, not a
 * category, not one of the complaint-specific booleans, not the title, not display text. One
 * discriminator, one resolver.
 *
 * **It never invents the value.** If no option is labelled Complaint, resolution fails and the
 * caller must refuse to create — because a Case written with a guessed case type is a Case filed
 * as the wrong kind of thing.
 */

/** One option as the platform reports it. Label-first, because the label is what carries meaning. */
export interface CaseTypeOption {
  value: number;
  label: string;
}

/**
 * The label QDB's configuration uses. Matching is exact but case-insensitive.
 *
 * A label rather than a number, and a whole-string match rather than a substring: "Complaint" must
 * not also match a future "Complaint — Closed" or "Service Complaint", because choosing between
 * two plausible options is exactly the guess this module exists to avoid.
 */
const COMPLAINT_LABEL = 'complaint';

export type CaseTypeResolution =
  | { resolved: true; value: number }
  | { resolved: false; reason: string };

/**
 * The numeric case type that means "formal Customer Complaint".
 *
 * Ambiguity is a failure, not a coin toss: if two options both claim the label, nothing is
 * returned. Returning the first would file Complaints under whichever option happened to sort
 * earlier in metadata.
 */
export function resolveComplaintCaseType(
  options: readonly CaseTypeOption[],
): CaseTypeResolution {
  const matches = options.filter(option => option.label.trim().toLowerCase() === COMPLAINT_LABEL);

  if (matches.length === 1) return { resolved: true, value: matches[0]!.value };
  if (matches.length === 0) {
    return {
      resolved: false,
      reason: 'No case type is configured for complaints, so one cannot be raised.',
    };
  }
  return {
    resolved: false,
    reason: 'More than one case type claims to be a complaint, so it is not clear which to use.',
  };
}

/** Whether a Case's stored type is the Complaint type, given the resolved contract. */
export function isComplaintCaseType(
  caseTypeCode: number | undefined,
  resolution: CaseTypeResolution,
): boolean {
  if (!resolution.resolved || caseTypeCode === undefined) return false;
  return caseTypeCode === resolution.value;
}

// ── The create contract ──────────────────────────────────────────────────────

/**
 * Everything a formal Complaint needs, and nothing more.
 *
 * Proven against the organisation rather than copied from the form: the platform refused a Case
 * carrying only a title and a case type with *"You should specify a contact or account."*, and
 * accepted one the moment a customer was added. The thirteen `ApplicationRequired` fields —
 * including the partner bank, its relationship manager, a financing purpose and an amount in QAR —
 * are a **form** rule that the Web API never reaches.
 *
 * The lesson is written here because it will be tempting to reintroduce:
 * **`ApplicationRequired` is not server-required.** Only `SystemRequired` binds a create through
 * the API, and only runtime evidence establishes an integration's real contract.
 */
export interface ComplaintDraft {
  title: string;
  customer: ComplaintCustomer;
}

/**
 * Who the Complaint is about.
 *
 * The Case's `customerid` is **polymorphic**, which makes this the first downstream process that
 * takes either book directly: a BFD customer binds as an account, a Housing Loan customer binds as
 * a contact. No conversion happens in either direction — the Legal KI-108 problem does not arise
 * here and must not be reintroduced by "normalising" a contact into an account.
 */
export type ComplaintCustomer =
  | { table: 'account'; id: string }
  | { table: 'contact'; id: string };

/** The write-side navigation property for each customer shape, as the platform names them. */
export const COMPLAINT_CUSTOMER_BINDING: Readonly<Record<ComplaintCustomer['table'], string>> = {
  account: 'customerid_account',
  contact: 'customerid_contact',
};

/** The entity set each customer shape is bound from. */
export const COMPLAINT_CUSTOMER_SET: Readonly<Record<ComplaintCustomer['table'], string>> = {
  account: 'accounts',
  contact: 'contacts',
};

export type ComplaintCreateDecision =
  | { create: true; body: Record<string, unknown> }
  | { create: false; reason: string };

/**
 * Builds the create payload, or refuses.
 *
 * Returns the body or nothing at all, so a Complaint that should not be raised has no way to be
 * raised. The payload carries exactly three things — title, case type and customer — and a test
 * asserts that it never grows a financing field.
 */
export function buildComplaintCreate(
  draft: ComplaintDraft,
  resolution: CaseTypeResolution,
): ComplaintCreateDecision {
  if (!resolution.resolved) return { create: false, reason: resolution.reason };
  if (!draft.title.trim()) {
    return { create: false, reason: 'A complaint needs a short description before it can be raised.' };
  }
  if (!draft.customer.id) {
    return { create: false, reason: 'A complaint must name the customer it is about.' };
  }

  const binding = COMPLAINT_CUSTOMER_BINDING[draft.customer.table];
  const set = COMPLAINT_CUSTOMER_SET[draft.customer.table];
  return {
    create: true,
    body: {
      title: draft.title.trim(),
      casetypecode: resolution.value,
      [`${binding}@odata.bind`]: `/${set}(${draft.customer.id})`,
    },
  };
}

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Whether a lookup is allowed to answer "has a Complaint already been raised?".
 *
 * **It is not**, and this exists to say so where a test can see it. `qdb_complaintcaseid` is
 * traceability: it records which Case an activity produced, after the fact. It cannot make a
 * create safe, because two workers racing on the same intent both read it empty and both proceed.
 *
 * Retry safety comes from creating the Case at a caller-chosen id with `If-None-Match: *`, so the
 * **platform** refuses the second attempt with 412 rather than this code deciding it already knows.
 */
export function lookupProvidesIdempotency(): false {
  return false;
}

/** This module's own namespace, so no Complaint id can collide with a Litigation Request's. */
const COMPLAINT_NAMESPACE = '9d41c7a2-5e38-4b16-ae70-2c85f3d90b41';

/**
 * The id a formal Complaint will take for a given Collection Activity.
 *
 * **One component, and deliberately not the customer.** The activity is the hand-off intent; the
 * customer is a detail of it. Deriving from the customer as well would mean correcting a
 * mis-recorded customer produced a *second* Complaint for the same intent — the exact duplicate
 * this is meant to prevent, and the same reasoning that shaped `litigationRequestId`.
 *
 * Nothing time-based and nothing random takes part, so a retry after a lost response writes to the
 * same id and is refused by the platform rather than accepted as a new Case.
 */
export function complaintCaseId(activityId: string): string {
  return uuidV5(`complaint|${activityId.toLowerCase()}`, COMPLAINT_NAMESPACE);
}
