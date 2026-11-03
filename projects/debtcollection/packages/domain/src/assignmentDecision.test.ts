import { describe, expect, it } from 'vitest';
import {
  ambiguousAssignment, awaitingAssignment, decideAssignment, shouldWriteAssignment, worthRetrying,
} from './assignmentDecision.js';
import type { AssignmentConfiguration, AssignmentMethod } from './assignment.js';

/**
 * Assignment decides **where**, and never decides **who** by inventing a rule.
 *
 * The tests that matter most here are the negative ones: that no routing algorithm exists, that a
 * human's ownership decision survives re-evaluation, and that "a person must choose" is reported as
 * a valid state rather than as a failure.
 */

const USER = '11111111-1111-1111-1111-111111111111';
const TEAM = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';

const configuration = (method: AssignmentMethod): AssignmentConfiguration => ({
  id: '44444444-4444-4444-4444-444444444444',
  name: 'HL early arrears',
  method,
  priority: 10,
  effective: {},
  isActive: true,
});

describe('a concrete target is honoured, because somebody already chose', () => {
  it('assigns to a named team', () => {
    const decision = decideAssignment(configuration('RoundRobin'), { targetTeamId: TEAM });

    expect(decision.status).toBe('Assigned');
    expect(decision.target).toEqual({ kind: 'team', id: TEAM });
  });

  it('assigns to a named user', () => {
    const decision = decideAssignment(configuration('SmartAssignment'), { defaultUserId: USER });

    expect(decision.status).toBe('Assigned');
    expect(decision.target).toEqual({ kind: 'user', id: USER });
  });

  it('prefers the team when both are named, leaving the narrower choice to a person', () => {
    const decision = decideAssignment(
      configuration('Manual'), { defaultUserId: USER, targetTeamId: TEAM });

    expect(decision.target?.kind).toBe('team');
  });

  it('honours the target even when the method would need an engine', () => {
    // Honouring a target somebody chose is not routing. The method only matters when nobody has.
    expect(decideAssignment(configuration('Load'), { targetTeamId: TEAM }).status).toBe('Assigned');
  });
});

describe('no routing engine is invented', () => {
  for (const method of ['RoundRobin', 'Load', 'Territory', 'SmartAssignment'] as const) {
    it(`${method} with no named target reports the capability as unavailable`, () => {
      const decision = decideAssignment(configuration(method), {});

      expect(decision.status).toBe('AssignmentCapabilityUnavailable');
      expect(decision.target).toBeUndefined();
    });
  }

  it('says so in words an officer can act on, naming no plugin or adapter', () => {
    const decision = decideAssignment(configuration('RoundRobin'), {});

    expect(decision.reason).toMatch(/assigned by hand/i);
    expect(decision.reason).not.toMatch(/plugin|adapter|roundrobin|qdb_|KI-\d+/i);
  });
});

describe('manual allocation is a valid answer, not a failure', () => {
  it('reports ManualAssignmentRequired for a Manual configuration', () => {
    expect(decideAssignment(configuration('Manual'), {}).status).toBe('ManualAssignmentRequired');
  });

  it('does not describe it as an error or a problem', () => {
    const decision = decideAssignment(configuration('Manual'), {});

    expect(decision.reason).not.toMatch(/error|fail|problem|could not/i);
    expect(decision.reason).toMatch(/allocated by a person/i);
  });

  it('is not worth retrying, because nothing about repeating the call would change it', () => {
    expect(worthRetrying('ManualAssignmentRequired')).toBe(false);
  });
});

describe('configuration that cannot decide refuses rather than guesses', () => {
  it('reports ConfigurationMissing when nothing applies', () => {
    expect(decideAssignment(null).status).toBe('ConfigurationMissing');
  });

  it('reports ConfigurationAmbiguous when more than one rule claims the work', () => {
    const decision = ambiguousAssignment();

    expect(decision.status).toBe('ConfigurationAmbiguous');
    expect(decision.target).toBeUndefined();
    expect(decision.reason).toMatch(/not clear who should receive/i);
  });
});

describe('a human ownership decision is never seized back', () => {
  it('writes the assignment when nobody owns the work yet', () => {
    const decision = decideAssignment(configuration('Manual'), { defaultUserId: USER });

    expect(shouldWriteAssignment(decision, undefined).write).toBe(true);
  });

  it('writes nothing when the work already belongs to the configured target', () => {
    const decision = decideAssignment(configuration('Manual'), { defaultUserId: USER });
    const result = shouldWriteAssignment(decision, USER);

    expect(result.write).toBe(false);
    expect(result.status).toBe('AlreadyAssigned');
  });

  it('LEAVES work with the officer who holds it, even though configuration points elsewhere', () => {
    // Without this, every re-evaluation would quietly undo every manual reassignment on the case,
    // and the officer who moved the work would have no way to tell why it kept moving back.
    const decision = decideAssignment(configuration('Manual'), { defaultUserId: USER });
    const result = shouldWriteAssignment(decision, OTHER);

    expect(result.write).toBe(false);
    expect(result.status).toBe('AlreadyAssigned');
    expect(result.reason).toMatch(/does not take work back/i);
  });

  it('never writes for a decision that named no target', () => {
    for (const method of ['RoundRobin', 'Manual'] as const) {
      expect(shouldWriteAssignment(decideAssignment(configuration(method), {}), undefined).write)
        .toBe(false);
    }
  });
});

describe('the states WP7 will need to tell apart', () => {
  it('knows which outcomes leave work without an assignee', () => {
    expect(awaitingAssignment('Assigned')).toBe(false);
    expect(awaitingAssignment('AlreadyAssigned')).toBe(false);

    for (const status of ['ManualAssignmentRequired', 'AssignmentCapabilityUnavailable',
      'ConfigurationMissing', 'ConfigurationAmbiguous', 'TargetUnavailable',
      'RetryableFailure', 'PermanentFailure'] as const) {
      expect(awaitingAssignment(status), status).toBe(true);
    }
  });

  it('separates a transient platform failure from a permanent refusal', () => {
    expect(worthRetrying('RetryableFailure')).toBe(true);
    expect(worthRetrying('PermanentFailure')).toBe(false);
    expect(worthRetrying('TargetUnavailable')).toBe(false);
  });
});
