import { describe, it, expect } from 'vitest';
import {
  emptyEscalationFields,
  copyEscalationFields,
  mapEscalationFields,
  mapEscalationConfig,
  buildEscalationBody,
  buildEscalationConfigBindPatch,
  hasEscalation,
  escalationSummaryText,
  ESCALATION_SELECT_COLUMNS,
  ESCALATION_CONFIG_ENTITY,
  ESCALATION_CONFIG_SET,
  ESCALATION_CONFIG_ID,
} from '@/services/escalationFields';

const FMT = '@OData.Community.Display.V1.FormattedValue';

describe('emptyEscalationFields', () => {
  it('should_default_to_a_step_that_does_not_escalate', () => {
    expect(emptyEscalationFields()).toEqual({
      escalationConfigId: null,
      escalationConfigName: null,
      applyEscalationFilter: false,
    });
  });
});

describe('mapEscalationFields', () => {
  it('should_read_an_absent_policy_as_no_escalation', () => {
    expect(mapEscalationFields({})).toEqual(emptyEscalationFields());
  });

  it('should_read_the_policy_lookup_and_its_display_name', () => {
    const mapped = mapEscalationFields({
      '_qdb_escalation_value': 'config-guid',
      [`_qdb_escalation_value${FMT}`]: 'Overdue Credit Review',
    });
    expect(mapped.escalationConfigId).toBe('config-guid');
    expect(mapped.escalationConfigName).toBe('Overdue Credit Review');
  });

  it('should_read_the_by_condition_flag', () => {
    expect(mapEscalationFields({ qdb_applyescalationfilter: true }).applyEscalationFilter).toBe(true);
  });
});

describe('buildEscalationBody', () => {
  it('should_return_empty_when_the_write_does_not_touch_escalation', () => {
    expect(buildEscalationBody({})).toEqual({});
  });

  it('should_write_the_by_condition_flag', () => {
    expect(buildEscalationBody({ applyEscalationFilter: true })).toEqual({
      qdb_applyescalationfilter: true,
    });
  });

  it('should_never_write_a_retired_dp2_sla_column', () => {
    const body = buildEscalationBody({ applyEscalationFilter: true });
    expect(Object.keys(body).some((key) => key.startsWith('qdb_sla_'))).toBe(false);
  });
});

describe('buildEscalationConfigBindPatch', () => {
  const resolveNavProp = async () => 'qdb_Escalation';

  it('should_return_empty_when_the_policy_is_not_part_of_the_write', async () => {
    expect(await buildEscalationConfigBindPatch({}, resolveNavProp, 'e', 'configs')).toEqual({});
  });

  it('should_bind_the_chosen_policy', async () => {
    const patch = await buildEscalationConfigBindPatch(
      { escalationConfigId: 'c1' }, resolveNavProp, 'e', 'configs'
    );
    expect(patch).toEqual({ 'qdb_Escalation@odata.bind': '/configs(c1)' });
  });

  it('should_clear_the_policy_through_the_nav_prop_not_the_value_column', async () => {
    const patch = await buildEscalationConfigBindPatch(
      { escalationConfigId: null }, resolveNavProp, 'e', 'configs'
    );
    expect(patch).toEqual({ 'qdb_Escalation@odata.bind': null });
  });
});

describe('mapEscalationConfig', () => {
  it('should_map_the_platforms_misspelled_id_column', () => {
    const option = mapEscalationConfig({ [ESCALATION_CONFIG_ID]: 'c1', qdb_name: 'Overdue' });
    expect(option.id).toBe('c1');
    expect(option.name).toBe('Overdue');
  });

  it('should_summarise_the_value_and_its_unit', () => {
    const option = mapEscalationConfig({
      [ESCALATION_CONFIG_ID]: 'c1', qdb_name: 'Overdue',
      qdb_escalationvalue: 3, qdb_escalationvalueunit: 100000002,
    });
    expect(option.summary).toBe('3 Days');
  });

  it('should_map_hours_and_minutes_units_too', () => {
    const hours = mapEscalationConfig({ qdb_escalationvalue: 8, qdb_escalationvalueunit: 100000001 });
    const minutes = mapEscalationConfig({ qdb_escalationvalue: 30, qdb_escalationvalueunit: 100000000 });
    expect(hours.summary).toBe('8 Hours');
    expect(minutes.summary).toBe('30 Minutes');
  });

  it('should_have_no_summary_when_the_value_is_not_set', () => {
    expect(mapEscalationConfig({ qdb_name: 'Overdue' }).summary).toBeNull();
  });
});

describe('copyEscalationFields', () => {
  it('should_copy_a_named_policy', () => {
    expect(copyEscalationFields({ escalationConfigId: 'c1', escalationConfigName: 'Overdue' })).toEqual({
      escalationConfigId: 'c1',
      escalationConfigName: 'Overdue',
      applyEscalationFilter: false,
    });
  });

  it('should_emit_defaults_for_a_source_that_declares_nothing', () => {
    expect(copyEscalationFields({})).toEqual(emptyEscalationFields());
  });
});

describe('hasEscalation', () => {
  it('should_be_false_for_a_step_with_no_policy', () => {
    expect(hasEscalation(emptyEscalationFields())).toBe(false);
  });

  it('should_be_true_for_a_named_policy', () => {
    expect(hasEscalation({ escalationConfigId: 'c1', applyEscalationFilter: false })).toBe(true);
  });

  it('should_be_true_for_a_by_condition_policy', () => {
    expect(hasEscalation({ escalationConfigId: null, applyEscalationFilter: true })).toBe(true);
  });
});

describe('escalationSummaryText', () => {
  it('should_be_null_when_the_step_does_not_escalate', () => {
    expect(escalationSummaryText(emptyEscalationFields())).toBeNull();
  });

  it('should_name_the_policy_rather_than_a_number', () => {
    expect(escalationSummaryText({ escalationConfigId: 'c1', escalationConfigName: 'Overdue' }))
      .toBe('Escalates: Overdue');
  });

  it('should_say_when_the_policy_is_chosen_by_condition', () => {
    expect(escalationSummaryText({ escalationConfigId: null, applyEscalationFilter: true }))
      .toBe('Escalates: by condition');
  });

  it('should_prefer_the_named_policy_when_both_are_set_as_the_engine_does', () => {
    expect(escalationSummaryText({
      escalationConfigId: 'c1', escalationConfigName: 'Overdue', applyEscalationFilter: true,
    })).toBe('Escalates: Overdue');
  });
});

describe('platform names', () => {
  it('should_request_only_the_two_columns_the_engine_reads', () => {
    expect(ESCALATION_SELECT_COLUMNS).toBe('_qdb_escalation_value,qdb_applyescalationfilter');
  });

  it('should_keep_the_platforms_misspelling_of_the_configuration_entity', () => {
    expect(ESCALATION_CONFIG_ENTITY).toBe('qdb_escalationconiguration');
    expect(ESCALATION_CONFIG_SET).toBe('qdb_escalationconigurations');
    expect(ESCALATION_CONFIG_ID).toBe('qdb_escalationconigurationid');
  });
});
