/**
 * The logging contract must protect two things the gate was explicit about: payloads/secrets must not
 * leak into a shared CRM table, and capabilities `qdb_crmlogs` lacks must stay behind the contract
 * rather than being smuggled into columns that already mean something else.
 */
import { describe, it, expect } from 'vitest';
import {
  buildLogSource,
  preparePayload,
  renderDiagnosticBlock,
  DEFAULT_PAYLOAD_POLICY,
  DIAGNOSTIC_BLOCK_START,
  PayloadPolicySchema,
  type CollectionLogEntry,
} from './logging.js';

const baseEntry: CollectionLogEntry = {
  source: 'DCP.MisSync',
  operation: 'GetArrearDetails',
  operationKind: 'MisBackgroundSync',
  severity: 'Info',
  succeeded: true,
};

describe('buildLogSource', () => {
  it('should_prefix_the_service_so_dcp_rows_are_separable_in_the_shared_table', () => {
    expect(buildLogSource('MisSync')).toBe('DCP.MisSync');
  });

  it('should_not_double_prefix_an_already_prefixed_source', () => {
    expect(buildLogSource('DCP.MisSync')).toBe('DCP.MisSync');
  });
});

describe('preparePayload', () => {
  it('should_return_undefined_when_retention_is_disabled_by_default', () => {
    expect(preparePayload('{"qid":"26963402045"}')).toBeUndefined();
  });

  it('should_redact_credentials_when_retention_is_enabled', () => {
    const policy = PayloadPolicySchema.parse({ retainPayloads: true });

    const result = preparePayload('{"client_secret":"s3cr3t","operation":"sync"}', policy);

    expect(result).not.toContain('s3cr3t');
    expect(result).toContain('[REDACTED]');
    expect(result).toContain('sync');
  });

  it('should_redact_customer_identifiers_and_contact_points', () => {
    const policy = PayloadPolicySchema.parse({ retainPayloads: true });

    const result = preparePayload('{"qid":"26963402045","mobile":"55564955","dpd":16}', policy);

    expect(result).not.toContain('26963402045');
    expect(result).not.toContain('55564955');
    expect(result).toContain('"dpd":16');
  });

  it('should_cap_an_oversized_payload', () => {
    const policy = PayloadPolicySchema.parse({ retainPayloads: true, maxPayloadChars: 50 });

    const result = preparePayload('x'.repeat(500), policy);

    expect(result?.length).toBeLessThan(80);
    expect(result).toContain('[truncated]');
  });

  it('should_keep_payload_retention_off_in_the_default_policy', () => {
    expect(DEFAULT_PAYLOAD_POLICY.retainPayloads).toBe(false);
  });
});

describe('renderDiagnosticBlock', () => {
  it('should_carry_capabilities_the_entity_has_no_column_for', () => {
    const block = renderDiagnosticBlock({
      ...baseEntry,
      correlationId: 'corr-1',
      batchId: 'batch-9',
      attemptNumber: 2,
      durationMs: 1234,
      errorCode: 'MIS_TIMEOUT',
    });

    expect(block).toContain(DIAGNOSTIC_BLOCK_START);
    expect(block).toContain('corr-1');
    expect(block).toContain('batch-9');
    expect(block).toContain('MIS_TIMEOUT');
    expect(block).toContain('1234');
  });

  it('should_return_undefined_when_there_is_nothing_pending', () => {
    expect(renderDiagnosticBlock({ ...baseEntry, severity: undefined as never })).toBeUndefined();
  });

  it('should_record_counts_for_a_batch_run', () => {
    const block = renderDiagnosticBlock({
      ...baseEntry,
      recordsRead: 4357,
      recordsWritten: 12,
      recordsFailed: 1,
    });

    expect(block).toContain('4357');
    expect(block).toContain('"recordsFailed": 1');
  });
});
