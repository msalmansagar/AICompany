import type { DataverseClient } from '@dcp/dataverse-client';
import type { IdentityException } from '@dcp/types';
import { ENTITY_SETS, ok, err, makeDomainError } from '@dcp/types';
import type { Result, DomainError } from '@dcp/types';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Returns the unresolved-identity queue (FR-007).
 * Cursor-based pagination via OData $skiptoken is a Phase-2 concern;
 * Phase 1 caps at DEFAULT_PAGE_SIZE records (the queue is small).
 */
export async function listIdentityExceptions(
  client: DataverseClient,
  correlationId: string,
): Promise<Result<readonly IdentityException[], DomainError>> {
  // FIXED: wrap in try/catch so network/CRM failures return err() rather than
  // throwing — the function signature promises Result, never a throw.
  try {
    const result = await client.getList<IdentityException>(
      ENTITY_SETS.IDENTITY_EXCEPTION,
      { top: DEFAULT_PAGE_SIZE, orderBy: 'createdon desc' },
      { correlationId },
    );
    return ok(result.value);
  } catch (error) {
    return err(
      makeDomainError(
        'dataverse_unavailable',
        error instanceof Error ? error.message : 'Failed to list identity exceptions',
        correlationId,
      ),
    );
  }
}
