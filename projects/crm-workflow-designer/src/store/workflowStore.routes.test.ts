import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '@/store/workflowStore';
import { EMPTY_FILTER } from '@/services/routeFilter';
import { emptyWorkflowHooks, ROUTE_HOOKS, PROCESS_HOOKS } from '@/services/workflowHooks';
import type { WorkflowRoute } from '@/types/WorkflowTypes';

/**
 * One decision may have exactly one fallback route. The engine enforces it with
 * "You cann't define multiple default conditions", so the store enforces it too —
 * promoting a route demotes whichever sibling held the role. The point is that the
 * state can never reach a save in a shape the server would refuse.
 */

function route(crmId: string, outcomeId: string, isDefault: boolean): WorkflowRoute {
  return {
    crmId,
    name: crmId,
    subject: '',
    sequenceNumber: 1,
    filter: isDefault ? EMPTY_FILTER : '<filter type="and"><condition attribute="x" operator="eq" value="1"/></filter>',
    outcomeId,
    nextStepId: null,
    isDefault,
    workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
  };
}

function routesById(): Record<string, WorkflowRoute> {
  return useWorkflowStore.getState().routes;
}

describe('one fallback route per decision', () => {
  beforeEach(() => {
    useWorkflowStore.setState({ routes: {}, routeOrder: {}, dirtyIds: [], newIds: [] });
  });

  it('should_demote_the_previous_fallback_when_another_is_added', () => {
    const { addRoute } = useWorkflowStore.getState();
    addRoute(route('r1', 'o1', true));
    addRoute(route('r2', 'o1', true));

    expect(routesById()['r1']!.isDefault).toBe(false);
    expect(routesById()['r2']!.isDefault).toBe(true);
  });

  it('should_demote_the_previous_fallback_when_one_is_promoted_by_edit', () => {
    const { addRoute, setRoute } = useWorkflowStore.getState();
    addRoute(route('r1', 'o1', true));
    addRoute(route('r2', 'o1', false));

    setRoute({ ...routesById()['r2']!, isDefault: true, filter: EMPTY_FILTER });

    expect(routesById()['r1']!.isDefault).toBe(false);
    expect(routesById()['r2']!.isDefault).toBe(true);
  });

  it('should_mark_the_demoted_route_dirty_so_the_change_is_persisted', () => {
    const { addRoute, setRoute } = useWorkflowStore.getState();
    addRoute(route('r1', 'o1', true));
    addRoute(route('r2', 'o1', false));

    setRoute({ ...routesById()['r2']!, isDefault: true });

    expect(useWorkflowStore.getState().dirtyIds).toContain('r1');
  });

  it('should_leave_a_fallback_on_a_different_decision_alone', () => {
    const { addRoute } = useWorkflowStore.getState();
    addRoute(route('r1', 'o1', true));
    addRoute(route('r2', 'o2', true));

    expect(routesById()['r1']!.isDefault).toBe(true);
    expect(routesById()['r2']!.isDefault).toBe(true);
  });

  it('should_not_disturb_anything_when_the_route_is_not_a_fallback', () => {
    const { addRoute } = useWorkflowStore.getState();
    addRoute(route('r1', 'o1', true));
    addRoute(route('r2', 'o1', false));

    expect(routesById()['r1']!.isDefault).toBe(true);
    expect(routesById()['r2']!.isDefault).toBe(false);
  });
});

/**
 * Add Next Step must produce a process that can still be saved.
 *
 * The engine stops on a task completed without a decision, and the designer refuses to
 * save a step that has none — so a new step arriving empty would have made the button
 * that created it immediately block the next save.
 */
describe('addStepAfter', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      process: {
        crmId: 'p1', name: 'P', recordEntity: null, recordEntityName: null,
        regardingField: null, parentEntity: null, parentEntityName: null,
        versionMajor: 1, versionMinor: 0, workflowHooks: emptyWorkflowHooks(PROCESS_HOOKS),
        workflowState: 'draft', snapshot: null,
      } as never,
      steps: {}, stepOrder: [], outcomes: {}, outcomeOrder: {},
      routes: {}, routeOrder: {}, nodePositions: {}, dirtyIds: [], newIds: [],
    });
    useWorkflowStore.setState({
      steps: { s1: { crmId: 's1', name: 'First', sequenceNo: 1 } as never },
      stepOrder: ['s1'],
    });
  });

  it('should_connect_the_new_step_to_the_one_it_follows', () => {
    useWorkflowStore.getState().addStepAfter('s1');
    const outcomes = Object.values(useWorkflowStore.getState().outcomes);
    const link = outcomes.find((o) => o.stepId === 's1');
    expect(link).toBeDefined();
    expect(link!.nextStepId).not.toBeNull();
  });

  it('should_give_the_new_step_a_decision_of_its_own', () => {
    useWorkflowStore.getState().addStepAfter('s1');
    const state = useWorkflowStore.getState();
    const newStepId = state.stepOrder.find((id) => id !== 's1')!;
    const owned = Object.values(state.outcomes).filter((o) => o.stepId === newStepId);
    expect(owned).toHaveLength(1);
    expect(owned[0]!.nextStepId).toBeNull();
  });

  it('should_leave_no_step_stranded_without_a_decision', () => {
    useWorkflowStore.getState().addStepAfter('s1');
    const state = useWorkflowStore.getState();
    const withDecision = new Set(Object.values(state.outcomes).map((o) => o.stepId));
    expect(state.stepOrder.filter((id) => !withDecision.has(id))).toEqual([]);
  });
});
