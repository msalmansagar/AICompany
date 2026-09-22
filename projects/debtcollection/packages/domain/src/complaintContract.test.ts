import { describe, expect, it } from 'vitest';
import {
  buildComplaintCreate, complaintCaseId, isComplaintCaseType, lookupProvidesIdempotency,
  resolveComplaintCaseType, type CaseTypeOption, type ComplaintDraft,
} from './complaintContract.js';

/**
 * The Complaint contract.
 *
 * Two properties carry most of the weight: the discriminator is resolved from a **label** so a
 * renumbering cannot silently change meaning (KI-123 proves that is a live risk), and the create
 * payload never grows a field the Web API does not require (KI-122 proves that is a live
 * temptation).
 */

const ACTIVITY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ACTIVITY = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACCOUNT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTACT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/** The organisation's current configuration, as metadata reports it. */
const LIVE_OPTIONS: CaseTypeOption[] = [
  { value: 1, label: 'Inquiry' },
  { value: 2, label: 'Complaint' },
  { value: 3, label: 'Suggestion' },
];

/** What the same three integers meant before QDB redefined the set in place. */
const LEGACY_OPTIONS: CaseTypeOption[] = [
  { value: 1, label: 'Question' },
  { value: 2, label: 'Problem' },
  { value: 3, label: 'Request' },
];

const resolution = resolveComplaintCaseType(LIVE_OPTIONS);

const draft = (overrides: Partial<ComplaintDraft> = {}): ComplaintDraft => ({
  title: 'Customer unhappy with how the call was handled',
  customer: { table: 'account', id: ACCOUNT },
  ...overrides,
});

// ── The discriminator comes from the label ───────────────────────────────────

describe('the Complaint case type is resolved, never written down', () => {
  it('finds the configured Complaint option', () => {
    expect(resolution).toEqual({ resolved: true, value: 2 });
  });

  it('follows a renumbering without a code change', () => {
    // The whole point: QDB may renumber again, as they already redefined this set once.
    const renumbered = resolveComplaintCaseType([
      { value: 100000000, label: 'Inquiry' },
      { value: 100000001, label: 'Complaint' },
    ]);

    expect(renumbered).toEqual({ resolved: true, value: 100000001 });
  });

  it('refuses when nothing is labelled Complaint, rather than guessing', () => {
    // These are the OLD semantics. Value 2 is there, and it means Problem — so resolving to it
    // would file every complaint as a problem.
    const legacy = resolveComplaintCaseType(LEGACY_OPTIONS);

    expect(legacy.resolved).toBe(false);
    expect(legacy.resolved === false && legacy.reason).toMatch(/no case type is configured/i);
  });

  it('refuses when two options both claim the label', () => {
    const ambiguous = resolveComplaintCaseType([
      { value: 2, label: 'Complaint' }, { value: 9, label: 'complaint' },
    ]);

    expect(ambiguous.resolved).toBe(false);
    expect(ambiguous.resolved === false && ambiguous.reason).toMatch(/more than one/i);
  });

  it('matches the whole label, not a substring', () => {
    // "Service Complaint" and "Complaint — Closed" are different case types, not this one.
    const near = resolveComplaintCaseType([
      { value: 1, label: 'Service Complaint' }, { value: 2, label: 'Complaint — Closed' },
    ]);

    expect(near.resolved).toBe(false);
  });

  it('tolerates whitespace and casing in configuration', () => {
    expect(resolveComplaintCaseType([{ value: 7, label: '  COMPLAINT ' }]))
      .toEqual({ resolved: true, value: 7 });
  });

  it('recognises a stored case type only through the resolved contract', () => {
    expect(isComplaintCaseType(2, resolution)).toBe(true);
    expect(isComplaintCaseType(1, resolution)).toBe(false);
    expect(isComplaintCaseType(undefined, resolution)).toBe(false);
    // With no resolution there is no such thing as "the complaint type".
    expect(isComplaintCaseType(2, resolveComplaintCaseType(LEGACY_OPTIONS))).toBe(false);
  });
});

// ── The create payload stays minimal and truthful ────────────────────────────

describe('a Complaint is created with the minimum the server actually requires', () => {
  it('carries exactly title, case type and customer', () => {
    const decision = buildComplaintCreate(draft(), resolution);

    expect(decision.create).toBe(true);
    expect(decision.create === true && Object.keys(decision.body).sort())
      .toEqual(['casetypecode', 'customerid_account@odata.bind', 'title']);
  });

  it('never carries a partner-bank or financing field', () => {
    // KI-122: these are ApplicationRequired — a FORM rule the Web API never reaches. Adding them
    // would mean fabricating a bank, a relationship manager and an amount in QAR.
    const decision = buildComplaintCreate(draft(), resolution);
    const keys = decision.create === true ? Object.keys(decision.body).join(' ') : '';

    expect(keys).not.toMatch(/partnerbank|pb_rm|purpose_of_financing|totalamountrequested|product/i);
  });

  it('binds a BFD customer as an account', () => {
    const decision = buildComplaintCreate(draft(), resolution);

    expect(decision.create === true && decision.body['customerid_account@odata.bind'])
      .toBe(`/accounts(${ACCOUNT})`);
  });

  it('binds an HL customer as a contact, with no conversion', () => {
    const decision = buildComplaintCreate(
      draft({ customer: { table: 'contact', id: CONTACT } }), resolution);

    expect(decision.create === true && decision.body['customerid_contact@odata.bind'])
      .toBe(`/contacts(${CONTACT})`);
    expect(decision.create === true && decision.body['customerid_account@odata.bind'])
      .toBeUndefined();
  });

  it('refuses when the case type could not be resolved', () => {
    const decision = buildComplaintCreate(draft(), resolveComplaintCaseType(LEGACY_OPTIONS));

    expect(decision.create).toBe(false);
    // No body means no way to create — the refusal is structural, not a convention.
    expect('body' in decision).toBe(false);
  });

  it('refuses an empty description or a missing customer', () => {
    expect(buildComplaintCreate(draft({ title: '   ' }), resolution).create).toBe(false);
    expect(buildComplaintCreate(
      draft({ customer: { table: 'account', id: '' } }), resolution).create).toBe(false);
  });

  it('explains a refusal without naming a column or an option value', () => {
    const decision = buildComplaintCreate(draft(), resolveComplaintCaseType([]));
    const reason = decision.create === false ? decision.reason : '';

    expect(reason).not.toMatch(/casetypecode|incident|qdb_|KI-\d+|option/i);
  });
});

// ── Identity, and what the lookup is not ─────────────────────────────────────

describe('one hand-off maps to exactly one Complaint', () => {
  it('derives the same id every time, so a retry writes to the same place', () => {
    expect(complaintCaseId(ACTIVITY)).toBe(complaintCaseId(ACTIVITY));
  });

  it('derives a different id for a different activity', () => {
    expect(complaintCaseId(ACTIVITY)).not.toBe(complaintCaseId(OTHER_ACTIVITY));
  });

  it('is insensitive to the case the platform returns the id in', () => {
    expect(complaintCaseId(ACTIVITY.toUpperCase())).toBe(complaintCaseId(ACTIVITY));
  });

  it('does not vary with the customer, so a correction cannot produce a second Complaint', () => {
    // The identity is the hand-off intent. Correcting a mis-recorded customer must not raise a
    // second formal Complaint for the same intent.
    const id = complaintCaseId(ACTIVITY);

    expect(complaintCaseId(ACTIVITY)).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not collide with a Litigation Request derived from the same activity', async () => {
    const { litigationRequestId } = await import('./legalHandoff.js');

    expect(complaintCaseId(ACTIVITY)).not.toBe(litigationRequestId(ACTIVITY));
  });

  it('never claims the traceability lookup provides uniqueness', () => {
    // Two racing workers both read the lookup empty and both proceed. Only the platform's 412 on
    // a caller-chosen id can decide this.
    expect(lookupProvidesIdempotency()).toBe(false);
  });
});
