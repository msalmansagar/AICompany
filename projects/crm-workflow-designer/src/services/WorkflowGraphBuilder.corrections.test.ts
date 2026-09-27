import { describe, it, expect } from 'vitest';
import { buildGraph } from './WorkflowGraphBuilder';
import type { ViewStepData } from './WorkflowGraphBuilder';
import type { CrmStep, CrmOutcome } from '@/types/ViewTypes';

/**
 * CWFD-009 P1/P2 — pure correction loops leave the layout spine.
 *
 * Unranked "Return to X by Y" steps piled up at rank 0, so a 35-step process
 * opened on its corrections instead of its entry step. They now collapse to
 * pills attached beside the step they resubmit to, with a short return edge.
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
  sequenceNumber = 1
): CrmOutcome {
  return { id, name: 'Next', sequenceNumber, applyFilter: false, stepId, nextStepId } as CrmOutcome;
}

// approve(5) → return(6) → approve(5): the canonical correction loop, plus a
// spine around it so the layout has something to attach to.
const steps = [step('entry', 1), step('approve', 5), step('return', 6), step('final', 9)];
const outcomes = [
  outcome('o_in', 'entry', 'approve'),
  outcome('o_send', 'approve', 'return', 1),
  outcome('o_fwd', 'approve', 'final', 2),
  outcome('o_resubmit', 'return', 'approve'),
  outcome('o_done', 'final', null),
];

describe('correction loops on the read-only canvas', () => {
  it('should_mark_a_pure_return_step_as_a_correction', () => {
    const { nodes } = buildGraph(steps, outcomes);
    const data = nodes.find((n) => n.id === 'step_return')!.data as ViewStepData;
    expect(data.isCorrection).toBe(true);
    expect(data.returnTargetName).toBe('Step 5');
  });

  it('should_leave_spine_steps_uncollapsed', () => {
    const { nodes } = buildGraph(steps, outcomes);
    for (const id of ['step_entry', 'step_approve', 'step_final']) {
      expect((nodes.find((n) => n.id === id)!.data as ViewStepData).isCorrection).toBeFalsy();
    }
  });

  it('should_attach_the_pill_beside_its_resubmit_target_not_at_the_origin', () => {
    const { nodes } = buildGraph(steps, outcomes, 'TB');
    const pill = nodes.find((n) => n.id === 'step_return')!;
    const target = nodes.find((n) => n.id === 'step_approve')!;
    // In TB the pill sits in the target's left gutter at the target's height.
    expect(pill.position.x).toBeLessThan(target.position.x);
    expect(pill.position.y).toBe(target.position.y);
  });

  it('should_keep_the_entry_step_first_in_rank_order', () => {
    const { nodes } = buildGraph(steps, outcomes, 'TB');
    const entryY = nodes.find((n) => n.id === 'step_entry')!.position.y;
    const spineYs = nodes
      .filter((n) => n.type === 'viewStep' && !(n.data as ViewStepData).isCorrection)
      .map((n) => n.position.y);
    expect(Math.min(...spineYs)).toBe(entryY);
  });

  it('should_draw_the_return_as_a_short_e_back_edge_for_the_toggle_to_find', () => {
    const { edges } = buildGraph(steps, outcomes);
    const back = edges.find((e) => e.id === 'e_back_o_resubmit');
    expect(back).toBeDefined();
    expect(back!).toMatchObject({ source: 'step_return', target: 'step_approve' });
  });

  it('should_not_collapse_a_hybrid_step_that_also_moves_forward', () => {
    // Step 30 in the Loan process: returns to 25 but also transitions to 31.
    const hybridSteps = [step('a', 1), step('b', 2), step('hybrid', 3), step('c', 4)];
    const hybridOutcomes = [
      outcome('h1', 'a', 'b'),
      outcome('h2', 'b', 'hybrid'),
      outcome('h3', 'hybrid', 'b', 1),
      outcome('h4', 'hybrid', 'c', 2),
      outcome('h5', 'c', null),
    ];
    const { nodes } = buildGraph(hybridSteps, hybridOutcomes);
    expect((nodes.find((n) => n.id === 'step_hybrid')!.data as ViewStepData).isCorrection).toBeFalsy();
  });

  it('should_attach_an_orphan_correction_instead_of_ranking_it_first', () => {
    // The Loan spec's shape: nothing routes into the correction step at all.
    const orphanSteps = [step('entry', 1), step('mid', 2), step('orphan', 8)];
    const orphanOutcomes = [
      outcome('p1', 'entry', 'mid'),
      outcome('p2', 'mid', null),
      outcome('p3', 'orphan', 'mid'),
    ];
    const { nodes } = buildGraph(orphanSteps, orphanOutcomes, 'TB');
    const orphan = nodes.find((n) => n.id === 'step_orphan')!;
    const entry = nodes.find((n) => n.id === 'step_entry')!;
    const mid = nodes.find((n) => n.id === 'step_mid')!;
    expect((orphan.data as ViewStepData).isCorrection).toBe(true);
    // Beside its target, not above the entry step.
    expect(orphan.position.y).toBe(mid.position.y);
    expect(orphan.position.y).toBeGreaterThan(entry.position.y);
  });
});
