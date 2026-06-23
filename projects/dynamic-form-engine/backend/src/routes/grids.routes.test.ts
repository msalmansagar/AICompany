import 'express-async-errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createGridsRouter } from './grids.routes.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { errorMiddleware } from '../middleware/error.middleware.js';
import { correlationMiddleware } from '../utils/correlation.js';

// ── Mocks ──────────────────────────────────────────────────────

const mockFetchGridRecords = vi.fn();
const mockGridDataService = {
  fetchGridRecords: mockFetchGridRecords,
} as never;

// ── App setup ──────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(correlationMiddleware);

  // Inject a fake user — auth is tested separately via authMiddleware
  app.use((req, _res, next) => {
    req.user = { oid: 'user-001', aud: 'api', iss: 'sts', exp: 9999999999 };
    next();
  });

  app.use('/api/grids', createGridsRouter(mockGridDataService));
  app.use(errorMiddleware);
  return app;
}

const app = buildApp();

// ── Tests ──────────────────────────────────────────────────────

describe('GET /api/grids/:fieldId/records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy path', () => {
    it('returns_200_with_paginated_records', async () => {
      // Arrange
      const mockPage = {
        records: [{ id: 'prod-001', values: { qdb_name: 'Savings' } }],
        totalCount: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        isCapped: false,
      };
      mockFetchGridRecords.mockResolvedValueOnce(mockPage);

      // Act
      const response = await request(app)
        .get('/api/grids/a1b2c3d4-e5f6-7890-abcd-ef1234567890/records')
        .query({ page: 1, pageSize: 50 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.isCapped).toBe(false);
    });

    it('uses_default_pagination_when_query_params_omitted', async () => {
      // Arrange
      mockFetchGridRecords.mockResolvedValueOnce({
        records: [],
        totalCount: 0,
        page: 1,
        pageSize: 50,
        totalPages: 0,
        isCapped: false,
      });

      // Act
      const response = await request(app)
        .get('/api/grids/a1b2c3d4-e5f6-7890-abcd-ef1234567890/records');

      // Assert
      expect(response.status).toBe(200);
      expect(mockFetchGridRecords).toHaveBeenCalledWith(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        1,
        50,
        expect.any(String),
      );
    });
  });

  describe('Validation failure', () => {
    it('returns_400_when_fieldId_is_not_a_uuid', async () => {
      // Act
      const response = await request(app)
        .get('/api/grids/not-a-uuid/records');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns_400_when_pageSize_exceeds_100', async () => {
      // Act
      const response = await request(app)
        .get('/api/grids/a1b2c3d4-e5f6-7890-abcd-ef1234567890/records')
        .query({ pageSize: 9999 });

      // Assert
      expect(response.status).toBe(400);
    });

    it('returns_400_when_view_is_a_user_view', async () => {
      // Arrange — service throws ValidationError for user views (BC-011)
      mockFetchGridRecords.mockRejectedValueOnce(
        new ValidationError('Only System Views are permitted for Selection Grid configuration.'),
      );

      // Act
      const response = await request(app)
        .get('/api/grids/a1b2c3d4-e5f6-7890-abcd-ef1234567890/records');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('System Views');
    });

    it('returns_400_when_saved_view_not_found', async () => {
      // Arrange — CEO condition BC-004: not-found view -> 400 not 502
      mockFetchGridRecords.mockRejectedValueOnce(
        new ValidationError('The configured grid view was not found. Please contact your administrator.'),
      );

      // Act
      const response = await request(app)
        .get('/api/grids/a1b2c3d4-e5f6-7890-abcd-ef1234567890/records');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('not found');
    });
  });

  describe('Not found', () => {
    it('returns_404_when_field_not_found', async () => {
      // Arrange
      mockFetchGridRecords.mockRejectedValueOnce(
        new NotFoundError('Grid field'),
      );

      // Act
      const response = await request(app)
        .get('/api/grids/a1b2c3d4-e5f6-7890-abcd-ef1234567890/records');

      // Assert
      expect(response.status).toBe(404);
    });
  });
});
