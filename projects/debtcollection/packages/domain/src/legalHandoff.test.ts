import { describe, expect, it } from 'vitest';
import {
  decideLegalHandoff, interpretHandoffWrite, litigationRequestId, remainsAvailable,
  resolveLegalCustomer, worthRetrying,
  type LegalQualificationPolicy, type LegalRecommendation,
} from './legalHandoff.js';

/**
 * Legal hand-off — and mostly, the cases where it must NOT raise litigation.
 *
 * Raising a Litigation Request is irreversible and outward-facing. The tests that matter here are
 * the refusals: an unresolvable customer, an unconfigured qualification, an unapproved
 * recommendation, and an activity that is merely *of type* Legal.
 */

const ACTIVITY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ACTIVITY = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACCOUNT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTACT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const APPROVED = 1;

/** A fully configured policy. Values stand in for QDB's; none is a constant in the module. */
const policy: LegalQualificationPolicy = {
  qualifyingApprovalStatus: APPROVED,
  caseType: 100000001,
  caseAgainst: 1,
  caseInitiatedBy: 100000005,
};

const recommendation = (overrides: Partial<LegalRecommendation> = {}): LegalRecommendation => ({
  activityId: ACTIVITY,
  lifecycle: 'Open',
  isLegalRecommendation: true,
  approvalStatus: APPROVED,
  ...overrides,
});

const bfd = { table: 'account' as const, id: ACCOUNT };
const housingLoan = { table: 'contact' as const, id: CONTACT };

const decide = (
  over: { recommendation?: Partial<LegalRecommendation>; customer?: { table?: 'account' | 'contact'; id?: string }; policy?: LegalQualificationPolicy } = {},
) => decideLegalHandoff({
  recommendation: recommendation(over.recommendation),
  customer: over.customer ?? bfd,
  policy: over.policy ?? policy,
});

// ── The customer must be known ───────────────────────────────────────────────

describe('a Litigation Request is never raised against a customer nobody resolved', () => {
  it('refuses a Housing Loan case, whose customer is a person (KI-108)', () => {
    const result = decide({ customer: housingLoan });

    expect(result.outcome).toBe('CustomerResolutionRequired');
    expect(result.request, 'and hands the caller nothing to create with').toBeUndefined();
  });

  it('refuses a case with no customer at all', () => {
    expect(decide({ customer: {} }).outcome).toBe('CustomerResolutionRequired');
  });

  it('proceeds for a BFD case, whose customer IS an account', () => {
    const result = decide();

    expect(result.outcome).toBe('ReadyForLegalHandoff');
    expect(result.request?.accountId).toBe(ACCOUNT);
  });

  it('decides from the table the platform reports, not from an organisation code', () => {
    // The same case would be handed off or refused purely on which table its customer is in.
    expect(resolveLegalCustomer({ table: 'account', id: ACCOUNT }).resolved).toBe(true);
    expect(resolveLegalCustomer({ table: 'contact', id: CONTACT }).resolved).toBe(false);
  });

  it('explains the refusal without naming a table, a column or a KI number', () => {
    const result = decide({ customer: housingLoan });

    expect(result.reason).not.toMatch(/qdb_|account\b.*lookup|contact\b.*table|KI-\d+|odata/i);
    expect(result.reason).toMatch(/person|company/i);
  });

  it('never invents an account to satisfy the hand-off', () => {
    const result = decide({ customer: housingLoan });

    // The only way to create is through `request`, and there is none.
    expect(result.request).toBeUndefined();
  });
});

// ── Qualification is configuration, and absence refuses ──────────────────────

describe('nothing is handed to Legal until QDB says what qualifies', () => {
  it('refuses when no policy is configured at all (KI-109)', () => {
    expect(decide({ policy: {} }).outcome).toBe('QualificationNotConfigured');
  });

  for (const missing of ['qualifyingApprovalStatus', 'caseType', 'caseAgainst', 'caseInitiatedBy'] as const) {
    it(`refuses when ${missing} alone is missing — a partial policy is not a policy`, () => {
      const partial = { ...policy };
      delete partial[missing];

      expect(decide({ policy: partial }).outcome).toBe('QualificationNotConfigured');
    });
  }

  it('refuses a recommendation that has not been approved', () => {
    const unapproved = decideLegalHandoff({
      recommendation: {
        activityId: ACTIVITY, lifecycle: 'Open', isLegalRecommendation: true,
      },
      customer: bfd,
      policy,
    });

    expect(unapproved.outcome).toBe('NotQualified');
    expect(decide({ recommendation: { approvalStatus: 0 } }).outcome).toBe('NotQualified');
  });

  it('carries QDB’s own picklist values through rather than choosing any', () => {
    const result = decide();

    expect(result.request?.policy.caseType).toBe(policy.caseType);
    expect(result.request?.policy.caseInitiatedBy).toBe(policy.caseInitiatedBy);
  });
});

// ── Being "Legal" is not permission ──────────────────────────────────────────

describe('an activity of type Legal is not by itself a litigation', () => {
  it('refuses an activity that is not a Legal Recommendation', () => {
    expect(decide({ recommendation: { isLegalRecommendation: false } }).outcome)
      .toBe('RecommendationNotActionable');
  });

  it('refuses a completed or cancelled recommendation', () => {
    expect(decide({ recommendation: { lifecycle: 'Completed' } }).outcome)
      .toBe('RecommendationNotActionable');
    expect(decide({ recommendation: { lifecycle: 'Cancelled' } }).outcome)
      .toBe('RecommendationNotActionable');
  });

  it('treats a manual and a strategy-generated recommendation identically', () => {
    // Origin is traceability, never permission. An officer's own approved recommendation is as
    // valid as one the strategy raised.
    expect(decide({ recommendation: { origin: 'Manual' } }).outcome).toBe('ReadyForLegalHandoff');
    expect(decide({ recommendation: { origin: 'StrategyGenerated' } }).outcome)
      .toBe('ReadyForLegalHandoff');
  });
});

// ── Identity, and why a retry is safe ────────────────────────────────────────

describe('one recommendation maps to exactly one Litigation Request', () => {
  it('derives the same id every time, so a retry writes to the same place', () => {
    expect(litigationRequestId(ACTIVITY)).toBe(litigationRequestId(ACTIVITY));
  });

  it('derives a different id for a different recommendation', () => {
    expect(litigationRequestId(ACTIVITY)).not.toBe(litigationRequestId(OTHER_ACTIVITY));
  });

  it('is insensitive to the case the platform returns the id in', () => {
    expect(litigationRequestId(ACTIVITY.toUpperCase())).toBe(litigationRequestId(ACTIVITY));
  });

  it('does not vary with the customer, so a corrected customer cannot produce a second request', () => {
    const first = decide({ customer: { table: 'account', id: ACCOUNT } });
    const second = decide({ customer: { table: 'account', id: CONTACT } });

    expect(first.request?.litigationRequestId).toBe(second.request?.litigationRequestId);
  });

  it('does not vary with time or with the attempt', () => {
    expect(litigationRequestId(ACTIVITY)).toBe(litigationRequestId(ACTIVITY));
    expect(litigationRequestId(ACTIVITY)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('reports an already-linked recommendation as done, not as an error', () => {
    const result = decide({ recommendation: { litigationRequestId: 'existing' } });

    expect(result.outcome).toBe('AlreadyHandedOff');
    expect(result.request).toBeUndefined();
  });
});

// ── What a write's status means ──────────────────────────────────────────────

describe('a refused duplicate is the good case, not a failure', () => {
  it('reads 412 as already handed off', () => {
    // The derived id was taken, so a previous or concurrent attempt succeeded. Calling this a
    // failure would invite a retry loop that eventually produced a second Litigation Request.
    expect(interpretHandoffWrite(412)).toBe('AlreadyHandedOff');
  });

  it('reads a 2xx as created', () => {
    expect(interpretHandoffWrite(204)).toBe('LegalHandoffCreated');
    expect(interpretHandoffWrite(201)).toBe('LegalHandoffCreated');
  });

  it('separates a transient failure from a permanent one', () => {
    expect(interpretHandoffWrite(503)).toBe('RetryableFailure');
    expect(interpretHandoffWrite(429)).toBe('RetryableFailure');
    expect(interpretHandoffWrite(400)).toBe('PermanentFailure');
    expect(interpretHandoffWrite(403)).toBe('PermanentFailure');
  });

  it('reports a missing Legal entry point as its own outcome', () => {
    expect(interpretHandoffWrite(404)).toBe('LegalEntryPointUnavailable');
  });

  it('never retries a duplicate or a permanent refusal', () => {
    expect(worthRetrying('AlreadyHandedOff')).toBe(false);
    expect(worthRetrying('PermanentFailure')).toBe(false);
    expect(worthRetrying('RetryableFailure')).toBe(true);
  });
});

// ── The recommendation survives a refusal ────────────────────────────────────

describe('a refusal leaves the recommendation available to try again', () => {
  it('keeps it available when the customer or the policy is the problem', () => {
    expect(remainsAvailable('CustomerResolutionRequired')).toBe(true);
    expect(remainsAvailable('QualificationNotConfigured')).toBe(true);
  });

  it('does not keep it available once it is settled', () => {
    expect(remainsAvailable('AlreadyHandedOff')).toBe(false);
    expect(remainsAvailable('LegalHandoffCreated')).toBe(false);
    expect(remainsAvailable('PermanentFailure')).toBe(false);
  });

  it('does not offer an automatic retry for something a person must fix', () => {
    // Available to try again is not the same as worth retrying now: nobody should poll a customer
    // record into existence.
    expect(worthRetrying('CustomerResolutionRequired')).toBe(false);
    expect(worthRetrying('QualificationNotConfigured')).toBe(false);
  });
});

// ── Order of refusals ────────────────────────────────────────────────────────

describe('the most useful reason is the one reported', () => {
  it('reports an existing hand-off ahead of any configuration problem', () => {
    expect(decide({
      recommendation: { litigationRequestId: 'existing' }, policy: {}, customer: housingLoan,
    }).outcome).toBe('AlreadyHandedOff');
  });

  it('reports a missing policy ahead of an unresolvable customer', () => {
    // Configuration is the thing that blocks every case; the customer blocks only this one.
    expect(decide({ policy: {}, customer: housingLoan }).outcome)
      .toBe('QualificationNotConfigured');
  });

  it('reports a closed recommendation ahead of everything but an existing hand-off', () => {
    expect(decide({ recommendation: { lifecycle: 'Cancelled' }, policy: {} }).outcome)
      .toBe('RecommendationNotActionable');
  });
});
