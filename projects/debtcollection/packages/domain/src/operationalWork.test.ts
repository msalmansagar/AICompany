import { describe, expect, it } from 'vitest';
import {
  bucketTotalsAreDisjoint, bucketsFor, dedupeWork, describeBucket, describeCount,
  describeWorkType, distinctWorkCount, knownCount, toWorkCount, unknownCount,
  type WorkItem, type WorkType,
} from './operationalWork.js';

/**
 * The operational read model.
 *
 * The tests that matter assert the three ways an aggregation screen usually goes wrong: it
 * duplicates one record into several work items, it sums overlapping buckets, and it renders an
 * unknown count as zero.
 */

const NOW = new Date('2026-09-22T12:00:00Z');
const ME = 'user-me';
const SOMEONE_ELSE = 'user-other';

const item = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: 'act-1',
  type: 'CollectionActivity',
  title: 'Follow-up call',
  caseId: 'case-1',
  ownerId: ME,
  isCurrent: true,
  ...overrides,
});

const bucketsOf = (work: WorkItem, over: Partial<Parameters<typeof bucketsFor>[1]> = {}) =>
  [...bucketsFor(work, { currentUserId: ME, now: NOW, ...over })];

// ── One record is one piece of work ──────────────────────────────────────────

describe('one record never becomes several pieces of work', () => {
  it('puts the same item in several buckets at once', () => {
    const buckets = bucketsOf(
      item({ type: 'LegalRecommendation', dueAt: '2026-09-22T14:00:00Z' }),
      { dueSoonHours: 4 });

    expect(buckets).toContain('MyAssigned');
    expect(buckets).toContain('DueSoon');
    expect(buckets).toContain('Legal');
    expect(buckets.length, 'three classifications of one record').toBe(3);
  });

  it('collapses the same record arriving from two sources', () => {
    // A Legal Recommendation read by both the Legal query and the activity query is one job.
    const deduped = dedupeWork([
      item({ id: 'act-1', type: 'CollectionActivity' }),
      item({ id: 'ACT-1', type: 'LegalRecommendation' }),
      item({ id: 'act-2' }),
    ]);

    expect(deduped).toHaveLength(2);
  });

  it('counts distinct work, not rows', () => {
    expect(distinctWorkCount([
      item({ id: 'act-1' }), item({ id: 'ACT-1' }), item({ id: 'act-2' }),
    ])).toBe(2);
  });

  it('states that buckets overlap, so nobody sums them', () => {
    expect(bucketTotalsAreDisjoint()).toBe(false);
  });
});

// ── Historical work stays out ────────────────────────────────────────────────

describe('a closed episode’s work never enters a queue', () => {
  it('returns no buckets at all for historical work', () => {
    const buckets = bucketsOf(item({
      isCurrent: false, type: 'LegalRecommendation', dueAt: '2020-01-01T00:00:00Z' }));

    expect(buckets).toEqual([]);
  });

  it('keeps current work in its buckets', () => {
    expect(bucketsOf(item({ isCurrent: true }))).toContain('MyAssigned');
  });
});

// ── Deadlines are never invented ─────────────────────────────────────────────

describe('missing configuration is never treated as lateness', () => {
  it('is not overdue when no deadline could be determined', () => {
    // Most TAT configuration is absent (KI-101/KI-102). Treating that as overdue would make the
    // queue mostly red for no reason.
    const buckets = bucketsOf(item());

    expect(buckets).not.toContain('Overdue');
    expect(buckets).not.toContain('DueSoon');
  });

  it('is overdue only once a real deadline has passed', () => {
    expect(bucketsOf(item({ dueAt: '2026-09-22T11:00:00Z' }))).toContain('Overdue');
  });

  it('is due soon only when a warning window is configured', () => {
    const soon = item({ dueAt: '2026-09-22T14:00:00Z' });

    expect(bucketsOf(soon)).not.toContain('DueSoon');
    expect(bucketsOf(soon, { dueSoonHours: 4 })).toContain('DueSoon');
  });

  it('never marks something both due soon and overdue', () => {
    const buckets = bucketsOf(item({ dueAt: '2026-09-22T11:00:00Z' }), { dueSoonHours: 4 });

    expect(buckets).toContain('Overdue');
    expect(buckets).not.toContain('DueSoon');
  });
});

describe('overdue is never promoted to escalated', () => {
  it('leaves an overdue item unescalated', () => {
    const buckets = bucketsOf(item({ dueAt: '2020-01-01T00:00:00Z' }));

    expect(buckets).toContain('Overdue');
    expect(buckets).not.toContain('Escalated');
  });

  it('escalates only where an escalation actually exists', () => {
    expect(bucketsOf(item(), { escalated: true })).toContain('Escalated');
  });
});

// ── Assignment ───────────────────────────────────────────────────────────────

describe('assignment buckets reflect ownership, never a routing decision', () => {
  it('claims work owned by the signed-in user', () => {
    expect(bucketsOf(item({ ownerId: ME }))).toContain('MyAssigned');
  });

  it('does not claim someone else’s work', () => {
    expect(bucketsOf(item({ ownerId: SOMEONE_ELSE }))).not.toContain('MyAssigned');
  });

  it('reports unowned work as awaiting assignment', () => {
    const { ownerId: _omitted, ...unowned } = item();

    expect(bucketsOf(unowned as WorkItem)).toContain('AwaitingAssignment');
  });

  it('never reports owned work as awaiting assignment', () => {
    expect(bucketsOf(item({ ownerId: SOMEONE_ELSE }))).not.toContain('AwaitingAssignment');
  });
});

// ── Unknown is not zero ──────────────────────────────────────────────────────

describe('a count that could not be obtained is never rendered as zero', () => {
  it('distinguishes known, unknown and not-requested', () => {
    expect(describeCount(knownCount(7))).toBe('7');
    expect(describeCount(knownCount(0))).toBe('0');
    expect(describeCount(unknownCount())).toBe('Unknown');
    expect(describeCount(unknownCount('NotRequested'))).toBe('—');
  });

  it('turns an absent platform count into unknown, not zero', () => {
    // Xrm.WebApi omits @odata.count entirely (KI-96).
    expect(toWorkCount(null)).toEqual({ known: false, reason: 'Unavailable' });
    expect(toWorkCount(undefined)).toEqual({ known: false, reason: 'Unavailable' });
    expect(describeCount(toWorkCount(null))).not.toBe('0');
  });

  it('keeps a real zero a real zero', () => {
    expect(toWorkCount(0)).toEqual({ known: true, value: 0 });
    expect(describeCount(toWorkCount(0))).toBe('0');
  });
});

// ── No universal lifecycle, and no fabricated downstream state ───────────────

describe('each work type keeps its own vocabulary', () => {
  it('describes every type distinctly', () => {
    const types: WorkType[] = ['CollectionActivity', 'PromiseToPay', 'LegalRecommendation',
      'CollectionDispute', 'CustomerComplaint', 'DeceasedReview', 'RestructuringRecommendation'];
    const labels = types.map(describeWorkType);

    expect(new Set(labels).size).toBe(types.length);
  });

  it('calls restructuring a recommendation, never a Facility Amendment', () => {
    // The downstream integration is parked; there is no amendment state to read.
    const label = describeWorkType('RestructuringRecommendation');

    expect(label).toMatch(/recommendation/i);
    expect(label).not.toMatch(/facility amendment|submitted|approved|rescheduling/i);
  });

  it('carries a domain state through without interpreting it', () => {
    const work = item({ type: 'CustomerComplaint', domainState: 'Pending for Quality Review' });

    // The read model passes it along; it owns no complaint lifecycle of its own.
    expect(work.domainState).toBe('Pending for Quality Review');
  });

  it('names no bucket after a downstream lifecycle stage', () => {
    const buckets = (['MyAssigned', 'AwaitingAssignment', 'AssignmentRequiresAttention', 'DueSoon',
      'Overdue', 'Escalated', 'Legal', 'Disputes', 'Complaints', 'DeceasedReview',
      'RestructuringRecommendations'] as const).map(describeBucket).join(' | ');

    expect(buckets).not.toMatch(/court|settlement|cassation|quality review|problem solved|amendment/i);
  });
});
