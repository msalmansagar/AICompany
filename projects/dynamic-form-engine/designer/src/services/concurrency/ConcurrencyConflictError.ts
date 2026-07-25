/**
 * Thrown when Dataverse returns HTTP 412 Precondition Failed on a
 * conditional PATCH/DELETE (If-Match header mismatch).
 *
 * The save pipeline must catch this error, NOT wrap it in CrmApiError,
 * and transition the designer store to conflictState.
 */
export class ConcurrencyConflictError extends Error {
  readonly entityLogicalName: string;
  readonly recordId: string;
  /** The etag that was stale at the time of the 412 — i.e., the local (pre-conflict) etag. */
  readonly localEtag: string;

  constructor(entityLogicalName: string, recordId: string, localEtag: string) {
    super(
      `Concurrency conflict on '${entityLogicalName}' (id=${recordId}): ` +
      `the record was modified by another user after it was loaded (local etag=${localEtag}).`
    );
    this.name = 'ConcurrencyConflictError';
    this.entityLogicalName = entityLogicalName;
    this.recordId = recordId;
    this.localEtag = localEtag;
  }
}
