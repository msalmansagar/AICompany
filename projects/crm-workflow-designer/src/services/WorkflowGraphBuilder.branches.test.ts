import { describe, it, expect } from 'vitest';
import { buildGraph } from './WorkflowGraphBuilder';
import type { CrmStep, CrmOutcome } from '@/types/ViewTypes';
import type { Edge } from '@xyflow/react';

/**
 * A branch step has no outcome pointing at it — the engine creates its task from the
 * parent's, fanning out over `qdb_parentworkitemstep`. With nothing tying it to the
 * parent, the layout placed it without regard for where the parent sat, and the two
 * collided. The edit canvas already synthesised this edge; the read-only canvas did
 * not, which is why parallel tasks overlapped there and not in the editor.
 */

function step(id: string, sequenceNo: number, branch: Partial<CrmStep> = {}): CrmStep {
  return {
    id,
    name: `Step ${sequenceNo}`,
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
    ...branch,
  } as CrmStep;
}

function outcome(id: string, stepId: string, nextStepId: string | null): CrmOutcome {
  return { id, name: 'Next', sequenceNumber: 1, applyFilter: false, stepId, nextStepId } as CrmOutcome;
}

const branchEdges = (edges: Edge[]): Edge[] => edges.filter((e) => e.id.startsWith('branch_'));

describe('parallel branches on the read-only canvas', () => {
  it('should_draw_nothing_extra_when_no_step_runs_alongside_another', () => {
    const { edges } = buildGraph([step('a', 1), step('b', 2)], [outcome('o1', 'a', 'b')]);
    expect(branchEdges(edges)).toEqual([]);
  });

  it('should_connect_a_branch_step_to_the_step_it_runs_alongside', () => {
    const steps = [step('a', 1), step('c', 2, { parentStepId: 'a', parentStepName: 'Step 1' })];
    const { edges } = buildGraph(steps, [outcome('o1', 'a', null)]);
    const found = branchEdges(edges);
    expect(found).toHaveLength(1);
    expect(found[0]!).toMatchObject({ source: 'step_a', target: 'step_c' });
  });

  it('should_say_the_two_run_at_the_same_time_rather_than_one_following_the_other', () => {
    const steps = [step('a', 1), step('c', 2, { parentStepId: 'a' })];
    const { edges } = buildGraph(steps, [outcome('o1', 'a', null)]);
    expect(branchEdges(edges)[0]!.label).toBe('AT SAME TIME');
  });

  it('should_mark_a_conditional_branch_as_conditional', () => {
    const steps = [step('a', 1), step('c', 2, { parentStepId: 'a', applyBranchFilter: true })];
    const { edges } = buildGraph(steps, [outcome('o1', 'a', null)]);
    expect(branchEdges(edges)[0]!.label).toBe('AT SAME TIME · IF');
  });

  it('should_draw_one_edge_per_branch_when_several_run_alongside_the_same_step', () => {
    const steps = [
      step('a', 1),
      step('c', 2, { parentStepId: 'a' }),
      step('d', 3, { parentStepId: 'a' }),
    ];
    const { edges } = buildGraph(steps, [outcome('o1', 'a', null)]);
    expect(branchEdges(edges)).toHaveLength(2);
  });

  it('should_ignore_a_parent_that_is_not_in_the_graph', () => {
    const steps = [step('c', 2, { parentStepId: 'missing' })];
    const { edges } = buildGraph(steps, [outcome('o1', 'c', null)]);
    expect(branchEdges(edges)).toEqual([]);
  });

  // The point of the edge: with it, the layout has a reason to separate the two.
  it('should_give_the_layout_a_reason_to_keep_the_branch_off_its_parent', () => {
    const steps = [step('a', 1), step('c', 2, { parentStepId: 'a' })];
    const { nodes } = buildGraph(steps, [outcome('o1', 'a', null)]);
    const parent = nodes.find((n) => n.id === 'step_a')!;
    const branch = nodes.find((n) => n.id === 'step_c')!;
    const samePlace =
      parent.position.x === branch.position.x && parent.position.y === branch.position.y;
    expect(samePlace).toBe(false);
  });
});
