import 'express-async-errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createInfoCardsAdminRouter } from './info-cards.admin.routes.js';
import { ValidationError } from '../utils/errors.js';
import { errorMiddleware } from '../middleware/error.middleware.js';
import { correlationMiddleware } from '../utils/correlation.js';

// ── Mocks ──────────────────────────────────────────────────────

const mockCreateInfoCardItem = vi.fn();
const mockUpdateInfoCardItem = vi.fn();
const mockAdminService = {
  createInfoCardItem: mockCreateInfoCardItem,
  updateInfoCardItem: mockUpdateInfoCardItem,
} as never;

// ── App setup ──────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(correlationMiddleware);

  // Inject a fake admin user
  app.use((req, _res, next) => {
    req.user = { oid: 'admin-001', roles: ['CRMAdmin'], aud: 'api', iss: 'sts', exp: 9999999999 };
    next();
  });

  app.use('/api/admin', createInfoCardsAdminRouter(mockAdminService));
  app.use(errorMiddleware);
  return app;
}

const app = buildApp();

// ── Tests ──────────────────────────────────────────────────────

describe('POST /api/admin/info-card-items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy path', () => {
    it('returns_201_when_item_created_successfully', async () => {
      // Arrange
      mockCreateInfoCardItem.mockResolvedValueOnce('item-001');

      // Act
      const response = await request(app)
        .post('/api/admin/info-card-items')
        .send({
          infoCardSectionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          displayOrder: 1,
          itemTitle: 'Download the form',
          downloadUrl: 'https://cdn.example.com/form.pdf',
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('item-001');
    });

    it('returns_201_when_downloadUrl_is_absent', async () => {
      // Arrange
      mockCreateInfoCardItem.mockResolvedValueOnce('item-002');

      // Act
      const response = await request(app)
        .post('/api/admin/info-card-items')
        .send({
          infoCardSectionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          displayOrder: 1,
          itemTitle: 'No download needed',
        });

      // Assert
      expect(response.status).toBe(201);
    });
  });

  describe('Validation failure — CEO condition ADD-001-C3', () => {
    it('returns_400_when_service_rejects_http_downloadUrl', async () => {
      // Arrange — service enforces the HTTPS rule
      mockCreateInfoCardItem.mockRejectedValueOnce(
        new ValidationError(
          'downloadUrl must use the HTTPS protocol. HTTP URLs and non-HTTPS schemes are not permitted.',
        ),
      );

      // Act
      const response = await request(app)
        .post('/api/admin/info-card-items')
        .send({
          infoCardSectionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          displayOrder: 1,
          itemTitle: 'Insecure link',
          downloadUrl: 'http://cdn.example.com/file.pdf',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('HTTPS');
    });

    it('returns_400_when_service_rejects_relative_path', async () => {
      // Arrange
      mockCreateInfoCardItem.mockRejectedValueOnce(
        new ValidationError(
          'downloadUrl is not a valid absolute URL. Provide a full HTTPS URL (e.g. https://example.com/file.pdf).',
        ),
      );

      // Act
      const response = await request(app)
        .post('/api/admin/info-card-items')
        .send({
          infoCardSectionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          displayOrder: 1,
          itemTitle: 'Relative path',
          downloadUrl: '/files/form.pdf',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('absolute URL');
    });

    it('returns_400_when_infoCardSectionId_is_not_a_uuid', async () => {
      // Act — Zod rejects before reaching service
      const response = await request(app)
        .post('/api/admin/info-card-items')
        .send({
          infoCardSectionId: 'not-a-uuid',
          displayOrder: 1,
          itemTitle: 'Test',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockCreateInfoCardItem).not.toHaveBeenCalled();
    });

    it('returns_400_when_itemTitle_is_missing', async () => {
      // Act
      const response = await request(app)
        .post('/api/admin/info-card-items')
        .send({
          infoCardSectionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          displayOrder: 1,
          // itemTitle is missing
        });

      // Assert
      expect(response.status).toBe(400);
      expect(mockCreateInfoCardItem).not.toHaveBeenCalled();
    });
  });
});

describe('PATCH /api/admin/info-card-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy path', () => {
    it('returns_200_when_item_updated_successfully', async () => {
      // Arrange
      mockUpdateInfoCardItem.mockResolvedValueOnce(undefined);

      // Act
      const response = await request(app)
        .patch('/api/admin/info-card-items/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
        .send({ downloadUrl: 'https://cdn.example.com/updated.pdf' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });

  describe('Validation failure', () => {
    it('returns_400_when_item_id_is_not_a_uuid', async () => {
      // Act
      const response = await request(app)
        .patch('/api/admin/info-card-items/not-a-valid-id')
        .send({ itemTitle: 'Updated title' });

      // Assert
      expect(response.status).toBe(400);
      expect(mockUpdateInfoCardItem).not.toHaveBeenCalled();
    });

    it('returns_400_when_service_rejects_http_downloadUrl_on_patch', async () => {
      // Arrange
      mockUpdateInfoCardItem.mockRejectedValueOnce(
        new ValidationError('downloadUrl must use the HTTPS protocol.'),
      );

      // Act
      const response = await request(app)
        .patch('/api/admin/info-card-items/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
        .send({ downloadUrl: 'http://insecure.example.com/file.pdf' });

      // Assert
      expect(response.status).toBe(400);
    });
  });
});
