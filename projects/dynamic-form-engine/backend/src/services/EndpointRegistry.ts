import { z } from 'zod';
import { logger } from '../utils/logger.js';

// DFE-APILOOKUP-001 — server-side registry of approved external API endpoints.
// The registry is administrator-managed via the API_LOOKUP_ENDPOINT_REGISTRY env var
// (a JSON array). It is never writable by a form maker or portal user, and its
// contents (URLs, credentials) never leave the backend.

const endpointSchema = z.object({
  endpointKey: z.string().min(1),
  targetUrl: z.string().url().refine((u) => u.startsWith('https://'), 'targetUrl must be HTTPS'),
  httpMethod: z.literal('GET').default('GET'),
  authHeaderName: z.string().min(1).optional(),
  authHeaderValue: z.string().min(1).optional(),
  timeoutMs: z.coerce.number().int().positive().max(30_000).default(5_000),
  isActive: z.boolean().default(true),
});

export type RegisteredEndpoint = z.infer<typeof endpointSchema>;

// Both the env-var registry (below) and the Dataverse-backed registry satisfy this.
// resolve/activeKeys may be sync (env) or async (Dataverse); callers await either.
export interface IEndpointRegistry {
  resolve(endpointKey: string): RegisteredEndpoint | null | Promise<RegisteredEndpoint | null>;
  activeKeys(): string[] | Promise<string[]>;
}

export class EndpointRegistry implements IEndpointRegistry {
  private readonly byKey: Map<string, RegisteredEndpoint>;

  constructor(registryJson: string) {
    this.byKey = EndpointRegistry.parse(registryJson);
  }

  /** Resolve an opaque key to its endpoint, or null when unknown or inactive. */
  resolve(endpointKey: string): RegisteredEndpoint | null {
    const entry = this.byKey.get(endpointKey);
    if (!entry || !entry.isActive) return null;
    return entry;
  }

  /** Active endpoint keys — the only registry data ever exposed to the designer. */
  activeKeys(): string[] {
    return [...this.byKey.values()].filter((e) => e.isActive).map((e) => e.endpointKey);
  }

  private static parse(registryJson: string): Map<string, RegisteredEndpoint> {
    const map = new Map<string, RegisteredEndpoint>();
    let raw: unknown;
    try {
      raw = JSON.parse(registryJson);
    } catch {
      logger.error('API_LOOKUP_ENDPOINT_REGISTRY is not valid JSON — no endpoints registered');
      return map;
    }
    const parsed = z.array(endpointSchema).safeParse(raw);
    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues }, 'API_LOOKUP_ENDPOINT_REGISTRY failed validation — no endpoints registered');
      return map;
    }
    for (const entry of parsed.data) {
      map.set(entry.endpointKey, entry);
    }
    logger.info({ count: map.size }, 'Endpoint registry loaded');
    return map;
  }
}
