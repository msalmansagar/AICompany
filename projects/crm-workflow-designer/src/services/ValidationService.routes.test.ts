import { describe, it, expect } from 'vitest';
import { ValidationService } from '@/services/ValidationService';
import { EMPTY_FILTER } from '@/services/routeFilter';
import { emptyEscalationFields } from '@/services/escalationFields';
import { emptyBranchFields, emptyOutcomeConcurrency } from '@/services/branchFields';
import { emptyAssignmentFields } from '@/services/taskAssignment';
import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS, ROUTE_HOOKS, PROCESS_HOOKS } from '@/services/workflowHooks';
import type { WorkflowProcess, WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

/**
 * Route rules, all of which used to read a route's filter to decide whether it carried
 * a condition or was the fallback. A route with no condition stores EMPTY_FILTER — a
 * non-empty string — so every one of those checks answered the opposite of the truth.
 */

const service = new ValidationService();

const REAL_CONDITION =
  '<fetch><entity name="qdb_task"><filter type="and">' +
  '<condition attribute="qdb_approvedamount" operator="gt" value="500000"/>' +
  '</filter></entity></fetch>';

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

function buildOutcome(crmId: string, stepId: string, nextStepId: string | null, applyFilter: boolean): WorkflowOutcome {
  return {
    ...emptyOutcomeConcurrency(),
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId, name: 'Approve', sequenceNumber: 1, applyFilter, stepId, nextStepId,
  } as WorkflowOutcome;
}

function buildRoute(crmId: string, outcomeId: string, overrides: Partial<WorkflowRoute> = {}): WorkflowRoute {
  return {
    crmId, name: crmId, subject: '', sequenceNumber: 1,
    filter: REAL_CONDITION, outcomeId, nextStepId: 'b', isDefault: false,
    workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
    ...overrides,
  };
}

function fixture(routes: WorkflowRoute[], applyFilter = true) {
  const steps = [buildStep('a', 1), buildStep('b', 2)];
  const outcomes = [buildOutcome('o1', 'a', 'b', applyFilter), buildOutcome('o2', 'b', null, false)];
  return {
    process: buildProcess(),
    steps: Object.fromEntries(steps.map((s) => [s.crmId, s])),
    outcomes: Object.fromEntries(outcomes.map((o) => [o.crmId, o])),
    routes: Object.fromEntries(routes.map((r) => [r.crmId, r])),
    stepOrder: steps.map((s) => s.crmId),
    outcomeOrder: { a: ['o1'], b: ['o2'] },
  };
}

function codes(state: ReturnType<typeof fixture>): string[] {
  return service.validate(state).map((v) => v.code);
}

describe('routes the engine would reject', () => {
  it('should_accept_a_conditional_route_carrying_a_real_condition', () => {
    expect(codes(fixture([buildRoute('r1', 'o1')]))).not.toContain('ROUTE_WITHOUT_CONDITION');
  });

  it('should_flag_a_non_fallback_route_holding_only_the_empty_fragment', () => {
    const found = codes(fixture([buildRoute('r1', 'o1', { filter: EMPTY_FILTER })]));
    expect(found).toContain('ROUTE_WITHOUT_CONDITION');
  });

  it('should_not_flag_a_fallback_route_for_having_no_condition', () => {
    const route = buildRoute('r1', 'o1', { filter: EMPTY_FILTER, isDefault: true });
    expect(codes(fixture([route]))).not.toContain('ROUTE_WITHOUT_CONDITION');
  });

  it('should_flag_two_fallback_routes_on_one_decision', () => {
    const found = codes(fixture([
      buildRoute('r1', 'o1', { filter: EMPTY_FILTER, isDefault: true }),
      buildRoute('r2', 'o1', { filter: EMPTY_FILTER, isDefault: true }),
    ]));
    expect(found).toContain('MULTIPLE_DEFAULT_ROUTES');
  });
});

describe('MISSING_FETCHXML', () => {
  it('should_not_be_satisfied_by_the_empty_fragment_alone', () => {
    const found = codes(fixture([buildRoute('r1', 'o1', { filter: EMPTY_FILTER, isDefault: true })]));
    expect(found).toContain('MISSING_FETCHXML');
  });

  it('should_be_satisfied_by_a_route_with_a_real_condition', () => {
    expect(codes(fixture([buildRoute('r1', 'o1')]))).not.toContain('MISSING_FETCHXML');
  });
});

describe('MISSING_FALLBACK_ROUTE', () => {
  it('should_warn_when_several_conditional_routes_have_no_fallback_between_them', () => {
    const found = codes(fixture([
      buildRoute('r1', 'o1'),
      buildRoute('r2', 'o1'),
    ]));
    expect(found).toContain('MISSING_FALLBACK_ROUTE');
  });

  it('should_be_satisfied_by_a_route_marked_as_the_fallback', () => {
    const found = codes(fixture([
      buildRoute('r1', 'o1'),
      buildRoute('r2', 'o1', { filter: EMPTY_FILTER, isDefault: true }),
    ]));
    expect(found).not.toContain('MISSING_FALLBACK_ROUTE');
  });

  // The old rule read an empty filter as "this is the fallback". A loaded default route
  // stores EMPTY_FILTER, so it would have been counted — and a genuinely missing
  // fallback would have been reported as present.
  it('should_not_treat_a_conditionless_non_fallback_route_as_the_fallback', () => {
    const found = codes(fixture([
      buildRoute('r1', 'o1'),
      buildRoute('r2', 'o1', { filter: EMPTY_FILTER, isDefault: false }),
    ]));
    expect(found).toContain('MISSING_FALLBACK_ROUTE');
  });
});
