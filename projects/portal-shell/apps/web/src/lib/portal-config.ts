import { unstable_cache } from 'next/cache';
import type { PortalConfig } from '@portal/types';

const API_BASE = process.env['API_URL'] ?? 'http://localhost:4001';
const PORTAL_ID = process.env['NEXT_PUBLIC_PORTAL_ID'] ?? 'default';

/**
 * Fetches the portal configuration from the Fastify API.
 * Cached by Next.js with a 5-minute revalidation window.
 * Cache tag: portal-config-{portalId} — invalidated by admin save endpoint.
 */
export const getPortalConfig = unstable_cache(
  async (portalId: string): Promise<PortalConfig> => {
    const response = await fetch(`${API_BASE}/api/portal-config`, {
      headers: { 'x-portal-id': portalId },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to load portal config for portalId "${portalId}": ${response.status}`
      );
    }

    return response.json() as Promise<PortalConfig>;
  },
  ['portal-config'],
  {
    revalidate: 300,
    tags: [`portal-config-${PORTAL_ID}`],
  }
);

/**
 * Returns the active portal ID from the environment.
 * Overridable via x-portal-id header in middleware.
 */
export function getPortalId(): string {
  return PORTAL_ID;
}
