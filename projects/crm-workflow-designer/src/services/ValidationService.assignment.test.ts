import { describe, it, expect } from 'vitest';
import { ValidationService } from '@/services/ValidationService';
import { emptyEscalationFields } from '@/services/escalationFields';
import { emptyBranchFields } from '@/services/branchFields';
import { emptyAssignmentFields } from '@/services/taskAssignment';
import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS, PROCESS_HOOKS } from '@/services/workflowHooks';
import type { WorkflowProcess, WorkflowStep, WorkflowOutcome } from '@/types/WorkflowTypes';

const service = new ValidationService();

function buildProcess(): WorkflowProcess {
  return {
    crmId: 'p1',
    name: 'Assignment Fixture',
    recordEntity: 'qdb_request',
    recordEntityName: 'Request',
    regardingField: 'regardingobjectid',
    parentEntity: 'account',
    parentEntityName: 'Account',
    versionMajor: 1,
    versionMinor: 0,
    workflowHooks: emptyWorkflowHooks(PROCESS_HOOKS),
    workflowState: 'draft',
    snapshot: null,
  };
}

function buildStep(assignment: Partial<WorkflowStep>): WorkflowStep {
  return {
    ...emptyEscalationFields(),
    ...emptyBranchFields(),
    ...emptyAssignmentFields(),
    ...assignment,
    workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
    crmId: 'a',
    name: 'Credit Review',
    schemaName: '',
    sequenceNo: 1,
    taskSubject: 'Review',
    taskDescription: '',
    recordEntityId: null,
    recordEntityName: null,
    regardingFieldId: null,
    regardingFieldName: null,
    parentEntityId: null,
    parentEntityName: null,
    allowBulkApproval: assignment.allowBulkApproval ?? false,
    processId: 'p1',
  };
}

function validateStep(assignment: Partial<WorkflowStep>) {
  const step = buildStep(assignment);
  const outcome: WorkflowOutcome = {
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId: 'o1',
    name: 'Done',
    sequenceNumber: 1,
    applyFilter: false,
    stepId: 'a',
    nextStepId: null,
    checkParallelTasks: false,
    updateParallelTaskRef: false,
  };
  return service
    .validate({
      process: buildProcess(),
      steps: { a: step },
      outcomes: { o1: outcome },
      routes: {},
      stepOrder: ['a'],
      outcomeOrder: { a: ['o1'] },
    })
    .filter((violation) => violation.code === 'INVALID_ASSIGNMENT');
}

describe('assignment validation', () => {
  it('should_reject_a_user_step_with_no_user', () => {
    expect(validateStep({ assignTo: 'user' })).toHaveLength(1);
  });

  it('should_accept_a_user_step_with_a_user', () => {
    expect(validateStep({ assignTo: 'user', assignedUserId: 'u1' })).toHaveLength(0);
  });

  it('should_accept_a_round_robin_step_with_a_round_robin_team', () => {
    expect(validateStep({ assignTo: 'roundRobin', roundRobinTeamId: 'rr1' })).toHaveLength(0);
  });

  it('should_reject_a_read_from_parent_step_missing_its_lookups', () => {
    expect(validateStep({ assignTo: 'readFromParent' })).toHaveLength(1);
  });

  it('should_reject_a_read_from_parent_step_that_sets_only_two_of_three', () => {
    const partial = {
      assignTo: 'readFromParent' as const,
      parentAssignEntityId: 'e1',
      parentAssignFieldId: 'f1',
    };
    expect(validateStep(partial)).toHaveLength(1);
  });

  it('should_accept_a_read_from_parent_step_with_all_three_lookups', () => {
    const complete = {
      assignTo: 'readFromParent' as const,
      parentAssignEntityId: 'e1',
      parentAssignFieldId: 'f1',
      parentAssignUserFieldId: 'u1',
    };
    expect(validateStep(complete)).toHaveLength(0);
  });

  it('should_name_the_mode_the_maker_chose_in_the_message', () => {
    const [violation] = validateStep({ assignTo: 'readFromParent' });
    expect(violation.message).toContain('Read From Parent');
  });

  it('should_say_the_task_would_be_created_unowned', () => {
    const [violation] = validateStep({ assignTo: 'team' });
    expect(violation.message).toContain('unowned');
  });
});
