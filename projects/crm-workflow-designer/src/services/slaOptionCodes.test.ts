import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  SLA_DURATION_UNIT_CODES,
  SLA_BASIS_CODES,
  ESCALATION_ACTION_CODES,
  ESCALATION_TARGET_TYPE_CODES,
} from '@/types/WorkflowTypes';

// GA-3 (DP-2 audit): the provisioning script and the TypeScript maps declare the
// SLA/escalation option-set integer codes independently. This test fails if they
// ever drift — a silent-data-corruption guard. Both now derive from
// scripts/sla-option-codes.js, so this asserts the TS maps stay in lockstep.
const require = createRequire(import.meta.url);
const codes = require('../../scripts/sla-option-codes.js') as {
  SLA_DURATION_UNIT: Record<string, number>;
  SLA_BASIS: Record<string, number>;
  ESCALATION_ACTION: Record<string, number>;
  ESCALATION_TARGET_TYPE: Record<string, number>;
};

describe('SLA option-set codes — provisioning script vs WorkflowTypes', () => {
  it('should_match_for_sla_duration_unit', () => {
    expect(codes.SLA_DURATION_UNIT).toEqual(SLA_DURATION_UNIT_CODES);
  });

  it('should_match_for_sla_basis', () => {
    expect(codes.SLA_BASIS).toEqual(SLA_BASIS_CODES);
  });

  it('should_match_for_escalation_action', () => {
    expect(codes.ESCALATION_ACTION).toEqual(ESCALATION_ACTION_CODES);
  });

  it('should_match_for_escalation_target_type', () => {
    expect(codes.ESCALATION_TARGET_TYPE).toEqual(ESCALATION_TARGET_TYPE_CODES);
  });
});
