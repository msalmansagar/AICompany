import { describe, it, expect } from 'vitest';
import {
  mapSlaFields,
  buildSlaBody,
  activeEscalationLookup,
  emptySlaFields,
  slaSummaryText,
  buildEscalationBindPatches,
} from '@/services/slaStepFields';
import {
  SLA_DURATION_UNIT_CODES,
  SLA_DURATION_UNIT_FROM_CODE,
  SLA_BASIS_CODES,
  SLA_BASIS_FROM_CODE,
  ESCALATION_ACTION_CODES,
  ESCALATION_ACTION_FROM_CODE,
  ESCALATION_TARGET_TYPE_CODES,
  ESCALATION_TARGET_TYPE_FROM_CODE,
} from '@/types/WorkflowTypes';

describe('buildSlaBody', () => {
  it('should_return_empty_when_slaEnabled_is_undefined', () => {
    expect(buildSlaBody({})).toEqual({});
  });

  it('should_write_explicit_nulls_for_all_scalar_fields_when_disabled', () => {
    const body = buildSlaBody({ slaEnabled: false });
    expect(body).toEqual({
      qdb_sla_enabled: false,
      qdb_sla_duration: null,
      qdb_sla_duration_unit: null,
      qdb_sla_basis: null,
      qdb_sla_warning_pct: null,
      qdb_escalation_enabled: false,
      qdb_escalation_action: null,
      qdb_escalation_target_type: null,
    });
  });

  it('should_map_enabled_config_to_dataverse_field_names_and_integer_codes', () => {
    const body = buildSlaBody({
      slaEnabled: true,
      slaDuration: 3,
      slaDurationUnit: 'BusinessDays',
      slaBasis: 'TaskAssigned',
      slaWarningPct: 80,
      escalationEnabled: true,
      escalationAction: 'ReassignAndNotify',
      escalationTargetType: 'Role',
    });
    expect(body['qdb_sla_enabled']).toBe(true);
    expect(body['qdb_sla_duration']).toBe(3);
    expect(body['qdb_sla_duration_unit']).toBe(SLA_DURATION_UNIT_CODES.BusinessDays);
    expect(body['qdb_sla_basis']).toBe(SLA_BASIS_CODES.TaskAssigned);
    expect(body['qdb_sla_warning_pct']).toBe(80);
    expect(body['qdb_escalation_action']).toBe(ESCALATION_ACTION_CODES.ReassignAndNotify);
    expect(body['qdb_escalation_target_type']).toBe(ESCALATION_TARGET_TYPE_CODES.Role);
  });

  it('should_null_escalation_option_fields_when_escalation_off', () => {
    const body = buildSlaBody({ slaEnabled: true, escalationEnabled: false });
    expect(body['qdb_escalation_action']).toBeNull();
    expect(body['qdb_escalation_target_type']).toBeNull();
  });

  it('should_pass_a_null_warning_pct_through', () => {
    expect(buildSlaBody({ slaEnabled: true, slaWarningPct: null })['qdb_sla_warning_pct']).toBeNull();
  });
});

describe('mapSlaFields', () => {
  it('should_default_to_disabled_and_null_when_raw_is_empty', () => {
    expect(mapSlaFields({})).toEqual(emptySlaFields());
  });

  it('should_map_raw_option_codes_to_type_union_values', () => {
    const raw = {
      qdb_sla_enabled: true,
      qdb_sla_duration: 5,
      qdb_sla_duration_unit: SLA_DURATION_UNIT_CODES.Hours,
      qdb_sla_basis: SLA_BASIS_CODES.TaskCreated,
      qdb_escalation_enabled: true,
      qdb_escalation_action: ESCALATION_ACTION_CODES.Notify,
      qdb_escalation_target_type: ESCALATION_TARGET_TYPE_CODES.SpecificUser,
      _qdb_escalationuser_value: 'user-guid',
    };
    const fields = mapSlaFields(raw);
    expect(fields.slaEnabled).toBe(true);
    expect(fields.slaDuration).toBe(5);
    expect(fields.slaDurationUnit).toBe('Hours');
    expect(fields.slaBasis).toBe('TaskCreated');
    expect(fields.escalationAction).toBe('Notify');
    expect(fields.escalationTargetType).toBe('SpecificUser');
    expect(fields.escalationUserId).toBe('user-guid');
  });
});

describe('activeEscalationLookup', () => {
  const base = { slaEnabled: true, escalationEnabled: true } as const;

  it('should_return_the_user_lookup_for_specific_user', () => {
    const result = activeEscalationLookup({ ...base, escalationTargetType: 'SpecificUser', escalationUserId: 'u1' });
    expect(result).toEqual({ attribute: 'qdb_escalationuser', id: 'u1' });
  });

  it('should_return_the_team_lookup_for_specific_team', () => {
    const result = activeEscalationLookup({ ...base, escalationTargetType: 'SpecificTeam', escalationTeamId: 't1' });
    expect(result).toEqual({ attribute: 'qdb_escalationteam', id: 't1' });
  });

  it('should_return_the_role_lookup_for_role', () => {
    const result = activeEscalationLookup({ ...base, escalationTargetType: 'Role', escalationRoleId: 'r1' });
    expect(result).toEqual({ attribute: 'qdb_escalationrole', id: 'r1' });
  });

  it('should_return_null_for_manager_of_assignee', () => {
    expect(activeEscalationLookup({ ...base, escalationTargetType: 'ManagerOfAssignee' })).toBeNull();
  });

  it('should_return_null_when_sla_or_escalation_is_off', () => {
    expect(activeEscalationLookup({ slaEnabled: false, escalationEnabled: true })).toBeNull();
    expect(activeEscalationLookup({ slaEnabled: true, escalationEnabled: false })).toBeNull();
  });
});

describe('slaSummaryText', () => {
  it('should_return_null_when_sla_is_off', () => {
    expect(slaSummaryText({ slaEnabled: false, slaDuration: 2, slaDurationUnit: 'Hours', escalationEnabled: false, escalationAction: null })).toBeNull();
  });

  it('should_summarise_sla_without_escalation', () => {
    expect(slaSummaryText({ slaEnabled: true, slaDuration: 2, slaDurationUnit: 'BusinessDays', escalationEnabled: false, escalationAction: null }))
      .toBe('SLA: 2 Business Days');
  });

  it('should_append_the_escalation_action_when_enabled', () => {
    expect(slaSummaryText({ slaEnabled: true, slaDuration: 4, slaDurationUnit: 'Hours', escalationEnabled: true, escalationAction: 'Notify' }))
      .toBe('SLA: 4 Hours | Notify');
  });

  it('should_render_a_question_mark_when_duration_is_null', () => {
    expect(slaSummaryText({ slaEnabled: true, slaDuration: null, slaDurationUnit: 'BusinessDays', escalationEnabled: false, escalationAction: null }))
      .toBe('SLA: ? Business Days');
  });
});

describe('buildEscalationBindPatches', () => {
  const resolveNav = async (_entity: string, attribute: string) => attribute;
  const sets = { user: 'systemusers', team: 'teams', role: 'qdb_roles' };

  it('should_return_empty_and_not_resolve_when_slaEnabled_is_undefined', async () => {
    let calls = 0;
    const spy = async (_e: string, a: string) => { calls++; return a; };
    const patches = await buildEscalationBindPatches({}, spy, 'qdb_work_item_steps', sets);
    expect(patches).toEqual({});
    expect(calls).toBe(0);
  });

  it('should_null_all_three_lookups_when_sla_disabled', async () => {
    const patches = await buildEscalationBindPatches({ slaEnabled: false }, resolveNav, 'E', sets);
    expect(patches).toEqual({
      'qdb_escalationuser@odata.bind': null,
      'qdb_escalationteam@odata.bind': null,
      'qdb_escalationrole@odata.bind': null,
    });
  });

  it('should_bind_the_active_user_and_null_the_others', async () => {
    const patches = await buildEscalationBindPatches(
      { slaEnabled: true, escalationEnabled: true, escalationTargetType: 'SpecificUser', escalationUserId: 'u1' },
      resolveNav, 'E', sets
    );
    expect(patches['qdb_escalationuser@odata.bind']).toBe('/systemusers(u1)');
    expect(patches['qdb_escalationteam@odata.bind']).toBeNull();
    expect(patches['qdb_escalationrole@odata.bind']).toBeNull();
  });

  it('should_skip_lookups_whose_navprop_resolves_to_empty_string', async () => {
    const patches = await buildEscalationBindPatches({ slaEnabled: false }, async () => '', 'E', sets);
    expect(patches).toEqual({});
  });
});

describe('option-set code maps round-trip', () => {
  it.each([
    ['SLADurationUnit', SLA_DURATION_UNIT_CODES, SLA_DURATION_UNIT_FROM_CODE],
    ['SLABasis', SLA_BASIS_CODES, SLA_BASIS_FROM_CODE],
    ['EscalationAction', ESCALATION_ACTION_CODES, ESCALATION_ACTION_FROM_CODE],
    ['EscalationTargetType', ESCALATION_TARGET_TYPE_CODES, ESCALATION_TARGET_TYPE_FROM_CODE],
  ])('should_be_identity_for_%s', (_name, forward, inverse) => {
    for (const key of Object.keys(forward)) {
      expect(inverse[(forward as Record<string, number>)[key]]).toBe(key);
    }
  });
});
