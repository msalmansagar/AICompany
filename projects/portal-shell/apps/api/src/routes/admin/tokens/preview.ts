/**
 * Admin token preview route — serves draft cache.
 *
 * GET /api/admin/tokens/preview
 *
 * Requires JWT authentication + 'portal-admin' role.
 *
 * Identical resolution flow to GET /api/tokens/resolve but reads from the
 * draft cache tier. Allows admins to preview unpublished token changes before
 * calling POST /api/admin/tokens/publish.
 *
 * Uses the same TokenResolveQuerySchema as the public resolve endpoint.
 */

import type { FastifyInstance } from 'fastify';
import { TokenResolveQuerySchema } from '../../../services/tokens/TokenTypes.js';
import { buildContextKey } from '../../../services/tokens/ITokenCacheService.js';
import type { ITokenCacheService } from '../../../services/tokens/ITokenCacheService.js';
import type { TokenResolutionService } from '../../../services/tokens/TokenResolutionService.js';
import type { ITokenDefinitionRepository } from '../../../services/tokens/TokenDefinitionRepository.js';
import type { ITokenValueRepository } from '../../../services/tokens/TokenValueRepository.js';
import { sanitiseResolvedMap } from '../../../services/tokens/cssUtils.js';

interface AdminTokenPreviewRouteOptions {
  cacheService: ITokenCacheService;
  tokenResolutionService: TokenResolutionService;
  definitionRepo: ITokenDefinitionRepository;
  valueRepo: ITokenValueRepository;
}

const PORTAL_ADMIN_ROLE = 'portal-admin';

/**
 * Admin token preview route — returns draft-cached token resolution.
 */
export async function adminTokenPreviewRoutes(
  app: FastifyInstance,
  {
    cacheService,
    tokenResolutionService,
    definitionRepo,
    valueRepo,
  }: AdminTokenPreviewRouteOptions,
): Promise<void> {
  const AUTH_HANDLERS = [app.authenticate, app.requireRole(PORTAL_ADMIN_ROLE)];

  app.get<{ Querystring: Record<string, string>; Reply: { data: Record<string, string> } }>(
    '/api/admin/tokens/preview',
    {
      preHandler: AUTH_HANDLERS,
      schema: {
        tags: ['Admin', 'Tokens'],
        summary: 'Preview token resolution from draft cache (includes unpublished changes)',
      },
    },
    async (request, reply) => {
      const query = TokenResolveQuerySchema.parse(request.query);
      const context = {
        renderTarget: query.renderTarget as 'portal' | 'admin' | 'mobile',
        locale: query.locale ?? null,
        service: query.service ?? null,
        category: query.category ?? null,
        componentSlug: query.componentSlug ?? null,
      };

      const contextKey = buildContextKey(context);

      const cachedMap = await cacheService.getResolvedMap('draft', contextKey);
      if (cachedMap !== null) {
        app.log.debug({
          operation: 'admin.tokens.preview.draft_cache_hit',
          contextKey,
        });
        return reply.status(200).send({ data: sanitiseResolvedMap(cachedMap) });
      }

      app.log.info({
        operation: 'admin.tokens.preview.draft_cache_miss',
        correlationId: request.correlationId,
        contextKey,
      });

      const resolvedMap = await resolveFromDraftCache(
        context,
        contextKey,
        cacheService,
        tokenResolutionService,
        definitionRepo,
        valueRepo,
        app,
        request.correlationId,
      );

      return reply.status(200).send({ data: resolvedMap });
    },
  );
}

// ---------------------------------------------------------------------------
// Private — draft two-tier cache flow
// ---------------------------------------------------------------------------

async function resolveFromDraftCache(
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
  app: FastifyInstance,
  correlationId?: string,
): Promise<Record<string, string>> {
  let rawDefs = await cacheService.getRawDefinitions();
  let rawVals = await cacheService.getRawValues('draft');

  if (rawDefs === null || rawVals === null) {
    app.log.info({
      operation: 'admin.tokens.preview.dataverse_fetch',
      correlationId,
    });
    rawDefs = await definitionRepo.findAll({ activeOnly: true });
    rawVals = await valueRepo.findAllActive();
    await cacheService.setRawDefinitions(rawDefs);
    await cacheService.setRawValues('draft', rawVals);
  }

  const resolvedMap = tokenResolutionService.resolve(rawDefs, rawVals, {
    renderTarget: context.renderTarget,
    locale: (context.locale as 'ar' | 'en' | null) ?? null,
    service: context.service ?? null,
    category: context.category ?? null,
    componentSlug: context.componentSlug ?? null,
  });

  await cacheService.setResolvedMap('draft', contextKey, resolvedMap);
  return sanitiseResolvedMap(resolvedMap);
}
