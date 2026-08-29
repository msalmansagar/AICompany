import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '@/store/workflowStore';
import { emptyEscalationFields } from '@/services/escalationFields';
import { emptyBranchFields, emptyOutcomeConcurrency } from '@/services/branchFields';
import { emptyAssignmentFields } from '@/services/taskAssignment';
import {
  emptyWorkflowHooks,
  OUTCOME_HOOKS,
  PROCESS_HOOKS,
  ROUTE_HOOKS,
  STEP_HOOKS,
} from '@/services/workflowHooks';
import type { WorkflowOutcome, WorkflowProcess, WorkflowRoute, WorkflowStep } from '@/types/WorkflowTypes';

/**
 * CWFD-016 B5/B6 — insert-between and duplicate, the two modelling gestures.
 * Both are single store actions so one Ctrl+Z removes the whole gesture.
 */

function process(): WorkflowProcess {
  return {
    crmId: 'proc1',
    name: 'P',
    recordEntity: null,
    recordEntityName: null,
    regardingField: null,
    parentEntity: null,
    parentEntityName: null,
    workflowHooks: emptyWorkflowHooks(PROCESS_HOOKS),
  } as unknown as WorkflowProcess;
}

function step(crmId: string, sequenceNo: number, name = crmId): WorkflowStep {
  return {
    ...emptyEscalationFields(),
    ...emptyBranchFields(),
    ...emptyAssignmentFields(),
    workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
    crmId,
    name,
    sequenceNo,
    schemaName: '',
    taskSubject: `subject of ${name}`,
    taskDescription: '',
    allowBulkApproval: false,
    recordEntityId: null,
    recordEntityName: null,
    regardingFieldId: null,
    regardingFieldName: null,
    parentEntityId: null,
    parentEntityName: null,
    processId: 'proc1',
  };
}

function outcome(crmId: string, stepId: string, nextStepId: string | null, extra: Partial<WorkflowOutcome> = {}): WorkflowOutcome {
  return {
    crmId,
    name: crmId,
    sequenceNumber: 1,
    applyFilter: false,
    ...emptyOutcomeConcurrency(),
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    stepId,
    nextStepId,
    ...extra,
  };
}

function loadThreeStepFlow() {
  const { loadWorkflow } = useWorkflowStore.getState();
  loadWorkflow(
    process(),
    [step('a', 1), step('b', 2), step('c', 3)],
    [outcome('o_ab', 'a', 'b'), outcome('o_bc', 'b', 'c'), outcome('o_end', 'c', null, { sequenceNumber: 2 })],
    [],
    { step_a: { x: 0, y: 0 }, step_b: { x: 400, y: 0 }, step_c: { x: 800, y: 0 } }
  );
}

const state = () => useWorkflowStore.getState();

describe('insertStepBetween', () => {
  beforeEach(loadThreeStepFlow);

  it('should_splice_the_new_step_into_the_transition', () => {
    state().insertStepBetween('o_ab');
    const newStepId = state().stepOrder[1];
    expect(newStepId.startsWith('tmp_')).toBe(true);
    // a's decision now leads to the new step…
    expect(state().outcomes['o_ab']!.nextStepId).toBe(newStepId);
    // …and the new step carries one decision to the old target.
    const newOutcomes = state().outcomeOrder[newStepId] ?? [];
    expect(newOutcomes).toHaveLength(1);
    expect(state().outcomes[newOutcomes[0]]!.nextStepId).toBe('b');
  });

  it('should_renumber_the_whole_order_around_the_insert', () => {
    state().insertStepBetween('o_ab');
    const sequences = state().stepOrder.map((id) => state().steps[id]!.sequenceNo);
    expect(sequences).toEqual([1, 2, 3, 4]);
    expect(state().steps['b']!.sequenceNo).toBe(3);
  });

  it('should_keep_a_terminal_transition_terminal', () => {
    state().insertStepBetween('o_end');
    const newStepId = state().selectedId!.slice('step_'.length);
    const newOutcomes = state().outcomeOrder[newStepId] ?? [];
    expect(state().outcomes['o_end']!.nextStepId).toBe(newStepId);
    expect(state().outcomes[newOutcomes[0]]!.nextStepId).toBeNull();
  });

  it('should_place_the_card_midway_between_its_neighbours', () => {
    state().insertStepBetween('o_ab');
    const newStepId = state().stepOrder[1];
    expect(state().nodePositions[`step_${newStepId}`]).toEqual({ x: 200, y: 0 });
  });

  it('should_refuse_conditional_decisions_whose_targets_live_in_routes', () => {
    useWorkflowStore.setState((s) => ({
      outcomes: { ...s.outcomes, o_ab: { ...s.outcomes['o_ab']!, applyFilter: true } },
    }));
    const before = state().stepOrder.length;
    state().insertStepBetween('o_ab');
    expect(state().stepOrder.length).toBe(before);
  });
});

describe('duplicateStep', () => {
  beforeEach(() => {
    loadThreeStepFlow();
    const { addRoute } = state();
    useWorkflowStore.setState((s) => ({
      outcomes: { ...s.outcomes, o_bc: { ...s.outcomes['o_bc']!, applyFilter: true } },
    }));
    const route: WorkflowRoute = {
      crmId: 'r1',
      name: 'route',
      subject: '',
      sequenceNumber: 1,
      filter: '<filter type="and"><condition attribute="x" operator="eq" value="1"/></filter>',
      outcomeId: 'o_bc',
      nextStepId: 'c',
      isDefault: false,
      workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
    };
    addRoute(route);
  });

  it('should_clone_the_step_directly_after_its_source', () => {
    state().duplicateStep('b');
    expect(state().stepOrder[2].startsWith('tmp_')).toBe(true);
    const clone = state().steps[state().stepOrder[2]]!;
    expect(clone.name).toBe('Copy of b');
    expect(clone.taskSubject).toBe('subject of b');
    expect(clone.sequenceNo).toBe(3);
    expect(state().steps['c']!.sequenceNo).toBe(4);
  });

  it('should_clone_decisions_and_routes_with_fresh_ids', () => {
    state().duplicateStep('b');
    const cloneId = state().stepOrder[2];
    const clonedOutcomeIds = state().outcomeOrder[cloneId] ?? [];
    expect(clonedOutcomeIds).toHaveLength(1);
    const clonedOutcome = state().outcomes[clonedOutcomeIds[0]]!;
    expect(clonedOutcome.crmId).not.toBe('o_bc');
    expect(clonedOutcome.nextStepId).toBe('c');
    expect(clonedOutcome.applyFilter).toBe(true);
    const clonedRouteIds = state().routeOrder[clonedOutcome.crmId] ?? [];
    expect(clonedRouteIds).toHaveLength(1);
    expect(state().routes[clonedRouteIds[0]]!.filter).toContain('condition');
  });

  it('should_offset_the_clone_so_it_never_hides_its_source', () => {
    state().duplicateStep('b');
    const cloneId = state().stepOrder[2];
    expect(state().nodePositions[`step_${cloneId}`]).toEqual({ x: 448, y: 48 });
  });

  it('should_select_the_clone_and_mark_the_draft_dirty', () => {
    state().duplicateStep('b');
    expect(state().selectedId).toBe(`step_${state().stepOrder[2]}`);
    expect(state().isDirty).toBe(true);
  });
});

describe('moveStepTo', () => {
  beforeEach(loadThreeStepFlow);

  it('should_move_a_step_to_an_arbitrary_position_and_renumber', () => {
    state().moveStepTo('c', 0);
    expect(state().stepOrder).toEqual(['c', 'a', 'b']);
    expect(state().steps['c']!.sequenceNo).toBe(1);
    expect(state().steps['a']!.sequenceNo).toBe(2);
    expect(state().steps['b']!.sequenceNo).toBe(3);
  });

  it('should_clamp_a_position_beyond_the_ends', () => {
    state().moveStepTo('a', 99);
    expect(state().stepOrder).toEqual(['b', 'c', 'a']);
    state().moveStepTo('a', -5);
    expect(state().stepOrder).toEqual(['a', 'b', 'c']);
  });

  it('should_do_nothing_when_the_position_is_unchanged', () => {
    const before = state().isDirty;
    state().moveStepTo('b', 1);
    expect(state().stepOrder).toEqual(['a', 'b', 'c']);
    expect(state().isDirty).toBe(before);
  });
});
