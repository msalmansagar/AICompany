/**
 * A MIS delinquency record is not a Collection Case (ADR-DCP-11). These tests pin the contract, not the
 * thresholds: no DPD value, arrears ratio or bucket name appears here, because those are Rule Engine
 * configuration and HL and BFD may differ materially on the same build.
 */
import { describe, it, expect } from 'vitest';
import {
  createsOrUpdatesCase,
  shouldPersistSnapshot,
  NON_CASE_OUTCOMES,
  EligibilityOutcomeSchema,
  type EligibilityOutcome,
} from './eligibility.js';

const ALL_OUTCOMES = EligibilityOutcomeSchema.options as readonly EligibilityOutcome[];

describe('createsOrUpdatesCase', () => {
  it('should_admit_only_the_two_case_bearing_outcomes', () => {
    const admitted = ALL_OUTCOMES.filter(createsOrUpdatesCase);

    expect(admitted).toEqual(['EligibleCreateCase', 'ExistingEpisodeUpdate']);
  });

  it('should_never_create_a_case_for_a_non_case_outcome', () => {
    for (const outcome of NON_CASE_OUTCOMES) {
      expect(createsOrUpdatesCase(outcome)).toBe(false);
    }
  });

  it('should_cover_every_outcome_between_the_two_groups', () => {
    expect(NON_CASE_OUTCOMES.length + 2).toBe(ALL_OUTCOMES.length);
  });
});

describe('shouldPersistSnapshot', () => {
  it('should_persist_every_observation_under_AllReceived', () => {
    for (const outcome of ALL_OUTCOMES) {
      expect(shouldPersistSnapshot('AllReceived', outcome, false)).toBe(true);
    }
  });

  it('should_persist_only_case_bearing_observations_under_EligibleOnly', () => {
    expect(shouldPersistSnapshot('EligibleOnly', 'EligibleCreateCase', false)).toBe(true);
    expect(shouldPersistSnapshot('EligibleOnly', 'GraceMonitor', true)).toBe(false);
  });

  it('should_persist_only_changed_observations_under_ChangedOnly', () => {
    expect(shouldPersistSnapshot('ChangedOnly', 'GraceMonitor', true)).toBe(true);
    expect(shouldPersistSnapshot('ChangedOnly', 'GraceMonitor', false)).toBe(false);
  });

  it('should_let_ChangedOnly_keep_a_grace_observation_auditable_without_repeating_it_forever', () => {
    // The gate's constraint: a GraceMonitor decision stays auditable, but an unchanged record must not
    // generate a new snapshot on every run.
    const firstObservation = shouldPersistSnapshot('ChangedOnly', 'GraceMonitor', true);
    const unchangedRerun = shouldPersistSnapshot('ChangedOnly', 'GraceMonitor', false);

    expect(firstObservation).toBe(true);
    expect(unchangedRerun).toBe(false);
  });
});
