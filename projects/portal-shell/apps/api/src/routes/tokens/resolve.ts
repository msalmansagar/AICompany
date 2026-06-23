/**
 * Token resolution route — public, unauthenticated.
 *
 * GET /api/tokens/resolve
 *
 * Implements the two-tier cache-first flow from Section 8.4 of phase-3-arch.md:
 *   1. Try resolved map cache (live)
 *   2. On miss: try raw records cache → compute → cache resolved map
 *   3. On raw miss: fetch from Dataverse → cache raw → compute → cache resolved map
 *
 * This endpoint is the primary SSR path — must respond within 50ms p95 (NFR-001)
 * when the resolved map cache is warm.
 */

import type { FastifyInstance } from 'fastify';
import { TokenResolveQuerySchema } from '../../services/tokens/TokenTypes.js';
import { buildContextKey } from '../../services/tokens/ITokenCacheService.js';
import type { ITokenCacheService } from '../../services/tokens/ITokenCacheService.js';
import type { TokenResolutionService } from '../../services/tokens/TokenResolutionService.js';
import type { ITokenDefinitionRepository } from '../../services/tokens/TokenDefinitionRepository.js';
import type { ITokenValueRepository } from '../../services/tokens/TokenValueRepository.js';
import { sanitiseResolvedMap } from '../../services/tokens/cssUtils.js';

interface TokenResolveRouteOptions {
  cacheService: ITokenCacheService;
  tokenResolutionService: TokenResolutionService;
  definitionRepo: ITokenDefinitionRepository;
  valueRepo: ITokenValueRepository;
}

/**
 * Public token resolution route.
 * No authentication required — served from live cache.
 */
export async function tokenResolveRoutes(
  app: FastifyInstance,
  { cacheService, tokenResolutionService, definitionRepo, valueRepo }: TokenResolveRouteOptions,
): Promise<void> {
  app.get<{ Querystring: Record<string, string>; Reply: { data: Record<string, string> } }>(
    '/api/tokens/resolve',
    {
      schema: {
        tags: ['Tokens'],
        summary: 'Resolve theme token map for the given rendering context (public, live cache)',
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

      const cachedMap = await cacheService.getResolvedMap('live', contextKey);
      if (cachedMap !== null) {
        app.log.debug({ operation: 'tokens.resolve.cache_hit', contextKey });
        // Read-time sanitisation (B-003): values seeded via provisioning script bypass
        // write-time sanitisation in TokenValueService. Sanitise at serve time as defence-in-depth.
        return reply.status(200).send({ data: sanitiseResolvedMap(cachedMap) });
      }

      app.log.info({
        operation: 'tokens.resolve.cache_miss',
        correlationId: request.correlationId,
        contextKey,
      });

      const resolvedMap = await resolveFromCacheOrDataverse(
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
// Private — two-tier cache flow
// ---------------------------------------------------------------------------

async function resolveFromCacheOrDataverse(
  context: Parameters<typeof buildContextKey>[0] & {
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
  let rawVals = await cacheService.getRawValues('live');

  if (rawDefs === null || rawVals === null) {
    app.log.info({
      operation: 'tokens.resolve.dataverse_fetch',
      correlationId,
    });

    rawDefs = await definitionRepo.findAll({ activeOnly: true });
    rawVals = await valueRepo.findAllActive();

    await cacheService.setRawDefinitions(rawDefs);
    await cacheService.setRawValues('live', rawVals);
  }

  const resolvedMap = tokenResolutionService.resolve(rawDefs, rawVals, {
    renderTarget: context.renderTarget as 'portal' | 'admin' | 'mobile',
    locale: (context.locale as 'ar' | 'en' | null) ?? null,
    service: context.service ?? null,
    category: context.category ?? null,
    componentSlug: context.componentSlug ?? null,
  });

  await cacheService.setResolvedMap('live', contextKey, resolvedMap);
  // Read-time sanitisation (B-003): apply after resolution, before returning.
  return sanitiseResolvedMap(resolvedMap);
}
