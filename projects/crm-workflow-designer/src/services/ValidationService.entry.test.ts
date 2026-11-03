import { describe, it, expect } from 'vitest';
import { ValidationService } from '@/services/ValidationService';
import { emptyEscalationFields } from '@/services/escalationFields';
import { emptyBranchFields, emptyOutcomeConcurrency } from '@/services/branchFields';
import { emptyAssignmentFields } from '@/services/taskAssignment';
import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS, PROCESS_HOOKS } from '@/services/workflowHooks';
import type { WorkflowProcess, WorkflowStep, WorkflowOutcome } from '@/types/WorkflowTypes';

/**
 * The entry step is whichever step carries the lowest sequence number — not
 * literally sequence number 1. The live org runs processes numbered 2, 3, 4;
 * the retired MISSING_START check called them broken, then reported their own
 * entry step as unreachable. These tests pin the corrected rule, and the
 * outcome-level fallback rule that came in alongside it.
 */

const service = new ValidationService();

function buildProcess(): WorkflowProcess {
  return {
    crmId: 'p1', name: 'Test Process',
    recordEntity: 'task', recordEntityName: 'Task',
    regardingField: 'regardingobjectid',
    parentEntity: 'account', parentEntityName: 'Account',
    versionMajor: 1, versionMinor: 0,
    workflowHooks: emptyWorkflowHooks(PROCESS_HOOKS),
    workflowState: 'draft', snapshot: null,
  };
}

function buildStep(crmId: string, sequenceNo: number): WorkflowStep {
  return {
    ...emptyEscalationFields(), ...emptyBranchFields(), ...emptyAssignmentFields(),
    workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
    crmId, name: `Step ${sequenceNo}`, schemaName: '', sequenceNo,
    taskSubject: `Do ${crmId}`, taskDescription: '',
    recordEntityId: null, recordEntityName: null,
    regardingFieldId: null, regardingFieldName: null,
    parentEntityId: null, parentEntityName: null,
    allowBulkApproval: false,
    assignTo: 'user', assignedUserId: 'u1', assignedUserName: 'User One',
    processId: 'p1',
  } as WorkflowStep;
}

function buildOutcome(
  crmId: string,
  stepId: string,
  nextStepId: string | null,
  applyFilter: boolean
): WorkflowOutcome {
  return {
    ...emptyOutcomeConcurrency(),
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId, name: crmId, sequenceNumber: 1, applyFilter, stepId, nextStepId,
  } as WorkflowOutcome;
}

interface GraphSpec {
  steps: WorkflowStep[];
  outcomes: WorkflowOutcome[];
}

function validate(spec: GraphSpec) {
  return service.validate({
    process: buildProcess(),
    steps: Object.fromEntries(spec.steps.map((s) => [s.crmId, s])),
    outcomes: Object.fromEntries(spec.outcomes.map((o) => [o.crmId, o])),
    routes: {},
    stepOrder: spec.steps.map((s) => s.crmId),
    outcomeOrder: {},
  });
}

describe('entry step by lowest sequence number', () => {
  const chainFrom2 : GraphSpec = {
    steps: [buildStep('s2', 2), buildStep('s3', 3), buildStep('s4', 4)],
    outcomes: [
      buildOutcome('o1', 's2', 's3', false),
      buildOutcome('o2', 's3', 's4', false),
      buildOutcome('o3', 's4', null, false),
    ],
  };

  it('should_not_flag_a_chain_that_starts_at_sequence_two', () => {
    const codes = validate(chainFrom2).map((v) => v.code);
    expect(codes).not.toContain('ORPHAN_STEP');
  });

  it('should_still_flag_a_step_nothing_leads_to', () => {
    const orphaned: GraphSpec = {
      steps: [...chainFrom2.steps, buildStep('s9', 9)],
      outcomes: [...chainFrom2.outcomes, buildOutcome('o9', 's9', null, false)],
    };
    const orphans = validate(orphaned).filter((v) => v.code === 'ORPHAN_STEP');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].nodeId).toBe('s9');
  });
});

describe('ALL_OUTCOMES_CONDITIONAL', () => {
  it('should_warn_when_every_outcome_of_a_step_is_conditional', () => {
    const spec: GraphSpec = {
      steps: [buildStep('s1', 1), buildStep('s2', 2)],
      outcomes: [
        buildOutcome('o1', 's1', 's2', true),
        buildOutcome('o2', 's1', null, true),
        buildOutcome('o3', 's2', null, false),
      ],
    };
    const findings = validate(spec).filter((v) => v.code === 'ALL_OUTCOMES_CONDITIONAL');
    expect(findings).toHaveLength(1);
    expect(findings[0].nodeId).toBe('s1');
    expect(findings[0].severity).toBe('warning');
  });

  it('should_stay_quiet_when_one_outcome_is_the_unconditional_fallback', () => {
    const spec: GraphSpec = {
      steps: [buildStep('s1', 1), buildStep('s2', 2)],
      outcomes: [
        buildOutcome('o1', 's1', 's2', true),
        buildOutcome('o2', 's1', null, false),
        buildOutcome('o3', 's2', null, false),
      ],
    };
    const codes = validate(spec).map((v) => v.code);
    expect(codes).not.toContain('ALL_OUTCOMES_CONDITIONAL');
  });

  it('should_stay_quiet_for_a_step_with_no_outcomes_at_all', () => {
    const spec: GraphSpec = {
      steps: [buildStep('s1', 1)],
      outcomes: [],
    };
    const codes = validate(spec).map((v) => v.code);
    expect(codes).not.toContain('ALL_OUTCOMES_CONDITIONAL');
  });
});
