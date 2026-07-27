import { describe, it, expect } from 'vitest';
import {
  emptyBranchFields,
  emptyOutcomeConcurrency,
  mapBranchFields,
  mapOutcomeConcurrency,
  buildBranchBody,
  buildOutcomeConcurrencyBody,
  buildParentStepBindPatch,
  isBranchStep,
  branchChildrenOf,
  branchSummaryText,
  fanOutSummaryText,
  BRANCH_SELECT_COLUMNS,
  OUTCOME_CONCURRENCY_SELECT_COLUMNS,
} from '@/services/branchFields';

const FMT = '@OData.Community.Display.V1.FormattedValue';

describe('emptyBranchFields', () => {
  it('should_default_to_an_ordinary_sequential_step', () => {
    expect(emptyBranchFields()).toEqual({
      parentStepId: null,
      parentStepName: null,
      applyBranchFilter: false,
      branchFilter: '',
    });
  });
});

describe('mapBranchFields', () => {
  it('should_read_an_absent_parent_as_not_a_branch', () => {
    expect(mapBranchFields({}).parentStepId).toBeNull();
  });

  it('should_read_the_parent_lookup_and_its_display_name', () => {
    const mapped = mapBranchFields({
      '_qdb_parentworkitemstep_value': 'parent-guid',
      [`_qdb_parentworkitemstep_value${FMT}`]: 'Credit Check',
    });
    expect(mapped.parentStepId).toBe('parent-guid');
    expect(mapped.parentStepName).toBe('Credit Check');
  });

  it('should_read_the_branch_condition', () => {
    const mapped = mapBranchFields({ qdb_applyfilter: true, qdb_filter: '<fetch/>' });
    expect(mapped.applyBranchFilter).toBe(true);
    expect(mapped.branchFilter).toBe('<fetch/>');
  });

  it('should_read_a_null_filter_as_an_empty_string', () => {
    expect(mapBranchFields({ qdb_filter: null }).branchFilter).toBe('');
  });
});

describe('mapOutcomeConcurrency', () => {
  it('should_default_both_flags_to_false', () => {
    expect(mapOutcomeConcurrency({})).toEqual({
      checkParallelTasks: false,
      updateParallelTaskRef: false,
    });
  });

  it('should_read_the_join_guard', () => {
    expect(mapOutcomeConcurrency({ qdb_checkparalleltasks: true }).checkParallelTasks).toBe(true);
  });
});

describe('buildBranchBody', () => {
  it('should_return_empty_when_the_write_does_not_touch_branching', () => {
    expect(buildBranchBody({})).toEqual({});
  });

  it('should_write_the_condition_flag_and_filter', () => {
    expect(buildBranchBody({ applyBranchFilter: true, branchFilter: '<fetch/>' })).toEqual({
      qdb_applyfilter: true,
      qdb_filter: '<fetch/>',
    });
  });

  it('should_clear_an_emptied_filter_with_an_explicit_null', () => {
    expect(buildBranchBody({ branchFilter: '' })).toEqual({ qdb_filter: null });
  });
});

describe('buildOutcomeConcurrencyBody', () => {
  it('should_return_empty_when_the_write_does_not_touch_concurrency', () => {
    expect(buildOutcomeConcurrencyBody({})).toEqual({});
  });

  it('should_write_only_the_flag_supplied', () => {
    expect(buildOutcomeConcurrencyBody({ checkParallelTasks: true })).toEqual({
      qdb_checkparalleltasks: true,
    });
  });
});

describe('buildParentStepBindPatch', () => {
  const resolveNavProp = async () => 'qdb_ParentWorkItemStep';

  it('should_return_empty_when_the_parent_is_not_part_of_the_write', async () => {
    expect(await buildParentStepBindPatch({}, resolveNavProp, 'e', 'steps')).toEqual({});
  });

  it('should_bind_the_parent_step', async () => {
    const patch = await buildParentStepBindPatch({ parentStepId: 'p1' }, resolveNavProp, 'e', 'steps');
    expect(patch).toEqual({ 'qdb_ParentWorkItemStep@odata.bind': '/steps(p1)' });
  });

  it('should_clear_the_parent_through_the_nav_prop_not_the_value_column', async () => {
    const patch = await buildParentStepBindPatch({ parentStepId: null }, resolveNavProp, 'e', 'steps');
    expect(patch).toEqual({ 'qdb_ParentWorkItemStep@odata.bind': null });
  });
});

describe('isBranchStep', () => {
  it('should_be_false_without_a_parent', () => {
    expect(isBranchStep({ parentStepId: null })).toBe(false);
  });

  it('should_be_true_with_a_parent', () => {
    expect(isBranchStep({ parentStepId: 'p1' })).toBe(true);
  });
});

describe('branchChildrenOf', () => {
  const steps = {
    p: { crmId: 'p', parentStepId: null, sequenceNo: 1 },
    b: { crmId: 'b', parentStepId: 'p', sequenceNo: 3 },
    a: { crmId: 'a', parentStepId: 'p', sequenceNo: 2 },
    x: { crmId: 'x', parentStepId: null, sequenceNo: 4 },
  };

  it('should_find_every_child_of_a_parent', () => {
    expect(branchChildrenOf('p', steps)).toHaveLength(2);
  });

  it('should_return_children_in_sequence_order', () => {
    expect(branchChildrenOf('p', steps)).toEqual(['a', 'b']);
  });

  it('should_return_nothing_for_a_step_with_no_branches', () => {
    expect(branchChildrenOf('x', steps)).toEqual([]);
  });
});

describe('branchSummaryText', () => {
  it('should_be_null_for_an_ordinary_step', () => {
    expect(branchSummaryText({ parentStepId: null, applyBranchFilter: false })).toBeNull();
  });

  it('should_label_an_unconditional_branch', () => {
    expect(branchSummaryText({ parentStepId: 'p', applyBranchFilter: false })).toBe('BRANCH');
  });

  it('should_mark_a_conditional_branch_differently', () => {
    expect(branchSummaryText({ parentStepId: 'p', applyBranchFilter: true })).toBe('BRANCH · IF');
  });
});

describe('fanOutSummaryText', () => {
  it('should_be_null_when_no_step_runs_alongside', () => {
    expect(fanOutSummaryText(0)).toBeNull();
  });

  it('should_count_the_concurrent_steps', () => {
    expect(fanOutSummaryText(3)).toBe('⧉ 3 CONCURRENT');
  });
});

describe('select columns', () => {
  it('should_request_the_engine_branch_columns', () => {
    expect(BRANCH_SELECT_COLUMNS).toBe('_qdb_parentworkitemstep_value,qdb_applyfilter,qdb_filter');
  });

  it('should_request_the_engine_outcome_concurrency_columns', () => {
    expect(OUTCOME_CONCURRENCY_SELECT_COLUMNS).toBe('qdb_checkparalleltasks,qdb_updateparalleltaskref');
  });

  it('should_never_request_the_retired_dp1_columns', () => {
    const all = `${BRANCH_SELECT_COLUMNS},${OUTCOME_CONCURRENCY_SELECT_COLUMNS}`;
    expect(all).not.toContain('qdb_splittype');
    expect(all).not.toContain('qdb_jointype');
  });
});

describe('outcome concurrency defaults', () => {
  it('should_default_to_no_guard_and_no_carry_over', () => {
    expect(emptyOutcomeConcurrency()).toEqual({
      checkParallelTasks: false,
      updateParallelTaskRef: false,
    });
  });
});
