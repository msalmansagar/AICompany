import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { SPLIT_TYPE_CODES, JOIN_TYPE_CODES } from '@/types/WorkflowTypes';

// The provisioning script and the TypeScript maps declare the control-flow
// option-set integer codes independently. This test fails if they ever drift.
// Drift here is silent and destructive: Dataverse would store an integer that
// reads back as a different control-flow semantic — an exclusive step quietly
// becoming a parallel one, or the reverse. Same guard the DP-2 audit forced
// onto the SLA codes (GA-3), applied up front this time.
const require = createRequire(import.meta.url);
const codes = require('../../scripts/controlflow-option-codes.js') as {
  SPLIT_TYPE: Record<string, number>;
  JOIN_TYPE: Record<string, number>;
};

describe('control-flow option-set codes — provisioning script vs WorkflowTypes', () => {
  it('should_match_for_split_type', () => {
    expect(codes.SPLIT_TYPE).toEqual(SPLIT_TYPE_CODES);
  });

  it('should_match_for_join_type', () => {
    expect(codes.JOIN_TYPE).toEqual(JOIN_TYPE_CODES);
  });

  it('should_leave_100000002_unallocated_for_a_future_inclusive_gateway', () => {
    const allocated = [...Object.values(codes.SPLIT_TYPE), ...Object.values(codes.JOIN_TYPE)];
    expect(allocated).not.toContain(100000002);
  });
});
