import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ApiResponse } from '@qdb/shared';
import { ForbiddenError } from '../utils/errors.js';
import { config } from '../config/env.js';
import type { CrmInfoCardAdminService } from '../services/CrmInfoCardAdminService.js';

// ── Zod schemas ────────────────────────────────────────────────

const createInfoCardItemSchema = z.object({
  infoCardSectionId: z.string().uuid('infoCardSectionId must be a valid UUID'),
  displayOrder: z.number().int().min(0),
  itemTitle: z.string().min(1, 'itemTitle is required'),
  itemDescription: z.string().optional(),
  iconReference: z.string().optional(),
  // downloadUrl: present values are validated by the service (CEO condition ADD-001-C3).
  // Zod accepts any string; HTTPS enforcement is a business rule enforced in the service.
  downloadUrl: z.string().optional(),
});

const updateInfoCardItemSchema = createInfoCardItemSchema
  .partial()
  .omit({ infoCardSectionId: true });

const SAFE_ITEM_ID = z.string().uuid('id must be a valid UUID');

// ── Router factory ─────────────────────────────────────────────

export function createInfoCardsAdminRouter(
  adminService: CrmInfoCardAdminService,
): Router {
  const router = Router();

  // POST /api/admin/info-card-items
  // Creates a new info-card item.
  // CEO condition ADD-001-C3: downloadUrl validated as absolute HTTPS in the service layer.
  router.post('/info-card-items', async (req: Request, res: Response) => {
    assertAdminRole(req);
    const body = createInfoCardItemSchema.parse(req.body);

    const itemId = await adminService.createInfoCardItem(
      body,
      req.user!.oid,
      req.correlationId,
    );

    const response: ApiResponse<{ id: string }> = { success: true, data: { id: itemId } };
    res.status(201).json(response);
  });

  // PATCH /api/admin/info-card-items/:id
  // Updates an existing info-card item.
  // CEO condition ADD-001-C3: downloadUrl validated as absolute HTTPS in the service layer.
  router.patch('/info-card-items/:id', async (req: Request, res: Response) => {
    assertAdminRole(req);
    const itemId = SAFE_ITEM_ID.parse(req.params.id);
    const body = updateInfoCardItemSchema.parse(req.body);

    await adminService.updateInfoCardItem(itemId, body, req.user!.oid, req.correlationId);

    const response: ApiResponse<{ id: string }> = { success: true, data: { id: itemId } };
    res.json(response);
  });

  return router;
}

// ── Private helpers ────────────────────────────────────────────

function assertAdminRole(req: Request): void {
  // In development, admin endpoints are open to allow local testing.
  if (config.NODE_ENV === 'development') return;
  const roles = req.user?.roles;
  if (!roles?.includes('CRMAdmin')) {
    throw new ForbiddenError('CRMAdmin role required');
  }
}
