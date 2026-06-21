import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type { ComponentRegistryService } from '../../services/ComponentRegistryService.js';
import { RegistryError } from '../../services/ComponentRegistryService.js';

interface AdminComponentRouteOptions {
  componentRegistryService: ComponentRegistryService;
}

const ADMIN_ROLE = 'Admin';

const IdParamSchema = z.object({ id: z.string().uuid() });
const VersionParamSchema = z.object({ id: z.string().uuid(), versionId: z.string().uuid() });

const ListQuerySchema = z.object({
  category: z.coerce.number().int().optional(),
  top: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
});

const CreateDefinitionSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'name must be kebab-case'),
  displayName: z.string().min(1).max(255),
  displayNameAr: z.string().max(255).optional(),
  descriptionEn: z.string().max(2000).optional(),
  descriptionAr: z.string().max(2000).optional(),
  category: z.number().int(),
  renderTargets: z.array(z.string().min(1)).min(1),
});

// category and name are immutable after creation (BRD FR-042) — not exposed here.
// .strict() ensures any attempt to send them returns 400.
const PatchDefinitionSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  displayNameAr: z.string().max(255).optional(),
  descriptionEn: z.string().max(2000).optional(),
  descriptionAr: z.string().max(2000).optional(),
  renderTargets: z.array(z.string().min(1)).min(1).optional(),
}).strict();

const CreateVersionSchema = z.object({
  versionNumber: z.string().min(1).max(50),
  propsSchema: z.string().max(1048576).optional(),
  defaultProps: z.string().max(1048576).optional(),
  bundleUrl: z.string().url().max(2048).optional(),
  changeLog: z.string().max(4000).optional(),
});

// isLatest, propsSchema, versionNumber, defaultProps are immutable after creation (BRD C-005, C-006).
// deprecatedOn cannot be cleared once set to a non-null value.
// .strict() ensures sending immutable fields returns 400, not a silent strip.
const PatchVersionSchema = z.object({
  changeLog: z.string().max(4000).optional(),
  bundleUrl: z.string().url().max(2048).optional(),
  deprecatedOn: z.string().datetime().optional(),
}).strict();

type AuthHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * Admin Component Registry routes — JWT authentication + Admin role required on all.
 *
 * Routes:
 *   GET    /api/admin/components                                        — list definitions
 *   POST   /api/admin/components                                        — create definition
 *   GET    /api/admin/components/:id                                    — get definition
 *   PATCH  /api/admin/components/:id                                    — update definition
 *   DELETE /api/admin/components/:id                                    — deactivate definition
 *   GET    /api/admin/components/:id/versions                           — list versions
 *   POST   /api/admin/components/:id/versions                           — create version
 *   GET    /api/admin/components/:id/versions/latest                    — get current latest non-deprecated version
 *   GET    /api/admin/components/:id/versions/:versionId                — get version by ID
 *   PATCH  /api/admin/components/:id/versions/:versionId                — update version
 *   DELETE /api/admin/components/:id/versions/:versionId                — deactivate version
 *   POST   /api/admin/components/:id/versions/:versionId/set-latest     — promote version to latest
 */
export async function adminComponentRoutes(
  app: FastifyInstance,
  { componentRegistryService: registry }: AdminComponentRouteOptions,
): Promise<void> {
  const authGuard: AuthHandler[] = [app.authenticate, app.requireRole(ADMIN_ROLE)];

  // GET /api/admin/components
  app.get(
    '/api/admin/components',
    { preHandler: authGuard },
    async (request, reply) => {
      const query = ListQuerySchema.parse(request.query);

      app.log.info({
        operation: 'admin.components.list',
        correlationId: request.correlationId,
        userId: request.userId,
        query,
      });

      const { items, total } = await registry.listDefinitions(
        {
          top: query.top,
          skip: query.skip,
          ...(query.category !== undefined ? { category: query.category } : {}),
        },
        request.correlationId,
      );

      return reply.status(200).send({ items, total, top: query.top, skip: query.skip });
    },
  );

  // POST /api/admin/components
  app.post(
    '/api/admin/components',
    { preHandler: authGuard },
    async (request, reply) => {
      const body = CreateDefinitionSchema.parse(request.body);

      app.log.info({
        operation: 'admin.components.create',
        correlationId: request.correlationId,
        userId: request.userId,
        componentName: body.name,
      });

      try {
        const created = await registry.createDefinition(body, request.correlationId);
        return reply.status(201).send({ data: created });
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // GET /api/admin/components/:id
  app.get(
    '/api/admin/components/:id',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.components.getById',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
      });

      try {
        const definition = await registry.getDefinitionById(id, request.correlationId);
        return reply.status(200).send({ data: definition });
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // PATCH /api/admin/components/:id
  app.patch(
    '/api/admin/components/:id',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const parsed = PatchDefinitionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ code: 'validation_error', message: parsed.error.message });
      }

      app.log.info({
        operation: 'admin.components.patch',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
      });

      try {
        await registry.patchDefinition(id, parsed.data, request.correlationId);
        return reply.status(204).send();
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // DELETE /api/admin/components/:id
  app.delete(
    '/api/admin/components/:id',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.components.deactivate',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
      });

      try {
        await registry.deactivateDefinition(id, request.correlationId);
        return reply.status(204).send();
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // GET /api/admin/components/:id/versions
  app.get(
    '/api/admin/components/:id/versions',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const query = ListQuerySchema.parse(request.query);

      app.log.info({
        operation: 'admin.components.versions.list',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
        query,
      });

      try {
        const { items, total } = await registry.listVersions(
          id,
          { top: query.top, skip: query.skip },
          request.correlationId,
        );
        return reply.status(200).send({ items, total, top: query.top, skip: query.skip });
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // POST /api/admin/components/:id/versions
  app.post(
    '/api/admin/components/:id/versions',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const body = CreateVersionSchema.parse(request.body);

      app.log.info({
        operation: 'admin.components.versions.create',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
        versionNumber: body.versionNumber,
      });

      try {
        const created = await registry.createVersion(id, body, request.correlationId);
        return reply.status(201).send({ data: created });
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // GET /api/admin/components/:id/versions/latest
  // Registered before /:versionId so Fastify matches the static segment first.
  app.get(
    '/api/admin/components/:id/versions/latest',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.components.versions.getLatest',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
      });

      try {
        const version = await registry.getLatestVersion(id, request.correlationId);
        return reply.status(200).send({ data: version });
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // GET /api/admin/components/:id/versions/:versionId
  app.get(
    '/api/admin/components/:id/versions/:versionId',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id, versionId } = VersionParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.components.versions.getById',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
        versionId,
      });

      try {
        const version = await registry.getVersionById(id, versionId, request.correlationId);
        return reply.status(200).send({ data: version });
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // PATCH /api/admin/components/:id/versions/:versionId
  app.patch(
    '/api/admin/components/:id/versions/:versionId',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id, versionId } = VersionParamSchema.parse(request.params);
      const parsed = PatchVersionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ code: 'validation_error', message: parsed.error.message });
      }

      app.log.info({
        operation: 'admin.components.versions.patch',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
        versionId,
      });

      try {
        await registry.patchVersion(id, versionId, parsed.data, request.correlationId);
        return reply.status(204).send();
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // DELETE /api/admin/components/:id/versions/:versionId
  app.delete(
    '/api/admin/components/:id/versions/:versionId',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id, versionId } = VersionParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.components.versions.deactivate',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
        versionId,
      });

      try {
        await registry.deactivateVersion(id, versionId, request.correlationId);
        return reply.status(204).send();
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );

  // POST /api/admin/components/:id/versions/:versionId/set-latest
  app.post(
    '/api/admin/components/:id/versions/:versionId/set-latest',
    { preHandler: authGuard },
    async (request, reply) => {
      const { id, versionId } = VersionParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.components.versions.setLatest',
        correlationId: request.correlationId,
        userId: request.userId,
        componentId: id,
        versionId,
      });

      try {
        await registry.setLatestVersion(id, versionId, request.correlationId);
        return reply.status(204).send();
      } catch (error) {
        return handleRegistryError(error, reply);
      }
    },
  );
}

function handleRegistryError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof RegistryError) {
    return reply.status(error.statusCode).send({ code: error.code, message: error.message });
  }
  if (error instanceof DataverseNotFoundError) {
    return reply.status(404).send({ code: 'not_found', message: 'Resource not found' });
  }
  throw error;
}
