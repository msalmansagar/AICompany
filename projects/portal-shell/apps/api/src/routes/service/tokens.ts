/**
 * Service-owner token routes.
 *
 * All routes require JWT authentication + 'service-owner' role.
 * The service slug is always derived from the caller's role slug (never from request body).
 *
 * Routes:
 *   GET    /api/service/tokens               — resolve token map for caller's service
 *   POST   /api/service/tokens/values        — create Level 5 (service) value override
 *   DELETE /api/service/tokens/values/:id    — soft-delete a Level 5 value
 *
 * Service slug extraction:
 *   Role slug format: 'service-owner:<slug>'
 *   extractServiceSlug() returns the suffix, or null if no suffix present.
 *   A missing service slug returns 403 (TokenNoServiceSlugError).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServiceTokenValueCreateSchema } from '../../services/tokens/TokenTypes.js';
import type { TokenValueSummary, CallerContext } from '../../services/tokens/TokenTypes.js';
import { extractServiceSlug } from '../../services/tokens/TokenValueService.js';
import { buildContextKey } from '../../services/tokens/ITokenCacheService.js';
import { TokenNoServiceSlugError } from '../../services/tokens/TokenErrors.js';
import type { ITokenCacheService } from '../../services/tokens/ITokenCacheService.js';
import type { TokenResolutionService } from '../../services/tokens/TokenResolutionService.js';
import type { ITokenDefinitionRepository } from '../../services/tokens/TokenDefinitionRepository.js';
import type { ITokenValueRepository } from '../../services/tokens/TokenValueRepository.js';
import type { TokenValueService } from '../../services/tokens/TokenValueService.js';

interface ServiceTokenRouteOptions {
  cacheService: ITokenCacheService;
  tokenResolutionService: TokenResolutionService;
  tokenValueService: TokenValueService;
  definitionRepo: ITokenDefinitionRepository;
  valueRepo: ITokenValueRepository;
}

const SERVICE_OWNER_ROLE = 'service-owner';
const IdParamSchema = z.object({ id: z.string().uuid() });

const ServiceTokenQuerySchema = z.object({
  renderTarget: z.enum(['portal', 'admin', 'mobile']).default('portal'),
  locale: z.enum(['ar', 'en']).optional(),
});

/**
 * Service-owner token routes.
 */
export async function serviceTokenRoutes(
  app: FastifyInstance,
  {
    cacheService,
    tokenResolutionService,
    tokenValueService,
    definitionRepo,
    valueRepo,
  }: ServiceTokenRouteOptions,
): Promise<void> {
  const AUTH_HANDLERS = [app.authenticate, app.requireRole(SERVICE_OWNER_ROLE)];

  // GET /api/service/tokens — live cache, service slug enforced
  app.get<{ Querystring: Record<string, string>; Reply: { data: Record<string, string> } }>(
    '/api/service/tokens',
    {
      preHandler: AUTH_HANDLERS,
      schema: {
        tags: ['Service', 'Tokens'],
        summary:
          'Resolve token map for the calling service from live cache (service-owner only)',
      },
    },
    async (request, reply) => {
      const callerServiceSlug = resolveCallerServiceSlug(request.user?.roles ?? []);
      const query = ServiceTokenQuerySchema.parse(request.query);

      const context = {
        renderTarget: query.renderTarget as 'portal' | 'admin' | 'mobile',
        locale: query.locale ?? null,
        service: callerServiceSlug,
        category: null,
        componentSlug: null,
      };

      const contextKey = buildContextKey(context);
      const cachedMap = await cacheService.getResolvedMap('live', contextKey);

      if (cachedMap !== null) {
        return reply.status(200).send({ data: cachedMap });
      }

      const resolvedMap = await resolveServiceTokenMap(
        context,
        contextKey,
        cacheService,
        tokenResolutionService,
        definitionRepo,
        valueRepo,
      );

      return reply.status(200).send({ data: resolvedMap });
    },
  );

  // POST /api/service/tokens/values — create Level 5 value
  app.post<{ Reply: { data: TokenValueSummary } }>(
    '/api/service/tokens/values',
    {
      preHandler: AUTH_HANDLERS,
      schema: {
        tags: ['Service', 'Tokens'],
        summary: 'Create a Level 5 (service-scoped) token value override',
      },
    },
    async (request, reply) => {
      const callerServiceSlug = resolveCallerServiceSlug(request.user?.roles ?? []);
      const body = ServiceTokenValueCreateSchema.parse(request.body);
      const callerContext: CallerContext = {
        role: SERVICE_OWNER_ROLE,
        serviceSlug: callerServiceSlug,
        userId: request.userId ?? 'unknown',
      };

      app.log.info({
        operation: 'service.tokens.values.create',
        correlationId: request.correlationId,
        userId: request.userId,
        serviceSlug: callerServiceSlug,
        definitionSlug: body.definitionSlug,
      });

      const created = await tokenValueService.createServiceValue(body, callerContext);
      return reply.status(201).send({ data: created });
    },
  );

  // DELETE /api/service/tokens/values/:id
  app.delete<{ Params: { id: string } }>(
    '/api/service/tokens/values/:id',
    {
      preHandler: AUTH_HANDLERS,
      schema: {
        tags: ['Service', 'Tokens'],
        summary: 'Soft-delete a Level 5 (service-scoped) token value override',
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const callerServiceSlug = resolveCallerServiceSlug(request.user?.roles ?? []);
      const callerContext: CallerContext = {
        role: SERVICE_OWNER_ROLE,
        serviceSlug: callerServiceSlug,
        userId: request.userId ?? 'unknown',
      };

      app.log.info({
        operation: 'service.tokens.values.delete',
        correlationId: request.correlationId,
        userId: request.userId,
        serviceSlug: callerServiceSlug,
        valueId: id,
      });

      await tokenValueService.deactivateValue(id, callerContext);
      return reply.status(204).send();
    },
  );
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the service slug from the caller's JWT roles array.
 * The service-owner role slug must be in the form 'service-owner:<slug>'.
 *
 * @throws TokenNoServiceSlugError when no valid service slug is found
 */
function resolveCallerServiceSlug(roles: string[]): string {
  for (const role of roles) {
    const slug = extractServiceSlug(role);
    if (slug !== null && slug.length > 0) return slug;
  }
  throw new TokenNoServiceSlugError();
}

async function resolveServiceTokenMap(
  context: {
    renderTarget: 'portal' | 'admin' | 'mobile';
    locale: string | null;
    service: string | null;
    category: string | null;
    componentSlug: string | null;
  },
  contextKey: string,
  cacheService: ITokenCacheService,
  tokenResolutionService: TokenResolutionService,
  definitionRepo: ITokenDefinitionRepository,
  valueRepo: ITokenValueRepository,
): Promise<Record<string, string>> {
  let rawDefs = await cacheService.getRawDefinitions();
  let rawVals = await cacheService.getRawValues('live');

  if (rawDefs === null || rawVals === null) {
    rawDefs = await definitionRepo.findAll({ activeOnly: true });
    rawVals = await valueRepo.findAllActive();
    await cacheService.setRawDefinitions(rawDefs);
    await cacheService.setRawValues('live', rawVals);
  }

  const resolvedMap = tokenResolutionService.resolve(rawDefs, rawVals, {
    renderTarget: context.renderTarget,
    locale: (context.locale as 'ar' | 'en' | null) ?? null,
    service: context.service ?? null,
    category: context.category ?? null,
    componentSlug: context.componentSlug ?? null,
  });

  await cacheService.setResolvedMap('live', contextKey, resolvedMap);
  return resolvedMap;
}
