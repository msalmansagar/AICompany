import { describe, it, expect } from 'vitest';
import { deriveStageOverview, buildOverviewGraph } from './stageOverview';
import type { CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';

function step(id: string, sequenceNo: number, name: string, parentStepId: string | null = null): CrmStep {
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
    parentStepId,
    parentStepName: null,
    applyBranchFilter: false,
    branchFilter: '',
  };
}

function outcome(
  id: string,
  stepId: string,
  nextStepId: string | null,
  applyFilter = false
): CrmOutcome {
  return {
    id,
    name: `o_${id}`,
    sequenceNumber: 1,
    applyFilter,
    stepId,
    stepName: null,
    nextStepId,
    nextStepName: null,
  };
}

function route(id: string, outcomeId: string, nextStepId: string | null): CrmRoute {
  return {
    id,
    name: `r_${id}`,
    subject: '',
    sequenceNumber: 1,
    nextStepId,
    nextStepName: null,
    filter: '',
    outcomeId,
    isDefault: false,
  };
}

// RM stage (2 steps, one a branch child), Credit stage (2 steps), a pure
// correction inside Credit looping to RM, and a conditional CEO hop.
const STEPS = [
  step('rm1', 1, 'Proposal Review by RM'),
  step('rm2', 2, 'Customer Documents Check', 'rm1'),
  step('cr1', 3, 'Credit Analyst Review'),
  step('cr2', 4, 'Credit Manager Approval'),
  step('corr', 5, 'Return to RM by Credit Manager'),
  step('ceo', 6, 'CEO Joint Approval'),
];

const OUTCOMES = [
  outcome('a', 'rm1', 'cr1'),
  outcome('b', 'cr1', 'cr2'),
  outcome('via', 'cr2', 'corr'),
  outcome('loop', 'corr', 'rm1'),
  outcome('gate', 'cr2', null, true),
  outcome('end', 'ceo', null),
];

const ROUTES = [route('hi', 'gate', 'ceo'), route('reject', 'gate', null)];

describe('deriveStageOverview', () => {
  it('should_merge_neighbouring_steps_sharing_a_role_into_one_stage', () => {
    const { stages } = deriveStageOverview(STEPS, OUTCOMES, ROUTES);
    expect(stages.map((s) => s.label)).toEqual(['Relationship Manager', 'Credit', 'CEO']);
    expect(stages[0].counts.steps).toBe(2);
    expect(stages[0].firstStepId).toBe('rm1');
  });

  it('should_count_corrections_as_returns_of_their_real_source_stage_not_as_steps', () => {
    const { stages } = deriveStageOverview(STEPS, OUTCOMES, ROUTES);
    const credit = stages[1];
    // The correction step itself is plumbing — not a stage step.
    expect(credit.counts.steps).toBe(2);
    // Its routed return is attributed to Credit (source = Credit Manager Approval)
    // plus the correction's own hop resolves with source in Credit too.
    expect(credit.counts.returns).toBeGreaterThanOrEqual(1);
    expect(stages[0].counts.returns).toBe(0);
  });

  it('should_count_parallel_and_endings_where_they_live', () => {
    const { stages } = deriveStageOverview(STEPS, OUTCOMES, ROUTES);
    expect(stages[0].counts.parallel).toBe(1);
    // Credit owns the terminal route; CEO owns its terminal decision.
    expect(stages[1].counts.endings).toBe(1);
    expect(stages[2].counts.endings).toBe(1);
  });

  it('should_bundle_forward_transitions_between_stage_pairs', () => {
    const { transitions } = deriveStageOverview(STEPS, OUTCOMES, ROUTES);
    const keys = transitions.map((t) => `${t.fromIndex}→${t.toIndex}`).sort();
    // RM → Credit (outcome a), Credit → CEO (conditional route hi).
    expect(keys).toEqual(['0→1', '1→2']);
  });
});

describe('buildOverviewGraph', () => {
  it('should_chain_start_stages_and_end_with_adjacent_solid_links', () => {
    const { nodes, edges } = buildOverviewGraph(STEPS, OUTCOMES, 'TB', ROUTES);
    expect(nodes.map((n) => n.type)).toEqual([
      'viewStart',
      'overviewStage',
      'overviewStage',
      'overviewStage',
      'viewEnd',
    ]);
    const ids = edges.map((e) => e.id).sort();
    expect(ids).toEqual(['e_ovr_0_1', 'e_ovr_1_2', 'e_ovr_end', 'e_ovr_start']);
    // Adjacent transitions run through the chain handles.
    const seq = edges.find((e) => e.id === 'e_ovr_0_1');
    expect(seq?.sourceHandle).toBe('out');
  });

  it('should_arc_a_stage_skipping_transition_by_the_side_handles', () => {
    const withSkip = [...OUTCOMES, outcome('skip', 'rm1', 'ceo')];
    const { edges } = buildOverviewGraph(STEPS, withSkip, 'TB', ROUTES);
    const skip = edges.find((e) => e.id === 'e_ovr_0_2');
    expect(skip).toBeDefined();
    expect(skip?.sourceHandle).toBe('side-out');
    expect(skip?.targetHandle).toBe('side-in');
  });
});
