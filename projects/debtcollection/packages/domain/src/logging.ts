import { z } from 'zod';

/**
 * DCP technical / integration logging contract.
 *
 * Debt Collection reuses the **existing `qdb_crmlogs`** entity (QDB decision). That entity is a custom
 * *activity* with 1,295 rows already written by other QDB systems, and it lacks several capabilities
 * DCP needs. Two rules follow, and this module exists to honour both:
 *
 *  1. **Missing capabilities stay behind the contract.** Callers populate `correlationId`, `batchId`,
 *     `severity`, `errorCode`, `attemptNumber` and `durationMs` today. The writer persists whatever the
 *     entity can hold and keeps the rest in a delimited diagnostic block until the nine proposed
 *     extension columns are approved. When they are, the writer moves those fields to real columns and
 *     **no caller changes**.
 *  2. **Existing fields are never overloaded.** `qdb_depth` means plugin execution depth, so a retry
 *     count must not be written there; `qdb_source` is a source name, not a correlation id. Wrong data
 *     in a typed column is worse than the same data in a clearly-labelled diagnostic block.
 *
 * This is **not** business audit. Dynamics native audit owns entity field-change history. Nothing here
 * may be used to reconstruct who changed which business field — that is a different mechanism with
 * different retention and different privileges.
 */

export const LogSeveritySchema = z.enum(['Debug', 'Info', 'Warn', 'Error', 'Fatal']);
export type LogSeverity = z.infer<typeof LogSeveritySchema>;

/** Categories DCP writes. Deliberately coarse — this is operational evidence, not analytics. */
export const LogOperationKindSchema = z.enum([
  'MisLiveQuery',
  'MisBackgroundSync',
  'IdentityResolution',
  'FacilityResolution',
  'EligibilityEvaluation',
  'CaseLifecycle',
  'CommunicationSend',
  'ContactHoldEvaluation',
  'CrossOrgQuery',
  'Scheduler',
]);
export type LogOperationKind = z.infer<typeof LogOperationKindSchema>;

/**
 * Payload retention is **off by default**. MIS payloads carry QID, name, mobile and balances, so they
 * are PDPPL-relevant; storing them is permitted only where QDB policy says so, and then redacted and
 * size-capped. Secrets and tokens must never reach this contract at all.
 */
export const PayloadPolicySchema = z.object({
  retainPayloads: z.boolean().default(false),
  maxPayloadChars: z.number().int().positive().default(4000),
  /** Keys whose values are replaced with a marker before anything is written. */
  redactKeys: z.array(z.string()).default([
    'password', 'secret', 'token', 'authorization', 'client_secret', 'access_token',
    'mobile', 'mobileNumber', 'email', 'nationalId', 'qid', 'address',
  ]),
});
export type PayloadPolicy = z.infer<typeof PayloadPolicySchema>;

export const DEFAULT_PAYLOAD_POLICY: PayloadPolicy = PayloadPolicySchema.parse({});

export const CollectionLogEntrySchema = z.object({
  /** Source name — DCP writes a reserved prefix so its rows are separable from other teams'. */
  source: z.string().min(1).max(100),
  operation: z.string().min(1).max(100),
  operationKind: LogOperationKindSchema,
  severity: LogSeveritySchema,
  /** End-to-end trace id across React → Integration Service → CRM. */
  correlationId: z.string().max(100).optional(),
  /** Groups one synchronisation run, for replay. */
  batchId: z.string().max(100).optional(),
  /** Business key of the record being processed (e.g. a facility number) — never a CRM GUID alone. */
  sourceReference: z.string().max(200).optional(),
  /** Endpoint or system addressed. */
  destination: z.string().max(1000).optional(),
  succeeded: z.boolean(),
  errorCode: z.string().max(100).optional(),
  errorMessage: z.string().optional(),
  attemptNumber: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  startedOn: z.string().optional(),
  completedOn: z.string().optional(),
  recordsRead: z.number().int().nonnegative().optional(),
  recordsWritten: z.number().int().nonnegative().optional(),
  recordsFailed: z.number().int().nonnegative().optional(),
  /** Only written when the payload policy permits; always redacted and capped. */
  requestPayload: z.string().optional(),
  responsePayload: z.string().optional(),
  /** Free-form diagnostics. Must not contain PII or secrets. */
  diagnostics: z.record(z.unknown()).optional(),
});
export type CollectionLogEntry = z.infer<typeof CollectionLogEntrySchema>;

/**
 * The abstraction Collection services depend on. Implementations write to `qdb_crmlogs`; tests use an
 * in-memory one. Business logic never constructs a Dataverse row for a log.
 */
export interface ICollectionLogger {
  log(entry: CollectionLogEntry): Promise<void>;
}

/** The reserved `qdb_source` prefix that makes DCP rows separable in a shared table. */
export const DCP_LOG_SOURCE_PREFIX = 'DCP.' as const;

export function buildLogSource(service: string): string {
  return service.startsWith(DCP_LOG_SOURCE_PREFIX) ? service : `${DCP_LOG_SOURCE_PREFIX}${service}`;
}

/** Marker delimiting the block that carries capabilities `qdb_crmlogs` has no column for yet. */
export const DIAGNOSTIC_BLOCK_START = '--- DCP-DIAGNOSTICS ---';

/**
 * Redacts a payload and caps its length, or returns undefined when retention is disabled.
 * Applied to every payload before it can reach CRM — the policy is enforced here, not at call sites.
 */
export function preparePayload(
  raw: string | undefined,
  policy: PayloadPolicy = DEFAULT_PAYLOAD_POLICY,
): string | undefined {
  if (raw === undefined || !policy.retainPayloads) return undefined;
  const redacted = policy.redactKeys.reduce(
    (text, key) =>
      text.replace(
        new RegExp(`("${escapeRegExp(key)}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^,}\\s]+)`, 'gi'),
        '$1"[REDACTED]"',
      ),
    raw,
  );
  return redacted.length > policy.maxPayloadChars
    ? `${redacted.slice(0, policy.maxPayloadChars)}…[truncated]`
    : redacted;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Renders the capabilities the entity cannot yet store as a labelled block.
 *
 * Deliberately a readable block rather than a typed column: until the extensions are approved, writing
 * a correlation id into `qdb_source` or a retry count into `qdb_depth` would corrupt the meaning of
 * columns that other QDB systems already rely on.
 */
export function renderDiagnosticBlock(entry: CollectionLogEntry): string | undefined {
  const pending: Record<string, unknown> = {};
  if (entry.correlationId !== undefined) pending['correlationId'] = entry.correlationId;
  if (entry.batchId !== undefined) pending['batchId'] = entry.batchId;
  if (entry.sourceReference !== undefined) pending['sourceReference'] = entry.sourceReference;
  if (entry.severity !== undefined) pending['severity'] = entry.severity;
  if (entry.errorCode !== undefined) pending['errorCode'] = entry.errorCode;
  if (entry.attemptNumber !== undefined) pending['attemptNumber'] = entry.attemptNumber;
  if (entry.durationMs !== undefined) pending['durationMs'] = entry.durationMs;
  if (entry.recordsRead !== undefined) pending['recordsRead'] = entry.recordsRead;
  if (entry.recordsWritten !== undefined) pending['recordsWritten'] = entry.recordsWritten;
  if (entry.recordsFailed !== undefined) pending['recordsFailed'] = entry.recordsFailed;
  if (entry.diagnostics !== undefined) pending['diagnostics'] = entry.diagnostics;

  if (Object.keys(pending).length === 0) return undefined;
  return `${DIAGNOSTIC_BLOCK_START}\n${JSON.stringify(pending, null, 2)}`;
}
