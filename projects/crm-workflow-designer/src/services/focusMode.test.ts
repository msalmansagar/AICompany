import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { applyFocusFade, applyHoverEmphasis } from './focusMode';

function node(id: string, type = 'editStep'): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as Node;
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target, style: { strokeWidth: 1.5 } } as Edge;
}

const NODES: Node[] = [
  node('edit_start', 'viewStart'),
  node('step_a'),
  node('step_b'),
  node('step_c'),
  node('end_stub_o9', 'viewEnd'),
];

const ALL_EDGES: Edge[] = [
  edge('start_to_step_a', 'edit_start', 'step_a'),
  edge('outcome_1', 'step_a', 'step_b'),
  edge('outcome_2', 'step_b', 'step_c'),
  edge('outcome_back', 'step_b', 'step_a'),
  edge('outcome_9', 'step_b', 'end_stub_o9'),
];

// The visibility filter hid the return edge, as the default does.
const VISIBLE_EDGES = ALL_EDGES.filter((e) => e.id !== 'outcome_back');

describe('applyFocusFade', () => {
  it('should_keep_the_selection_its_relations_and_edge_endpoints_lit', () => {
    const result = applyFocusFade(NODES, VISIBLE_EDGES, ALL_EDGES, 'step_b', new Set(['b', 'a', 'c']));
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get('step_b')?.style?.opacity).toBe(1);
    expect(byId.get('step_a')?.style?.opacity).toBe(1);
    expect(byId.get('step_c')?.style?.opacity).toBe(1);
    // The stub is lit because an incident edge lands on it.
    expect(byId.get('end_stub_o9')?.style?.opacity).toBe(1);
    // The start marker touches no incident edge of b — faded.
    expect(byId.get('edit_start')?.style?.opacity).toBeLessThan(1);
  });

  it('should_restore_a_filtered_out_return_edge_incident_to_the_selection', () => {
    const result = applyFocusFade(NODES, VISIBLE_EDGES, ALL_EDGES, 'step_b', new Set(['b', 'a', 'c']));
    const back = result.edges.find((e) => e.id === 'outcome_back');
    expect(back).toBeDefined();
    expect(back?.style?.opacity).toBe(1);
  });

  it('should_fade_edges_that_do_not_touch_the_selection', () => {
    const result = applyFocusFade(NODES, VISIBLE_EDGES, ALL_EDGES, 'step_b', new Set(['b', 'a', 'c']));
    const startEdge = result.edges.find((e) => e.id === 'start_to_step_a');
    expect(startEdge?.style?.opacity).toBeLessThan(1);
    const incident = result.edges.find((e) => e.id === 'outcome_1');
    expect(incident?.style?.opacity).toBe(1);
  });
});

describe('applyHoverEmphasis', () => {
  it('should_lean_on_incident_edges_and_step_back_the_rest', () => {
    const result = applyHoverEmphasis(VISIBLE_EDGES, 'step_a');
    const incident = result.find((e) => e.id === 'outcome_1');
    expect(incident?.style?.opacity).toBe(1);
    expect(Number(incident?.style?.strokeWidth)).toBeGreaterThan(1.5);
    const far = result.find((e) => e.id === 'outcome_2');
    expect(far?.style?.opacity).toBeLessThan(1);
  });

  it('should_change_nothing_when_the_hovered_node_has_no_edges', () => {
    const result = applyHoverEmphasis(VISIBLE_EDGES, 'step_unknown');
    expect(result).toBe(VISIBLE_EDGES);
  });
});
