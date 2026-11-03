import { describe, it, expect } from 'vitest';
import { findSaveBlockers, describeSaveBlockers } from './saveBlockers';
import { EMPTY_FILTER } from './routeFilter';
import type { WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';
import { emptyWorkflowHooks, ROUTE_HOOKS, OUTCOME_HOOKS } from '@/services/workflowHooks';

const REAL_CONDITION =
  '<fetch><entity name="qdb_task"><filter type="and">' +
  '<condition attribute="qdb_approvedamount" operator="gt" value="500000"/>' +
  '</filter></entity></fetch>';

function outcome(crmId: string, name: string): WorkflowOutcome {
  return {
    crmId,
    name,
    sequenceNumber: 1,
    applyFilter: true,
    stepId: 'step_1',
    nextStepId: null,
    checkParallelTasks: false,
    updateParallelTaskRef: false,
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
  } as WorkflowOutcome;
}

function route(overrides: Partial<WorkflowRoute>): WorkflowRoute {
  return {
    crmId: 'route_1',
    name: 'Route',
    subject: '',
    sequenceNumber: 1,
    filter: REAL_CONDITION,
    outcomeId: 'outcome_1',
    nextStepId: 'step_2',
    isDefault: false,
    workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
    ...overrides,
  };
}

function state(routes: WorkflowRoute[]) {
  return {
    outcomes: { outcome_1: outcome('outcome_1', 'Approve') },
    routes: Object.fromEntries(routes.map((r) => [r.crmId, r])),
  };
}

describe('findSaveBlockers', () => {
  it('should_allow_a_conditional_route_with_a_real_condition', () => {
    expect(findSaveBlockers(state([route({})]))).toEqual([]);
  });

  it('should_allow_a_single_fallback_route_with_no_condition', () => {
    expect(findSaveBlockers(state([route({ isDefault: true, filter: EMPTY_FILTER })]))).toEqual([]);
  });

  it('should_allow_one_fallback_alongside_conditional_routes', () => {
    const blockers = findSaveBlockers(state([
      route({ crmId: 'r1', name: 'CEO' }),
      route({ crmId: 'r2', name: 'Chairman' }),
      route({ crmId: 'r3', name: 'Otherwise', isDefault: true, filter: EMPTY_FILTER }),
    ]));
    expect(blockers).toEqual([]);
  });

  // Engine: "You cann't define multiple default conditions"
  it('should_block_a_second_fallback_route_on_one_decision', () => {
    const blockers = findSaveBlockers(state([
      route({ crmId: 'r1', name: 'First', isDefault: true, filter: EMPTY_FILTER }),
      route({ crmId: 'r2', name: 'Second', isDefault: true, filter: EMPTY_FILTER }),
    ]));
    expect(blockers).toHaveLength(1);
    expect(blockers[0]!.message).toContain('2 fallback routes');
    expect(blockers[0]!.message).toContain('"First"');
    expect(blockers[0]!.message).toContain('"Second"');
  });

  // Engine: "Please add any condition in filter"
  it('should_block_a_non_fallback_route_with_an_empty_filter', () => {
    const blockers = findSaveBlockers(state([route({ name: 'Nowhere', filter: '' })]));
    expect(blockers).toHaveLength(1);
    expect(blockers[0]!.message).toContain('has no condition');
  });

  // The exact shape the old code stored, and the reason the engine rejected it.
  it('should_block_a_non_fallback_route_holding_only_the_empty_fragment', () => {
    const blockers = findSaveBlockers(state([route({ name: 'Submit', filter: EMPTY_FILTER })]));
    expect(blockers).toHaveLength(1);
    expect(blockers[0]!.routeId).toBe('route_1');
  });

  it('should_report_every_offending_route_not_just_the_first', () => {
    const blockers = findSaveBlockers(state([
      route({ crmId: 'r1', name: 'A', filter: '' }),
      route({ crmId: 'r2', name: 'B', filter: '' }),
    ]));
    expect(blockers).toHaveLength(2);
  });

  it('should_ignore_routes_belonging_to_a_different_decision', () => {
    const s = state([route({ crmId: 'r1', outcomeId: 'outcome_other', filter: '' })]);
    expect(findSaveBlockers(s)).toEqual([]);
  });
});

describe('describeSaveBlockers', () => {
  it('should_return_null_when_the_save_can_proceed', () => {
    expect(describeSaveBlockers([])).toBeNull();
  });

  it('should_state_the_single_problem_directly', () => {
    const message = describeSaveBlockers([{ outcomeId: 'o1', message: 'Route "X" has no condition.' }]);
    expect(message).toBe('Cannot save: Route "X" has no condition.');
  });

  it('should_list_every_problem_when_there_are_several', () => {
    const message = describeSaveBlockers([
      { outcomeId: 'o1', message: 'first problem' },
      { outcomeId: 'o2', message: 'second problem' },
    ]);
    expect(message).toContain('2 problems');
    expect(message).toContain('first problem');
    expect(message).toContain('second problem');
  });
});
