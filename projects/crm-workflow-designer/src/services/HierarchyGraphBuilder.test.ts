import { describe, it, expect } from 'vitest';
import { buildHierarchyGraph, HIER_CARD_W } from './HierarchyGraphBuilder';
import type { HierarchyStepData } from './HierarchyGraphBuilder';
import type { CrmStep, CrmOutcome, CrmRoute } from '@/types/ViewTypes';

/**
 * CWFD-010 — the org-chart Hierarchy view. The flow graph is not a tree, so
 * the builder draws its spanning tree: first forward parent wins, corrections
 * stay out, orphans hang under their nearest lower-sequence step, and a
 * collapsed card hides its whole subtree.
 */

function step(id: string, sequenceNo: number, name = `Step ${sequenceNo}`): CrmStep {
  return {
    id,
    name,
    sequenceNo,
    schemaName: '',
    taskSubject: '',
    taskDescription: '',
    assignToCode: 100000000,
    enableRoundRobin: false,
    assignedUserId: null,
    assignedUserName: null,
    teamId: null,
    teamName: null,
    roundRobinTeamId: null,
    roundRobinTeamName: null,
    parentStepId: null,
    parentStepName: null,
    applyBranchFilter: false,
  } as CrmStep;
}

function outcome(
  id: string,
  stepId: string,
  nextStepId: string | null,
  extra: Partial<CrmOutcome> = {}
): CrmOutcome {
  return {
    id,
    name: 'Next',
    sequenceNumber: 1,
    applyFilter: false,
    stepId,
    nextStepId,
    ...extra,
  } as CrmOutcome;
}

const dataOf = (nodes: ReturnType<typeof buildHierarchyGraph>['nodes'], id: string) =>
  nodes.find((n) => n.id === `step_${id}`)?.data as HierarchyStepData | undefined;

describe('the hierarchy spanning tree', () => {
  const steps = [step('a', 1), step('b', 2), step('c', 3), step('d', 4)];
  const outcomes = [
    outcome('o1', 'a', 'b'),
    outcome('o2', 'a', 'c'),
    outcome('o3', 'b', 'd', { sequenceNumber: 1 }),
    // second forward parent for d — the tree must not duplicate it
    outcome('o4', 'c', 'd', { sequenceNumber: 2 }),
    outcome('o5', 'd', null),
  ];

  it('should_hang_each_step_under_its_first_forward_parent', () => {
    const { nodes, edges } = buildHierarchyGraph(steps, outcomes);
    expect(nodes).toHaveLength(4);
    expect(dataOf(nodes, 'a')!.childStepIds).toEqual(['b', 'c']);
    expect(dataOf(nodes, 'b')!.childStepIds).toEqual(['d']);
    expect(dataOf(nodes, 'c')!.childStepIds).toEqual([]);
    // one tree edge per child, cross-links not drawn
    expect(edges.map((e) => e.id).sort()).toEqual(['h_e_a_b', 'h_e_a_c', 'h_e_b_d']);
  });

  it('should_centre_a_parent_over_its_children_in_TB', () => {
    const { nodes } = buildHierarchyGraph(steps, outcomes, 'TB');
    const a = nodes.find((n) => n.id === 'step_a')!;
    const b = nodes.find((n) => n.id === 'step_b')!;
    const c = nodes.find((n) => n.id === 'step_c')!;
    expect(a.position.y).toBeLessThan(b.position.y);
    expect(b.position.y).toBe(c.position.y);
    const centre = (n: typeof a) => n.position.x + HIER_CARD_W / 2;
    expect(centre(a)).toBeCloseTo((centre(b) + centre(c)) / 2, 5);
  });

  it('should_hide_the_whole_subtree_of_a_collapsed_card', () => {
    const { nodes, edges } = buildHierarchyGraph(steps, outcomes, 'TB', [], new Set(['b']));
    expect(nodes.map((n) => n.id).sort()).toEqual(['step_a', 'step_b', 'step_c']);
    expect(edges.some((e) => e.id === 'h_e_b_d')).toBe(false);
    // the pill still knows what it is hiding
    expect(dataOf(nodes, 'b')!.descendantCount).toBe(1);
  });

  it('should_report_descendants_transitively_for_the_pill_count', () => {
    const { nodes } = buildHierarchyGraph(steps, outcomes);
    expect(dataOf(nodes, 'a')!.descendantCount).toBe(3);
  });
});

describe('hierarchy edge cases from the Loan process', () => {
  it('should_adopt_gateway_route_destinations_as_children_of_the_gateway_step', () => {
    const steps = [step('src', 1), step('t1', 2), step('t2', 3)];
    const outcomes = [outcome('cond', 'src', null, { applyFilter: true })];
    const routes = [
      { id: 'r1', name: 'A', sequenceNumber: 1, filter: '', isDefault: false, outcomeId: 'cond', nextStepId: 't1' },
      { id: 'r2', name: 'B', sequenceNumber: 2, filter: '', isDefault: true, outcomeId: 'cond', nextStepId: 't2' },
    ] as CrmRoute[];
    const { nodes } = buildHierarchyGraph(steps, outcomes, 'TB', routes);
    expect(dataOf(nodes, 'src')!.childStepIds.sort()).toEqual(['t1', 't2']);
    expect(dataOf(nodes, 'src')!.isDecisionPoint).toBe(true);
  });

  it('should_leave_pure_correction_loops_out_of_the_chart', () => {
    const steps = [step('approve', 1), step('ret', 2), step('done', 3)];
    const outcomes = [
      outcome('o1', 'approve', 'ret', { sequenceNumber: 1 }),
      outcome('o2', 'approve', 'done', { sequenceNumber: 2 }),
      outcome('o3', 'ret', 'approve'),
      outcome('o4', 'done', null),
    ];
    const { nodes } = buildHierarchyGraph(steps, outcomes);
    expect(nodes.some((n) => n.id === 'step_ret')).toBe(false);
  });

  it('should_hang_an_orphan_under_its_nearest_lower_sequence_step', () => {
    const steps = [step('a', 1), step('b', 2), step('orphan', 5), step('after', 6)];
    const outcomes = [
      outcome('o1', 'a', 'b'),
      outcome('o2', 'b', null),
      outcome('o3', 'orphan', 'after'),
      outcome('o4', 'after', null),
    ];
    const { nodes } = buildHierarchyGraph(steps, outcomes);
    expect(dataOf(nodes, 'b')!.childStepIds).toEqual(['orphan']);
    expect(dataOf(nodes, 'orphan')!.childStepIds).toEqual(['after']);
  });

  it('should_mark_terminating_steps_for_the_ends_process_chip', () => {
    const steps = [step('a', 1), step('b', 2)];
    const outcomes = [outcome('o1', 'a', 'b'), outcome('o2', 'b', null)];
    const { nodes } = buildHierarchyGraph(steps, outcomes);
    expect(dataOf(nodes, 'b')!.isTerminating).toBe(true);
    expect(dataOf(nodes, 'a')!.isTerminating).toBe(false);
  });
});

describe('returns in the outer gutter (CWFD-011)', () => {
  const steps = [step('a', 1), step('b', 2), step('c', 3)];
  const outcomes = [
    outcome('o1', 'a', 'b'),
    outcome('o2', 'b', 'c'),
    outcome('r1', 'b', 'a', { name: 'Return to A', sequenceNumber: 2 }),
    outcome('r2', 'c', 'a', { name: 'Reject to A', sequenceNumber: 1 }),
    outcome('o3', 'c', null, { sequenceNumber: 2 }),
  ];

  it('should_emit_hidden_return_edges_with_their_own_lanes', () => {
    const { edges } = buildHierarchyGraph(steps, outcomes);
    const returns = edges.filter((e) => e.type === 'hierReturn');
    expect(returns).toHaveLength(2);
    expect(returns.every((e) => e.hidden)).toBe(true);
    const gutters = returns.map((e) => (e.data as { gutter: number }).gutter);
    expect(new Set(gutters).size).toBe(2);
  });

  it('should_route_lanes_outside_the_tree', () => {
    const { nodes, edges } = buildHierarchyGraph(steps, outcomes);
    const minX = Math.min(...nodes.map((n) => n.position.x));
    for (const e of edges.filter((x) => x.type === 'hierReturn')) {
      expect((e.data as { gutter: number }).gutter).toBeLessThan(minX);
    }
  });

  it('should_count_returns_per_card_for_the_badge', () => {
    const { nodes } = buildHierarchyGraph(steps, outcomes);
    expect(dataOf(nodes, 'b')!.returnCount).toBe(1);
    expect(dataOf(nodes, 'c')!.returnCount).toBe(1);
    expect(dataOf(nodes, 'a')!.returnCount).toBe(0);
  });

  it('should_drop_returns_whose_endpoint_is_inside_a_collapsed_subtree', () => {
    const { edges } = buildHierarchyGraph(steps, outcomes, 'TB', [], new Set(['b']));
    // c is hidden under collapsed b — its return to a must not dangle.
    expect(edges.some((e) => e.id === 'h_ret_r2')).toBe(false);
    expect(edges.some((e) => e.id === 'h_ret_r1')).toBe(true);
  });

  it('should_ignore_self_loops', () => {
    const selfSteps = [step('a', 1), step('b', 2)];
    const selfOutcomes = [
      outcome('o1', 'a', 'b'),
      outcome('s1', 'b', 'b', { sequenceNumber: 1 }),
      outcome('o2', 'b', null, { sequenceNumber: 2 }),
    ];
    const { edges } = buildHierarchyGraph(selfSteps, selfOutcomes);
    expect(edges.some((e) => e.type === 'hierReturn')).toBe(false);
  });
});

describe('left-to-right layout (CWFD-014)', () => {
  const steps = [step('a', 1), step('b', 2), step('c', 3), step('d', 4)];
  const outcomes = [
    outcome('o1', 'a', 'b'),
    outcome('o2', 'a', 'c'),
    outcome('o3', 'b', 'd'),
    outcome('o4', 'c', null),
    outcome('o5', 'd', null),
  ];

  it('should_space_LR_levels_by_card_width_so_columns_never_overlap', () => {
    const { nodes } = buildHierarchyGraph(steps, outcomes, 'LR');
    const a = nodes.find((n) => n.id === 'step_a')!;
    const b = nodes.find((n) => n.id === 'step_b')!;
    expect(b.position.x - a.position.x).toBeGreaterThanOrEqual(HIER_CARD_W);
  });

  it('should_stack_LR_siblings_by_card_height_without_overlap', () => {
    const { nodes } = buildHierarchyGraph(steps, outcomes, 'LR');
    const b = nodes.find((n) => n.id === 'step_b')!;
    const c = nodes.find((n) => n.id === 'step_c')!;
    expect(b.position.x).toBe(c.position.x);
    const gap = Math.abs(c.position.y - b.position.y);
    expect(gap).toBeGreaterThanOrEqual(104);
  });

  it('should_centre_an_LR_parent_on_its_children_rows', () => {
    const { nodes } = buildHierarchyGraph(steps, outcomes, 'LR');
    const centreY = (id: string) => nodes.find((n) => n.id === id)!.position.y + 104 / 2;
    expect(centreY('step_a')).toBeCloseTo((centreY('step_b') + centreY('step_c')) / 2, 5);
  });

  it('should_produce_no_overlapping_cards_in_LR', () => {
    const { nodes } = buildHierarchyGraph(steps, outcomes, 'LR');
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].position;
        const b = nodes[j].position;
        const overlaps =
          a.x < b.x + HIER_CARD_W && a.x + HIER_CARD_W > b.x &&
          a.y < b.y + 104 && a.y + 104 > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });
});
