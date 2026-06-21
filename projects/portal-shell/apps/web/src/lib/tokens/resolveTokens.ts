import type { TokenResolutionContext } from './TokenResolutionContext';

// Prefer internal URL (server-to-server) over public URL to avoid going through
// the public network. Falls back to NEXT_PUBLIC_API_URL for local development.
const TOKEN_API_URL =
  process.env['INTERNAL_API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? '';

/**
 * Builds URLSearchParams from a TokenResolutionContext, omitting undefined fields.
 * Pure function — no side effects.
 */
function buildQueryParams(context: TokenResolutionContext): URLSearchParams {
  const params = new URLSearchParams();

  params.set('renderTarget', context.renderTarget);

  if (context.locale) params.set('locale', context.locale);
  if (context.service) params.set('service', context.service);
  if (context.category) params.set('category', context.category);
  if (context.componentSlug) params.set('componentSlug', context.componentSlug);

  return params;
}

/**
 * Resolves the token map for the given SSR context by calling the live-cache
 * token resolution endpoint.
 *
 * Uses Next.js ISR fetch cache with a 5-minute revalidation window (ADR-003-001 TTL).
 * On any non-ok response: logs the failure and returns an empty map so the portal
 * renders without CSS vars rather than crashing (graceful degradation).
 *
 * IMPORTANT: console.error is intentional here — this is a Next.js Server Component.
 * Pino is not available in the RSC runtime; structured logging occurs in the API layer.
 */
export async function resolveTokensForSSR(
  context: TokenResolutionContext,
): Promise<Record<string, string>> {
  const params = buildQueryParams(context);
  const url = `${TOKEN_API_URL}/api/tokens/resolve?${params.toString()}`;

  let response: Response;

  try {
    response = await fetch(url, {
      next: { revalidate: 300 },
    });
  } catch (error) {
    console.error('[tokens] Network error fetching token map', { url, error });
    return {};
  }

  if (!response.ok) {
    console.error('[tokens] Failed to fetch token map', {
      url,
      status: response.status,
    });
    return {};
  }

  const body = (await response.json()) as { data: Record<string, string> };
  return body.data;
}
