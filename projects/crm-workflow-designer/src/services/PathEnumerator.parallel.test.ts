import { describe, it, expect } from 'vitest';
import { enumerateAllPaths } from '@/services/PathEnumerator';
import { emptySlaFields } from '@/services/slaStepFields';
import { emptyControlFlowFields } from '@/services/controlFlowFields';
import type { WorkflowStep, WorkflowOutcome, SplitType, JoinType } from '@/types/WorkflowTypes';

// ADR-1-004: a parallel region collapses into one path element. Two properties
// matter and are asserted directly — concurrency must be visible rather than
// silently walked (FR-060), and branch count must not multiply path count (FR-061).

function buildStep(
  crmId: string,
  sequenceNo: number,
  flow: { splitType?: SplitType; joinType?: JoinType } = {}
): WorkflowStep {
  return {
    ...emptySlaFields(),
    ...emptyControlFlowFields(),
    ...flow,
    crmId,
    name: crmId.toUpperCase(),
    schemaName: '',
    sequenceNo,
    taskSubject: '',
    taskDescription: '',
    recordEntityId: null,
    recordEntityName: null,
    regardingFieldId: null,
    regardingFieldName: null,
    parentEntityId: null,
    parentEntityName: null,
    assignTo: 'user',
    assignedUserId: 'u1',
    assignedUserName: 'User One',
    teamId: null,
    teamName: null,
    roundRobinTeamId: null,
    roundRobinTeamName: null,
    processId: 'p1',
  };
}

function buildOutcome(crmId: string, stepId: string, nextStepId: string | null): WorkflowOutcome {
  return { crmId, name: crmId, sequenceNumber: 1, applyFilter: false, stepId, nextStepId };
}

function enumerate(steps: WorkflowStep[], outcomes: WorkflowOutcome[]) {
  const outcomeOrder: Record<string, string[]> = {};
  for (const outcome of outcomes) {
    outcomeOrder[outcome.stepId] = [...(outcomeOrder[outcome.stepId] ?? []), outcome.crmId];
  }
  return enumerateAllPaths(
    steps[0].crmId,
    Object.fromEntries(steps.map((s) => [s.crmId, s])),
    Object.fromEntries(outcomes.map((o) => [o.crmId, o])),
    outcomeOrder,
    {},
    {}
  );
}

/** S ⇉ (a, b) → j → End, with `branchCount` concurrent branches. */
function parallelFixture(branchCount: number) {
  const branchIds = Array.from({ length: branchCount }, (_, i) => `b${i}`);
  const steps = [
    buildStep('s', 1, { splitType: 'Parallel' }),
    ...branchIds.map((id, i) => buildStep(id, i + 2)),
    buildStep('j', branchCount + 2, { joinType: 'AndJoin' }),
  ];
  const outcomes = [
    ...branchIds.map((id, i) => buildOutcome(`os${i}`, 's', id)),
    ...branchIds.map((id, i) => buildOutcome(`oj${i}`, id, 'j')),
    buildOutcome('oend', 'j', null),
  ];
  return enumerate(steps, outcomes);
}

describe('enumerateAllPaths — processes without concurrency are unaffected', () => {
  it('should_enumerate_a_linear_process_as_one_path', () => {
    const paths = enumerate(
      [buildStep('a', 1), buildStep('b', 2)],
      [buildOutcome('o1', 'a', 'b'), buildOutcome('o2', 'b', null)]
    );
    expect(paths).toHaveLength(1);
  });

  it('should_still_enumerate_an_exclusive_choice_as_two_separate_paths', () => {
    const paths = enumerate(
      [buildStep('a', 1), buildStep('b', 2), buildStep('c', 3)],
      [
        buildOutcome('o1', 'a', 'b'),
        buildOutcome('o2', 'a', 'c'),
        buildOutcome('o3', 'b', null),
        buildOutcome('o4', 'c', null),
      ]
    );
    expect(paths).toHaveLength(2);
  });

  it('should_not_mark_any_step_as_concurrent_in_a_process_without_concurrency', () => {
    const paths = enumerate(
      [buildStep('a', 1), buildStep('b', 2)],
      [buildOutcome('o1', 'a', 'b'), buildOutcome('o2', 'b', null)]
    );
    const concurrent = paths.flatMap((p) => p.steps).filter((s) => s.concurrentBranches);
    expect(concurrent).toEqual([]);
  });
});

describe('enumerateAllPaths — a parallel region collapses to one element', () => {
  it('should_produce_a_single_path_through_a_two_branch_region', () => {
    expect(parallelFixture(2)).toHaveLength(1);
  });

  it('should_show_the_split_step_as_concurrent', () => {
    const [path] = parallelFixture(2);
    expect(path.steps[0].concurrentBranches).toHaveLength(2);
  });

  it('should_name_the_branches_that_run_together', () => {
    const [path] = parallelFixture(2);
    const entries = path.steps[0].concurrentBranches?.map((b) => b.entryStepName).sort();
    expect(entries).toEqual(['B0', 'B1']);
  });

  it('should_continue_the_path_through_the_join_to_the_end', () => {
    const [path] = parallelFixture(2);
    expect(path.steps.map((s) => s.stepName)).toEqual(['S', 'J']);
    expect(path.endReason).toBe('end');
  });

  it('should_not_multiply_path_count_by_branch_count', () => {
    expect(parallelFixture(2)).toHaveLength(1);
    expect(parallelFixture(3)).toHaveLength(1);
    expect(parallelFixture(5)).toHaveLength(1);
  });

  it('should_report_a_split_whose_branches_never_converge_rather_than_walking_one', () => {
    const paths = enumerate(
      [buildStep('s', 1, { splitType: 'Parallel' }), buildStep('a', 2), buildStep('b', 3)],
      [
        buildOutcome('o1', 's', 'a'),
        buildOutcome('o2', 's', 'b'),
        buildOutcome('o3', 'a', null),
        buildOutcome('o4', 'b', null),
      ]
    );
    expect(paths.map((p) => p.endReason)).toEqual(['unmatched-parallel']);
  });
});
