import { describe, it, expect } from 'vitest';
import { ValidationService } from '@/services/ValidationService';
import { emptyEscalationFields } from '@/services/escalationFields';
import { emptyBranchFields, emptyOutcomeConcurrency } from '@/services/branchFields';
import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from '@/services/workflowHooks';
import type { WorkflowProcess, WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

// The reconciliation's headline behavioural change: concurrency no longer blocks
// publish. DP-1's block existed because the designer wrote columns the platform
// never read; these columns are the ones the engine acts on.

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

function buildStep(crmId: string, sequenceNo: number, branch: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    ...emptyEscalationFields(),
    ...emptyBranchFields(),
    ...branch,
    workflowHooks: branch.workflowHooks ?? emptyWorkflowHooks(STEP_HOOKS),
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

function buildOutcome(
  crmId: string,
  stepId: string,
  nextStepId: string | null,
  concurrency: Partial<WorkflowOutcome> = {}
): WorkflowOutcome {
  return {
    ...emptyOutcomeConcurrency(),
    ...concurrency,
    workflowHooks: concurrency.workflowHooks ?? emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId,
    name: `${stepId}->${nextStepId ?? 'End'}`,
    sequenceNumber: 1,
    applyFilter: false,
    stepId,
    nextStepId,
  };
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

/** A → B → End, no concurrency anywhere. */
function plainProcess(): Fixture {
  return toFixture(
    [buildStep('a', 1), buildStep('b', 2)],
    [buildOutcome('o1', 'a', 'b'), buildOutcome('o2', 'b', null)]
  );
}

/** A fans out to branch C; A waits for it; A → B → End. */
function concurrentProcess(): Fixture {
  const steps = [buildStep('a', 1), buildStep('b', 2), buildStep('c', 3, { parentStepId: 'a' })];
  const outcomes = [
    buildOutcome('o1', 'a', 'b', { checkParallelTasks: true }),
    buildOutcome('o2', 'b', null),
    buildOutcome('o3', 'c', null),
  ];
  return toFixture(steps, outcomes);
}

describe('ValidationService — no publish block for concurrency', () => {
  it('should_report_nothing_for_a_well_formed_concurrent_process', () => {
    expect(service.validate(concurrentProcess())).toEqual([]);
  });

  it('should_not_block_publish_for_a_concurrent_process', () => {
    const blocking = service.validate(concurrentProcess()).filter((v) => v.severity === 'error');
    expect(blocking).toEqual([]);
  });

  it('should_no_longer_emit_the_retired_not_executable_code', () => {
    const codes = service.validate(concurrentProcess()).map((v) => String(v.code));
    expect(codes).not.toContain('PARALLEL_NOT_EXECUTABLE');
  });
});

describe('ValidationService — regression: processes without concurrency', () => {
  it('should_report_no_violations_at_all_for_a_valid_plain_process', () => {
    expect(service.validate(plainProcess())).toEqual([]);
  });

  it('should_leave_an_unrelated_defect_reported_exactly_as_before', () => {
    const fixture = plainProcess();
    fixture.steps['b'].assignedUserId = null;
    expect(service.validate(fixture).map((v) => v.code)).toEqual(['INVALID_ASSIGNMENT']);
  });
});

describe('ValidationService — concurrency defects and their severity', () => {
  it('should_warn_rather_than_block_when_a_parent_never_waits', () => {
    const fixture = concurrentProcess();
    fixture.outcomes['o1'].checkParallelTasks = false;
    const violation = service.validate(fixture).find((v) => v.code === 'BRANCH_NO_JOIN_GUARD');
    expect(violation?.severity).toBe('warning');
  });

  it('should_warn_rather_than_block_for_a_guard_with_no_branches', () => {
    const fixture = plainProcess();
    fixture.outcomes['o1'].checkParallelTasks = true;
    const violation = service.validate(fixture).find((v) => v.code === 'ORPHAN_JOIN_GUARD');
    expect(violation?.severity).toBe('warning');
  });

  it('should_block_publish_for_a_branch_with_no_condition_set', () => {
    const fixture = concurrentProcess();
    fixture.steps['c'].applyBranchFilter = true;
    const violation = service.validate(fixture).find((v) => v.code === 'BRANCH_FILTER_MISSING');
    expect(violation?.severity).toBe('error');
  });

  it('should_tell_the_maker_the_branch_would_never_start', () => {
    const fixture = concurrentProcess();
    fixture.steps['c'].applyBranchFilter = true;
    const violation = service.validate(fixture).find((v) => v.code === 'BRANCH_FILTER_MISSING');
    expect(violation?.message).toContain('never start');
  });

  it('should_anchor_a_concurrency_finding_to_the_step_it_concerns', () => {
    const fixture = concurrentProcess();
    fixture.outcomes['o1'].checkParallelTasks = false;
    const violation = service.validate(fixture).find((v) => v.code === 'BRANCH_NO_JOIN_GUARD');
    expect(violation?.nodeId).toBe('a');
  });

  it('should_block_publish_for_a_step_running_beneath_itself', () => {
    const fixture = plainProcess();
    fixture.steps['b'].parentStepId = 'b';
    const violation = service.validate(fixture).find((v) => v.code === 'BRANCH_SELF_PARENT');
    expect(violation?.severity).toBe('error');
  });
});
