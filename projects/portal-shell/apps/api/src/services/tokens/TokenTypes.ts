/**
 * TokenTypes — domain types, Zod validation schemas, and option set constants
 * for the DXP-P1-003 Theme Token System.
 *
 * All Zod schemas are defined here so routes and services share one source of truth.
 * Option set integer codes match the Dataverse GlobalOptionSets provisioned in
 * projects/dxp-p1-003/scripts/provision-schema/.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Option set integer constants (Section 6.1 of phase-3-arch.md)
// ---------------------------------------------------------------------------

/** qdb_token_type GlobalOptionSet codes */
export const TOKEN_TYPE = {
  COLOR: 860005001,
  TYPOGRAPHY_FAMILY: 860005002,
  TYPOGRAPHY_SIZE: 860005003,
  TYPOGRAPHY_WEIGHT: 860005004,
  SPACING: 860005005,
  BORDER_RADIUS: 860005006,
  SHADOW: 860005007,
  DIRECTION: 860005008,
} as const;

/** qdb_token_level GlobalOptionSet codes */
export const TOKEN_LEVEL = {
  GLOBAL: 860005011,
  RENDER_TARGET: 860005012,
  CATEGORY: 860005013,
  COMPONENT: 860005014,
  SERVICE: 860005015,
} as const;

/** qdb_token_category GlobalOptionSet codes */
export const TOKEN_CATEGORY = {
  WIDGET: 860005021,
  FORM: 860005022,
  NAV_COMPONENT: 860005023,
  LAYOUT: 860005024,
  DATA_DISPLAY: 860005025,
} as const;

// ---------------------------------------------------------------------------
// Domain types — mirror the Dataverse entity shapes with domain-friendly names
// ---------------------------------------------------------------------------

/** Domain object for a qdb_token_definitions record. */
export interface TokenDefinition {
  id: string;
  name: string;
  slug: string;
  tokenType: number;
  description: string | null;
  defaultValue: string | null;
  isActive: boolean;
  createdOn: string;
  modifiedOn: string;
}

/** Domain object for a qdb_token_values record. */
export interface TokenValue {
  id: string;
  definitionId: string;
  definitionSlug: string;
  level: number;
  renderTarget: string | null;
  category: number | null;
  componentSlug: string | null;
  serviceSlug: string | null;
  locale: string | null;
  value: string;
  publishedOn: string | null;
  publishedBy: string | null;
  isActive: boolean;
  createdOn: string;
  modifiedOn: string;
}

/** Context used by TokenResolutionService to resolve the token map. */
export interface TokenResolutionContext {
  renderTarget: 'portal' | 'admin' | 'mobile';
  locale: 'ar' | 'en' | null;
  service: string | null;
  category: string | null;
  componentSlug: string | null;
}

/** Identity of the caller performing a write operation. */
export interface CallerContext {
  /** Role string from JWT — 'portal-admin' | 'service-owner' | ... */
  role: string;
  /** Extracted from 'service-owner:<slug>' role — null for portal-admin. */
  serviceSlug: string | null;
  /** User ID (sub claim) of the authenticated user. */
  userId: string;
}

// ---------------------------------------------------------------------------
// API response summary types
// ---------------------------------------------------------------------------

/** Flat response shape for a token definition record. */
export type TokenDefinitionSummary = TokenDefinition;

/** Flat response shape for a token value record. */
export type TokenValueSummary = TokenValue;

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

/** Query schema for GET /api/tokens/resolve and GET /api/admin/tokens/preview. */
export const TokenResolveQuerySchema = z.object({
  renderTarget: z.enum(['portal', 'admin', 'mobile']).default('portal'),
  locale: z.enum(['ar', 'en']).optional(),
  service: z.string().regex(/^[a-z0-9-]+$/).optional(),
  category: z.string().regex(/^[a-z0-9-]+$/).optional(),
  componentSlug: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

/** Query schema for GET /api/admin/tokens/definitions. */
export const TokenDefinitionListQuerySchema = z.object({
  activeOnly: z.coerce.boolean().default(true),
  tokenType: z.coerce.number().int().optional(),
  top: z.coerce.number().int().min(1).max(250).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

/** Body schema for POST /api/admin/tokens/definitions. */
export const TokenDefinitionCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case'),
  tokenType: z.number().int().min(860005001).max(860005008),
  description: z.string().max(1000).optional(),
  defaultValue: z.string().max(500).optional(),
});

/**
 * Body schema for PATCH /api/admin/tokens/definitions/:slug.
 * slug and tokenType are intentionally absent — they are immutable after creation.
 */
export const TokenDefinitionPatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  defaultValue: z.string().max(500).optional(),
});

/** Query schema for GET /api/admin/tokens/values. */
export const TokenValueListQuerySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  level: z.coerce.number().int().optional(),
  service: z.string().optional(),
  activeOnly: z.coerce.boolean().default(true),
  top: z.coerce.number().int().min(1).max(250).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

/** Body schema for POST /api/admin/tokens/values. */
export const TokenValueCreateSchema = z
  .object({
    definitionSlug: z.string().regex(/^[a-z0-9-]+$/),
    level: z.number().int().min(860005011).max(860005015),
    renderTarget: z.enum(['portal', 'admin', 'mobile']).optional(),
    category: z.number().int().optional(),
    componentSlug: z.string().regex(/^[a-z0-9-]+$/).optional(),
    serviceSlug: z.string().regex(/^[a-z0-9-]+$/).optional(),
    locale: z.enum(['ar', 'en']).optional(),
    value: z.string().min(1).max(500),
  })
  .superRefine((data, ctx) => {
    if (data.level === 860005012 && !data.renderTarget) {
      ctx.addIssue({
        code: 'custom',
        message: 'renderTarget is required for render-target level',
        path: ['renderTarget'],
      });
    }
    if (data.level === 860005013 && !data.category) {
      ctx.addIssue({
        code: 'custom',
        message: 'category is required for category level',
        path: ['category'],
      });
    }
    if (data.level === 860005014 && !data.componentSlug) {
      ctx.addIssue({
        code: 'custom',
        message: 'componentSlug is required for component level',
        path: ['componentSlug'],
      });
    }
    if (data.level === 860005015 && !data.serviceSlug) {
      ctx.addIssue({
        code: 'custom',
        message: 'serviceSlug is required for service level',
        path: ['serviceSlug'],
      });
    }
  });

/**
 * Body schema for POST /api/service/tokens/values.
 * level is always TOKEN_LEVEL.SERVICE; serviceSlug comes from JWT — not accepted in body.
 */
export const ServiceTokenValueCreateSchema = z.object({
  definitionSlug: z.string().regex(/^[a-z0-9-]+$/),
  locale: z.enum(['ar', 'en']).optional(),
  value: z.string().min(1).max(500),
});

// ---------------------------------------------------------------------------
// Payload types used internally by repositories
// ---------------------------------------------------------------------------

export type CreateTokenDefinitionPayload = z.infer<typeof TokenDefinitionCreateSchema>;
export type UpdateTokenDefinitionPayload = z.infer<typeof TokenDefinitionPatchSchema>;
export type CreateTokenValuePayload = z.infer<typeof TokenValueCreateSchema> & {
  /** Resolved from definitionSlug before calling the repository. */
  definitionId: string;
};

export type TokenDefinitionListQuery = z.infer<typeof TokenDefinitionListQuerySchema>;
export type TokenValueListQuery = z.infer<typeof TokenValueListQuerySchema>;
export type TokenResolveQuery = z.infer<typeof TokenResolveQuerySchema>;
