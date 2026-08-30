import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { applyFlowVisibility, applyReturnPathFilter, isReturnLine, SHOW_ALL_FLOW_VISIBILITY } from './viewFilters';

function node(id: string, type: string, data: Record<string, unknown> = {}): Node {
  return { id, type, position: { x: 0, y: 0 }, data } as Node;
}

function edge(id: string, source: string, target: string, data?: Record<string, unknown>): Edge {
  return { id, source, target, data } as Edge;
}

// start → A → B → end, a return edge B → A, and a return-only pill off B.
const NODES: Node[] = [
  node('start', 'viewStart'),
  node('a', 'viewStep', { outcomeRows: [{ isBackEdge: false }, { isBackEdge: true }] }),
  node('b', 'viewStep'),
  node('pill_return', 'techNewOutcome', { isReturn: true }),
  node('end', 'viewEnd'),
  node('lane', 'swimlane'),
];

const EDGES: Edge[] = [
  edge('e1', 'start', 'a'),
  edge('e2', 'a', 'b'),
  edge('e_back_1', 'b', 'a'),
  edge('e3', 'b', 'pill_return'),
  edge('tn_e_return_9', 'pill_return', 'a'),
  edge('e4', 'b', 'end'),
];

describe('isReturnLine', () => {
  it('should_recognise_all_three_return_markers', () => {
    expect(isReturnLine(edge('e_back_x', 'b', 'a'))).toBe(true);
    expect(isReturnLine(edge('tn_e_return_x', 'p', 'a'))).toBe(true);
    expect(isReturnLine(edge('any', 'b', 'a', { isBackEdge: true }))).toBe(true);
    expect(isReturnLine(edge('e_fwd', 'a', 'b'))).toBe(false);
  });
});

describe('applyReturnPathFilter', () => {
  it('should_change_nothing_in_show_mode', () => {
    const result = applyReturnPathFilter(NODES, EDGES, 'show');
    expect(result.nodes).toHaveLength(6);
    expect(result.edges).toHaveLength(6);
  });

  it('should_drop_only_return_edges_in_hide_lines_mode', () => {
    const result = applyReturnPathFilter(NODES, EDGES, 'hide-lines');
    expect(result.nodes).toHaveLength(6);
    expect(result.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('should_drop_return_pills_and_their_edges_in_hide_all_mode', () => {
    const result = applyReturnPathFilter(NODES, EDGES, 'hide-all');
    const ids = result.nodes.map((n) => n.id);
    expect(ids).not.toContain('pill_return');
    expect(result.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e4']);
  });

  it('should_strip_return_rows_from_cards_in_hide_all_mode', () => {
    const result = applyReturnPathFilter(NODES, EDGES, 'hide-all');
    const a = result.nodes.find((n) => n.id === 'a');
    expect((a?.data as { outcomeRows: unknown[] }).outcomeRows).toHaveLength(1);
  });

  it('should_drop_steps_unreachable_without_return_edges_but_keep_scenery', () => {
    const orphanGraph: Node[] = [
      ...NODES,
      node('only_via_return', 'viewStep'),
    ];
    const orphanEdges: Edge[] = [
      ...EDGES,
      edge('e_back_2', 'b', 'only_via_return', { isBackEdge: true }),
    ];
    const result = applyReturnPathFilter(orphanGraph, orphanEdges, 'hide-all');
    const ids = result.nodes.map((n) => n.id);
    expect(ids).not.toContain('only_via_return');
    expect(ids).toContain('lane');
    expect(ids).toContain('end');
  });
});

// A graph exercising all five flow classes: start -> A -> gateway -> B, a
// parallel branch off A, a return B -> A, and endings (global + stub).
const FLOW_NODES: Node[] = [
  node('start', 'viewStart'),
  node('a', 'viewStep'),
  node('branch_child', 'viewStep'),
  node('gw_1', 'routeGateway'),
  node('b', 'viewStep'),
  node('end_stub_b', 'viewEnd', { compact: true }),
  node('node_end', 'viewEnd'),
];

const FLOW_EDGES: Edge[] = [
  edge('e_start_a', 'start', 'a'),
  edge('branch_a_child', 'a', 'branch_child'),
  edge('e_entry_1', 'a', 'gw_1'),
  edge('e_route_1', 'gw_1', 'b'),
  edge('e_route_2', 'gw_1', 'end_stub_b'),
  edge('e_back_1', 'b', 'a', { isBackEdge: true }),
  edge('e_end_b', 'b', 'node_end'),
];

describe('applyFlowVisibility', () => {
  it('should_change_nothing_when_everything_is_shown', () => {
    const result = applyFlowVisibility(FLOW_NODES, FLOW_EDGES, SHOW_ALL_FLOW_VISIBILITY);
    expect(result.nodes).toHaveLength(FLOW_NODES.length);
    expect(result.edges).toHaveLength(FLOW_EDGES.length);
  });

  it('should_hide_return_lines_by_default_visibility', () => {
    const result = applyFlowVisibility(FLOW_NODES, FLOW_EDGES, {
      ...SHOW_ALL_FLOW_VISIBILITY,
      returns: 'hide-lines',
    });
    expect(result.edges.map((e) => e.id)).not.toContain('e_back_1');
    expect(result.nodes).toHaveLength(FLOW_NODES.length);
  });

  it('should_remove_gateways_and_their_routes_when_decisions_hide', () => {
    const result = applyFlowVisibility(FLOW_NODES, FLOW_EDGES, {
      ...SHOW_ALL_FLOW_VISIBILITY,
      decisions: false,
    });
    expect(result.nodes.map((n) => n.id)).not.toContain('gw_1');
    const ids = result.edges.map((e) => e.id);
    expect(ids).not.toContain('e_entry_1');
    expect(ids).not.toContain('e_route_1');
    // The terminal route hides with its gateway, not with the endings toggle.
    expect(ids).not.toContain('e_route_2');
    expect(ids).toContain('e_end_b');
  });

  it('should_remove_end_markers_and_their_edges_when_endings_hide', () => {
    const result = applyFlowVisibility(FLOW_NODES, FLOW_EDGES, {
      ...SHOW_ALL_FLOW_VISIBILITY,
      endings: false,
    });
    const nodeIds = result.nodes.map((n) => n.id);
    expect(nodeIds).not.toContain('node_end');
    expect(nodeIds).not.toContain('end_stub_b');
    const ids = result.edges.map((e) => e.id);
    expect(ids).not.toContain('e_end_b');
    expect(ids).not.toContain('e_route_2');
    expect(ids).toContain('e_route_1');
  });

  it('should_hide_only_branch_links_when_parallel_hides', () => {
    const result = applyFlowVisibility(FLOW_NODES, FLOW_EDGES, {
      ...SHOW_ALL_FLOW_VISIBILITY,
      parallel: false,
    });
    expect(result.edges.map((e) => e.id)).not.toContain('branch_a_child');
    expect(result.nodes).toHaveLength(FLOW_NODES.length);
  });

  it('should_hide_the_forward_flow_when_primary_hides', () => {
    const result = applyFlowVisibility(FLOW_NODES, FLOW_EDGES, {
      ...SHOW_ALL_FLOW_VISIBILITY,
      primary: false,
    });
    const ids = result.edges.map((e) => e.id);
    expect(ids).not.toContain('e_start_a');
    expect(ids).toContain('e_entry_1');
  });
});

