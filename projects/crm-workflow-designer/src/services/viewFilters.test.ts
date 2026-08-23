import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { applyReturnPathFilter, isReturnLine } from './viewFilters';

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
