import { describe, it, expect } from 'vitest';
import {
  emptyControlFlowFields,
  copyControlFlowFields,
  mapControlFlowFields,
  buildControlFlowBody,
  hasParallelControlFlow,
  processUsesParallelFlow,
  controlFlowSummaryText,
  CONTROL_FLOW_SELECT_COLUMNS,
} from '@/services/controlFlowFields';
import { SPLIT_TYPE_CODES, JOIN_TYPE_CODES } from '@/types/WorkflowTypes';

describe('emptyControlFlowFields', () => {
  it('should_default_to_exclusive_choice_and_no_wait', () => {
    expect(emptyControlFlowFields()).toEqual({ splitType: 'Exclusive', joinType: 'None' });
  });
});

describe('mapControlFlowFields', () => {
  it('should_read_absent_columns_as_exclusive_and_none', () => {
    expect(mapControlFlowFields({})).toEqual({ splitType: 'Exclusive', joinType: 'None' });
  });

  it('should_read_null_columns_as_exclusive_and_none', () => {
    expect(mapControlFlowFields({ qdb_splittype: null, qdb_jointype: null })).toEqual({
      splitType: 'Exclusive',
      joinType: 'None',
    });
  });

  it('should_map_parallel_split_code_to_its_union_value', () => {
    expect(mapControlFlowFields({ qdb_splittype: SPLIT_TYPE_CODES.Parallel }).splitType).toBe('Parallel');
  });

  it('should_map_and_join_code_to_its_union_value', () => {
    expect(mapControlFlowFields({ qdb_jointype: JOIN_TYPE_CODES.AndJoin }).joinType).toBe('AndJoin');
  });

  it('should_fall_back_to_exclusive_for_an_unrecognised_code', () => {
    expect(mapControlFlowFields({ qdb_splittype: 100000002 }).splitType).toBe('Exclusive');
  });
});

describe('buildControlFlowBody', () => {
  it('should_return_empty_when_the_write_does_not_touch_control_flow', () => {
    expect(buildControlFlowBody({})).toEqual({});
  });

  it('should_not_rewrite_join_type_when_only_split_type_is_supplied', () => {
    expect(buildControlFlowBody({ splitType: 'Parallel' })).toEqual({
      qdb_splittype: SPLIT_TYPE_CODES.Parallel,
    });
  });

  it('should_write_integer_codes_for_both_semantics', () => {
    expect(buildControlFlowBody({ splitType: 'Exclusive', joinType: 'AndJoin' })).toEqual({
      qdb_splittype: SPLIT_TYPE_CODES.Exclusive,
      qdb_jointype: JOIN_TYPE_CODES.AndJoin,
    });
  });
});

describe('control-flow round trip', () => {
  it('should_survive_a_write_then_read_cycle', () => {
    const written = buildControlFlowBody({ splitType: 'Parallel', joinType: 'AndJoin' });
    const readBack = mapControlFlowFields(written);
    expect(readBack).toEqual({ splitType: 'Parallel', joinType: 'AndJoin' });
  });
});

describe('copyControlFlowFields', () => {
  it('should_copy_declared_semantics', () => {
    expect(copyControlFlowFields({ splitType: 'Parallel', joinType: 'AndJoin' })).toEqual({
      splitType: 'Parallel',
      joinType: 'AndJoin',
    });
  });

  it('should_emit_defaults_for_a_source_that_declares_nothing', () => {
    expect(copyControlFlowFields({})).toEqual({ splitType: 'Exclusive', joinType: 'None' });
  });
});

describe('hasParallelControlFlow', () => {
  it('should_be_false_for_a_plain_exclusive_step', () => {
    expect(hasParallelControlFlow({ splitType: 'Exclusive', joinType: 'None' })).toBe(false);
  });

  it('should_be_true_for_a_parallel_split', () => {
    expect(hasParallelControlFlow({ splitType: 'Parallel', joinType: 'None' })).toBe(true);
  });

  it('should_be_true_for_an_and_join', () => {
    expect(hasParallelControlFlow({ splitType: 'Exclusive', joinType: 'AndJoin' })).toBe(true);
  });
});

describe('processUsesParallelFlow', () => {
  it('should_be_false_for_a_process_with_no_parallel_configuration', () => {
    expect(processUsesParallelFlow([emptyControlFlowFields(), emptyControlFlowFields()])).toBe(false);
  });

  it('should_be_true_when_any_single_step_declares_parallel_flow', () => {
    expect(
      processUsesParallelFlow([emptyControlFlowFields(), { splitType: 'Parallel', joinType: 'None' }])
    ).toBe(true);
  });

  it('should_be_false_for_an_empty_process', () => {
    expect(processUsesParallelFlow([])).toBe(false);
  });
});

describe('controlFlowSummaryText', () => {
  it('should_be_null_for_a_plain_exclusive_step', () => {
    expect(controlFlowSummaryText({ splitType: 'Exclusive', joinType: 'None' })).toBeNull();
  });

  it('should_label_a_parallel_split', () => {
    expect(controlFlowSummaryText({ splitType: 'Parallel', joinType: 'None' })).toBe('ALL');
  });

  it('should_label_an_and_join', () => {
    expect(controlFlowSummaryText({ splitType: 'Exclusive', joinType: 'AndJoin' })).toBe('WAIT ALL');
  });

  it('should_label_a_step_that_is_both_a_join_and_a_split', () => {
    expect(controlFlowSummaryText({ splitType: 'Parallel', joinType: 'AndJoin' })).toBe('ALL · WAIT ALL');
  });
});

describe('CONTROL_FLOW_SELECT_COLUMNS', () => {
  it('should_request_both_columns', () => {
    expect(CONTROL_FLOW_SELECT_COLUMNS).toBe('qdb_splittype,qdb_jointype');
  });
});
