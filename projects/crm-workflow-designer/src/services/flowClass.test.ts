import { describe, it, expect } from 'vitest';
import type { Edge } from '@xyflow/react';
import { classifyEdge, isEndingEdge } from './flowClass';

function edge(
  id: string,
  target = 'step_x',
  data?: Record<string, unknown>,
  type?: string
): Edge {
  return { id, source: 'step_s', target, data, type } as Edge;
}

describe('classifyEdge', () => {
  it('should_classify_return_edges_from_every_builder_convention', () => {
    expect(classifyEdge(edge('e_back_1'))).toBe('return');
    expect(classifyEdge(edge('tn_e_return_1'))).toBe('return');
    expect(classifyEdge(edge('outcome_1', 'step_a', { isBackEdge: true }))).toBe('return');
    expect(classifyEdge(edge('h_ret_1', 'step_a', undefined, 'hierReturn'))).toBe('return');
  });

  it('should_classify_a_conditional_backwards_edge_as_return_not_decision', () => {
    expect(
      classifyEdge(edge('outcome_1', 'step_a', { isBackEdge: true, isConditional: true }))
    ).toBe('return');
  });

  it('should_classify_branch_links_as_parallel', () => {
    expect(classifyEdge(edge('branch_p_c'))).toBe('parallel');
  });

  it('should_classify_gateway_entries_and_routes_as_decision', () => {
    expect(classifyEdge(edge('e_entry_1', 'gw_1'))).toBe('decision');
    expect(classifyEdge(edge('e_route_1'))).toBe('decision');
    expect(classifyEdge(edge('e_exec_entry_1', 'gw_1'))).toBe('decision');
    expect(classifyEdge(edge('e_exec_route_1'))).toBe('decision');
    expect(classifyEdge(edge('tn_e_route_1'))).toBe('decision');
    expect(classifyEdge(edge('outcome_1', 'step_a', { isConditional: true }))).toBe('decision');
  });

  it('should_classify_edges_into_end_markers_as_ending', () => {
    expect(classifyEdge(edge('e_end_step1', 'node_end'))).toBe('ending');
    expect(classifyEdge(edge('e_exec_end_1', 'node_end'))).toBe('ending');
    expect(classifyEdge(edge('tn_e_end_1', 'tn_end'))).toBe('ending');
    expect(classifyEdge(edge('outcome_1', 'edit_end', { isConditional: false }))).toBe('ending');
    expect(classifyEdge(edge('outcome_1', 'end_stub_o1', { isConditional: false }))).toBe('ending');
  });

  it('should_classify_a_terminal_route_as_ending_so_hiding_decisions_keeps_endings', () => {
    // The gateway-node removal is what takes this edge along when decisions
    // hide; classified as ending, it survives a decisions-only toggle.
    expect(classifyEdge(edge('e_route_9', 'end_stub_gw_1'))).toBe('ending');
    expect(classifyEdge(edge('outcome_9', 'end_stub_o9', { isConditional: true }))).toBe('ending');
  });

  it('should_classify_forward_flow_and_start_links_as_primary', () => {
    expect(classifyEdge(edge('e_start_1'))).toBe('primary');
    expect(classifyEdge(edge('start_to_step_1'))).toBe('primary');
    expect(classifyEdge(edge('e_fwd_a_b'))).toBe('primary');
    expect(classifyEdge(edge('tn_e_fwd_1'))).toBe('primary');
    expect(classifyEdge(edge('e_exec_fwd_a_b'))).toBe('primary');
    expect(classifyEdge(edge('tn_e_so_1', 'tn_outcome_1'))).toBe('primary');
    expect(classifyEdge(edge('outcome_1', 'step_a', { isConditional: false }))).toBe('primary');
  });
});

describe('isEndingEdge', () => {
  it('should_match_global_ends_and_local_stubs_only', () => {
    expect(isEndingEdge(edge('x', 'node_end'))).toBe(true);
    expect(isEndingEdge(edge('x', 'edit_end'))).toBe(true);
    expect(isEndingEdge(edge('x', 'end_stub_abc'))).toBe(true);
    expect(isEndingEdge(edge('x', 'step_a'))).toBe(false);
  });
});
