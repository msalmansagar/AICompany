import { describe, expect, it } from 'vitest';
import {
  deceasedReviewId, describeIndication, describeIndicationSource, effectsOfIndication,
  effectsOfStartingReview, hasAnyEffect, reviewsToGenerateFrom, toDeceasedReviewRow,
  type DeceasedIndication, type DeceasedReview,
} from './deceasedReview.js';

/**
 * The deceased indication and its review.
 *
 * Nearly every assertion here is that something does **not** happen or is **not** said. That is
 * the requirement: an unverified QCB flag must not become a statement about a person, must not
 * change any collection behaviour, and must not manufacture 724 tasks.
 */

const CASE = '11111111-1111-1111-1111-111111111111';
const OTHER_CASE = '22222222-2222-2222-2222-222222222222';
const FACILITY = 'ARR-HL-00012';
const formatDate = (iso: string) => iso.slice(0, 10);

const indication = (overrides: Partial<DeceasedIndication> = {}): DeceasedIndication => ({
  present: true,
  source: 'QcbViaMis',
  asOf: '2026-06-30T00:00:00Z',
  facilityNumber: FACILITY,
  ...overrides,
});

const review = (overrides: Partial<DeceasedReview> = {}): DeceasedReview => ({
  activityId: 'act-1',
  status: 'Open',
  recordedOn: '2026-09-22T00:00:00Z',
  ...overrides,
});

// ── An indication is never a death ───────────────────────────────────────────

describe('a QCB indication is described as requiring verification, never as a fact', () => {
  it('never says the customer is deceased', () => {
    const described = describeIndication(indication());

    expect(described).toMatch(/verification required/i);
    expect(described).not.toMatch(/deceased customer|confirmed deceased|is deceased|has died/i);
  });

  it('names the indication as QCB’s, not QDB’s conclusion', () => {
    expect(describeIndication(indication())).toMatch(/QCB/);
    expect(describeIndicationSource('QcbViaMis')).toMatch(/Qatar Central Bank/i);
  });

  it('says plainly when there is no indication', () => {
    expect(describeIndication(indication({ present: false }))).toBe('No deceased indication');
  });

  it('reports an unrecorded source rather than assuming one', () => {
    expect(describeIndicationSource(undefined)).toBe('Source not recorded');
  });

  it('carries the as-of date, because an indication is never timeless', () => {
    expect(toDeceasedReviewRow({ indication: indication(), formatDate }).asOf).toBe('2026-06-30');
  });

  it('never labels a recorded review as a confirmed death', () => {
    const row = toDeceasedReviewRow({
      indication: indication(), review: review({ outcome: 'Death certificate seen' }), formatDate });

    expect(row.label).toBe('Review recorded');
    expect(row.label).not.toMatch(/confirmed|verified|deceased/i);
    // The conclusion is the activity's own outcome, shown beside the state rather than as it.
    expect(row.reviewOutcome).toBe('Death certificate seen');
  });
});

// ── Nothing happens ──────────────────────────────────────────────────────────

describe('an indication changes no collection behaviour', () => {
  it('claims no effect at all', () => {
    expect(hasAnyEffect(effectsOfIndication())).toBe(false);
  });

  it('does not pause collection or the strategy', () => {
    const effects = effectsOfIndication();

    expect(effects.pausesCollection).toBe(false);
    expect(effects.pausesStrategy).toBe(false);
  });

  it('suppresses no communication channel', () => {
    // KI-127 and KI-79: no authoritative contact-hold policy exists, and the indication is not
    // adopted as one.
    expect(effectsOfIndication().suppressedChannels).toEqual([]);
  });

  it('neither starts nor stops Legal', () => {
    // Discovery proved the two coexist — 72 deceased-indicated accounts are already in Legal.
    expect(effectsOfIndication().blocksLegal).toBe(false);
    expect(effectsOfIndication().stopsEscalation).toBe(false);
  });

  it('never alters delinquency — MIS stays authoritative', () => {
    expect(effectsOfIndication().altersDelinquency).toBe(false);
  });

  it('does not close the collection case', () => {
    expect(effectsOfIndication().closesCase).toBe(false);
  });

  it('starting a review changes nothing either', () => {
    expect(hasAnyEffect(effectsOfStartingReview())).toBe(false);
  });

  it('would notice if any effect ever appeared', () => {
    const none = effectsOfIndication();

    expect(hasAnyEffect({ ...none, pausesCollection: true })).toBe(true);
    expect(hasAnyEffect({ ...none, altersDelinquency: true })).toBe(true);
    expect(hasAnyEffect({ ...none, blocksLegal: true })).toBe(true);
    expect(hasAnyEffect({ ...none, suppressedChannels: ['SMS'] })).toBe(true);
  });
});

// ── 724 indications are data, not a queue ────────────────────────────────────

describe('indications never generate work by themselves', () => {
  it('generates nothing from one indication', () => {
    expect(reviewsToGenerateFrom([indication()])).toBe(0);
  });

  it('generates nothing from 724', () => {
    // Bulk-creating these would manufacture 724 tasks against real customer records, and the
    // generation policy is unestablished (KI-129).
    const many = Array.from({ length: 724 }, () => indication());

    expect(reviewsToGenerateFrom(many)).toBe(0);
  });

  it('generates nothing from none', () => {
    expect(reviewsToGenerateFrom([])).toBe(0);
  });
});

// ── No insurance, anywhere ───────────────────────────────────────────────────

describe('nothing in the deceased capability mentions insurance', () => {
  it('renders no insurance vocabulary in any state', () => {
    const rows = [
      toDeceasedReviewRow({ indication: indication(), formatDate }),
      toDeceasedReviewRow({ indication: indication(), review: review(), formatDate }),
      toDeceasedReviewRow({
        indication: indication(), review: review({ outcome: 'Referred' }), formatDate }),
      toDeceasedReviewRow({ indication: indication({ present: false }), formatDate }),
    ];
    const rendered = rows.flatMap(row =>
      [row.label, row.indication, row.source, row.reviewOutcome]).join(' | ');

    expect(rendered).not.toMatch(
      /insur|takaful|policy|claim|beneficiar|premium|insurer|coverage|eligib|settle/i);
  });

  it('renders no exemption or relief vocabulary either', () => {
    // KI-125/KI-126: the exemption programme is unestablished and its data is null everywhere.
    const row = toDeceasedReviewRow({ indication: indication(), review: review(), formatDate });
    const rendered = [row.label, row.indication, row.reviewOutcome].join(' ');

    expect(rendered).not.toMatch(/exempt|relief|waiv|write.?off|discount/i);
  });
});

// ── The review's identity ────────────────────────────────────────────────────

describe('one facility on one case maps to exactly one review', () => {
  it('derives the same id every time, so a retry writes to the same place', () => {
    expect(deceasedReviewId(CASE, FACILITY)).toBe(deceasedReviewId(CASE, FACILITY));
  });

  it('derives a different id for a different case', () => {
    expect(deceasedReviewId(CASE, FACILITY)).not.toBe(deceasedReviewId(OTHER_CASE, FACILITY));
  });

  it('derives a different id for a different facility', () => {
    expect(deceasedReviewId(CASE, FACILITY)).not.toBe(deceasedReviewId(CASE, 'ARR-HL-00013'));
  });

  it('is insensitive to case, as the platform’s ids are', () => {
    expect(deceasedReviewId(CASE.toUpperCase(), FACILITY.toUpperCase()))
      .toBe(deceasedReviewId(CASE, FACILITY));
  });

  it('carries nothing time-based, so two attempts cannot diverge', () => {
    const first = deceasedReviewId(CASE, FACILITY);

    expect(deceasedReviewId(CASE, FACILITY)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

// ── The states an officer sees ───────────────────────────────────────────────

describe('the review states describe work, not conclusions about a person', () => {
  it('reports an unreviewed indication as awaiting review, and offers the review', () => {
    const row = toDeceasedReviewRow({ indication: indication(), formatDate });

    expect(row.state).toBe('AwaitingReview');
    expect(row.canStartReview).toBe(true);
  });

  it('reports an open review as under review, and offers no second one', () => {
    const row = toDeceasedReviewRow({ indication: indication(), review: review(), formatDate });

    expect(row.state).toBe('UnderReview');
    expect(row.canStartReview, 'no duplicate review').toBe(false);
  });

  it('reports a settled review as recorded, and still offers no second one', () => {
    const row = toDeceasedReviewRow({
      indication: indication(), review: review({ outcome: 'No further action' }), formatDate });

    expect(row.state).toBe('ReviewRecorded');
    expect(row.canStartReview).toBe(false);
  });

  it('offers nothing where there is no indication', () => {
    const row = toDeceasedReviewRow({ indication: indication({ present: false }), formatDate });

    expect(row.state).toBe('NoIndication');
    expect(row.canStartReview).toBe(false);
  });

  it('shows who holds the review rather than an empty cell', () => {
    expect(toDeceasedReviewRow({ indication: indication(), formatDate }).ownerName)
      .toBe('Nobody yet');
  });

  it('renders no identifier, logical name or known-issue number', () => {
    const row = toDeceasedReviewRow({ indication: indication(), review: review(), formatDate });
    const rendered = [row.label, row.indication, row.source, row.reviewOutcome, row.asOf].join(' ');

    expect(rendered).not.toMatch(/qdb_|statuscode|KI-\d+|odata|snapshot/i);
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
