import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { NotificationService } from '../services/NotificationService.js';
import type { PortalNotification } from '@portal/types';

interface NotificationRouteOptions {
  notificationService: NotificationService;
}

const IdParamSchema = z.object({ id: z.string().uuid() });

/**
 * Notification routes — /api/notifications/*
 * All routes require authentication. User can only access their own records.
 */
export async function notificationRoutes(
  app: FastifyInstance,
  { notificationService }: NotificationRouteOptions,
): Promise<void> {
  // GET /api/notifications
  app.get<{ Reply: { data: PortalNotification[] } }>(
    '/api/notifications',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Notifications'], summary: 'Get notifications for the authenticated user' },
    },
    async (request, reply) => {
      const userId = request.user?.sub ?? '';
      const notifications = await notificationService.getNotificationsForUser(
        userId,
        request.correlationId,
      );
      return reply.status(200).send({ data: notifications });
    },
  );

  // PATCH /api/notifications/:id/read
  app.patch<{ Params: { id: string } }>(
    '/api/notifications/:id/read',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Notifications'], summary: 'Mark a notification as read' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const userId = request.user?.sub ?? '';
      await notificationService.markAsRead(id, userId, request.correlationId);
      return reply.status(204).send();
    },
  );

  // PATCH /api/notifications/read-all
  app.patch(
    '/api/notifications/read-all',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read for the authenticated user',
      },
    },
    async (request, reply) => {
      const userId = request.user?.sub ?? '';
      await notificationService.markAllAsRead(userId, request.correlationId);
      return reply.status(204).send();
    },
  );
}
