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
  readonly staledEtag: string;

  constructor(entityLogicalName: string, recordId: string, staledEtag: string) {
    super(
      `Concurrency conflict on '${entityLogicalName}' (id=${recordId}): ` +
      `the record was modified by another user after it was loaded (etag=${staledEtag}).`
    );
    this.name = 'ConcurrencyConflictError';
    this.entityLogicalName = entityLogicalName;
    this.recordId = recordId;
    this.staledEtag = staledEtag;
  }
}
