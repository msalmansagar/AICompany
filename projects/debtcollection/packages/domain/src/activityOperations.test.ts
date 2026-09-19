import { describe, expect, it } from 'vitest';
import {
  PROMISE_TYPE_CODES,
  describePromiseVerification,
  planActivityTransition,
  planCompleteActivity,
  planCreateActivity,
  planUpdateActivity,
  planUpdatePromise,
  planCreatePromise,
  planFollowUp,
  planPromiseTransition,
  type ActivityOutcomeConfig,
} from './activityOperations.js';
import { ACTIVITY_STATUS_CODES, PTP_STATUS_CODES } from './activityLifecycle.js';

/**
 * The operations behind the forms.
 *
 * Two themes run through these tests. The first is that configuration decides behaviour: an outcome
 * that requires notes refuses without them, and one that does not, does not — the same code, two
 * deployments. The second is what is *absent*: there is no maximum promise amount, no maximum
 * horizon and no limit on open promises, because none is in evidence, and a test asserting one would
 * make invented policy permanent.
 */

const outcome = (over: Partial<ActivityOutcomeConfig> = {}): ActivityOutcomeConfig => ({
  id: 'outcome-1', code: 'P6-CONTACTED', name: 'Customer contacted',
  requiresFollowUp: false, requiresNotes: false, escalationRequired: false, ...over,
});

const VALID_ACTIVITY = { caseId: 'case-1', activityTypeId: 'type-1', subject: 'Called the customer' };

describe('creating an activity', () => {
  it('plans the write when the essentials are present', () => {
    const result = planCreateActivity(VALID_ACTIVITY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.binds).toEqual([
      { lookup: 'case', id: 'case-1' },
      { lookup: 'type', id: 'type-1' },
    ]);
  });

  /** `DefaultStatusAssigner` owns the opening status. Setting it here would be a second author. */
  it('does not set the opening status, which the server assigns', () => {
    const result = planCreateActivity(VALID_ACTIVITY);
    expect(result.ok && 'statuscode' in result.plan.fields).toBe(false);
  });

  it('refuses without a case, a type or a subject, naming each field', () => {
    const result = planCreateActivity({ caseId: '', activityTypeId: '', subject: '  ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusals.map(r => r.code).sort()).toEqual(['CaseRequired', 'SubjectRequired', 'TypeRequired']);
    for (const refusal of result.refusals) expect(refusal.field, refusal.code).toBeTruthy();
  });

  it('refuses a date that is not a date rather than storing it', () => {
    const result = planCreateActivity({ ...VALID_ACTIVITY, activityDate: 'next tuesday' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('DateMalformed');
  });
});

describe('completing an activity, where configuration decides', () => {
  it('completes an open activity with no outcome configured', () => {
    const result = planCompleteActivity({ currentStatus: 'Open' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.fields['statuscode']).toBe(ACTIVITY_STATUS_CODES.Completed);
    expect(result.plan.fields['statecode']).toBe(1);
  });

  it('demands notes when the OUTCOME says so, not when the code says so', () => {
    const demanding = planCompleteActivity({ currentStatus: 'Open', outcome: outcome({ requiresNotes: true }) });
    expect(demanding.ok).toBe(false);
    if (!demanding.ok) expect(demanding.refusals[0]!.code).toBe('NotesRequired');

    const relaxed = planCompleteActivity({ currentStatus: 'Open', outcome: outcome({ requiresNotes: false }) });
    expect(relaxed.ok, 'the same code, a different configuration').toBe(true);
  });

  it('accepts the notes when they are supplied', () => {
    const result = planCompleteActivity({
      currentStatus: 'Open', outcome: outcome({ requiresNotes: true }), notes: 'Customer disputes the balance.',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.fields['notes']).toBe('Customer disputes the balance.');
  });

  it('schedules the follow-up the configured number of days out', () => {
    const now = new Date('2026-09-19T10:00:00.000Z');
    const result = planCompleteActivity({
      currentStatus: 'Open', outcome: outcome({ requiresFollowUp: true, followUpDays: 3 }), now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.fields['followUpDate']).toBe('2026-09-22T10:00:00.000Z');
  });

  /** An outcome that wants a follow-up but names no window is a configuration gap, not a default. */
  it('asks the user for a date when follow-up is required but no window is configured', () => {
    const result = planCompleteActivity({
      currentStatus: 'Open', outcome: outcome({ requiresFollowUp: true }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('FollowUpDateRequired');
  });

  it('prefers the date the user chose over the configured window', () => {
    const result = planCompleteActivity({
      currentStatus: 'Open',
      outcome: outcome({ requiresFollowUp: true, followUpDays: 3 }),
      followUpDate: '2026-12-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.fields['followUpDate']).toBe('2026-12-01T00:00:00.000Z');
  });

  it('carries the escalation request from configuration without acting on it', () => {
    const result = planCompleteActivity({ currentStatus: 'Open', outcome: outcome({ escalationRequired: true }) });
    expect(result.ok).toBe(true);
    // Phase 6 records it; Phase 8 owns doing anything about it.
    if (result.ok) expect(result.plan.escalationRequested).toBe(true);
  });

  it('refuses to complete an already-completed activity, as immutable rather than invalid', () => {
    const result = planCompleteActivity({ currentStatus: 'Completed' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('ActivityImmutable');
  });
});

describe('moving an activity', () => {
  it('allows a documented transition', () => {
    const result = planActivityTransition('Open', 'InProgress');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.fields['statuscode']).toBe(ACTIVITY_STATUS_CODES.InProgress);
  });

  it('refuses to resurrect a completed activity', () => {
    const result = planActivityTransition('Completed', 'Open');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('ActivityImmutable');
  });

  it('says plainly when nothing would change', () => {
    const result = planActivityTransition('Open', 'Open');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.message).toContain('already Open');
  });
});

describe('follow-up', () => {
  it('clears the date when none is given — deciding no further contact is legitimate', () => {
    const result = planFollowUp('Open', undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.fields['followUpDate']).toBeNull();
  });

  it('refuses to reschedule a completed activity', () => {
    expect(planFollowUp('Completed', '2026-10-01').ok).toBe(false);
  });
});

describe('the promise', () => {
  const VALID_PROMISE = {
    caseId: 'case-1', activityTypeId: 'ptp-type', subject: 'Promise to pay',
    promisedAmount: 5000, promiseDate: '2026-10-01T00:00:00.000Z',
  };

  it('is an activity plan carrying promise columns, never a second entity', () => {
    const result = planCreatePromise(VALID_PROMISE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.fields['ptpStatus']).toBe(PTP_STATUS_CODES.Active);
    expect(result.plan.fields['promisedAmount']).toBe(5000);
    expect(result.plan.binds.map(b => b.lookup)).toEqual(['case', 'type']);
  });

  it('refuses an amount that is not positive', () => {
    for (const amount of [0, -1]) {
      const result = planCreatePromise({ ...VALID_PROMISE, promisedAmount: amount });
      expect(result.ok, `amount ${amount}`).toBe(false);
      if (!result.ok) expect(result.refusals[0]!.code).toBe('AmountNotPositive');
    }
  });

  it('requires a promise date', () => {
    const result = planCreatePromise({ ...VALID_PROMISE, promiseDate: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('DateMissing');
  });

  it('records the promise type as its provisioned option value', () => {
    const result = planCreatePromise({ ...VALID_PROMISE, promiseType: 'Partial' });
    expect(result.ok && result.plan.fields['promiseType']).toBe(PROMISE_TYPE_CODES.Partial);
  });

  /**
   * The absences that matter.
   *
   * A maximum amount, a maximum horizon and a cap on open promises are all QDB policy and none is in
   * evidence (KI-72). Accepting a large amount and a distant date is not an oversight — it is the
   * refusal to invent a limit that would then be enforced on real customers.
   */
  it('imposes no maximum amount, because none is in evidence', () => {
    expect(planCreatePromise({ ...VALID_PROMISE, promisedAmount: 50_000_000 }).ok).toBe(true);
  });

  it('imposes no maximum promise period, because none is in evidence', () => {
    expect(planCreatePromise({ ...VALID_PROMISE, promiseDate: '2030-01-01T00:00:00.000Z' }).ok).toBe(true);
  });
});

describe('moving a promise', () => {
  it('allows a documented transition and writes the reported amount', () => {
    const result = planPromiseTransition('Active', 'PartiallyKept', { amountReceived: 2000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.fields['ptpStatus']).toBe(PTP_STATUS_CODES.PartiallyKept);
    expect(result.plan.fields['amountReceived']).toBe(2000);
  });

  it('allows the documented false-Broken reversal', () => {
    expect(planPromiseTransition('Broken', 'Kept').ok).toBe(true);
  });

  it('refuses a transition the matrix does not permit', () => {
    const result = planPromiseTransition('Kept', 'Broken');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('TransitionNotAllowed');
  });

  it('records a broken reason with the date, when one is given', () => {
    const result = planPromiseTransition('Active', 'Broken', { brokenReason: 'No payment received' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.fields['brokenReason']).toBe('No payment received');
      expect(result.plan.fields['brokenDate']).toBeDefined();
    }
  });

  it('refuses a received amount that is not positive', () => {
    const result = planPromiseTransition('Active', 'Kept', { amountReceived: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('AmountNotPositive');
  });

  /**
   * The line the authorisation draws twice, asserted so it cannot erode: marking a promise Kept
   * records what a collector believes, and writes no verification of any kind.
   */
  it('writes no verification flag when a promise is marked Kept', () => {
    const result = planPromiseTransition('Active', 'Kept', { amountReceived: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = Object.keys(result.plan.fields).join(',').toLowerCase();
    expect(written).not.toMatch(/verif|confirmed|reconcil/);
  });
});

describe('what a promise outcome may be said to mean', () => {
  it('reports every outcome as operationally recorded and financially unverified', () => {
    for (const status of ['Kept', 'PartiallyKept', 'Broken', 'Active'] as const) {
      const described = describePromiseVerification(status);
      expect(described.operationalOutcome, status).toBe(status);
      expect(described.financiallyVerified, status).toBe(false);
      expect(described.note).toMatch(/not been verified/i);
    }
  });
});

describe('editing an activity that is still being worked', () => {
  it('writes only the fields that were supplied', () => {
    const result = planUpdateActivity({ currentStatus: 'Open', subject: 'Called again' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.fields).toEqual({ subject: 'Called again' });
  });

  /**
   * The distinction that protects collection history: the form sends what the user touched, so an
   * absent note must mean "unchanged". Treating it as "clear it" would erase notes on every
   * unrelated edit, silently and irreversibly.
   */
  it('leaves an absent field alone rather than clearing it', () => {
    const result = planUpdateActivity({ currentStatus: 'Open', subject: 'Called again' });
    expect(result.ok && 'notes' in result.plan.fields).toBe(false);
  });

  it('clears a note only when an empty one is passed deliberately', () => {
    const result = planUpdateActivity({ currentStatus: 'Open', notes: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.fields['notes']).toBe('');
  });

  it('refuses to edit a completed activity, and a cancelled one', () => {
    for (const status of ['Completed', 'Cancelled'] as const) {
      const result = planUpdateActivity({ currentStatus: status, subject: 'x' });
      expect(result.ok, status).toBe(false);
      if (!result.ok) expect(result.refusals[0]!.code).toBe('ActivityImmutable');
    }
  });

  it('refuses to blank out the subject', () => {
    const result = planUpdateActivity({ currentStatus: 'Open', subject: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('SubjectRequired');
  });

  /** An empty write answers 200 having done nothing, because the platform elides unchanged fields. */
  it('says plainly when there is nothing to write', () => {
    const result = planUpdateActivity({ currentStatus: 'Open' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('NothingToSave');
  });
});

describe('editing the terms of a promise', () => {
  it('allows an outstanding promise to be re-agreed', () => {
    for (const status of ['Active', 'Rescheduled'] as const) {
      const result = planUpdatePromise({ currentStatus: status, promisedAmount: 7500 });
      expect(result.ok, status).toBe(true);
      if (result.ok) expect(result.plan.fields['promisedAmount']).toBe(7500);
    }
  });

  /**
   * Once an outcome has been recorded the terms are the thing that outcome was judged against.
   * Editing them afterwards would rewrite history, so it is refused with its own code rather than
   * being lumped in with a validation failure.
   */
  it('refuses to rewrite the terms of a promise that has an outcome', () => {
    for (const status of ['Kept', 'PartiallyKept', 'Broken', 'Cancelled'] as const) {
      const result = planUpdatePromise({ currentStatus: status, promisedAmount: 1 });
      expect(result.ok, status).toBe(false);
      if (!result.ok) expect(result.refusals[0]!.code).toBe('PromiseTermsSettled');
    }
  });

  it('refuses an amount that is not positive', () => {
    const result = planUpdatePromise({ currentStatus: 'Active', promisedAmount: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals[0]!.code).toBe('AmountNotPositive');
  });

  it('still imposes no maximum amount or horizon when editing', () => {
    const result = planUpdatePromise({
      currentStatus: 'Active', promisedAmount: 90_000_000, promiseDate: '2032-01-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
  });
});
