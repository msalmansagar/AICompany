import { describe, it, expect } from 'vitest';
import {
  ASSIGN_TO_CODES,
  ASSIGNMENT_SELECT_COLUMNS,
  assigneeIsMissing,
  buildAssignmentBody,
  emptyAssignmentFields,
  mapAssignTo,
  mapAssignmentFields,
} from '@/services/taskAssignment';

const FMT = '@OData.Community.Display.V1.FormattedValue';

describe('assignment codes', () => {
  it('should_use_the_orgs_own_value_for_round_robin', () => {
    expect(ASSIGN_TO_CODES.roundRobin).toBe(100000004);
  });

  it('should_not_reuse_the_team_code_for_round_robin', () => {
    expect(ASSIGN_TO_CODES.roundRobin).not.toBe(ASSIGN_TO_CODES.team);
  });

  it('should_use_the_orgs_own_value_for_read_from_parent', () => {
    expect(ASSIGN_TO_CODES.readFromParent).toBe(100000003);
  });
});

describe('mapAssignTo', () => {
  it('should_read_round_robin_from_the_engines_own_code', () => {
    expect(mapAssignTo(100000004, false)).toBe('roundRobin');
  });

  it('should_read_round_robin_when_a_legacy_row_carries_the_team_code_with_the_flag', () => {
    expect(mapAssignTo(100000002, true)).toBe('roundRobin');
  });

  it('should_read_team_when_the_team_code_carries_no_round_robin_flag', () => {
    expect(mapAssignTo(100000002, false)).toBe('team');
  });

  it('should_read_read_from_parent', () => {
    expect(mapAssignTo(100000003, false)).toBe('readFromParent');
  });

  it('should_fall_back_to_user_for_an_unmapped_code', () => {
    expect(mapAssignTo(100000005, false)).toBe('user');
  });
});

describe('buildAssignmentBody', () => {
  it('should_write_the_engines_round_robin_code', () => {
    expect(buildAssignmentBody({ assignTo: 'roundRobin' })['qdb_task_assign_to']).toBe(100000004);
  });

  it('should_keep_setting_the_round_robin_flag_the_engine_checks_first', () => {
    expect(buildAssignmentBody({ assignTo: 'roundRobin' })['qdb_enableroundrobin']).toBe(true);
  });

  it('should_clear_the_round_robin_flag_for_any_other_mode', () => {
    expect(buildAssignmentBody({ assignTo: 'team' })['qdb_enableroundrobin']).toBe(false);
  });

  it('should_write_nothing_when_the_mode_is_untouched', () => {
    expect(buildAssignmentBody({})).toEqual({});
  });
});

describe('mapAssignmentFields', () => {
  it('should_round_trip_a_round_robin_step_saved_under_the_legacy_encoding', () => {
    const mapped = mapAssignmentFields({
      qdb_task_assign_to: 100000002,
      qdb_enableroundrobin: true,
      _qdb_roundrobinteam_value: 'rr-team-id',
      [`_qdb_roundrobinteam_value${FMT}`]: 'Credit Pool',
    });
    expect(mapped.assignTo).toBe('roundRobin');
    expect(mapped.roundRobinTeamId).toBe('rr-team-id');
  });

  it('should_read_the_three_read_from_parent_lookups', () => {
    const mapped = mapAssignmentFields({
      qdb_task_assign_to: 100000003,
      _qdb_assignto_parententity_value: 'entity-id',
      _qdb_assignto_parentfield_value: 'field-id',
      _qdb_assignto_user_mapping_value: 'mapping-id',
    });
    expect(mapped.parentAssignEntityId).toBe('entity-id');
    expect(mapped.parentAssignFieldId).toBe('field-id');
    expect(mapped.parentAssignUserFieldId).toBe('mapping-id');
  });

  it('should_default_a_row_with_no_assignment_column_to_user', () => {
    expect(mapAssignmentFields({}).assignTo).toBe('user');
  });
});

describe('ASSIGNMENT_SELECT_COLUMNS', () => {
  it('should_request_the_flag_the_legacy_encoding_needs_to_be_read_back', () => {
    expect(ASSIGNMENT_SELECT_COLUMNS).toContain('qdb_enableroundrobin');
  });

  it('should_request_the_read_from_parent_lookups', () => {
    expect(ASSIGNMENT_SELECT_COLUMNS).toContain('_qdb_assignto_user_mapping_value');
  });
});

describe('assigneeIsMissing', () => {
  it('should_flag_a_team_step_with_no_team_chosen', () => {
    expect(assigneeIsMissing({ ...emptyAssignmentFields(), assignTo: 'team' })).toBe(true);
  });

  it('should_accept_a_team_step_with_a_team_chosen', () => {
    expect(assigneeIsMissing({ ...emptyAssignmentFields(), assignTo: 'team', teamId: 'a' })).toBe(false);
  });

  it('should_flag_a_read_from_parent_step_missing_any_of_its_three_lookups', () => {
    const partial = {
      ...emptyAssignmentFields(),
      assignTo: 'readFromParent' as const,
      parentAssignEntityId: 'e',
      parentAssignFieldId: 'f',
    };
    expect(assigneeIsMissing(partial)).toBe(true);
  });

  it('should_accept_a_read_from_parent_step_with_all_three_lookups', () => {
    const complete = {
      ...emptyAssignmentFields(),
      assignTo: 'readFromParent' as const,
      parentAssignEntityId: 'e',
      parentAssignFieldId: 'f',
      parentAssignUserFieldId: 'u',
    };
    expect(assigneeIsMissing(complete)).toBe(false);
  });
});
