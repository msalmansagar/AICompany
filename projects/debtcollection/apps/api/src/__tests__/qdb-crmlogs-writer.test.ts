/**
 * The gate approved reusing `qdb_crmlogs` but forbade three things: overloading its existing fields,
 * storing unrestricted payloads or secrets, and using it as business audit. These tests pin all three,
 * because each would be an easy and invisible mistake to make later.
 */
import { describe, it, expect, vi } from 'vitest';
import { PayloadPolicySchema, type CollectionLogEntry } from '@dcp/domain';
import { QdbCrmLogsWriter, QDB_CRMLOGS_ENTITY_SET } from '../services/QdbCrmLogsWriter.js';

function makeClient(create = vi.fn(async () => ({ id: 'log-1' }))) {
  return { client: { create } as never, create };
}

const entry: CollectionLogEntry = {
  source: 'DCP.MisSync',
  operation: 'GetArrearDetails',
  operationKind: 'MisBackgroundSync',
  severity: 'Error',
  succeeded: false,
  correlationId: 'corr-42',
  batchId: 'batch-7',
  sourceReference: '5011477',
  destination: 'https://mis.example/arrears',
  errorCode: 'MIS_TIMEOUT',
  errorMessage: 'upstream timed out after 30s',
  attemptNumber: 3,
  durationMs: 812,
  recordsRead: 4357,
  recordsFailed: 1,
};

describe('QdbCrmLogsWriter — existing columns are not overloaded', () => {
  it('should_never_write_qdb_depth_which_means_plugin_execution_depth', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client }).toCrmLogRow(entry);

    expect(row).not.toHaveProperty('qdb_depth');
  });

  it('should_not_squeeze_a_millisecond_duration_into_the_minutes_column', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client }).toCrmLogRow(entry);

    // 812ms would round to 0 minutes and misreport the call as instantaneous.
    expect(row).not.toHaveProperty('actualdurationminutes');
    expect(String(row['description'])).toContain('812');
  });

  it('should_leave_qdb_type_unset_when_no_accurate_option_exists', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client }).toCrmLogRow(entry);

    expect(row).not.toHaveProperty('qdb_type');
  });

  it('should_write_qdb_type_only_when_an_approved_option_is_configured', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client, typeValue: 100000003 }).toCrmLogRow(entry);

    expect(row['qdb_type']).toBe(100000003);
  });

  it('should_not_set_regardingobjectid_so_technical_logs_stay_out_of_the_case_timeline', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client }).toCrmLogRow(entry);

    expect(row).not.toHaveProperty('regardingobjectid');
  });
});

describe('QdbCrmLogsWriter — capabilities the entity lacks stay behind the contract', () => {
  it('should_carry_correlation_batch_severity_error_code_and_attempt_in_the_diagnostic_block', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client }).toCrmLogRow(entry);
    const description = String(row['description']);

    expect(description).toContain('corr-42');
    expect(description).toContain('batch-7');
    expect(description).toContain('MIS_TIMEOUT');
    expect(description).toContain('"attemptNumber": 3');
    expect(description).toContain('5011477');
  });

  it('should_not_smuggle_the_correlation_id_into_qdb_source', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client }).toCrmLogRow(entry);

    expect(row['qdb_source']).toBe('DCP.MisSync');
    expect(String(row['qdb_source'])).not.toContain('corr-42');
  });
});

describe('QdbCrmLogsWriter — payload and co-tenancy safety', () => {
  it('should_not_store_payloads_under_the_default_policy', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client }).toCrmLogRow({
      ...entry,
      requestPayload: '{"qid":"26963402045"}',
      responsePayload: '{"token":"abc"}',
    });

    expect(row).not.toHaveProperty('qdb_request');
    expect(row).not.toHaveProperty('qdb_response');
  });

  it('should_redact_identifiers_when_payload_retention_is_explicitly_enabled', () => {
    const { client } = makeClient();
    const writer = new QdbCrmLogsWriter({
      client,
      payloadPolicy: PayloadPolicySchema.parse({ retainPayloads: true }),
    });

    const row = writer.toCrmLogRow({ ...entry, requestPayload: '{"qid":"26963402045","dpd":16}' });

    expect(String(row['qdb_request'])).not.toContain('26963402045');
    expect(String(row['qdb_request'])).toContain('"dpd":16');
  });

  it('should_tag_every_row_with_the_dcp_source_prefix_because_the_table_is_shared', () => {
    const { client } = makeClient();
    const row = new QdbCrmLogsWriter({ client }).toCrmLogRow(entry);

    expect(String(row['qdb_source']).startsWith('DCP.')).toBe(true);
  });

  it('should_write_to_the_existing_entity_set', async () => {
    const { client, create } = makeClient();

    await new QdbCrmLogsWriter({ client }).log(entry);

    expect(create).toHaveBeenCalledWith(QDB_CRMLOGS_ENTITY_SET, expect.any(Object));
  });
});

describe('QdbCrmLogsWriter — logging must never break the operation it logs', () => {
  it('should_swallow_a_write_failure_and_report_it_out_of_band', async () => {
    const failing = vi.fn(async () => { throw new Error('CRM unavailable'); });
    const onWriteError = vi.fn();

    await new QdbCrmLogsWriter({ client: { create: failing } as never, onWriteError }).log(entry);

    expect(onWriteError).toHaveBeenCalledOnce();
  });

  it('should_rethrow_when_the_caller_opts_out_of_swallowing', async () => {
    const failing = vi.fn(async () => { throw new Error('CRM unavailable'); });
    const writer = new QdbCrmLogsWriter({ client: { create: failing } as never, swallowErrors: false });

    await expect(writer.log(entry)).rejects.toThrow('CRM unavailable');
  });
});
