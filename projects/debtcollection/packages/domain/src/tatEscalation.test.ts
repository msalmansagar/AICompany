import { describe, expect, it } from 'vitest';
import {
  computeDeadline, continuousElapsed, deriveWorkState, escalationDue, escalationEventId,
  isCurrentWork, type TatDeadline,
} from './tatEscalation.js';

/**
 * TAT and escalation, with the clocks kept apart.
 *
 * The most important tests here are the ones that assert a state is **not** reached: unassigned
 * work is never overdue, an undetermined deadline never produces an overdue claim, and passing a
 * deadline is never reported as an escalation.
 */

const NOW = new Date('2026-09-21T12:00:00Z');
const CREATED = '2026-09-20T12:00:00Z';
const ASSIGNED = '2026-09-21T09:00:00Z';
const ACTIVITY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const determined = (dueAt: string): TatDeadline =>
  ({ determined: true, startedAt: CREATED, dueAt, basis: 'ContinuousElapsed' });
const undetermined: TatDeadline = { determined: false, reason: 'No turn-around time is configured.' };

const base = {
  lifecycle: 'Open' as const,
  assignment: 'Assigned' as const,
  deadline: undetermined,
  escalated: false,
  now: NOW,
};

// ── The clock will not be invented ───────────────────────────────────────────

describe('a deadline is computed only from configuration that exists', () => {
  it('refuses to guess when nobody has agreed where the clock starts', () => {
    const deadline = computeDeadline({ hours: 24, instants: { createdOn: CREATED } });

    expect(deadline.determined).toBe(false);
    expect(deadline.determined === false && deadline.reason).toMatch(/when the clock should start/i);
  });

  it('refuses when no turn-around time is configured', () => {
    const deadline = computeDeadline({
      startPolicy: 'ActivityCreated', instants: { createdOn: CREATED } });

    expect(deadline.determined).toBe(false);
  });

  it('treats ZERO hours as a configured instant deadline, never as unset', () => {
    // The distinction that would otherwise silently turn a deliberate instant deadline into no
    // deadline at all.
    const deadline = computeDeadline({
      startPolicy: 'ActivityCreated', hours: 0, instants: { createdOn: CREATED } });

    expect(deadline.determined).toBe(true);
    expect(deadline.determined === true && deadline.dueAt).toBe('2026-09-20T12:00:00.000Z');
  });

  it('computes from creation when that is the configured start', () => {
    const deadline = computeDeadline({
      startPolicy: 'ActivityCreated', hours: 24, instants: { createdOn: CREATED } });

    expect(deadline.determined === true && deadline.dueAt).toBe('2026-09-21T12:00:00.000Z');
  });

  it('computes from ASSIGNMENT when that is the configured start, which is a different answer', () => {
    const deadline = computeDeadline({
      startPolicy: 'AssignmentCompleted', hours: 24,
      instants: { createdOn: CREATED, assignedOn: ASSIGNED } });

    expect(deadline.determined === true && deadline.dueAt).toBe('2026-09-22T09:00:00.000Z');
  });

  it('is not determined when the configured starting event has not happened', () => {
    const deadline = computeDeadline({
      startPolicy: 'AssignmentCompleted', hours: 24, instants: { createdOn: CREATED } });

    expect(deadline.determined).toBe(false);
    expect(deadline.determined === false && deadline.reason).toMatch(/has not happened yet/i);
  });

  it('always reports what the duration was measured against', () => {
    const deadline = computeDeadline({
      startPolicy: 'ActivityCreated', hours: 24, instants: { createdOn: CREATED },
      calendar: continuousElapsed });

    expect(deadline.determined === true && deadline.basis).toBe('ContinuousElapsed');
  });

  it('implements no weekend or holiday rule of its own', () => {
    // 2026-09-25 is a Friday. A Qatar working-week assumption would push this deadline; the
    // continuous clock must not, because no business calendar has been supplied (KI-102).
    const friday = '2026-09-25T08:00:00Z';
    const deadline = computeDeadline({
      startPolicy: 'ActivityCreated', hours: 24, instants: { createdOn: friday } });

    expect(deadline.determined === true && deadline.dueAt).toBe('2026-09-26T08:00:00.000Z');
  });
});

// ── The clocks are separate ──────────────────────────────────────────────────

describe('work nobody received is never reported as an officer running late', () => {
  it('shows AwaitingAssignment when configuration says a person allocates it', () => {
    const result = deriveWorkState({ ...base, assignment: 'ManualAssignmentRequired' });

    expect(result.state).toBe('AwaitingAssignment');
  });

  for (const assignment of ['AssignmentCapabilityUnavailable', 'ConfigurationMissing',
    'ConfigurationAmbiguous', 'TargetUnavailable', 'RetryableFailure', 'PermanentFailure'] as const) {
    it(`shows AssignmentRequiresAttention for ${assignment}`, () => {
      expect(deriveWorkState({ ...base, assignment }).state).toBe('AssignmentRequiresAttention');
    });
  }

  it('does NOT report unassigned work as Overdue, even with a deadline long past', () => {
    // The whole point of the module. On this organisation no officer can currently receive
    // collection work at all (KI-100), so this would otherwise blame people for a routing gap.
    const result = deriveWorkState({
      ...base,
      assignment: 'ConfigurationMissing',
      deadline: determined('2026-01-01T00:00:00Z'),
    });

    expect(result.state).toBe('AssignmentRequiresAttention');
    expect(result.state).not.toBe('Overdue');
  });

  it('says so in business language, naming no plugin, code or identifier', () => {
    const result = deriveWorkState({ ...base, assignment: 'ConfigurationMissing' });

    expect(result.reason).toMatch(/supervisor/i);
    expect(result.reason).not.toMatch(/qdb_|statuscode|plugin|KI-\d+|http|odata/i);
  });
});

describe('an assigned deadline behaves as configured', () => {
  it('is Overdue once the deadline has passed', () => {
    expect(deriveWorkState({ ...base, deadline: determined('2026-09-21T11:00:00Z') }).state)
      .toBe('Overdue');
  });

  it('is DueSoon only when a warning window is configured', () => {
    const deadline = determined('2026-09-21T14:00:00Z');

    expect(deriveWorkState({ ...base, deadline }).state).toBe('Assigned');
    expect(deriveWorkState({ ...base, deadline, dueSoonHours: 4 }).state).toBe('DueSoon');
  });

  it('is simply Assigned when no deadline could be determined', () => {
    const result = deriveWorkState({ ...base, deadline: undetermined });

    expect(result.state).toBe('Assigned');
    expect(result.reason).toMatch(/no turn-around time is configured/i);
  });
});

// ── Overdue is not escalation ────────────────────────────────────────────────

describe('escalation is an action, not a missed deadline', () => {
  it('reports Escalated only when an escalation actually happened', () => {
    expect(deriveWorkState({ ...base, deadline: determined('2026-09-21T11:00:00Z') }).state)
      .toBe('Overdue');
    expect(deriveWorkState({
      ...base, deadline: determined('2026-09-21T11:00:00Z'), escalated: true }).state)
      .toBe('Escalated');
  });

  it('raises an observation for an overdue item, not an escalation', () => {
    const due = escalationDue({ state: 'Overdue', escalationConfigured: false, activityId: ACTIVITY });

    expect(due?.kind).toBe('TatOverdue');
    expect(due?.kind).not.toBe('Escalation');
  });

  it('separates an assignment exception from a missed deadline', () => {
    expect(escalationDue({
      state: 'AssignmentRequiresAttention', escalationConfigured: false, activityId: ACTIVITY,
    })?.kind).toBe('AssignmentException');
  });

  it('raises nothing for work that is simply assigned', () => {
    expect(escalationDue({ state: 'Assigned', escalationConfigured: false, activityId: ACTIVITY }))
      .toBeNull();
  });
});

describe('escalation events are retry-safe by construction', () => {
  it('derives the same id for the same event, so a repeat creates nothing', () => {
    expect(escalationEventId(ACTIVITY, 'TatOverdue', 1))
      .toBe(escalationEventId(ACTIVITY, 'TatOverdue', 1));
  });

  it('gives a different id to a different level, because that is a different event', () => {
    expect(escalationEventId(ACTIVITY, 'TatOverdue', 1))
      .not.toBe(escalationEventId(ACTIVITY, 'TatOverdue', 2));
  });

  it('gives a different id to a different kind on the same activity', () => {
    expect(escalationEventId(ACTIVITY, 'TatOverdue', 1))
      .not.toBe(escalationEventId(ACTIVITY, 'AssignmentException', 1));
  });

  it('is insensitive to the case of the activity id', () => {
    expect(escalationEventId(ACTIVITY.toUpperCase(), 'TatOverdue', 1))
      .toBe(escalationEventId(ACTIVITY, 'TatOverdue', 1));
  });
});

// ── Current work vs history ──────────────────────────────────────────────────

describe('a cured episode stops being current work without losing its history', () => {
  it('drops open work from the queue once the episode is no longer current', () => {
    // A cured case's open activities must not follow an officer around forever — and deleting or
    // cancelling them to clear the queue would destroy the record to tidy a list.
    expect(isCurrentWork({ state: 'Assigned', episodeIsCurrent: false })).toBe(false);
    expect(isCurrentWork({ state: 'Overdue', episodeIsCurrent: false })).toBe(false);
  });

  it('keeps open work in the queue while the episode is current', () => {
    expect(isCurrentWork({ state: 'Assigned', episodeIsCurrent: true })).toBe(true);
    expect(isCurrentWork({ state: 'AwaitingAssignment', episodeIsCurrent: true })).toBe(true);
  });

  it('excludes settled and obsolete work from the current queue', () => {
    for (const state of ['Completed', 'Cancelled', 'NoLongerApplicable'] as const) {
      expect(isCurrentWork({ state, episodeIsCurrent: true }), state).toBe(false);
    }
  });

  it('reports NoLongerApplicable work as such rather than as cancelled', () => {
    const result = deriveWorkState({ ...base, disposition: 'NoLongerApplicable' });

    expect(result.state).toBe('NoLongerApplicable');
    expect(result.reason).toMatch(/left as it is/i);
  });
});

describe('settled work outranks everything', () => {
  it('reports completed work as completed even if its deadline passed', () => {
    expect(deriveWorkState({
      ...base, lifecycle: 'Completed', deadline: determined('2026-01-01T00:00:00Z') }).state)
      .toBe('Completed');
  });

  it('reports cancelled work as cancelled even if it was escalated', () => {
    expect(deriveWorkState({ ...base, lifecycle: 'Cancelled', escalated: true }).state)
      .toBe('Cancelled');
  });
});
