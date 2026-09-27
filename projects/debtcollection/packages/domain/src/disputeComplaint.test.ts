import { describe, expect, it } from 'vitest';
import {
  describeDisputedSubject, effectsOfRaisingComplaint, effectsOfRecordingDispute, hasAnyEffect,
  impliesOtherConcern, toComplaintRow, toDisputeRow,
  type CollectionDispute, type ComplaintCaseSummary, type DisputedSubject,
} from './disputeComplaint.js';

/**
 * Collection Dispute and Customer Complaint.
 *
 * Almost every test here asserts that something does **not** happen. That is the point: no QDB
 * policy says a dispute pauses collection, suppresses a channel, freezes delinquency or closes a
 * case (KI-119), and nothing says a dispute becomes a Complaint or a Complaint becomes a dispute
 * (KI-118). Absence of behaviour is the requirement, so it needs tests that would notice its
 * arrival.
 */

const formatDate = (iso: string) => iso.slice(0, 10);

const dispute = (overrides: Partial<CollectionDispute> = {}): CollectionDispute => ({
  activityId: 'act-1',
  subject: 'Arrears',
  recordedOn: '2026-09-21T10:00:00Z',
  ...overrides,
});

const complaint = (overrides: Partial<ComplaintCaseSummary> = {}): ComplaintCaseSummary => ({
  caseNumber: 'CAS-01001-B9F5C9',
  status: 'Pending for Quality Review',
  category: 'Delayed processing',
  createdOn: '2026-09-20T08:00:00Z',
  ...overrides,
});

// ── Recording a dispute changes nothing ──────────────────────────────────────

describe('recording a Collection Dispute has no effect on collection', () => {
  it('claims no effect at all', () => {
    expect(hasAnyEffect(effectsOfRecordingDispute())).toBe(false);
  });

  it('does not pause collection or the strategy', () => {
    const effects = effectsOfRecordingDispute();

    // The dormant qdb_collectionpaused column is deliberately not adopted just because it exists.
    expect(effects.pausesCollection).toBe(false);
    expect(effects.pausesStrategy).toBe(false);
  });

  it('suppresses no communication channel', () => {
    expect(effectsOfRecordingDispute().suppressedChannels).toEqual([]);
  });

  it('does not block Legal or stop escalation', () => {
    const effects = effectsOfRecordingDispute();

    expect(effects.blocksLegal).toBe(false);
    expect(effects.stopsEscalation).toBe(false);
  });

  it('never alters delinquency — MIS stays authoritative', () => {
    // A customer disagreeing with their arrears does not change their arrears.
    expect(effectsOfRecordingDispute().altersDelinquency).toBe(false);
  });

  it('does not close the collection case', () => {
    expect(effectsOfRecordingDispute().closesCase).toBe(false);
  });

  it('does not create a Complaint Case', () => {
    expect(effectsOfRecordingDispute().createsComplaintCase).toBe(false);
  });
});

describe('raising a formal Complaint also changes no collection behaviour', () => {
  it('claims no effect at all', () => {
    // Case Management owns complaint processing; collection strategy is independent.
    expect(hasAnyEffect(effectsOfRaisingComplaint())).toBe(false);
  });

  it('does not pause collection or alter delinquency', () => {
    const effects = effectsOfRaisingComplaint();

    expect(effects.pausesCollection).toBe(false);
    expect(effects.altersDelinquency).toBe(false);
  });
});

describe('hasAnyEffect would notice if an effect ever appeared', () => {
  it('reports true for each effect individually, so the guard is not vacuous', () => {
    const none = effectsOfRecordingDispute();

    expect(hasAnyEffect({ ...none, pausesCollection: true })).toBe(true);
    expect(hasAnyEffect({ ...none, pausesStrategy: true })).toBe(true);
    expect(hasAnyEffect({ ...none, blocksLegal: true })).toBe(true);
    expect(hasAnyEffect({ ...none, stopsEscalation: true })).toBe(true);
    expect(hasAnyEffect({ ...none, altersDelinquency: true })).toBe(true);
    expect(hasAnyEffect({ ...none, closesCase: true })).toBe(true);
    expect(hasAnyEffect({ ...none, createsComplaintCase: true })).toBe(true);
    expect(hasAnyEffect({ ...none, suppressedChannels: ['SMS'] })).toBe(true);
  });
});

// ── The two concepts never imply each other ──────────────────────────────────

describe('a dispute is not a complaint, and a complaint is not a dispute', () => {
  it('never derives one concern from the other', () => {
    expect(impliesOtherConcern()).toBe(false);
  });

  it('labels the two rows with different vocabulary', () => {
    const disputeRow = toDisputeRow(dispute(), formatDate);
    const complaintRow = toComplaintRow(complaint(), formatDate);

    expect(disputeRow.concern).toBe('CollectionDispute');
    expect(complaintRow.concern).toBe('CustomerComplaint');
    expect(disputeRow.heading).not.toBe(complaintRow.heading);
  });

  it('never shows a Case number against a dispute', () => {
    const row = toDisputeRow(dispute(), formatDate);
    const rendered = `${row.heading} ${row.detail} ${row.status}`;

    expect(rendered).not.toMatch(/CAS-\d|case number|complaint/i);
  });

  it('never shows a complaint status against a dispute', () => {
    const row = toDisputeRow(dispute({ status: 'Open' }), formatDate);

    // These are Case Management's statuses; a dispute must never borrow one.
    expect(row.status).not.toMatch(/quality review|problem solved|information provided|merged/i);
  });

  /**
   * The default matters as much as the supplied value.
   *
   * Without this the previous test always passed a status, so the fallback never ran — and
   * replacing it with a Case Management status ("Pending for Quality Review") passed the whole
   * suite. A dispute's default must be the activity's own vocabulary.
   */
  it('falls back to the activity’s own status, never Case Management’s', () => {
    const { status: _s, outcome: _o, ...bare } = dispute({ status: 'x', outcome: 'y' });
    const row = toDisputeRow(bare, formatDate);

    expect(row.status).toBe('Open');
    expect(row.status).not.toMatch(
      /quality review|problem solved|information provided|merged|case returned|researching/i);
  });

  it('shows the Complaint’s own Case number and status, carried through untouched', () => {
    const row = toComplaintRow(complaint(), formatDate);

    expect(row.heading).toContain('CAS-01001-B9F5C9');
    expect(row.status).toBe('Pending for Quality Review');
  });

  it('never invents a complaint status when Case Management sent none', () => {
    const { status: _omitted, ...withoutStatus } = complaint();
    const row = toComplaintRow(withoutStatus, formatDate);

    expect(row.status).toBe('Status not recorded');
    expect(row.status).not.toMatch(/open|in progress|resolved/i);
  });
});

// ── What a dispute is about ──────────────────────────────────────────────────

describe('a dispute names the collection information being contested', () => {
  it('describes each subject in an officer’s words', () => {
    const subjects: DisputedSubject[] = ['Arrears', 'DaysPastDue', 'Balance', 'PaymentPosting',
      'PaymentAllocation', 'MissedPaymentCalculation', 'OtherDelinquencyInformation'];

    for (const subject of subjects) {
      const described = describeDisputedSubject(subject);
      expect(described, subject).not.toBe(subject);
      expect(described, subject).not.toMatch(/qdb_|[A-Z][a-z]+[A-Z]/);
    }
  });

  it('every subject is a delinquency fact, never a service grievance', () => {
    const all = (['Arrears', 'DaysPastDue', 'Balance', 'PaymentPosting', 'PaymentAllocation',
      'MissedPaymentCalculation', 'OtherDelinquencyInformation'] as DisputedSubject[])
      .map(describeDisputedSubject).join(' | ');

    expect(all).not.toMatch(/staff|service|rude|delay in processing|product issue|complaint/i);
  });

  it('falls back to a neutral heading when the subject was not recorded', () => {
    const { subject: _omitted, ...withoutSubject } = dispute();

    expect(toDisputeRow(withoutSubject, formatDate).heading).toBe('Disputed information');
  });

  it('never renders a technical identifier', () => {
    const row = toDisputeRow(dispute({ notes: 'Customer says the March payment was made' }), formatDate);
    const rendered = [row.heading, row.detail, row.status, row.recordedOn].join(' ');

    expect(rendered).not.toMatch(/qdb_|statuscode|incident|KI-\d+/i);
  });
});
