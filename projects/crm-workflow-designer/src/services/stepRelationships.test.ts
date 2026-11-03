import { describe, it, expect } from 'vitest';
import { computeStepRelationships, collectFocusStepIds } from './stepRelationships';
import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from './workflowHooks';
import { emptyEscalationFields } from './escalationFields';
import { emptyBranchFields, emptyOutcomeConcurrency } from './branchFields';
import { emptyAssignmentFields } from './taskAssignment';
import type { WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

function step(crmId: string, sequenceNo: number, name: string, parentStepId: string | null = null): WorkflowStep {
  return {
    ...emptyEscalationFields(),
    ...emptyBranchFields(),
    ...emptyAssignmentFields(),
    workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
    crmId,
    name,
    sequenceNo,
    schemaName: '',
    taskSubject: '',
    taskDescription: '',
    allowBulkApproval: false,
    recordEntityId: null,
    recordEntityName: null,
    regardingFieldId: null,
    regardingFieldName: null,
    parentEntityId: null,
    parentEntityName: null,
    processId: 'p1',
    parentStepId,
    parentStepName: null,
  };
}

function outcome(
  crmId: string,
  stepId: string,
  nextStepId: string | null,
  overrides: Partial<WorkflowOutcome> = {}
): WorkflowOutcome {
  return {
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId,
    name: `o_${crmId}`,
    sequenceNumber: 1,
    applyFilter: false,
    stepId,
    nextStepId,
    ...emptyOutcomeConcurrency(),
    ...overrides,
  };
}

function route(crmId: string, outcomeId: string, nextStepId: string | null, isDefault = false): WorkflowRoute {
  return {
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId,
    name: `r_${crmId}`,
    subject: '',
    sequenceNumber: 1,
    filter: '',
    outcomeId,
    nextStepId,
    isDefault,
  };
}

const STEPS: Record<string, WorkflowStep> = {
  a: step('a', 1, 'Analyst Review'),
  b: step('b', 2, 'Manager Approval'),
  c: step('c', 3, 'CEO Sign-off'),
  branch: step('branch', 4, 'Compliance Check', 'b'),
};

const OUTCOMES: Record<string, WorkflowOutcome> = {
  fwd: outcome('fwd', 'a', 'b'),
  gate: outcome('gate', 'b', null, { applyFilter: true, name: 'Amount check' }),
  back: outcome('back', 'c', 'a', { name: 'Return to Analyst' }),
  end: outcome('end', 'c', null, { name: 'Approve' }),
};

const ROUTES: Record<string, WorkflowRoute> = {
  hi: route('hi', 'gate', 'c'),
  lo: route('lo', 'gate', null, true),
};

describe('computeStepRelationships', () => {
  it('should_list_outgoing_decisions_with_their_kinds_and_routes', () => {
    const rel = computeStepRelationships('b', STEPS, OUTCOMES, ROUTES);
    expect(rel.outgoing).toHaveLength(1);
    expect(rel.outgoing[0].kind).toBe('conditional');
    expect(rel.outgoing[0].routes.map((r) => r.stepName)).toEqual(['CEO Sign-off', 'Ends the process']);
    expect(rel.outgoing[0].routes[1].isDefault).toBe(true);
  });

  it('should_list_incoming_from_decisions_and_from_routes', () => {
    const relC = computeStepRelationships('c', STEPS, OUTCOMES, ROUTES);
    // c is reached only through the gate's conditional route on b.
    expect(relC.incoming).toHaveLength(1);
    expect(relC.incoming[0].stepName).toBe('Manager Approval');
    expect(relC.incoming[0].kind).toBe('conditional');

    const relA = computeStepRelationships('a', STEPS, OUTCOMES, ROUTES);
    expect(relA.incoming.map((r) => r.kind)).toEqual(['return']);
    expect(relA.incoming[0].stepName).toBe('CEO Sign-off');
  });

  it('should_report_the_concurrency_family_both_ways', () => {
    const relB = computeStepRelationships('b', STEPS, OUTCOMES, ROUTES);
    expect(relB.parallelChildren.map((c) => c.stepName)).toEqual(['Compliance Check']);
    const relBranch = computeStepRelationships('branch', STEPS, OUTCOMES, ROUTES);
    expect(relBranch.parallelParent?.stepName).toBe('Manager Approval');
    expect(relBranch.counts.parallel).toBe(1);
  });

  it('should_count_returns_and_terminals_from_the_outgoing_side', () => {
    const relC = computeStepRelationships('c', STEPS, OUTCOMES, ROUTES);
    expect(relC.counts).toMatchObject({ decisions: 2, returns: 1 });
    expect(relC.outgoing.map((r) => r.kind).sort()).toEqual(['return', 'terminal']);
  });

  it('should_return_the_empty_shape_for_an_unknown_step', () => {
    const rel = computeStepRelationships('missing', STEPS, OUTCOMES, ROUTES);
    expect(rel.incoming).toHaveLength(0);
    expect(rel.outgoing).toHaveLength(0);
  });
});

describe('collectFocusStepIds', () => {
  it('should_gather_the_selection_and_every_related_step', () => {
    const rel = computeStepRelationships('b', STEPS, OUTCOMES, ROUTES);
    const ids = collectFocusStepIds('b', rel);
    // b itself, incoming a, route destination c, branch child.
    expect([...ids].sort()).toEqual(['a', 'b', 'branch', 'c']);
  });
});
