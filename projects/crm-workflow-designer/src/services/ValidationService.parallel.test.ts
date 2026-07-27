import { describe, it, expect } from 'vitest';
import { ValidationService } from '@/services/ValidationService';
import { emptySlaFields } from '@/services/slaStepFields';
import { emptyControlFlowFields } from '@/services/controlFlowFields';
import type {
  WorkflowProcess,
  WorkflowStep,
  WorkflowOutcome,
  WorkflowRoute,
  SplitType,
  JoinType,
} from '@/types/WorkflowTypes';

// Two things are under test here.
//
// 1. CEO condition C-3: a process with no parallel configuration must validate
//    exactly as it did before DP-1. Inspection is not evidence — these fixtures are.
// 2. CEO condition C-1: the publish block. It must be error severity, so it flows
//    through the gate usePublish already runs before any mutation.

const service = new ValidationService();

function buildProcess(): WorkflowProcess {
  return {
    crmId: 'p1',
    name: 'Test Process',
    recordEntity: 'task',
    recordEntityName: 'Task',
    regardingField: 'regardingobjectid',
    parentEntity: 'account',
    parentEntityName: 'Account',
    versionMajor: 1,
    versionMinor: 0,
    workflowState: 'draft',
    snapshot: null,
  };
}

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
    name: `Step ${sequenceNo}`,
    schemaName: '',
    sequenceNo,
    taskSubject: `Do ${crmId}`,
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
  return { crmId, name: `${stepId}->${nextStepId ?? 'End'}`, sequenceNumber: 1, applyFilter: false, stepId, nextStepId };
}

interface Fixture {
  process: WorkflowProcess;
  steps: Record<string, WorkflowStep>;
  outcomes: Record<string, WorkflowOutcome>;
  routes: Record<string, WorkflowRoute>;
  stepOrder: string[];
  outcomeOrder: Record<string, string[]>;
}

function toFixture(steps: WorkflowStep[], outcomes: WorkflowOutcome[]): Fixture {
  const outcomeOrder: Record<string, string[]> = {};
  for (const outcome of outcomes) {
    outcomeOrder[outcome.stepId] = [...(outcomeOrder[outcome.stepId] ?? []), outcome.crmId];
  }
  return {
    process: buildProcess(),
    steps: Object.fromEntries(steps.map((step) => [step.crmId, step])),
    outcomes: Object.fromEntries(outcomes.map((outcome) => [outcome.crmId, outcome])),
    routes: {},
    stepOrder: steps.map((step) => step.crmId),
    outcomeOrder,
  };
}

/** A → B → End. The simplest valid, entirely non-parallel process. */
function plainProcess(): Fixture {
  return toFixture(
    [buildStep('a', 1), buildStep('b', 2)],
    [buildOutcome('o1', 'a', 'b'), buildOutcome('o2', 'b', null)]
  );
}

/** S ⇉ (A, B) → J → End, with S declared parallel and J declared as an AND-join. */
function parallelProcess(): Fixture {
  return toFixture(
    [
      buildStep('s', 1, { splitType: 'Parallel' }),
      buildStep('a', 2),
      buildStep('b', 3),
      buildStep('j', 4, { joinType: 'AndJoin' }),
    ],
    [
      buildOutcome('o1', 's', 'a'),
      buildOutcome('o2', 's', 'b'),
      buildOutcome('o3', 'a', 'j'),
      buildOutcome('o4', 'b', 'j'),
      buildOutcome('o5', 'j', null),
    ]
  );
}

describe('ValidationService — C-3 regression: no parallel configuration', () => {
  it('should_report_no_violations_at_all_for_a_valid_non_parallel_process', () => {
    expect(service.validate(plainProcess())).toEqual([]);
  });

  it('should_not_emit_any_parallel_code_for_a_non_parallel_process', () => {
    const codes = service.validate(plainProcess()).map((v) => v.code);
    expect(codes.filter((code) => code.startsWith('PARALLEL') || code.includes('JOIN'))).toEqual([]);
  });

  it('should_not_block_publish_for_a_non_parallel_process', () => {
    const blocking = service.validate(plainProcess()).filter((v) => v.severity === 'error');
    expect(blocking).toEqual([]);
  });

  it('should_leave_an_unrelated_defect_reported_exactly_as_before', () => {
    const fixture = plainProcess();
    fixture.steps['b'].assignedUserId = null;
    const codes = service.validate(fixture).map((v) => v.code);
    expect(codes).toEqual(['INVALID_ASSIGNMENT']);
  });
});

describe('ValidationService — C-1: the publish block', () => {
  it('should_block_publish_for_a_structurally_valid_parallel_process', () => {
    const violation = service
      .validate(parallelProcess())
      .find((v) => v.code === 'PARALLEL_NOT_EXECUTABLE');
    expect(violation?.severity).toBe('error');
  });

  it('should_report_the_block_at_process_level_so_no_step_is_marked_at_fault', () => {
    const violation = service
      .validate(parallelProcess())
      .find((v) => v.code === 'PARALLEL_NOT_EXECUTABLE');
    expect(violation?.nodeId).toBeUndefined();
  });

  it('should_say_that_drafts_still_work', () => {
    const violation = service
      .validate(parallelProcess())
      .find((v) => v.code === 'PARALLEL_NOT_EXECUTABLE');
    expect(violation?.message).toContain('drafts');
  });

  it('should_report_no_structural_defect_for_a_well_formed_parallel_process', () => {
    const codes = service.validate(parallelProcess()).map((v) => v.code);
    expect(codes).toEqual(['PARALLEL_NOT_EXECUTABLE']);
  });

  it('should_block_publish_when_only_a_join_is_declared_and_nothing_splits', () => {
    const fixture = plainProcess();
    fixture.steps['b'].joinType = 'AndJoin';
    const codes = service.validate(fixture).map((v) => v.code);
    expect(codes).toContain('PARALLEL_NOT_EXECUTABLE');
  });
});

describe('ValidationService — parallel structural defects surface as violations', () => {
  it('should_report_an_orphan_and_join_against_the_step_that_declares_it', () => {
    const fixture = plainProcess();
    fixture.steps['b'].joinType = 'AndJoin';
    const violation = service.validate(fixture).find((v) => v.code === 'ORPHAN_AND_JOIN');
    expect(violation?.nodeId).toBe('b');
  });

  it('should_report_a_single_branch_parallel_split', () => {
    const fixture = plainProcess();
    fixture.steps['a'].splitType = 'Parallel';
    const codes = service.validate(fixture).map((v) => v.code);
    expect(codes).toContain('PARALLEL_SPLIT_SINGLE_BRANCH');
  });

  it('should_tell_the_maker_how_to_model_a_branch_that_would_otherwise_end_early', () => {
    const fixture = parallelProcess();
    fixture.outcomes['o6'] = buildOutcome('o6', 'a', null);
    fixture.outcomeOrder['a'] = ['o3', 'o6'];
    const violation = service.validate(fixture).find((v) => v.code === 'PARALLEL_JOIN_DEADLOCK');
    expect(violation?.message).toContain('Route every branch through it');
  });
});
