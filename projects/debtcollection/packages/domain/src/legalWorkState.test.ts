import { describe, expect, it } from 'vitest';
import {
  describeLegalWork, queueBucketFor, type LegalWorkInput,
} from './legalWorkState.js';
import type { LegalQualificationPolicy } from './legalHandoff.js';

/**
 * The Collection-side Legal state.
 *
 * The property this file exists to protect is that **`ReadyForHandoff` cannot be reached** while
 * QDB has configured no qualification rule (KI-109). Most of the tests below are attempts to reach
 * it by the routes someone might plausibly try — completing the activity, approving it, letting a
 * deadline pass — and confirmation that none of them works.
 */

const ACCOUNT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTACT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const LEGAL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

/** What the organisation actually holds: nothing. */
const NO_POLICY: LegalQualificationPolicy = {};

/** What a complete policy would look like, on the day QDB supplies one. */
const CONFIGURED_POLICY: LegalQualificationPolicy = {
  qualifyingApprovalStatus: 1,
  caseType: 100000001,
  caseAgainst: 1,
  caseInitiatedBy: 100000006,
};

const input = (overrides: Partial<LegalWorkInput> = {}): LegalWorkInput => ({
  recommendation: {
    activityId: 'act-1',
    lifecycle: 'Open',
    isLegalRecommendation: true,
    approvalStatus: 1,
  },
  customer: { table: 'account', id: ACCOUNT },
  policy: NO_POLICY,
  episodeIsCurrent: true,
  ...overrides,
});

// ── Fail-closed, and hard to talk out of it ──────────────────────────────────

describe('hand-off stays closed while nothing says what qualifies one', () => {
  it('reports awaiting authorisation, not readiness', () => {
    const work = describeLegalWork(input());

    expect(work.state).toBe('QualificationPending');
    expect(work.handoffAvailable).toBe(false);
  });

  it('is not opened by completing the recommendation', () => {
    const work = describeLegalWork(input({
      recommendation: {
        activityId: 'act-1', lifecycle: 'Completed', isLegalRecommendation: true, approvalStatus: 1,
      },
    }));

    expect(work.handoffAvailable).toBe(false);
  });

  it('is not opened by an approval status on its own', () => {
    for (const approvalStatus of [0, 1, 2]) {
      const work = describeLegalWork(input({
        recommendation: {
          activityId: 'act-1', lifecycle: 'Open', isLegalRecommendation: true, approvalStatus,
        },
      }));

      expect(work.handoffAvailable, `approval ${approvalStatus}`).toBe(false);
    }
  });

  it('is not opened by a resolvable BFD customer', () => {
    // Everything else being in order is not the same as being authorised.
    expect(describeLegalWork(input({ customer: { table: 'account', id: ACCOUNT } }))
      .handoffAvailable).toBe(false);
  });

  it('is not opened by a partly configured policy', () => {
    for (const missing of ['qualifyingApprovalStatus', 'caseType', 'caseAgainst', 'caseInitiatedBy'] as const) {
      const partial = { ...CONFIGURED_POLICY };
      delete partial[missing];

      expect(describeLegalWork(input({ policy: partial })).handoffAvailable, missing).toBe(false);
    }
  });

  it('opens only when a complete policy is configured AND met', () => {
    const work = describeLegalWork(input({ policy: CONFIGURED_POLICY }));

    expect(work.state).toBe('ReadyForHandoff');
    expect(work.handoffAvailable).toBe(true);
    expect(work.label).toMatch(/ready/i);
  });

  it('closes again when the configured policy is not met', () => {
    const work = describeLegalWork(input({
      policy: CONFIGURED_POLICY,
      recommendation: {
        activityId: 'act-1', lifecycle: 'Open', isLegalRecommendation: true, approvalStatus: 0,
      },
    }));

    expect(work.state).toBe('QualificationPending');
    expect(work.handoffAvailable).toBe(false);
  });
});

// ── HL stays unresolvable, visibly ───────────────────────────────────────────

describe('an HL customer is reported, never converted', () => {
  it('reports customer resolution required even with a full policy', () => {
    const work = describeLegalWork(input({
      customer: { table: 'contact', id: CONTACT }, policy: CONFIGURED_POLICY,
    }));

    expect(work.state).toBe('CustomerResolutionRequired');
    expect(work.handoffAvailable, 'and no hand-off is offered').toBe(false);
  });

  it('says so in business language, naming no mapping or identifier', () => {
    const work = describeLegalWork(input({ customer: { table: 'contact', id: CONTACT } }));

    expect(work.label).not.toMatch(/account|contact|government|mapping|KI-\d+|qdb_/i);
  });

  it('reports the configuration gap ahead of the customer gap', () => {
    // Configuration blocks every case; the customer blocks only this one.
    expect(describeLegalWork(input({ customer: { table: 'contact', id: CONTACT } })).state)
      .toBe('QualificationPending');
  });
});

// ── A raised Litigation Request outranks everything ──────────────────────────

describe('a recorded Litigation Request is never argued with', () => {
  it('shows the litigation, not the policy gap', () => {
    const work = describeLegalWork(input({
      recommendation: {
        activityId: 'act-1', lifecycle: 'Open', isLegalRecommendation: true,
        litigationRequestId: LEGAL_ID,
      },
      fetch: { kind: 'found', record: { reference: 'LEG-1', status: 'Under Criminal Court' } },
    }));

    expect(work.state).toBe('LitigationVisible');
    expect(work.litigation?.status).toBe('Under Criminal Court');
  });

  it('never offers a second hand-off for work already handed off', () => {
    const work = describeLegalWork(input({
      policy: CONFIGURED_POLICY,
      recommendation: {
        activityId: 'act-1', lifecycle: 'Open', isLegalRecommendation: true,
        litigationRequestId: LEGAL_ID,
      },
      fetch: { kind: 'found', record: { reference: 'LEG-1' } },
    }));

    expect(work.handoffAvailable).toBe(false);
  });

  it('reports a refused read as existing-but-hidden, never as absent', () => {
    const work = describeLegalWork(input({
      recommendation: {
        activityId: 'act-1', lifecycle: 'Open', isLegalRecommendation: true,
        litigationRequestId: LEGAL_ID,
      },
      fetch: { kind: 'forbidden' },
    }));

    expect(work.state).toBe('LitigationNotVisible');
    expect(work.label).toMatch(/raised/i);
    expect(work.label).not.toMatch(/no legal request/i);
  });
});

// ── Queue buckets carry no Legal taxonomy ────────────────────────────────────

describe('queue buckets are Collection-side, not a Legal status model', () => {
  it('maps each state to a bucket an officer would filter by', () => {
    expect(queueBucketFor('RecommendationOnly')).toBe('LegalRecommendations');
    expect(queueBucketFor('ReadyForHandoff')).toBe('LegalRecommendations');
    expect(queueBucketFor('CustomerResolutionRequired')).toBe('CustomerResolutionRequired');
    expect(queueBucketFor('QualificationPending')).toBe('QualificationRequired');
    expect(queueBucketFor('LitigationVisible')).toBe('LitigationRaised');
  });

  it('treats every inaccessible shape as the same bucket', () => {
    for (const state of ['LitigationNotVisible', 'LitigationUnavailable', 'LitigationLinkBroken'] as const) {
      expect(queueBucketFor(state), state).toBe('LegalDetailsInaccessible');
    }
  });

  it('has no bucket naming a Legal court stage, settlement or closure', () => {
    const buckets = (['RecommendationOnly', 'ReadyForHandoff', 'CustomerResolutionRequired',
      'QualificationPending', 'LitigationVisible', 'LitigationNotVisible'] as const)
      .map(queueBucketFor).join(' ');

    expect(buckets).not.toMatch(/court|appeal|cassation|settlement|closed|prosecution|draft/i);
  });

  it('gives an activity that is not a Legal Recommendation no bucket at all', () => {
    expect(queueBucketFor('NotLegal')).toBeNull();
  });
});

// ── Episode currency is Collection's alone ───────────────────────────────────

describe('Legal lifecycle never decides what is current collection work', () => {
  it('keeps a cured episode’s recommendation out of current work, live litigation or not', () => {
    const work = describeLegalWork(input({
      episodeIsCurrent: false,
      recommendation: {
        activityId: 'act-1', lifecycle: 'Open', isLegalRecommendation: true,
        litigationRequestId: LEGAL_ID,
      },
      fetch: { kind: 'found', record: { reference: 'LEG-1', status: 'Under Criminal Court' } },
    }));

    expect(work.isCurrent).toBe(false);
    expect(work.litigation, 'and it is still fully described').toBeDefined();
  });

  it('keeps a current episode’s recommendation current even when Legal has closed', () => {
    const work = describeLegalWork(input({
      recommendation: {
        activityId: 'act-1', lifecycle: 'Open', isLegalRecommendation: true,
        litigationRequestId: LEGAL_ID,
      },
      fetch: { kind: 'found', record: { reference: 'LEG-1', status: 'Closed' } },
    }));

    expect(work.isCurrent).toBe(true);
  });
});
