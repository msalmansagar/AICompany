import { describe, it, expect } from 'vitest';
import {
  buildStepGraph,
  findParallelRegions,
  analyseParallelRegions,
  describeBranches,
  END_SINK,
} from '@/validators/parallelRegions';
import type { ControlFlowGraphInput, ControlFlowStep } from '@/validators/parallelRegions';
import type { WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

// --- Fixture builders -------------------------------------------------------
// A process is described as steps plus "from -> to" transitions, so each test
// reads as the graph it is about. Duplication here is deliberate: these are the
// adversarial fixtures the deadlock analysis is judged against.

type StepSpec = { id: string; split?: 'Parallel'; join?: 'AndJoin' };
type EdgeSpec = { from: string; to: string | null; filtered?: boolean };

function buildInput(stepSpecs: StepSpec[], edgeSpecs: EdgeSpec[]): ControlFlowGraphInput {
  const steps: Record<string, ControlFlowStep> = {};
  for (const spec of stepSpecs) {
    steps[spec.id] = {
      crmId: spec.id,
      name: spec.id,
      splitType: spec.split ?? 'Exclusive',
      joinType: spec.join ?? 'None',
    };
  }

  const outcomes: Record<string, WorkflowOutcome> = {};
  const routes: Record<string, WorkflowRoute> = {};
  edgeSpecs.forEach((edge, index) => {
    const outcomeId = `o${index}`;
    outcomes[outcomeId] = {
      crmId: outcomeId,
      name: `${edge.from}->${edge.to ?? 'End'}`,
      sequenceNumber: index,
      applyFilter: edge.filtered ?? false,
      stepId: edge.from,
      nextStepId: edge.filtered ? null : edge.to,
    };
    if (edge.filtered) {
      routes[`r${index}`] = {
        crmId: `r${index}`,
        name: `route${index}`,
        subject: '',
        sequenceNumber: index,
        filter: '<fetch/>',
        outcomeId,
        nextStepId: edge.to,
      };
    }
  });

  return { steps, outcomes, routes };
}

function codesOf(input: ControlFlowGraphInput): string[] {
  return analyseParallelRegions(input).map((finding) => finding.code);
}

/** S → (A, B) → J → End. The canonical well-formed parallel region. */
function wellFormedRegion(): ControlFlowGraphInput {
  return buildInput(
    [{ id: 'S', split: 'Parallel' }, { id: 'A' }, { id: 'B' }, { id: 'J', join: 'AndJoin' }],
    [
      { from: 'S', to: 'A' },
      { from: 'S', to: 'B' },
      { from: 'A', to: 'J' },
      { from: 'B', to: 'J' },
      { from: 'J', to: null },
    ]
  );
}

// --- buildStepGraph ---------------------------------------------------------

describe('buildStepGraph', () => {
  it('should_route_a_terminal_outcome_to_the_end_sink', () => {
    const graph = buildStepGraph(buildInput([{ id: 'A' }], [{ from: 'A', to: null }]));
    expect(graph.successors('A')).toEqual([END_SINK]);
  });

  it('should_take_edges_from_the_routes_of_a_filtered_outcome', () => {
    const input = buildInput(
      [{ id: 'A' }, { id: 'B' }],
      [{ from: 'A', to: 'B', filtered: true }]
    );
    expect(buildStepGraph(input).successors('A')).toEqual(['B']);
  });

  it('should_ignore_an_outcome_pointing_at_a_step_that_no_longer_exists', () => {
    const input = buildInput([{ id: 'A' }], [{ from: 'A', to: 'ghost' }]);
    expect(buildStepGraph(input).successors('A')).toEqual([]);
  });
});

// --- Region discovery -------------------------------------------------------

describe('findParallelRegions', () => {
  it('should_find_nothing_in_a_process_with_no_parallel_configuration', () => {
    const input = buildInput([{ id: 'A' }, { id: 'B' }], [{ from: 'A', to: 'B' }, { from: 'B', to: null }]);
    expect(findParallelRegions(input)).toEqual([]);
  });

  it('should_match_the_split_to_its_and_join', () => {
    const [region] = findParallelRegions(wellFormedRegion());
    expect(region.joinStepId).toBe('J');
  });

  it('should_list_every_branch_entry', () => {
    const [region] = findParallelRegions(wellFormedRegion());
    expect(region.branchEntryIds.sort()).toEqual(['A', 'B']);
  });

  it('should_exclude_the_split_and_the_join_from_the_region_interior', () => {
    const [region] = findParallelRegions(wellFormedRegion());
    expect(region.interiorStepIds.sort()).toEqual(['A', 'B']);
  });

  it('should_match_the_nearest_and_join_when_two_are_downstream', () => {
    const input = buildInput(
      [
        { id: 'S', split: 'Parallel' },
        { id: 'A' },
        { id: 'B' },
        { id: 'J1', join: 'AndJoin' },
        { id: 'J2', join: 'AndJoin' },
      ],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: 'J1' },
        { from: 'B', to: 'J1' },
        { from: 'J1', to: 'J2' },
        { from: 'J2', to: null },
      ]
    );
    expect(findParallelRegions(input)[0].joinStepId).toBe('J1');
  });

  it('should_report_no_join_when_the_branches_never_converge', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A' }, { id: 'B' }],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: null },
        { from: 'B', to: null },
      ]
    );
    expect(findParallelRegions(input)[0].joinStepId).toBeNull();
  });
});

// --- The well-formed case must stay clean -----------------------------------

describe('analyseParallelRegions — well-formed models', () => {
  it('should_report_nothing_for_a_matched_split_and_join', () => {
    expect(analyseParallelRegions(wellFormedRegion())).toEqual([]);
  });

  it('should_report_nothing_for_a_process_with_no_parallel_configuration', () => {
    const input = buildInput(
      [{ id: 'A' }, { id: 'B' }],
      [{ from: 'A', to: 'B' }, { from: 'B', to: null }]
    );
    expect(analyseParallelRegions(input)).toEqual([]);
  });

  it('should_leave_a_loop_outside_any_parallel_region_alone', () => {
    const input = buildInput(
      [{ id: 'A' }, { id: 'B' }],
      [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }, { from: 'B', to: null }]
    );
    expect(analyseParallelRegions(input)).toEqual([]);
  });

  it('should_accept_three_branches', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'J', join: 'AndJoin' }],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'S', to: 'C' },
        { from: 'A', to: 'J' },
        { from: 'B', to: 'J' },
        { from: 'C', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    expect(analyseParallelRegions(input)).toEqual([]);
  });

  it('should_accept_a_multi_step_branch', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A1' }, { id: 'A2' }, { id: 'B' }, { id: 'J', join: 'AndJoin' }],
      [
        { from: 'S', to: 'A1' },
        { from: 'S', to: 'B' },
        { from: 'A1', to: 'A2' },
        { from: 'A2', to: 'J' },
        { from: 'B', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    expect(analyseParallelRegions(input)).toEqual([]);
  });

  it('should_accept_an_exclusive_choice_inside_a_branch_when_both_arms_reach_the_join', () => {
    const input = buildInput(
      [
        { id: 'S', split: 'Parallel' },
        { id: 'A' },
        { id: 'A1' },
        { id: 'A2' },
        { id: 'B' },
        { id: 'J', join: 'AndJoin' },
      ],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: 'A1' },
        { from: 'A', to: 'A2' },
        { from: 'A1', to: 'J' },
        { from: 'A2', to: 'J' },
        { from: 'B', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    expect(analyseParallelRegions(input)).toEqual([]);
  });
});

// --- Defects ----------------------------------------------------------------

describe('analyseParallelRegions — structural defects', () => {
  it('should_flag_a_parallel_split_with_a_single_branch', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A' }],
      [{ from: 'S', to: 'A' }, { from: 'A', to: null }]
    );
    expect(codesOf(input)).toEqual(['PARALLEL_SPLIT_SINGLE_BRANCH']);
  });

  it('should_flag_a_parallel_split_with_no_branches_at_all', () => {
    const input = buildInput([{ id: 'S', split: 'Parallel' }], []);
    expect(codesOf(input)).toEqual(['PARALLEL_SPLIT_SINGLE_BRANCH']);
  });

  it('should_flag_branches_that_never_converge', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A' }, { id: 'B' }],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: null },
        { from: 'B', to: null },
      ]
    );
    expect(codesOf(input)).toEqual(['UNMATCHED_PARALLEL_SPLIT']);
  });

  it('should_flag_branches_that_converge_on_a_step_not_declared_as_a_join', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A' }, { id: 'B' }, { id: 'M' }],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: 'M' },
        { from: 'B', to: 'M' },
        { from: 'M', to: null },
      ]
    );
    expect(codesOf(input)).toEqual(['UNMATCHED_PARALLEL_SPLIT']);
  });

  it('should_flag_an_and_join_that_no_split_feeds', () => {
    const input = buildInput(
      [{ id: 'A' }, { id: 'J', join: 'AndJoin' }],
      [{ from: 'A', to: 'J' }, { from: 'J', to: null }]
    );
    expect(codesOf(input)).toEqual(['ORPHAN_AND_JOIN']);
  });

  it('should_flag_a_branch_that_can_end_without_reaching_the_join', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A' }, { id: 'B' }, { id: 'J', join: 'AndJoin' }],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: 'J' },
        { from: 'A', to: null },
        { from: 'B', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    expect(codesOf(input)).toContain('PARALLEL_JOIN_DEADLOCK');
  });

  it('should_explain_a_starvation_deadlock_in_terms_of_the_end_node', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A' }, { id: 'B' }, { id: 'J', join: 'AndJoin' }],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: 'J' },
        { from: 'A', to: null },
        { from: 'B', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    const deadlock = analyseParallelRegions(input).find((f) => f.code === 'PARALLEL_JOIN_DEADLOCK');
    expect(deadlock?.detail).toContain('End node');
  });

  it('should_flag_a_join_reachable_without_passing_through_the_split', () => {
    const input = buildInput(
      [
        { id: 'X' },
        { id: 'S', split: 'Parallel' },
        { id: 'A' },
        { id: 'B' },
        { id: 'J', join: 'AndJoin' },
      ],
      [
        { from: 'X', to: 'S' },
        { from: 'X', to: 'J' },
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: 'J' },
        { from: 'B', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    const deadlock = analyseParallelRegions(input).find((f) => f.code === 'PARALLEL_JOIN_DEADLOCK');
    expect(deadlock?.affectedStepIds).toContain('X');
  });

  it('should_flag_a_loop_inside_a_parallel_region', () => {
    const input = buildInput(
      [
        { id: 'S', split: 'Parallel' },
        { id: 'A' },
        { id: 'C' },
        { id: 'B' },
        { id: 'J', join: 'AndJoin' },
      ],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'C', to: 'A' },
        { from: 'C', to: 'J' },
        { from: 'B', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    expect(codesOf(input)).toContain('PARALLEL_LOOP_IN_REGION');
  });

  it('should_name_both_loop_members_when_it_flags_a_loop_in_a_region', () => {
    const input = buildInput(
      [
        { id: 'S', split: 'Parallel' },
        { id: 'A' },
        { id: 'C' },
        { id: 'B' },
        { id: 'J', join: 'AndJoin' },
      ],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'C', to: 'A' },
        { from: 'C', to: 'J' },
        { from: 'B', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    const loop = analyseParallelRegions(input).find((f) => f.code === 'PARALLEL_LOOP_IN_REGION');
    expect(loop?.affectedStepIds?.sort()).toEqual(['A', 'C']);
  });

  it('should_flag_every_defective_split_when_a_process_has_more_than_one', () => {
    const input = buildInput(
      [
        { id: 'S1', split: 'Parallel' },
        { id: 'S2', split: 'Parallel' },
        { id: 'A' },
      ],
      [
        { from: 'S1', to: 'A' },
        { from: 'A', to: 'S2' },
        { from: 'S2', to: null },
      ]
    );
    expect(codesOf(input)).toEqual(['PARALLEL_SPLIT_SINGLE_BRANCH', 'PARALLEL_SPLIT_SINGLE_BRANCH']);
  });
});

// --- Branch description (feeds simulation) ----------------------------------

describe('describeBranches', () => {
  it('should_list_one_branch_per_split_successor', () => {
    const input = wellFormedRegion();
    const [region] = findParallelRegions(input);
    expect(describeBranches(input, region)).toHaveLength(2);
  });

  it('should_exclude_the_join_from_every_branch', () => {
    const input = wellFormedRegion();
    const [region] = findParallelRegions(input);
    const all = describeBranches(input, region).flatMap((branch) => branch.stepIds);
    expect(all).not.toContain('J');
  });

  it('should_never_include_the_synthetic_end_sink', () => {
    const input = wellFormedRegion();
    const [region] = findParallelRegions(input);
    const all = describeBranches(input, region).flatMap((branch) => branch.stepIds);
    expect(all).not.toContain(END_SINK);
  });

  it('should_carry_every_step_of_a_multi_step_branch', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A1' }, { id: 'A2' }, { id: 'B' }, { id: 'J', join: 'AndJoin' }],
      [
        { from: 'S', to: 'A1' },
        { from: 'S', to: 'B' },
        { from: 'A1', to: 'A2' },
        { from: 'A2', to: 'J' },
        { from: 'B', to: 'J' },
        { from: 'J', to: null },
      ]
    );
    const [region] = findParallelRegions(input);
    const longBranch = describeBranches(input, region).find((b) => b.entryStepId === 'A1');
    expect(longBranch?.stepIds.sort()).toEqual(['A1', 'A2']);
  });

  it('should_describe_a_split_that_has_no_join_rather_than_returning_nothing', () => {
    const input = buildInput(
      [{ id: 'S', split: 'Parallel' }, { id: 'A' }, { id: 'B' }],
      [
        { from: 'S', to: 'A' },
        { from: 'S', to: 'B' },
        { from: 'A', to: null },
        { from: 'B', to: null },
      ]
    );
    const [region] = findParallelRegions(input);
    expect(describeBranches(input, region).map((b) => b.entryStepId).sort()).toEqual(['A', 'B']);
  });
});

// --- Nested regions ---------------------------------------------------------

describe('analyseParallelRegions — nested regions', () => {
  it('should_accept_a_parallel_region_nested_inside_a_branch_of_another', () => {
    const input = buildInput(
      [
        { id: 'S1', split: 'Parallel' },
        { id: 'S2', split: 'Parallel' },
        { id: 'A' },
        { id: 'N1' },
        { id: 'N2' },
        { id: 'J2', join: 'AndJoin' },
        { id: 'J1', join: 'AndJoin' },
      ],
      [
        { from: 'S1', to: 'S2' },
        { from: 'S1', to: 'A' },
        { from: 'S2', to: 'N1' },
        { from: 'S2', to: 'N2' },
        { from: 'N1', to: 'J2' },
        { from: 'N2', to: 'J2' },
        { from: 'J2', to: 'J1' },
        { from: 'A', to: 'J1' },
        { from: 'J1', to: null },
      ]
    );
    expect(analyseParallelRegions(input)).toEqual([]);
  });

  it('should_match_each_nested_split_to_its_own_join', () => {
    const input = buildInput(
      [
        { id: 'S1', split: 'Parallel' },
        { id: 'S2', split: 'Parallel' },
        { id: 'A' },
        { id: 'N1' },
        { id: 'N2' },
        { id: 'J2', join: 'AndJoin' },
        { id: 'J1', join: 'AndJoin' },
      ],
      [
        { from: 'S1', to: 'S2' },
        { from: 'S1', to: 'A' },
        { from: 'S2', to: 'N1' },
        { from: 'S2', to: 'N2' },
        { from: 'N1', to: 'J2' },
        { from: 'N2', to: 'J2' },
        { from: 'J2', to: 'J1' },
        { from: 'A', to: 'J1' },
        { from: 'J1', to: null },
      ]
    );
    const joins = findParallelRegions(input).map((r) => `${r.splitStepId}->${r.joinStepId}`).sort();
    expect(joins).toEqual(['S1->J1', 'S2->J2']);
  });
});
