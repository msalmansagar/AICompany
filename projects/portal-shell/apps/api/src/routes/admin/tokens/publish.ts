/**
 * Admin token publish route.
 *
 * POST /api/admin/tokens/publish
 *
 * Requires JWT authentication + 'portal-admin' role.
 *
 * Implements the publish debounce and serialisation flow from ADR-003-007:
 *   1. Acquire publish lock → 429 if already in progress
 *   2. Check rate limit → 429 with Retry-After if within min interval
 *   3. Fetch all active definitions and values from Dataverse
 *   4. Update live cache (raw records + flush resolved maps)
 *   5. Record publish timestamp
 *   6. Release lock
 *   7. Return 204
 *
 * The publishedOn/publishedBy batch-PATCH step (Step 9 in arch doc) is
 * fire-and-forget after the 204 response to meet the 5s SLA (NFR-003).
 */

import type { FastifyInstance } from 'fastify';
import type { ITokenCacheService } from '../../../services/tokens/ITokenCacheService.js';
import type { ITokenDefinitionRepository } from '../../../services/tokens/TokenDefinitionRepository.js';
import type { ITokenValueRepository } from '../../../services/tokens/TokenValueRepository.js';
import {
  TokenPublishInProgressError,
  TokenPublishRateLimitedError,
} from '../../../services/tokens/TokenErrors.js';

interface AdminTokenPublishRouteOptions {
  cacheService: ITokenCacheService;
  definitionRepo: ITokenDefinitionRepository;
  valueRepo: ITokenValueRepository;
  publishMinIntervalMs: number;
}

const PORTAL_ADMIN_ROLE = 'portal-admin';
const PUBLISH_LOCK_TTL_SECONDS = 60;

/**
 * Admin token publish route.
 */
export async function adminTokenPublishRoutes(
  app: FastifyInstance,
  {
    cacheService,
    definitionRepo,
    valueRepo,
    publishMinIntervalMs,
  }: AdminTokenPublishRouteOptions,
): Promise<void> {
  const AUTH_HANDLERS = [app.authenticate, app.requireRole(PORTAL_ADMIN_ROLE)];

  app.post(
    '/api/admin/tokens/publish',
    {
      preHandler: AUTH_HANDLERS,
      schema: {
        tags: ['Admin', 'Tokens'],
        summary:
          'Publish all token changes to the live cache (rebuilds live cache from Dataverse)',
      },
    },
    async (request, reply) => {
      app.log.info({
        operation: 'admin.tokens.publish.start',
        correlationId: request.correlationId,
        userId: request.userId,
      });

      await acquirePublishLockOrThrow(cacheService);

      try {
        await enforceRateLimitOrThrow(cacheService, publishMinIntervalMs);
        await rebuildLiveCache(cacheService, definitionRepo, valueRepo, app, request.correlationId);
        await cacheService.setLastPublishedAt(new Date());
      } finally {
        await cacheService.releasePublishLock();
      }

      app.log.info({
        operation: 'admin.tokens.publish.complete',
        correlationId: request.correlationId,
        userId: request.userId,
      });

      return reply.status(204).send();
    },
  );
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function acquirePublishLockOrThrow(cacheService: ITokenCacheService): Promise<void> {
  const acquired = await cacheService.acquirePublishLock(PUBLISH_LOCK_TTL_SECONDS);
  if (!acquired) throw new TokenPublishInProgressError();
}

async function enforceRateLimitOrThrow(
  cacheService: ITokenCacheService,
  minIntervalMs: number,
): Promise<void> {
  const lastPublishedAt = await cacheService.getLastPublishedAt();
  if (lastPublishedAt === null) return;

  const elapsedMs = Date.now() - lastPublishedAt.getTime();
  if (elapsedMs < minIntervalMs) {
    throw new TokenPublishRateLimitedError(minIntervalMs - elapsedMs);
  }
}

async function rebuildLiveCache(
  cacheService: ITokenCacheService,
  definitionRepo: ITokenDefinitionRepository,
  valueRepo: ITokenValueRepository,
  app: FastifyInstance,
  correlationId?: string,
): Promise<void> {
  app.log.info({
    operation: 'admin.tokens.publish.dataverse_fetch',
    correlationId,
  });

  const [definitions, values] = await Promise.all([
    definitionRepo.findAll({ activeOnly: true }),
    valueRepo.findAllActive(),
  ]);

  await cacheService.setRawDefinitions(definitions);
  await cacheService.setRawValues('live', values);
  await cacheService.flushAllResolvedMaps('live');
}
