import { describe, it, expect } from 'vitest';
import { validateSlaConfig, type SlaConfigInput } from '@/validators/slaValidator';

/** A fully-valid SLA + escalation config; individual tests override one field. */
function validConfig(overrides: Partial<SlaConfigInput> = {}): SlaConfigInput {
  return {
    slaEnabled: true,
    slaDuration: 2,
    slaDurationUnit: 'BusinessDays',
    slaBasis: 'TaskCreated',
    slaWarningPct: 75,
    escalationEnabled: true,
    escalationAction: 'Notify',
    escalationTargetType: 'SpecificUser',
    escalationUserId: 'user-guid',
    escalationTeamId: null,
    escalationRoleId: null,
    ...overrides,
  };
}

describe('validateSlaConfig — SLA disabled', () => {
  it('should_return_no_errors_when_sla_is_off', () => {
    const errors = validateSlaConfig({
      slaEnabled: false,
      slaDuration: null,
      slaDurationUnit: null,
      slaBasis: null,
      slaWarningPct: null,
      escalationEnabled: false,
      escalationAction: null,
      escalationTargetType: null,
      escalationUserId: null,
      escalationTeamId: null,
      escalationRoleId: null,
    });
    expect(errors).toEqual({});
  });

  it('should_flag_escalation_enabled_when_sla_is_off', () => {
    const errors = validateSlaConfig(validConfig({ slaEnabled: false }));
    expect(errors.escalationEnabled).toBeDefined();
  });
});

describe('validateSlaConfig — happy path', () => {
  it('should_return_no_errors_for_a_fully_valid_config', () => {
    expect(validateSlaConfig(validConfig())).toEqual({});
  });

  it('should_allow_a_null_warning_pct', () => {
    expect(validateSlaConfig(validConfig({ slaWarningPct: null }))).toEqual({});
  });

  it('should_not_require_a_lookup_for_manager_of_assignee', () => {
    const errors = validateSlaConfig(
      validConfig({ escalationTargetType: 'ManagerOfAssignee', escalationUserId: null })
    );
    expect(errors).toEqual({});
  });
});

describe('validateSlaConfig — SLA field errors', () => {
  it.each([null, 0, -1, 1.5])('should_flag_duration_when_value_is_%s', (value) => {
    const errors = validateSlaConfig(validConfig({ slaDuration: value }));
    expect(errors.slaDuration).toBeDefined();
  });

  it('should_flag_missing_unit', () => {
    expect(validateSlaConfig(validConfig({ slaDurationUnit: null })).slaDurationUnit).toBeDefined();
  });

  it('should_flag_missing_basis', () => {
    expect(validateSlaConfig(validConfig({ slaBasis: null })).slaBasis).toBeDefined();
  });

  it.each([0, 100, 101, -5])('should_flag_warning_pct_out_of_range_%s', (value) => {
    expect(validateSlaConfig(validConfig({ slaWarningPct: value })).slaWarningPct).toBeDefined();
  });

  it.each([1, 50, 99])('should_accept_warning_pct_in_range_%s', (value) => {
    expect(validateSlaConfig(validConfig({ slaWarningPct: value })).slaWarningPct).toBeUndefined();
  });
});

describe('validateSlaConfig — escalation errors', () => {
  it('should_flag_missing_escalation_action', () => {
    expect(validateSlaConfig(validConfig({ escalationAction: null })).escalationAction).toBeDefined();
  });

  it('should_flag_missing_escalation_target_type', () => {
    const errors = validateSlaConfig(validConfig({ escalationTargetType: null }));
    expect(errors.escalationTargetType).toBeDefined();
  });

  it('should_flag_missing_user_when_target_is_specific_user', () => {
    const errors = validateSlaConfig(
      validConfig({ escalationTargetType: 'SpecificUser', escalationUserId: null })
    );
    expect(errors.escalationUserId).toBeDefined();
  });

  it('should_flag_missing_team_when_target_is_specific_team', () => {
    const errors = validateSlaConfig(
      validConfig({ escalationTargetType: 'SpecificTeam', escalationUserId: null, escalationTeamId: null })
    );
    expect(errors.escalationTeamId).toBeDefined();
  });

  it('should_flag_missing_role_when_target_is_role', () => {
    const errors = validateSlaConfig(
      validConfig({ escalationTargetType: 'Role', escalationUserId: null, escalationRoleId: null })
    );
    expect(errors.escalationRoleId).toBeDefined();
  });

  it('should_not_validate_escalation_fields_when_escalation_is_off', () => {
    const errors = validateSlaConfig(
      validConfig({ escalationEnabled: false, escalationAction: null, escalationTargetType: null })
    );
    expect(errors).toEqual({});
  });
});
