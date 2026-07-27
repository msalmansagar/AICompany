import { describe, it, expect } from 'vitest';
import { findBranchRegions, analyseBranchRegions } from '@/validators/branchRegions';
import type { BranchRegionInput, BranchStep } from '@/validators/branchRegions';
import type { WorkflowOutcome } from '@/types/WorkflowTypes';

// Fixtures describe a process as steps (some naming a parent) plus outcomes
// (some guarding). Duplication is deliberate — these are what the concurrency
// checks are judged against.

type StepSpec = { id: string; parent?: string; conditional?: boolean; filter?: string };
type OutcomeSpec = { id: string; stepId: string; guards?: boolean };

function buildInput(stepSpecs: StepSpec[], outcomeSpecs: OutcomeSpec[] = []): BranchRegionInput {
  const steps: Record<string, BranchStep> = {};
  stepSpecs.forEach((spec, index) => {
    steps[spec.id] = {
      crmId: spec.id,
      name: spec.id.toUpperCase(),
      sequenceNo: index + 1,
      parentStepId: spec.parent ?? null,
      applyBranchFilter: spec.conditional ?? false,
      branchFilter: spec.filter ?? '',
    };
  });

  const outcomes: Record<string, WorkflowOutcome> = {};
  for (const spec of outcomeSpecs) {
    outcomes[spec.id] = {
      crmId: spec.id,
      name: spec.id,
      sequenceNumber: 1,
      applyFilter: false,
      stepId: spec.stepId,
      nextStepId: null,
      checkParallelTasks: spec.guards ?? false,
      updateParallelTaskRef: false,
    };
  }

  return { steps, outcomes };
}

function codesOf(input: BranchRegionInput): string[] {
  return analyseBranchRegions(input).map((finding) => finding.code);
}

/** P fans out to A and B; P's outcome waits for them. The well-formed shape. */
function wellFormed(): BranchRegionInput {
  return buildInput(
    [{ id: 'p' }, { id: 'a', parent: 'p' }, { id: 'b', parent: 'p' }],
    [{ id: 'o1', stepId: 'p', guards: true }]
  );
}

describe('findBranchRegions', () => {
  it('should_find_nothing_in_a_process_with_no_branches', () => {
    expect(findBranchRegions(buildInput([{ id: 'a' }, { id: 'b' }]))).toEqual([]);
  });

  it('should_group_every_child_under_its_parent', () => {
    const [region] = findBranchRegions(wellFormed());
    expect(region.childStepIds).toEqual(['a', 'b']);
  });

  it('should_record_the_outcomes_that_wait_for_the_branches', () => {
    const [region] = findBranchRegions(wellFormed());
    expect(region.guardingOutcomeIds).toEqual(['o1']);
  });

  it('should_report_one_region_per_fanning_out_step', () => {
    const input = buildInput([
      { id: 'p1' }, { id: 'a', parent: 'p1' },
      { id: 'p2' }, { id: 'b', parent: 'p2' },
    ]);
    expect(findBranchRegions(input)).toHaveLength(2);
  });

  it('should_support_a_branch_that_itself_fans_out', () => {
    const input = buildInput([
      { id: 'p' }, { id: 'a', parent: 'p' }, { id: 'a1', parent: 'a' },
    ]);
    expect(findBranchRegions(input).map((r) => r.parentStepId).sort()).toEqual(['a', 'p']);
  });
});

describe('analyseBranchRegions — well-formed models', () => {
  it('should_report_nothing_for_a_guarded_fan_out', () => {
    expect(analyseBranchRegions(wellFormed())).toEqual([]);
  });

  it('should_report_nothing_for_a_process_with_no_concurrency', () => {
    const input = buildInput([{ id: 'a' }, { id: 'b' }], [{ id: 'o1', stepId: 'a' }]);
    expect(analyseBranchRegions(input)).toEqual([]);
  });

  it('should_accept_a_conditional_branch_that_has_its_condition', () => {
    const input = buildInput(
      [{ id: 'p' }, { id: 'a', parent: 'p', conditional: true, filter: '<fetch/>' }],
      [{ id: 'o1', stepId: 'p', guards: true }]
    );
    expect(analyseBranchRegions(input)).toEqual([]);
  });

  it('should_accept_a_single_branch', () => {
    const input = buildInput(
      [{ id: 'p' }, { id: 'a', parent: 'p' }],
      [{ id: 'o1', stepId: 'p', guards: true }]
    );
    expect(analyseBranchRegions(input)).toEqual([]);
  });
});

describe('analyseBranchRegions — defects', () => {
  it('should_flag_a_step_that_runs_beneath_itself', () => {
    const input = buildInput([{ id: 'a', parent: 'a' }]);
    expect(codesOf(input)).toContain('BRANCH_SELF_PARENT');
  });

  it('should_flag_a_parent_that_no_longer_exists', () => {
    const input = buildInput([{ id: 'a', parent: 'ghost' }]);
    expect(codesOf(input)).toEqual(['BRANCH_PARENT_MISSING']);
  });

  it('should_flag_a_cycle_in_the_parent_chain', () => {
    const input = buildInput([{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }]);
    expect(codesOf(input)).toContain('BRANCH_PARENT_CYCLE');
  });

  it('should_report_a_parent_cycle_once_not_once_per_member', () => {
    const input = buildInput([{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }]);
    const cycles = codesOf(input).filter((code) => code === 'BRANCH_PARENT_CYCLE');
    expect(cycles).toHaveLength(1);
  });

  it('should_name_both_members_of_a_parent_cycle', () => {
    const input = buildInput([{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }]);
    const cycle = analyseBranchRegions(input).find((f) => f.code === 'BRANCH_PARENT_CYCLE');
    expect(cycle?.affectedStepIds?.sort()).toEqual(['a', 'b']);
  });

  it('should_flag_a_conditional_branch_with_no_condition', () => {
    const input = buildInput(
      [{ id: 'p' }, { id: 'a', parent: 'p', conditional: true }],
      [{ id: 'o1', stepId: 'p', guards: true }]
    );
    expect(codesOf(input)).toEqual(['BRANCH_FILTER_MISSING']);
  });

  it('should_flag_a_fan_out_whose_parent_never_waits', () => {
    const input = buildInput([{ id: 'p' }, { id: 'a', parent: 'p' }], [{ id: 'o1', stepId: 'p' }]);
    expect(codesOf(input)).toEqual(['BRANCH_NO_JOIN_GUARD']);
  });

  it('should_flag_a_guard_on_a_step_with_no_branches', () => {
    const input = buildInput([{ id: 'a' }], [{ id: 'o1', stepId: 'a', guards: true }]);
    expect(codesOf(input)).toEqual(['ORPHAN_JOIN_GUARD']);
  });

  it('should_not_flag_an_orphan_guard_when_the_step_does_fan_out', () => {
    expect(codesOf(wellFormed())).not.toContain('ORPHAN_JOIN_GUARD');
  });
});
