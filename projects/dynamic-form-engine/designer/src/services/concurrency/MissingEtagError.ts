/**
 * Thrown by FormDefinitionService.updateForm when no etag is available for a
 * conditional PATCH.  A missing etag means the record was never loaded via
 * getFormWithEtag() — bypassing If-Match silently is forbidden by the
 * concurrency architecture.
 */
export class MissingEtagError extends Error {
  readonly entityLogicalName: string;
  readonly recordId: string;

  constructor(entityLogicalName: string, recordId: string) {
    super(
      `Cannot update '${entityLogicalName}' (id=${recordId}): ` +
      'no etag was provided. Load the record via getFormWithEtag() before saving.'
    );
    this.name = 'MissingEtagError';
    this.entityLogicalName = entityLogicalName;
    this.recordId = recordId;
  }
}
