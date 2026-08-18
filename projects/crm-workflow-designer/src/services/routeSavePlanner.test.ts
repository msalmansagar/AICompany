import { describe, it, expect } from 'vitest';
import { planRouteSave, describeBlockedRoutes } from './routeSavePlanner';
import type { RouteSaveContext } from './routeSavePlanner';
import type { WorkflowRoute } from '@/types/WorkflowTypes';
import { emptyWorkflowHooks, ROUTE_HOOKS } from '@/services/workflowHooks';

const REAL_OUTCOME = 'e8f076e6-a97c-f111-ab0e-000d3abd8313';
const REAL_STEP = 'b6f076e6-a97c-f111-ab0e-000d3abd8313';
const REAL_ROUTE = '11111111-2222-3333-4444-555555555555';

function makeRoute(overrides: Partial<WorkflowRoute> = {}): WorkflowRoute {
  return {
    crmId: REAL_ROUTE,
    name: 'CEO Approval',
    subject: '',
    sequenceNumber: 1,
    filter: '',
    outcomeId: REAL_OUTCOME,
    nextStepId: REAL_STEP,
    workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
    ...overrides,
  };
}

function makeContext(overrides: Partial<RouteSaveContext> = {}): RouteSaveContext {
  return { outcomeIdMap: {}, stepIdMap: {}, newIds: [], dirtyIds: [], ...overrides };
}

describe('planRouteSave', () => {
  it('should_create_a_route_whose_id_is_temporary', () => {
    const route = makeRoute({ crmId: 'tmp_route_1' });
    const plan = planRouteSave(route, makeContext());
    expect(plan.action).toBe('create');
  });

  it('should_update_a_route_marked_dirty', () => {
    const plan = planRouteSave(makeRoute(), makeContext({ dirtyIds: [REAL_ROUTE] }));
    expect(plan.action).toBe('update');
  });

  it('should_leave_an_untouched_route_alone', () => {
    expect(planRouteSave(makeRoute(), makeContext()).action).toBe('unchanged');
  });

  // The defect: a route with no next step is legal — the engine simply creates no
  // following task — but the save loop treated it as unsaveable and dropped it.
  it('should_save_a_route_that_has_no_next_step', () => {
    const route = makeRoute({ crmId: 'tmp_route_2', nextStepId: null });
    const plan = planRouteSave(route, makeContext());
    expect(plan.action).toBe('create');
    if (plan.action !== 'create') throw new Error('expected create');
    expect(plan.ids.nextStepId).toBeNull();
  });

  it('should_keep_a_null_next_step_null_when_updating', () => {
    const route = makeRoute({ nextStepId: null });
    const plan = planRouteSave(route, makeContext({ dirtyIds: [REAL_ROUTE] }));
    if (plan.action !== 'update') throw new Error('expected update');
    expect(plan.ids.nextStepId).toBeNull();
  });

  it('should_resolve_a_next_step_created_earlier_in_the_same_save', () => {
    const route = makeRoute({ crmId: 'tmp_route_3', nextStepId: 'tmp_step_9' });
    const plan = planRouteSave(route, makeContext({ stepIdMap: { tmp_step_9: REAL_STEP } }));
    if (plan.action !== 'create') throw new Error('expected create');
    expect(plan.ids.nextStepId).toBe(REAL_STEP);
  });

  it('should_resolve_an_outcome_created_earlier_in_the_same_save', () => {
    const route = makeRoute({ crmId: 'tmp_route_4', outcomeId: 'tmp_outcome_2' });
    const plan = planRouteSave(route, makeContext({ outcomeIdMap: { tmp_outcome_2: REAL_OUTCOME } }));
    if (plan.action !== 'create') throw new Error('expected create');
    expect(plan.ids.outcomeId).toBe(REAL_OUTCOME);
  });

  it('should_block_a_route_whose_outcome_never_persisted', () => {
    const route = makeRoute({ crmId: 'tmp_route_5', outcomeId: 'tmp_outcome_unsaved' });
    const plan = planRouteSave(route, makeContext());
    expect(plan.action).toBe('blocked');
    if (plan.action !== 'blocked') throw new Error('expected blocked');
    expect(plan.reason).toContain('outcome');
  });

  it('should_block_a_route_whose_next_step_never_persisted', () => {
    const route = makeRoute({ crmId: 'tmp_route_6', nextStepId: 'tmp_step_unsaved' });
    const plan = planRouteSave(route, makeContext());
    expect(plan.action).toBe('blocked');
    if (plan.action !== 'blocked') throw new Error('expected blocked');
    expect(plan.reason).toContain('next step');
  });
});

describe('describeBlockedRoutes', () => {
  it('should_return_null_when_every_route_was_saved', () => {
    expect(describeBlockedRoutes([])).toBeNull();
  });

  it('should_name_the_single_route_that_was_not_saved', () => {
    const message = describeBlockedRoutes([{ name: 'ICC Approval Path', reason: 'its outcome was not saved' }]);
    expect(message).toContain('ICC Approval Path');
    expect(message).toContain('1 route');
  });

  it('should_count_and_name_several_unsaved_routes', () => {
    const message = describeBlockedRoutes([
      { name: 'A', reason: 'its outcome was not saved' },
      { name: 'B', reason: 'its next step was not saved' },
    ]);
    expect(message).toContain('2 routes');
    expect(message).toContain('A');
    expect(message).toContain('B');
  });

  it('should_still_be_readable_when_a_route_has_no_name', () => {
    expect(describeBlockedRoutes([{ name: '', reason: 'its outcome was not saved' }])).toContain('unnamed route');
  });
});
