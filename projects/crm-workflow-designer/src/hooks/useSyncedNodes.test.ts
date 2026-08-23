import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import { mergeMeasuredNodes } from './useSyncedNodes';
import { collectErrorNodeIds } from '@/services/ValidationService';
import type { Violation } from '@/services/ValidationService';

function node(id: string, extra: Partial<Node> = {}): Node {
  return { id, position: { x: 0, y: 0 }, data: {}, ...extra } as Node;
}

describe('mergeMeasuredNodes', () => {
  it('should_carry_measured_dimensions_onto_a_rebuilt_node', () => {
    const previous = [node('a', { measured: { width: 260, height: 96 }, width: 260, height: 96 })];
    const merged = mergeMeasuredNodes(previous, [node('a')]);
    expect(merged[0].measured).toEqual({ width: 260, height: 96 });
    expect(merged[0].width).toBe(260);
  });

  it('should_leave_a_new_node_unmeasured', () => {
    const previous = [node('a', { measured: { width: 260, height: 96 } })];
    const merged = mergeMeasuredNodes(previous, [node('a'), node('b')]);
    expect(merged[1].measured).toBeUndefined();
  });

  it('should_take_blueprint_data_over_previous_data', () => {
    const previous = [node('a', { measured: { width: 1, height: 1 }, data: { name: 'old' } })];
    const merged = mergeMeasuredNodes(previous, [node('a', { data: { name: 'new' } })]);
    expect(merged[0].data).toEqual({ name: 'new' });
    expect(merged[0].measured).toEqual({ width: 1, height: 1 });
  });

  it('should_drop_nodes_missing_from_the_blueprint', () => {
    const previous = [node('a'), node('b')];
    const merged = mergeMeasuredNodes(previous, [node('b')]);
    expect(merged.map((n) => n.id)).toEqual(['b']);
  });
});

describe('collectErrorNodeIds', () => {
  const violation = (overrides: Partial<Violation>): Violation => ({
    code: 'MISSING_TASK_SUBJECT',
    message: '',
    severity: 'warning',
    ...overrides,
  });

  it('should_include_step_ids_from_errors_only', () => {
    const ids = collectErrorNodeIds([
      violation({ severity: 'error', nodeId: 'bad-step' }),
      violation({ severity: 'warning', nodeId: 'advisory-step' }),
    ]);
    expect(ids.has('bad-step')).toBe(true);
    expect(ids.has('advisory-step')).toBe(false);
  });

  it('should_ignore_outcome_scoped_errors', () => {
    const ids = collectErrorNodeIds([
      violation({ severity: 'error', nodeId: 'an-outcome', nodeType: 'outcome' }),
    ]);
    expect(ids.size).toBe(0);
  });

  it('should_spread_affected_node_ids_for_errors_but_not_warnings', () => {
    const ids = collectErrorNodeIds([
      violation({ severity: 'error', affectedNodeIds: ['s1', 's2'] }),
      violation({ severity: 'warning', affectedNodeIds: ['s3'] }),
    ]);
    expect([...ids].sort()).toEqual(['s1', 's2']);
  });
});
