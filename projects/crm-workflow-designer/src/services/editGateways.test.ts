import { describe, it, expect } from 'vitest';
import { buildEditGateways, EDIT_GATEWAY_GAP } from './editGateways';
import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from './workflowHooks';
import { emptyEscalationFields } from './escalationFields';
import { emptyBranchFields, emptyOutcomeConcurrency } from './branchFields';
import { emptyAssignmentFields } from './taskAssignment';
import type { WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

function step(crmId: string, sequenceNo: number, name: string): WorkflowStep {
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
  };
}

function outcome(
  crmId: string,
  stepId: string,
  overrides: Partial<WorkflowOutcome> = {}
): WorkflowOutcome {
  return {
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId,
    name: `o_${crmId}`,
    sequenceNumber: 1,
    applyFilter: false,
    stepId,
    nextStepId: null,
    ...emptyOutcomeConcurrency(),
    ...overrides,
  };
}

function route(
  crmId: string,
  outcomeId: string,
  nextStepId: string | null,
  overrides: Partial<WorkflowRoute> = {}
): WorkflowRoute {
  return {
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId,
    name: `r_${crmId}`,
    subject: '',
    sequenceNumber: 1,
    filter: '',
    outcomeId,
    nextStepId,
    isDefault: false,
    ...overrides,
  };
}

const STEPS: Record<string, WorkflowStep> = {
  a: step('a', 1, 'Credit Analyst Review'),
  b: step('b', 2, 'Sr Manager Endorsement'),
  c: step('c', 3, 'Sr. Credit Manager Approval'),
};

const OUTCOMES: Record<string, WorkflowOutcome> = {
  gate: outcome('gate', 'a', { applyFilter: true, name: 'Approval Route' }),
  plain: outcome('plain', 'b', { nextStepId: 'c' }),
};

const ROUTES: Record<string, WorkflowRoute> = {
  ceo: route('ceo', 'gate', 'b', { name: 'CEO Route' }),
  fallback: route('fallback', 'gate', 'c', { name: 'Default', isDefault: true }),
  reject: route('reject', 'gate', null, { name: 'Reject' }),
};

const INPUT = {
  stepOrder: ['a', 'b', 'c'],
  steps: STEPS,
  outcomes: OUTCOMES,
  routes: ROUTES,
  routeOrder: { gate: ['ceo', 'fallback', 'reject'] },
  positionOf: (id: string) => (id === 'a' ? { x: 100, y: 200 } : { x: 900, y: 200 }),
  heightOf: () => 120,
  stepWidth: 280,
  selectedId: null as string | null,
};

describe('buildEditGateways', () => {
  it('should_draw_one_diamond_per_conditional_decision_with_routes', () => {
    const graph = buildEditGateways(INPUT);
    const gateways = graph.nodes.filter((n) => n.type === 'routeGateway');
    expect(gateways).toHaveLength(1);
    expect(gateways[0].id).toBe('gw_gate');
    expect(gateways[0].data).toMatchObject({ outcomeName: 'Approval Route', routeCount: 3 });
    expect(graph.outcomeIdsWithGateway.has('gate')).toBe(true);
    expect(graph.outcomeIdsWithGateway.has('plain')).toBe(false);
  });

  it('should_place_the_diamond_a_short_hop_from_its_source_card', () => {
    const graph = buildEditGateways(INPUT);
    const gateway = graph.nodes.find((n) => n.id === 'gw_gate')!;
    expect(gateway.position.x).toBe(100 + 280 + EDIT_GATEWAY_GAP);
    // Vertically centred against the 120px card.
    expect(gateway.position.y).toBeGreaterThan(200);
    expect(gateway.position.y).toBeLessThan(200 + 120);
    expect(gateway.draggable).toBe(false);
  });

  it('should_wire_entry_and_route_edges_with_panel_compatible_ids', () => {
    const graph = buildEditGateways(INPUT);
    const ids = graph.edges.map((e) => e.id).sort();
    expect(ids).toEqual(['e_entry_gate', 'route_edge_ceo', 'route_edge_fallback', 'route_edge_reject']);
    const ceo = graph.edges.find((e) => e.id === 'route_edge_ceo')!;
    expect(ceo.source).toBe('gw_gate');
    expect(ceo.target).toBe('step_b');
    expect(ceo.label).toBe('CEO Route');
  });

  it('should_mark_the_default_route_with_the_slash_and_calm_styling', () => {
    const graph = buildEditGateways(INPUT);
    const fallback = graph.edges.find((e) => e.id === 'route_edge_fallback')!;
    expect(fallback.label).toBe('∕ Default');
    expect(fallback.animated).toBe(false);
    const ceo = graph.edges.find((e) => e.id === 'route_edge_ceo')!;
    expect(ceo.animated).toBe(true);
  });

  it('should_end_a_terminal_route_at_a_local_stub_under_the_diamond', () => {
    const graph = buildEditGateways(INPUT);
    const stub = graph.nodes.find((n) => n.id === 'end_stub_gw_gate');
    expect(stub).toBeDefined();
    expect(stub?.parentId).toBe('gw_gate');
    const reject = graph.edges.find((e) => e.id === 'route_edge_reject')!;
    expect(reject.target).toBe('end_stub_gw_gate');
  });

  it('should_skip_a_conditional_decision_that_has_no_routes_yet', () => {
    const graph = buildEditGateways({
      ...INPUT,
      routeOrder: {},
    });
    expect(graph.nodes).toHaveLength(0);
    expect(graph.outcomeIdsWithGateway.size).toBe(0);
  });

  it('should_mark_the_diamond_selected_when_its_decision_is_selected', () => {
    const graph = buildEditGateways({ ...INPUT, selectedId: 'outcome_gate' });
    const gateway = graph.nodes.find((n) => n.id === 'gw_gate')!;
    expect((gateway.data as { isSelected: boolean }).isSelected).toBe(true);
  });
});
