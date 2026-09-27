import type { DataverseClient } from '@dcp/dataverse-client';
import {
  type CollectionLogEntry,
  type ICollectionLogger,
  type PayloadPolicy,
  DEFAULT_PAYLOAD_POLICY,
  preparePayload,
  renderDiagnosticBlock,
} from '@dcp/domain';

/** OData entity-set name of the existing QDB technical log. */
export const QDB_CRMLOGS_ENTITY_SET = 'qdb_crmlogses' as const;

export interface QdbCrmLogsWriterOptions {
  client: DataverseClient;
  payloadPolicy?: PayloadPolicy;
  /**
   * Value for `qdb_type`. The existing choice offers only `CutomWorkflow` / `Plugin` / `Console`, none
   * of which describes an integration service, so it is **left unset by default** rather than forced
   * into a wrong option. Set it once QDB approves an accurate option.
   */
  typeValue?: number;
  /** Swallow logging failures so a log write can never fail the operation being logged. */
  swallowErrors?: boolean;
  onWriteError?: (error: unknown, entry: CollectionLogEntry) => void;
}

/**
 * Writes DCP technical/integration evidence to the **existing** `qdb_crmlogs` entity.
 *
 * Three constraints shape every mapping decision here, all from the Phase 0 gate:
 *
 *  - **Do not overload existing fields.** `qdb_depth` means plugin execution depth and is never
 *    written. `actualdurationminutes` is minutes, so a sub-minute API call would round to zero and
 *    misreport — `durationMs` stays in the diagnostic block until a millisecond column is approved.
 *  - **Do not store unrestricted payloads or secrets.** Payload retention is off unless policy enables
 *    it, and everything is redacted and capped by `preparePayload` before it can reach CRM.
 *  - **This is not business audit.** Native Dynamics audit owns entity field-change history.
 *
 * The table is shared — 1,295 rows already exist from other QDB systems — so every DCP row carries the
 * `DCP.` source prefix and this writer never applies anything table-wide.
 *
 * `regardingobjectid` is deliberately **not** set: `qdb_crmlogs` is an activity, so pointing it at a
 * Collection Case would put technical logs in the officer's Timeline. Revisit once QDB decides.
 */
export class QdbCrmLogsWriter implements ICollectionLogger {
  private readonly client: DataverseClient;
  private readonly payloadPolicy: PayloadPolicy;
  private readonly typeValue: number | undefined;
  private readonly swallowErrors: boolean;
  private readonly onWriteError: ((error: unknown, entry: CollectionLogEntry) => void) | undefined;

  constructor(options: QdbCrmLogsWriterOptions) {
    this.client = options.client;
    this.payloadPolicy = options.payloadPolicy ?? DEFAULT_PAYLOAD_POLICY;
    this.typeValue = options.typeValue;
    this.swallowErrors = options.swallowErrors ?? true;
    this.onWriteError = options.onWriteError;
  }

  async log(entry: CollectionLogEntry): Promise<void> {
    try {
      await this.client.create(QDB_CRMLOGS_ENTITY_SET, this.toCrmLogRow(entry));
    } catch (error) {
      this.onWriteError?.(error, entry);
      if (!this.swallowErrors) throw error;
    }
  }

  /** Maps the contract onto the columns the entity actually has. Exposed for tests. */
  toCrmLogRow(entry: CollectionLogEntry): Record<string, unknown> {
    const row: Record<string, unknown> = {
      subject: buildSubject(entry),
      qdb_source: entry.source,
      qdb_isexception: !entry.succeeded,
    };

    if (entry.destination !== undefined) row['qdb_destination'] = entry.destination;
    if (entry.errorMessage !== undefined) row['qdb_exception'] = entry.errorMessage;
    if (entry.startedOn !== undefined) row['actualstart'] = entry.startedOn;
    if (entry.completedOn !== undefined) row['actualend'] = entry.completedOn;
    if (this.typeValue !== undefined) row['qdb_type'] = this.typeValue;

    const request = preparePayload(entry.requestPayload, this.payloadPolicy);
    if (request !== undefined) row['qdb_request'] = request;
    const response = preparePayload(entry.responsePayload, this.payloadPolicy);
    if (response !== undefined) row['qdb_response'] = response;

    const diagnostics = renderDiagnosticBlock(entry);
    if (diagnostics !== undefined) row['description'] = diagnostics;

    return row;
  }
}

/** `subject` is the activity's primary name — a readable label, not a queryable operation code. */
function buildSubject(entry: CollectionLogEntry): string {
  const status = entry.succeeded ? 'OK' : 'FAIL';
  return `DCP · ${entry.operation} · ${status}`.slice(0, 200);
}
