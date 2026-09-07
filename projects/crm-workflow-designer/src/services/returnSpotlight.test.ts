import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { applyReturnSpotlight, collectReturnRefs, groupRefsBySource } from './returnSpotlight';
import type { ReturnRef } from './returnSpotlight';
import type { CrmStep, CrmOutcome } from '../types/ViewTypes';

function step(id: string, sequenceNo: number, name: string): CrmStep {
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
    recordEntityId: null,
    recordEntityName: null,
    regardingFieldId: null,
    regardingFieldName: null,
    parentEntityId: null,
    parentEntityName: null,
    processId: 'p1',
    parentStepId: null,
    parentStepName: null,
    applyBranchFilter: false,
    branchFilter: '',
  };
}

function outcome(id: string, stepId: string, nextStepId: string | null, name = `o_${id}`): CrmOutcome {
  return {
    id,
    name,
    sequenceNumber: 1,
    applyFilter: false,
    stepId,
    stepName: null,
    nextStepId,
    nextStepName: null,
  };
}

const STEPS = [step('a', 1, 'Analyst Review'), step('b', 2, 'Manager Approval'), step('c', 3, 'CEO Sign-off')];

describe('collectReturnRefs', () => {
  it('should_collect_only_outcomes_targeting_an_earlier_or_same_sequence_step', () => {
    const refs = collectReturnRefs(STEPS, [
      outcome('fwd', 'a', 'b'),
      outcome('ret', 'c', 'a', 'Return to Analyst'),
      outcome('terminal', 'c', null),
    ]);
    expect([...refs.keys()]).toEqual(['ret']);
    const ref = refs.get('ret')!;
    expect(ref.sourceStepName).toBe('CEO Sign-off');
    expect(ref.targetStepName).toBe('Analyst Review');
    expect(ref.name).toBe('Return to Analyst');
  });

  it('should_ignore_outcomes_whose_endpoints_are_unknown_steps', () => {
    const refs = collectReturnRefs(STEPS, [outcome('ghost', 'c', 'missing')]);
    expect(refs.size).toBe(0);
  });

  it('should_resolve_a_return_routed_through_a_pure_correction_step', () => {
    // c decides "Return to Analyst" → the correction step corr, whose only
    // job is looping back to a. The business meaning is c ↩ a.
    const steps = [...STEPS, step('corr', 4, 'Return to Analyst by CEO')];
    const refs = collectReturnRefs(steps, [
      outcome('fwd1', 'a', 'b'),
      outcome('fwd2', 'b', 'c'),
      outcome('via', 'c', 'corr', 'Return to Analyst'),
      outcome('loop', 'corr', 'a', 'Resubmit'),
    ]);
    const via = refs.get('via')!;
    expect(via).toBeDefined();
    expect(via.sourceStepName).toBe('CEO Sign-off');
    expect(via.targetStepName).toBe('Analyst Review');
    expect(via.viaStepId).toBe('corr');
    // The correction's own hop is a direct ref too.
    expect(refs.get('loop')?.viaStepId).toBeUndefined();
  });

  it('should_not_treat_a_forward_step_with_real_work_as_a_return_route', () => {
    // b has a forward outcome as well, so it is a genuine step, not plumbing.
    const refs = collectReturnRefs(STEPS, [
      outcome('to_b', 'a', 'b'),
      outcome('b_back', 'b', 'a'),
      outcome('b_on', 'b', 'c'),
    ]);
    expect(refs.get('to_b')).toBeUndefined();
    expect(refs.get('b_back')).toBeDefined();
  });
});

describe('groupRefsBySource', () => {
  it('should_group_refs_by_the_step_they_leave_from', () => {
    const refs = collectReturnRefs(STEPS, [
      outcome('r1', 'c', 'a'),
      outcome('r2', 'c', 'b'),
      outcome('r3', 'b', 'a'),
    ]);
    const bySource = groupRefsBySource(refs);
    expect(bySource.get('c')?.map((r) => r.outcomeId).sort()).toEqual(['r1', 'r2']);
    expect(bySource.get('b')?.map((r) => r.outcomeId)).toEqual(['r3']);
    expect(bySource.get('a')).toBeUndefined();
  });
});

function node(id: string, type: string, data: Record<string, unknown> = {}): Node {
  return { id, type, position: { x: 0, y: 0 }, data } as Node;
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target } as Edge;
}

const NODES: Node[] = [
  node('step_a', 'viewStep'),
  node('step_b', 'viewStep'),
  node('step_c', 'viewStep'),
  node('lane', 'swimlane'),
];
const EDGES: Edge[] = [edge('e_fwd_a_b', 'step_a', 'step_b'), edge('e_fwd_b_c', 'step_b', 'step_c')];

const REF: ReturnRef = {
  outcomeId: 'ret',
  name: 'Return to Analyst',
  sourceStepId: 'c',
  sourceStepName: 'CEO Sign-off',
  targetStepId: 'a',
  targetStepName: 'Analyst Review',
};

const HANDLES = { sourceHandle: 'back-out', targetHandle: 'back-in' };

describe('applyReturnSpotlight', () => {
  it('should_be_a_passthrough_with_nothing_active', () => {
    const result = applyReturnSpotlight(NODES, EDGES, [], HANDLES);
    expect(result.nodes).toBe(NODES);
    expect(result.edges).toBe(EDGES);
  });

  it('should_synthesise_a_dashed_edge_between_the_return_endpoints', () => {
    const result = applyReturnSpotlight(NODES, EDGES, [REF], HANDLES);
    const spotlight = result.edges.find((e) => e.id === 'spotlight_return_ret');
    expect(spotlight).toBeDefined();
    expect(spotlight?.source).toBe('step_c');
    expect(spotlight?.target).toBe('step_a');
    expect(spotlight?.sourceHandle).toBe('back-out');
    expect(spotlight?.targetHandle).toBe('back-in');
  });

  it('should_fade_uninvolved_nodes_and_edges_but_never_the_scenery', () => {
    const result = applyReturnSpotlight(NODES, EDGES, [REF], HANDLES);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get('step_b')?.style?.opacity).toBeLessThan(1);
    expect(byId.get('step_a')?.style?.opacity).toBe(1);
    expect(byId.get('step_c')?.style?.opacity).toBe(1);
    expect(byId.get('lane')?.style?.opacity).toBeUndefined();
    const fwd = result.edges.find((e) => e.id === 'e_fwd_a_b');
    expect(fwd?.style?.opacity).toBeLessThan(1);
  });

  it('should_tell_the_target_card_who_is_returning_to_it', () => {
    const result = applyReturnSpotlight(NODES, EDGES, [REF], HANDLES);
    const target = result.nodes.find((n) => n.id === 'step_a');
    expect(target?.data).toMatchObject({
      isSpotlightEndpoint: true,
      incomingReturns: [{ outcomeId: 'ret', sourceStepName: 'CEO Sign-off' }],
    });
    const source = result.nodes.find((n) => n.id === 'step_c');
    expect(source?.data).toMatchObject({ isSpotlightEndpoint: true, incomingReturns: [] });
  });

  it('should_keep_the_via_correction_pill_lit_for_a_routed_return', () => {
    const withPill = [...NODES, node('step_corr', 'viewStep')];
    const viaRef: ReturnRef = { ...REF, viaStepId: 'corr' };
    const result = applyReturnSpotlight(withPill, EDGES, [viaRef], HANDLES);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get('step_corr')?.style?.opacity).toBe(1);
    // The spotlight edge still runs source → final target, skipping the pill.
    const spotlight = result.edges.find((e) => e.id === 'spotlight_return_ret');
    expect(spotlight?.source).toBe('step_c');
    expect(spotlight?.target).toBe('step_a');
  });

  it('should_skip_refs_whose_endpoints_are_not_on_this_canvas', () => {
    const elsewhere: ReturnRef = { ...REF, targetStepId: 'not-here' };
    const result = applyReturnSpotlight(NODES, EDGES, [elsewhere], HANDLES);
    expect(result.nodes).toBe(NODES);
    expect(result.edges).toBe(EDGES);
  });
});
