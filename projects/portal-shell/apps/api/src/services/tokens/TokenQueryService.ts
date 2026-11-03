/**
 * TokenQueryService — shared two-tier cache-first token resolution.
 *
 * Extracted from the three route files (resolve.ts, preview.ts, tokens.ts)
 * that each duplicated this same 8-parameter, 40+ line pattern.
 *
 * Resolution tiers (Section 8.4 of phase-3-arch.md):
 *   1. Resolved map cache hit  → return immediately (p95 < 5 ms)
 *   2. Raw records cache hit   → resolve in-process (no Dataverse call)
 *   3. Full cache miss         → fetch from Dataverse → warm both tiers → resolve
 */

import type { ITokenCacheService } from './ITokenCacheService.js';
import { buildContextKey } from './ITokenCacheService.js';
import type { TokenResolutionService } from './TokenResolutionService.js';
import type { ITokenDefinitionRepository } from './TokenDefinitionRepository.js';
import type { ITokenValueRepository } from './TokenValueRepository.js';
import type { TokenResolutionContext } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Dependency bundle — passed as a single parameter object (max 3 params rule)
// ---------------------------------------------------------------------------

export interface TokenQueryDependencies {
  cacheService: ITokenCacheService;
  resolutionService: TokenResolutionService;
  definitionRepo: ITokenDefinitionRepository;
  valueRepo: ITokenValueRepository;
}

// ---------------------------------------------------------------------------
// Logger shape — minimal interface so routes can pass app.log directly
// ---------------------------------------------------------------------------

interface Logger {
  debug(obj: object): void;
  info(obj: object): void;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves the token map for the given context using the two-tier cache strategy.
 *
 * @param context   - Resolution context (renderTarget, locale, service, etc.)
 * @param cacheType - 'live' for published tokens; 'draft' for admin preview
 * @param deps      - Injected service and repository dependencies
 * @param log       - Structured logger (app.log or equivalent)
 * @returns Resolved { slug: cssValue } map
 */
export async function resolveTokenMap(
  context: TokenResolutionContext,
  cacheType: 'live' | 'draft',
  deps: TokenQueryDependencies,
  log: Logger,
): Promise<Record<string, string>> {
  const contextKey = buildContextKey(context);
  const cached = await deps.cacheService.getResolvedMap(cacheType, contextKey);

  if (cached !== null) {
    log.debug({ operation: 'token.resolve.cache_hit', contextKey, cacheType });
    return cached;
  }

  return resolveFromRawOrDataverse(context, cacheType, contextKey, deps, log);
}

// ---------------------------------------------------------------------------
// Private — tier-2 and tier-3 resolution
// ---------------------------------------------------------------------------

async function resolveFromRawOrDataverse(
  context: TokenResolutionContext,
  cacheType: 'live' | 'draft',
  contextKey: string,
  deps: TokenQueryDependencies,
  log: Logger,
): Promise<Record<string, string>> {
  const [rawDefs, rawVals] = await fetchRawRecords(cacheType, deps, log);
  const resolvedMap = deps.resolutionService.resolve(rawDefs, rawVals, context);
  await deps.cacheService.setResolvedMap(cacheType, contextKey, resolvedMap);
  return resolvedMap;
}

async function fetchRawRecords(
  cacheType: 'live' | 'draft',
  deps: TokenQueryDependencies,
  log: Logger,
) {
  const cachedDefs = await deps.cacheService.getRawDefinitions();
  const cachedVals = await deps.cacheService.getRawValues(cacheType);

  if (cachedDefs !== null && cachedVals !== null) {
    return [cachedDefs, cachedVals] as const;
  }

  log.info({ operation: 'token.resolve.cache_miss', cacheType });

  // Cache-warming path: always fetch all active records (no pagination).
  const defs = await deps.definitionRepo.findAll({ activeOnly: true });
  const vals = await deps.valueRepo.findAllActive();

  await deps.cacheService.setRawDefinitions(defs);
  await deps.cacheService.setRawValues(cacheType, vals);

  return [defs, vals] as const;
}
