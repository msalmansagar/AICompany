import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────────

export interface GridSchemaHashResult {
  gridFieldId: string;
  invalidated: boolean;
  reason: string;
}

export interface GridColumnDescriptor {
  fieldId: string;
  columnAttributes: string[];
}

// ── Constants ─────────────────────────────────────────────────

const HASH_HEX_LENGTH = 16;
const NULL_HASH_INVALIDATION_REASON =
  'No schema hash stored in draft — invalidating as a safety measure (CEO condition BC-001)';
const MISMATCH_INVALIDATION_REASON =
  'Grid column schema has changed since this draft was saved';

export class GridSchemaHashService {
  /**
   * Computes a stable 16-hex-char SHA-256 hash of the sorted column attribute
   * names for a single grid field. This is stored on the draft record to detect
   * column schema changes between draft save and resume.
   */
  computeColumnConfigHash(columnAttributes: string[]): string {
    const sorted = [...columnAttributes].sort();
    const input = sorted.join(',');
    return createHash('sha256').update(input).digest('hex').slice(0, HASH_HEX_LENGTH);
  }

  /**
   * Builds a hash map for all Entry Grid fields in a form.
   * Returns Record<fieldId, columnConfigHash>.
   */
  buildGridSchemaHashMap(gridColumns: GridColumnDescriptor[]): Record<string, string> {
    const hashMap: Record<string, string> = {};
    for (const descriptor of gridColumns) {
      hashMap[descriptor.fieldId] = this.computeColumnConfigHash(descriptor.columnAttributes);
    }
    return hashMap;
  }

  /**
   * Compares the stored draft schema hashes against live metadata hashes.
   * A null stored hash unconditionally invalidates (CEO condition BC-001).
   * A mismatch invalidates only that grid field's row data.
   */
  validateDraftGridHashes(
    storedHashMap: Record<string, string> | null,
    liveHashMap: Record<string, string>,
    correlationId: string,
  ): GridSchemaHashResult[] {
    const results: GridSchemaHashResult[] = [];

    for (const [fieldId, liveHash] of Object.entries(liveHashMap)) {
      const result = this.validateSingleFieldHash(fieldId, storedHashMap, liveHash, correlationId);
      results.push(result);
    }

    return results;
  }

  private validateSingleFieldHash(
    fieldId: string,
    storedHashMap: Record<string, string> | null,
    liveHash: string,
    correlationId: string,
  ): GridSchemaHashResult {
    // CEO condition BC-001: null stored hash must unconditionally invalidate.
    if (storedHashMap === null) {
      logger.info(
        { correlationId, fieldId, operation: 'validateGridHash' },
        'Draft has no grid schema hash — invalidating grid field',
      );
      return { gridFieldId: fieldId, invalidated: true, reason: NULL_HASH_INVALIDATION_REASON };
    }

    const storedHash = storedHashMap[fieldId];

    // Also treat missing entry as null — conservative "invalidate" policy.
    if (storedHash === undefined || storedHash === null) {
      logger.info(
        { correlationId, fieldId, operation: 'validateGridHash' },
        'Grid field has no stored hash — invalidating',
      );
      return { gridFieldId: fieldId, invalidated: true, reason: NULL_HASH_INVALIDATION_REASON };
    }

    if (storedHash !== liveHash) {
      logger.info(
        { correlationId, fieldId, storedHash, liveHash, operation: 'validateGridHash' },
        'Grid schema hash mismatch — invalidating grid field row data',
      );
      return { gridFieldId: fieldId, invalidated: true, reason: MISMATCH_INVALIDATION_REASON };
    }

    return { gridFieldId: fieldId, invalidated: false, reason: '' };
  }
}
