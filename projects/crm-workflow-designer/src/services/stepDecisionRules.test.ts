import { describe, it, expect } from 'vitest';
import { findStepsWithoutDecision, describeStepDecisionBlockers } from './stepDecisionRules';
import type { WorkflowOutcome, WorkflowStep } from '@/types/WorkflowTypes';
import { emptyEscalationFields } from './escalationFields';
import { emptyBranchFields, emptyOutcomeConcurrency } from './branchFields';
import { emptyAssignmentFields } from './taskAssignment';
import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from './workflowHooks';

function step(crmId: string, sequenceNo: number, name: string): WorkflowStep {
  return {
    ...emptyEscalationFields(),
    ...emptyBranchFields(),
    ...emptyAssignmentFields(),
    workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
    crmId,
    name,
    schemaName: '',
    sequenceNo,
    taskSubject: name,
    taskDescription: '',
    recordEntityId: null,
    recordEntityName: null,
    regardingFieldId: null,
    regardingFieldName: null,
    parentEntityId: null,
    parentEntityName: null,
    allowBulkApproval: false,
    assignTo: 'user',
    assignedUserId: 'u1',
    assignedUserName: 'User One',
    processId: 'p1',
  } as WorkflowStep;
}

function outcome(crmId: string, stepId: string): WorkflowOutcome {
  return {
    ...emptyOutcomeConcurrency(),
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId,
    name: 'Approve',
    sequenceNumber: 1,
    applyFilter: false,
    stepId,
    nextStepId: null,
  } as WorkflowOutcome;
}

const state = (steps: WorkflowStep[], outcomes: WorkflowOutcome[]) => ({
  steps: Object.fromEntries(steps.map((s) => [s.crmId, s])),
  outcomes: Object.fromEntries(outcomes.map((o) => [o.crmId, o])),
});

describe('findStepsWithoutDecision', () => {
  it('should_find_nothing_when_every_step_offers_a_decision', () => {
    const found = findStepsWithoutDecision(
      state([step('a', 1, 'Review'), step('b', 2, 'Approve')], [outcome('o1', 'a'), outcome('o2', 'b')])
    );
    expect(found).toEqual([]);
  });

  // The engine returns immediately when a completed task has no qdb_decision, so the
  // instance stops there with the task looking finished.
  it('should_flag_a_step_with_no_outcomes', () => {
    const found = findStepsWithoutDecision(state([step('a', 1, 'Review')], []));
    expect(found).toHaveLength(1);
    expect(found[0]!.stepId).toBe('a');
  });

  // A last step is not exempt: its task still needs a decision to be completed.
  it('should_flag_the_final_step_too', () => {
    const found = findStepsWithoutDecision(
      state([step('a', 1, 'Review'), step('b', 2, 'Approve')], [outcome('o1', 'a')])
    );
    expect(found.map((f) => f.stepId)).toEqual(['b']);
  });

  it('should_report_stranded_steps_in_sequence_order', () => {
    const found = findStepsWithoutDecision(
      state([step('c', 3, 'Third'), step('a', 1, 'First'), step('b', 2, 'Second')], [])
    );
    expect(found.map((f) => f.stepId)).toEqual(['a', 'b', 'c']);
  });

  it('should_name_the_step_so_the_message_can_be_acted_on', () => {
    const found = findStepsWithoutDecision(state([step('a', 4, 'E.D Credit Approval')], []));
    expect(found[0]!.message).toContain('E.D Credit Approval');
    expect(found[0]!.message).toContain('Step 4');
  });

  it('should_stay_readable_when_a_step_has_no_name_yet', () => {
    expect(findStepsWithoutDecision(state([step('a', 1, '')], []))[0]!.message).toContain('unnamed');
  });

  it('should_not_credit_a_step_with_an_outcome_belonging_to_another_step', () => {
    const found = findStepsWithoutDecision(
      state([step('a', 1, 'A'), step('b', 2, 'B')], [outcome('o1', 'a'), outcome('o2', 'a')])
    );
    expect(found.map((f) => f.stepId)).toEqual(['b']);
  });
});

describe('describeStepDecisionBlockers', () => {
  it('should_return_null_when_nothing_is_stranded', () => {
    expect(describeStepDecisionBlockers([])).toBeNull();
  });

  it('should_state_a_single_problem_directly', () => {
    expect(describeStepDecisionBlockers([{ stepId: 'a', message: 'Step 1 has no decision.' }]))
      .toBe('Cannot save: Step 1 has no decision.');
  });

  it('should_count_and_list_several', () => {
    const message = describeStepDecisionBlockers([
      { stepId: 'a', message: 'first' },
      { stepId: 'b', message: 'second' },
    ]);
    expect(message).toContain('2 steps');
    expect(message).toContain('first');
    expect(message).toContain('second');
  });
});
