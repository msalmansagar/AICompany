import { describe, it, expect } from 'vitest';
import { GridSchemaHashService } from './GridSchemaHashService.js';

describe('GridSchemaHashService', () => {
  const service = new GridSchemaHashService();

  describe('computeColumnConfigHash', () => {
    it('computeColumnConfigHash_withSameAttributesSorted_returnsSameHash', () => {
      // Arrange
      const colsA = ['qdb_name', 'qdb_amount', 'qdb_date'];
      const colsB = ['qdb_date', 'qdb_name', 'qdb_amount']; // different order

      // Act
      const hashA = service.computeColumnConfigHash(colsA);
      const hashB = service.computeColumnConfigHash(colsB);

      // Assert — order-independent
      expect(hashA).toBe(hashB);
    });

    it('computeColumnConfigHash_withDifferentAttributes_returnsDifferentHash', () => {
      // Arrange
      const original = ['qdb_name', 'qdb_amount'];
      const modified = ['qdb_name', 'qdb_amount', 'qdb_new_column'];

      // Act
      const hashOriginal = service.computeColumnConfigHash(original);
      const hashModified = service.computeColumnConfigHash(modified);

      // Assert
      expect(hashOriginal).not.toBe(hashModified);
    });

    it('computeColumnConfigHash_returnsExactly16HexChars', () => {
      // Act
      const hash = service.computeColumnConfigHash(['qdb_name', 'qdb_value']);

      // Assert
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('validateDraftGridHashes', () => {
    it('validateDraftGridHashes_whenStoredHashMapIsNull_invalidatesAllPerBC001', () => {
      // Arrange — CEO condition BC-001: null stored hash must invalidate
      const liveHashMap = { 'field-001': 'abc123def456abcd' };

      // Act
      const results = service.validateDraftGridHashes(null, liveHashMap, 'corr-001');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].invalidated).toBe(true);
      expect(results[0].reason).toContain('safety measure');
    });

    it('validateDraftGridHashes_whenHashesMatch_returnsNotInvalidated', () => {
      // Arrange
      const hash = service.computeColumnConfigHash(['qdb_name', 'qdb_amount']);
      const storedHashMap = { 'field-001': hash };
      const liveHashMap = { 'field-001': hash };

      // Act
      const results = service.validateDraftGridHashes(storedHashMap, liveHashMap, 'corr-001');

      // Assert
      expect(results[0].invalidated).toBe(false);
    });

    it('validateDraftGridHashes_whenHashMismatch_invalidatesAffectedFieldOnly', () => {
      // Arrange
      const hash = service.computeColumnConfigHash(['qdb_name']);
      const newHash = service.computeColumnConfigHash(['qdb_name', 'qdb_extra']);
      const storedHashMap = {
        'field-001': hash,
        'field-002': hash,
      };
      const liveHashMap = {
        'field-001': newHash, // changed
        'field-002': hash,   // unchanged
      };

      // Act
      const results = service.validateDraftGridHashes(storedHashMap, liveHashMap, 'corr-001');

      // Assert
      const invalidated = results.find((r) => r.gridFieldId === 'field-001');
      const valid = results.find((r) => r.gridFieldId === 'field-002');
      expect(invalidated?.invalidated).toBe(true);
      expect(valid?.invalidated).toBe(false);
    });

    it('validateDraftGridHashes_whenFieldMissingFromStoredMap_invalidatesPerBC001', () => {
      // Arrange — field exists in live metadata but not in stored hash (new field added)
      const storedHashMap = { 'field-001': 'some-hash' };
      const liveHashMap = {
        'field-001': 'some-hash',
        'field-002': 'new-hash', // new field not in stored map
      };

      // Act
      const results = service.validateDraftGridHashes(storedHashMap, liveHashMap, 'corr-001');

      // Assert
      const newFieldResult = results.find((r) => r.gridFieldId === 'field-002');
      expect(newFieldResult?.invalidated).toBe(true);
    });
  });
});
