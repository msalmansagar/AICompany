import NodeCache from 'node-cache';
import type { AppAbility } from '@portal/types';

// TTL matches access token lifetime (15 min = 900 s) so cache entries
// self-expire when the JWT they were built for can no longer be presented.
const abilityCache = new NodeCache({ stdTTL: 900, useClones: false });

/**
 * Returns the cached AppAbility for a user at a specific RBAC version,
 * or undefined on cache miss.
 */
export function getCachedAbility(userId: string, rbacVersion: number): AppAbility | undefined {
  return abilityCache.get<AppAbility>(buildCacheKey(userId, rbacVersion));
}

/**
 * Stores an AppAbility in the cache keyed by userId + rbacVersion.
 * The cache evicts automatically at the configured TTL.
 */
export function setCachedAbility(userId: string, rbacVersion: number, ability: AppAbility): void {
  abilityCache.set(buildCacheKey(userId, rbacVersion), ability);
}

function buildCacheKey(userId: string, rbacVersion: number): string {
  return `${userId}:${rbacVersion}`;
}
