import { describe, it, expect } from 'vitest';
import { buildSwimlaneGraph } from './SwimlaneGraphBuilder';
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

function outcome(id: string, stepId: string, nextStepId: string | null): CrmOutcome {
  return {
    id,
    name: `o_${id}`,
    sequenceNumber: 1,
    applyFilter: false,
    stepId,
    stepName: null,
    nextStepId,
    nextStepName: null,
  };
}

const STEPS = [step('a', 1, 'First'), step('b', 2, 'Second')];
const OUTCOMES = [outcome('fwd', 'a', 'b'), outcome('ret', 'b', 'a')];

describe('buildSwimlaneGraph', () => {
  it('should_anchor_back_edges_on_handles_the_swim_step_node_defines', () => {
    // The back edge asked for target handle 'bottom', but the node only
    // defines 'bottom-t' as a target — React Flow dropped every swimlane
    // return line silently, and nobody had ever seen one render.
    const { edges } = buildSwimlaneGraph(STEPS, OUTCOMES);
    const back = edges.find((e) => e.id === 'e_back_ret');
    expect(back).toBeDefined();
    expect(back?.sourceHandle).toBe('bottom');
    expect(back?.targetHandle).toBe('bottom-t');
  });

  it('should_draw_forward_edges_between_left_and_right_handles', () => {
    const { edges } = buildSwimlaneGraph(STEPS, OUTCOMES);
    const fwd = edges.find((e) => e.id === 'e_fwd_a_b');
    expect(fwd?.sourceHandle).toBe('right');
    expect(fwd?.targetHandle).toBe('left');
  });
});
