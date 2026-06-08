import { describe, it, expect } from 'vitest';
import {
  BatchChangesetBuilder,
  parseBatchResponse,
} from './BatchChangesetBuilder.js';

const BASE_URL = 'https://org.crm4.dynamics.com/api/data/v9.2';

// ── Helpers ────────────────────────────────────────────────────

function buildSimpleChangeset(): BatchChangesetBuilder {
  const builder = new BatchChangesetBuilder();
  builder.addParentRecord('contacts', { fullname: 'Ali Hassan' });
  builder.addStandardChildRecord('opportunities', { name: 'Loan Q1' }, 'qdb_contact_key');
  return builder;
}

function buildFakeSuccessResponse(contentIds: number[]): string {
  const parts = contentIds.map((id) => `
Content-ID: ${id}

HTTP/1.1 201 Created
Content-Type: application/json

{"contactid":"rec-${id}","@odata.entityId":"${BASE_URL}/contacts(rec-${id})"}
`);
  return `--changeset_dfe_boundary\r\n${parts.join('--changeset_dfe_boundary\r\n')}--changeset_dfe_boundary--`;
}

function buildFakeFailureResponse(failingContentId: number, allContentIds: number[]): string {
  const parts = allContentIds.map((id) => {
    if (id === failingContentId) {
      return `
Content-ID: ${id}

HTTP/1.1 400 Bad Request
Content-Type: application/json

{"error":{"message":"Validation failed for row ${id}"}}
`;
    }
    return `
Content-ID: ${id}

HTTP/1.1 201 Created
Content-Type: application/json

{"contactid":"rec-${id}"}
`;
  });
  return `--changeset_dfe_boundary\r\n${parts.join('--changeset_dfe_boundary\r\n')}--changeset_dfe_boundary--`;
}

// ── Tests ──────────────────────────────────────────────────────

describe('BatchChangesetBuilder', () => {
  describe('operationCount', () => {
    it('operationCount_afterAddingOperations_returnsCorrectCount', () => {
      // Arrange
      const builder = new BatchChangesetBuilder();

      // Act
      builder.addParentRecord('contacts', { name: 'Test' });
      builder.addGridRowRecord('qdb_grid_rows', { value: 'row1' }, 'gridField', 0);
      builder.addGridRowRecord('qdb_grid_rows', { value: 'row2' }, 'gridField', 1);

      // Assert
      expect(builder.operationCount).toBe(3);
    });
  });

  describe('buildMultipartBody', () => {
    it('buildMultipartBody_containsContentIdHeaders', () => {
      // Arrange
      const builder = buildSimpleChangeset();

      // Act
      const body = builder.buildMultipartBody(BASE_URL);

      // Assert
      expect(body).toContain('Content-ID: 1');
      expect(body).toContain('Content-ID: 2');
    });

    it('buildMultipartBody_includesParentPayload', () => {
      // Arrange
      const builder = new BatchChangesetBuilder();
      builder.addParentRecord('contacts', { fullname: 'Fatima Khan' });

      // Act
      const body = builder.buildMultipartBody(BASE_URL);

      // Assert
      expect(body).toContain('"fullname":"Fatima Khan"');
    });

    it('buildMultipartBody_hasCorrectContentType', () => {
      // Arrange
      const builder = buildSimpleChangeset();

      // Act
      const contentType = builder.batchContentType;

      // Assert
      expect(contentType).toContain('multipart/mixed');
      expect(contentType).toContain('batch_dfe_boundary');
    });
  });

  describe('buildContentIdToSourceMap', () => {
    it('buildContentIdToSourceMap_mapsParentToSourceTypeParent', () => {
      // Arrange
      const builder = new BatchChangesetBuilder();
      builder.addParentRecord('contacts', {});

      // Act
      const map = builder.buildContentIdToSourceMap();

      // Assert
      expect(map.get(1)?.sourceType).toBe('parent');
    });

    it('buildContentIdToSourceMap_mapsGridRowWithCorrectIndex', () => {
      // Arrange
      const builder = new BatchChangesetBuilder();
      builder.addParentRecord('contacts', {});
      builder.addGridRowRecord('items', {}, 'myGridField', 3);

      // Act
      const map = builder.buildContentIdToSourceMap();
      const source = map.get(2);

      // Assert
      expect(source?.sourceType).toBe('grid-row');
      if (source?.sourceType === 'grid-row') {
        expect(source.rowIndex).toBe(3);
        expect(source.fieldKey).toBe('myGridField');
      }
    });
  });
});

describe('parseBatchResponse', () => {
  it('parseBatchResponse_allSuccess_returnsSuccessWithParentId', () => {
    // Arrange
    const builder = buildSimpleChangeset();
    const contentIdMap = builder.buildContentIdToSourceMap();
    const rawResponse = buildFakeSuccessResponse([1, 2]);

    // Act
    const result = parseBatchResponse(rawResponse, contentIdMap);

    // Assert
    expect(result.success).toBe(true);
  });

  it('parseBatchResponse_withFailingParent_returnsFailureWithSourceTypeParent', () => {
    // Arrange
    const builder = new BatchChangesetBuilder();
    builder.addParentRecord('contacts', {});
    builder.addStandardChildRecord('items', {}, 'field');
    const contentIdMap = builder.buildContentIdToSourceMap();
    const rawResponse = buildFakeFailureResponse(1, [1, 2]);

    // Act
    const result = parseBatchResponse(rawResponse, contentIdMap);

    // Assert
    expect(result.success).toBe(false);
    expect(result.failingContentId).toBe(1);
    expect(result.failingSource?.sourceType).toBe('parent');
  });

  it('parseBatchResponse_withFailingGridRow_attributesRowIndexCorrectly', () => {
    // Arrange
    const builder = new BatchChangesetBuilder();
    builder.addParentRecord('contacts', {});
    builder.addGridRowRecord('items', {}, 'myGrid', 0);
    builder.addGridRowRecord('items', {}, 'myGrid', 1); // this one fails
    const contentIdMap = builder.buildContentIdToSourceMap();
    const rawResponse = buildFakeFailureResponse(3, [1, 2, 3]);

    // Act
    const result = parseBatchResponse(rawResponse, contentIdMap);

    // Assert
    expect(result.success).toBe(false);
    expect(result.failingContentId).toBe(3);
    expect(result.failingSource?.sourceType).toBe('grid-row');
    if (result.failingSource?.sourceType === 'grid-row') {
      expect(result.failingSource.rowIndex).toBe(1);
    }
  });
});
