import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '@/store/workflowStore';
import { EMPTY_FILTER } from '@/services/routeFilter';
import { emptyWorkflowHooks, ROUTE_HOOKS } from '@/services/workflowHooks';
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
