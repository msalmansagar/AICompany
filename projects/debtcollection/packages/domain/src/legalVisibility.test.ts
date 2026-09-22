import { describe, expect, it } from 'vitest';
import {
  assertsNoLitigation, describeLegalTrace, interpretLegalRead, litigationExists,
  type LegalRecordFetch, type LegalTraceInput, type LitigationSummary,
} from './legalVisibility.js';

/**
 * Legal visibility — and above all, the difference between absent and invisible.
 *
 * The tests that matter most here assert that an inaccessible Litigation Request is never reported
 * as a missing one. On this organisation that is the ordinary case, not the edge case: no DCP role
 * holds read permission on the Legal entity, so a real Collection Officer's read is refused.
 */

const LEGAL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const summary: LitigationSummary = {
  reference: 'LEG-2026-0001',
  status: 'Pending with Legal (First Instance Court)',
  createdOn: '2026-09-01T00:00:00Z',
  customerName: 'Doha Marine Supplies WLL',
};

const input = (overrides: Partial<LegalTraceInput> = {}): LegalTraceInput => ({
  isLegalRecommendation: true,
  episodeIsCurrent: true,
  ...overrides,
});

const linked = (fetch: LegalRecordFetch) =>
  describeLegalTrace(input({ legalRequestId: LEGAL_ID, fetch }));

// ── Absent is not the same as invisible ──────────────────────────────────────

describe('a Litigation Request that cannot be read is never reported as absent', () => {
  it('says the request exists when access is refused', () => {
    const trace = linked({ kind: 'forbidden' });

    expect(trace.state).toBe('LitigationNotVisible');
    expect(trace.label).toMatch(/raised/i);
    expect(trace.label).not.toMatch(/no legal request|not raised/i);
  });

  it('does not claim absence for any state where a link exists', () => {
    for (const fetch of [{ kind: 'forbidden' }, { kind: 'notFound' },
      { kind: 'unavailable' }] as const) {
      expect(assertsNoLitigation(linked(fetch).state), fetch.kind).toBe(false);
      expect(litigationExists(linked(fetch).state), fetch.kind).toBe(true);
    }
  });

  it('separates a withheld record from one the organisation does not hold', () => {
    expect(linked({ kind: 'forbidden' }).state).toBe('LitigationNotVisible');
    expect(linked({ kind: 'notFound' }).state).toBe('LitigationLinkBroken');
    expect(linked({ kind: 'forbidden' }).state).not.toBe(linked({ kind: 'notFound' }).state);
  });

  it('treats a link with no read attempt as unknown, not as absent', () => {
    const trace = describeLegalTrace(input({ legalRequestId: LEGAL_ID }));

    expect(trace.state).toBe('LitigationUnavailable');
    expect(assertsNoLitigation(trace.state)).toBe(false);
  });

  it('keeps 403 and 404 apart, which is what stops every officer seeing "no litigation"', () => {
    expect(interpretLegalRead(403)).toBe('forbidden');
    expect(interpretLegalRead(401)).toBe('forbidden');
    expect(interpretLegalRead(404)).toBe('notFound');
    expect(interpretLegalRead(500)).toBe('unavailable');
    expect(interpretLegalRead(200)).toBe('found');
  });
});

// ── The status comes from Legal, never from here ─────────────────────────────

describe('the Legal status is passed through, never decided', () => {
  it('shows the platform’s own label verbatim', () => {
    const trace = linked({ kind: 'found', record: summary });

    expect(trace.litigation?.status).toBe('Pending with Legal (First Instance Court)');
  });

  it('carries no status of its own when Legal sent none', () => {
    const trace = linked({ kind: 'found', record: { reference: 'LEG-1' } });

    expect(trace.litigation?.status).toBeUndefined();
  });

  it('never derives a Legal status from the collection state', () => {
    // The trace state describes the *link*, not the litigation's lifecycle.
    const trace = linked({ kind: 'found', record: summary });

    expect(trace.state).toBe('LitigationVisible');
    expect(trace.label).not.toMatch(/court|settlement|closed|cassation|appeal/i);
  });

  it('exposes the litigation only when it was actually read', () => {
    expect(linked({ kind: 'found', record: summary }).litigation).toEqual(summary);
    expect(linked({ kind: 'forbidden' }).litigation).toBeUndefined();
    expect(linked({ kind: 'notFound' }).litigation).toBeUndefined();
  });
});

// ── A recommendation is not a litigation ─────────────────────────────────────

describe('a recommendation without a Litigation Request is a valid state', () => {
  it('is described as recommended, not as failed or pending litigation', () => {
    const trace = describeLegalTrace(input());

    expect(trace.state).toBe('RecommendationOnly');
    expect(trace.label).not.toMatch(/fail|error|pending litigation/i);
  });

  /**
   * The separation §2 requires, asserted directly.
   *
   * Without this, relabelling "Recommended" as "Legal request raised" passed the whole suite —
   * every other test checked what the label was *not*, and none checked that a recommendation is
   * never presented as a litigation.
   */
  it('never claims a Legal request was raised when none was', () => {
    const affirmative = [
      linked({ kind: 'found', record: summary }).label,
      linked({ kind: 'forbidden' }).label,
      linked({ kind: 'unavailable' }).label,
    ];

    for (const outcome of [undefined, 'CustomerResolutionRequired',
      'QualificationNotConfigured', 'NotQualified'] as const) {
      const trace = describeLegalTrace(input(outcome ? { handoffOutcome: outcome } : {}));

      expect(assertsNoLitigation(trace.state), outcome ?? 'none').toBe(true);
      // Compared against the affirmative wording rather than pattern-matched: the honest label
      // contains the phrase "no Legal request raised", so a regex for "request raised" would
      // reject the correct text and accept nothing useful.
      expect(affirmative, outcome ?? 'none').not.toContain(trace.label);
    }
  });

  it('describes a recommendation and a raised request differently', () => {
    const recommended = describeLegalTrace(input()).label;
    const raised = linked({ kind: 'found', record: summary }).label;

    expect(recommended).not.toBe(raised);
    expect(recommended).toMatch(/recommended/i);
    expect(raised).toMatch(/raised/i);
  });

  it('reports customer resolution in QDB’s own wording', () => {
    const trace = describeLegalTrace(input({ handoffOutcome: 'CustomerResolutionRequired' }));

    expect(trace.label).toBe('Customer resolution required before Legal hand-off');
  });

  it('reports an unconfigured qualification as awaiting authorisation', () => {
    for (const outcome of ['QualificationNotConfigured', 'NotQualified'] as const) {
      expect(describeLegalTrace(input({ handoffOutcome: outcome })).state)
        .toBe('QualificationPending');
    }
  });

  it('does not invent a reason from an outcome it cannot verify', () => {
    for (const outcome of ['RetryableFailure', 'PermanentFailure',
      'LegalEntryPointUnavailable'] as const) {
      expect(describeLegalTrace(input({ handoffOutcome: outcome })).state)
        .toBe('RecommendationOnly');
    }
  });

  it('shows nothing at all for an activity that is not a Legal Recommendation', () => {
    const trace = describeLegalTrace(input({ isLegalRecommendation: false }));

    expect(trace.state).toBe('NotLegal');
    expect(trace.isCurrent).toBe(false);
  });
});

// ── The link outranks a stale outcome ────────────────────────────────────────

describe('a recorded Litigation Request outranks any reason it should not exist', () => {
  it('reports the litigation, not the blocker, when both are present', () => {
    // A stale CustomerResolutionRequired must never be shown over a litigation that exists.
    const trace = describeLegalTrace(input({
      legalRequestId: LEGAL_ID,
      fetch: { kind: 'found', record: summary },
      handoffOutcome: 'CustomerResolutionRequired',
    }));

    expect(trace.state).toBe('LitigationVisible');
  });

  it('still reports it as existing when it cannot be read', () => {
    const trace = describeLegalTrace(input({
      legalRequestId: LEGAL_ID,
      fetch: { kind: 'forbidden' },
      handoffOutcome: 'QualificationNotConfigured',
    }));

    expect(litigationExists(trace.state)).toBe(true);
  });
});

// ── The two clocks are independent ───────────────────────────────────────────

describe('Legal lifecycle and collection episode are independent', () => {
  it('does not make a cured episode current because its litigation is live', () => {
    const trace = describeLegalTrace(input({
      episodeIsCurrent: false,
      legalRequestId: LEGAL_ID,
      fetch: { kind: 'found', record: summary },
    }));

    expect(trace.isCurrent).toBe(false);
    expect(trace.litigation, 'and it is still fully described, not hidden').toEqual(summary);
  });

  it('keeps a current episode’s recommendation current whatever Legal says', () => {
    const closed = { ...summary, status: 'Closed' };
    const trace = describeLegalTrace(input({
      legalRequestId: LEGAL_ID, fetch: { kind: 'found', record: closed },
    }));

    expect(trace.isCurrent).toBe(true);
  });
});

// ── Nothing technical reaches the officer ────────────────────────────────────

describe('no implementation detail is rendered', () => {
  it('emits no state name, identifier, status code or known-issue number', () => {
    const fetches: LegalRecordFetch[] = [
      { kind: 'found', record: summary }, { kind: 'forbidden' },
      { kind: 'notFound' }, { kind: 'unavailable' },
    ];
    const labels = [
      ...fetches.map(fetch => linked(fetch).label),
      ...(['CustomerResolutionRequired', 'QualificationNotConfigured', undefined] as const)
        .map(outcome => describeLegalTrace(input(
          outcome ? { handoffOutcome: outcome } : {})).label),
    ].join(' | ');

    expect(labels).not.toMatch(/qdb_|statuscode|statecode|odata|KI-\d+|403|404|privilege|prvRead/i);
    expect(labels).not.toMatch(/LitigationNotVisible|QualificationPending|RecommendationOnly/);
    expect(labels).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('never mentions the identifier mismatch behind customer resolution', () => {
    const label = describeLegalTrace(input({ handoffOutcome: 'CustomerResolutionRequired' })).label;

    expect(label).not.toMatch(/government|account number|business id|mapping|contact|crosswalk/i);
  });
});
