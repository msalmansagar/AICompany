import { describe, expect, it } from 'vitest';
import { applyInputRules, boundInputNames, extractInputRules, ruleFor } from './inputRules';

const pcrm = { inputs: [
  { name: 'revenue', type: 'Decimal', binding: 'revenue' },
  { name: 'tier', type: 'Text', source: 'declared', required: true, nullable: false },
] };

describe('inputRules', () => {
  it('boundInputNames_should_list_only_record_bound_inputs', () => {
    expect(boundInputNames(pcrm)).toEqual(['revenue']);
  });

  it('applyInputRules_should_write_required_and_not_nullable_on_a_bound_input', () => {
    const applied = applyInputRules(pcrm, { revenue: { required: true, nullable: false } });
    expect(applied.inputs[0]).toEqual({ name: 'revenue', type: 'Decimal', binding: 'revenue', required: true, nullable: false });
  });

  it('applyInputRules_should_leave_defaults_off_the_pcrm', () => {
    expect(applyInputRules(pcrm, {}).inputs[0]).toEqual({ name: 'revenue', type: 'Decimal', binding: 'revenue' });
  });

  it('applyInputRules_should_never_touch_a_declared_fact', () => {
    expect(applyInputRules(pcrm, { tier: { required: false, nullable: true } }).inputs[1]).toEqual(pcrm.inputs[1]);
  });

  it('extractInputRules_should_round_trip_what_applyInputRules_wrote', () => {
    const applied = applyInputRules(pcrm, { revenue: { required: true, nullable: true } });
    expect(extractInputRules(applied.inputs)).toEqual({ revenue: { required: true, nullable: true } });
  });

  it('ruleFor_should_default_to_optional_and_nullable', () => {
    expect(ruleFor({}, 'anything')).toEqual({ required: false, nullable: true });
  });
});
