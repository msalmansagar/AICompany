/**
 * TokenValueService — business logic for token value CRUD.
 *
 * Responsibilities (Section 7.4 of phase-3-arch.md):
 *  - Context uniqueness enforcement (409 on duplicate context)
 *  - Service-owner slug enforcement for Level 5 values
 *  - CSS value sanitisation (Section 13 — defence-in-depth)
 *  - Draft cache invalidation on every write
 */

import type { ITokenDefinitionRepository } from './TokenDefinitionRepository.js';
import type {
  ITokenValueRepository,
  TokenValueContextQuery,
  CreateTokenValuePayload,
} from './TokenValueRepository.js';
import type { ITokenCacheService } from './ITokenCacheService.js';
import type { TokenValue, CallerContext } from './TokenTypes.js';
import { TOKEN_LEVEL } from './TokenTypes.js';
import {
  TokenNotFoundError,
  TokenValueNotFoundError,
  TokenDuplicateContextError,
  TokenServiceSlugMismatchError,
  TokenNoServiceSlugError,
  TokenCssValueValidationError,
} from './TokenErrors.js';

// ---------------------------------------------------------------------------
// Zod schema for the value create body (imported type only — parsing in route)
// ---------------------------------------------------------------------------

import type { z } from 'zod';
import type { TokenValueCreateSchema, ServiceTokenValueCreateSchema } from './TokenTypes.js';

type TokenValueCreateInput = z.infer<typeof TokenValueCreateSchema>;
type ServiceTokenValueCreateInput = z.infer<typeof ServiceTokenValueCreateSchema>;

// ---------------------------------------------------------------------------
// Module-level helper
// ---------------------------------------------------------------------------

/**
 * Extracts the service slug suffix from a 'service-owner:<slug>' role string.
 * Returns null when the role slug does not match the expected format.
 *
 * @param roleSlug - e.g. 'service-owner:loan-services' → 'loan-services'
 */
export function extractServiceSlug(roleSlug: string): string | null {
  const prefix = 'service-owner:';
  return roleSlug.startsWith(prefix) ? roleSlug.slice(prefix.length) : null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service handling all business rules for the qdb_token_values entity.
 */
export class TokenValueService {
  private readonly definitionRepo: ITokenDefinitionRepository;
  private readonly valueRepo: ITokenValueRepository;
  private readonly cacheService: ITokenCacheService;

  constructor(
    definitionRepo: ITokenDefinitionRepository,
    valueRepo: ITokenValueRepository,
    cacheService: ITokenCacheService,
  ) {
    this.definitionRepo = definitionRepo;
    this.valueRepo = valueRepo;
    this.cacheService = cacheService;
  }

  /**
   * Returns a paginated list of token values from Dataverse.
   *
   * When a definition slug filter is provided, the definition GUID is resolved
   * first. Pagination (top/skip) is forwarded to the repository so the Dataverse
   * query is bounded.
   *
   * The cache-warming path (TokenQueryService.fetchRawRecords) calls
   * valueRepo.findAllActive() directly — without pagination — to ensure all
   * active records are cached. This method is for the admin list route only.
   */
  async listValues(filters: {
    slug?: string;
    level?: number;
    service?: string;
    activeOnly: boolean;
    top: number;
    skip: number;
  }): Promise<TokenValue[]> {
    if (filters.slug !== undefined) {
      const definition = await this.definitionRepo.findBySlug(filters.slug);
      if (!definition) throw new TokenNotFoundError(filters.slug);
      // Slug-scoped listing: active-only path (admin never needs the inactive+slug combo here)
      return filters.activeOnly
        ? this.valueRepo.findActiveByDefinitionId(definition.id)
        : this.valueRepo.findAllByDefinitionId(definition.id);
    }

    // Full list with pagination forwarded to Dataverse
    return this.valueRepo.findAllActive({ top: filters.top, skip: filters.skip });
  }

  /**
   * Returns a single token value by its Dataverse GUID.
   *
   * @throws TokenValueNotFoundError when the ID does not exist or is inactive
   */
  async getValueById(id: string): Promise<TokenValue> {
    const value = await this.valueRepo.findById(id);
    if (!value || !value.isActive) throw new TokenValueNotFoundError(id);
    return value;
  }

  /**
   * Creates a new token value after enforcing business rules.
   *
   * Business rules (in order):
   *  1. Resolves definition GUID from definitionSlug
   *  2. For Level 5 (service): enforces serviceSlug === callerContext.serviceSlug
   *  3. Sanitises CSS value
   *  4. Checks context uniqueness (409 on duplicate)
   *  5. Creates the Dataverse record
   *  6. Flushes draft cache
   *
   * @param input          - Validated create body from the route
   * @param callerContext  - Identity of the authenticated caller
   */
  async createValue(
    input: TokenValueCreateInput,
    callerContext: CallerContext,
  ): Promise<TokenValue> {
    const definition = await this.definitionRepo.findBySlug(input.definitionSlug);
    if (!definition) throw new TokenNotFoundError(input.definitionSlug);

    if (input.level === TOKEN_LEVEL.SERVICE) {
      this.enforceServiceSlugOwnership(input.serviceSlug ?? null, callerContext);
    }

    const sanitisedValue = TokenValueService.sanitizeCssValue(input.value);

    await this.ensureUniqueContext(
      definition.id,
      input.level,
      {
        renderTarget: input.renderTarget,
        category: input.category,
        componentSlug: input.componentSlug,
        serviceSlug: input.serviceSlug,
      },
      input.locale ?? null,
      input.definitionSlug,
    );

    const payload: CreateTokenValuePayload = {
      definitionId: definition.id,
      level: input.level,
      renderTarget: input.renderTarget ?? null,
      category: input.category ?? null,
      componentSlug: input.componentSlug ?? null,
      serviceSlug: input.serviceSlug ?? null,
      locale: input.locale ?? null,
      value: sanitisedValue,
    };

    const created = await this.valueRepo.create(payload);
    await this.cacheService.flushDraftCache();
    return created;
  }

  /**
   * Creates a Level 5 (service-owner) token value.
   * serviceSlug is derived from the caller's JWT role — never from the request body.
   *
   * @param input          - Validated body (no serviceSlug field)
   * @param callerContext  - Must carry a non-null serviceSlug extracted from JWT
   */
  async createServiceValue(
    input: ServiceTokenValueCreateInput,
    callerContext: CallerContext,
  ): Promise<TokenValue> {
    if (!callerContext.serviceSlug) throw new TokenNoServiceSlugError();

    const definition = await this.definitionRepo.findBySlug(input.definitionSlug);
    if (!definition) throw new TokenNotFoundError(input.definitionSlug);

    const sanitisedValue = TokenValueService.sanitizeCssValue(input.value);

    await this.ensureUniqueContext(
      definition.id,
      TOKEN_LEVEL.SERVICE,
      { serviceSlug: callerContext.serviceSlug },
      input.locale ?? null,
      input.definitionSlug,
    );

    const payload: CreateTokenValuePayload = {
      definitionId: definition.id,
      level: TOKEN_LEVEL.SERVICE,
      renderTarget: null,
      category: null,
      componentSlug: null,
      serviceSlug: callerContext.serviceSlug,
      locale: input.locale ?? null,
      value: sanitisedValue,
    };

    const created = await this.valueRepo.create(payload);
    await this.cacheService.flushDraftCache();
    return created;
  }

  /**
   * Soft-deletes a token value.
   * For service-owner callers: verifies ownership of the value's serviceSlug.
   * Flushes draft cache after deactivation.
   *
   * @throws TokenValueNotFoundError when the ID does not exist
   * @throws TokenServiceSlugMismatchError when service-owner doesn't own the value
   */
  async deactivateValue(id: string, callerContext: CallerContext): Promise<void> {
    const value = await this.getValueById(id);

    if (callerContext.role === 'service-owner') {
      this.enforceServiceSlugOwnershipForValue(value.serviceSlug, callerContext);
    }

    await this.valueRepo.deactivate(id);
    await this.cacheService.flushDraftCache();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private enforceServiceSlugOwnership(
    requestedServiceSlug: string | null,
    callerContext: CallerContext,
  ): void {
    if (!callerContext.serviceSlug) throw new TokenNoServiceSlugError();
    if (requestedServiceSlug !== callerContext.serviceSlug) {
      throw new TokenServiceSlugMismatchError(callerContext.serviceSlug);
    }
  }

  private enforceServiceSlugOwnershipForValue(
    valueServiceSlug: string | null,
    callerContext: CallerContext,
  ): void {
    if (!callerContext.serviceSlug) throw new TokenNoServiceSlugError();
    if (valueServiceSlug !== callerContext.serviceSlug) {
      throw new TokenServiceSlugMismatchError(callerContext.serviceSlug);
    }
  }

  private async ensureUniqueContext(
    definitionId: string,
    level: number,
    ctx: {
      renderTarget?: string | null;
      category?: number | null;
      componentSlug?: string | null;
      serviceSlug?: string | null;
    },
    locale: string | null,
    definitionSlug: string,
  ): Promise<void> {
    const query: TokenValueContextQuery = {
      definitionId,
      level,
      renderTarget: ctx.renderTarget ?? null,
      category: ctx.category ?? null,
      componentSlug: ctx.componentSlug ?? null,
      serviceSlug: ctx.serviceSlug ?? null,
      locale,
    };

    const existing = await this.valueRepo.findMatchingContext(query);
    if (existing) throw new TokenDuplicateContextError(definitionSlug);
  }

  /**
   * Sanitises a CSS value string to prevent CSS injection attacks.
   *
   * Strips semicolons (which could terminate the CSS custom property and inject new rules).
   * Rejects values containing url(), expression(), or import() which could load external
   * resources or execute scripts.
   *
   * @param value - Raw CSS value string from the request
   * @returns Sanitised value with semicolons stripped
   * @throws TokenCssValueValidationError if the value contains disallowed constructs
   */
  static sanitizeCssValue(value: string): string {
    if (value.includes('url(')) {
      throw new TokenCssValueValidationError("CSS value must not contain 'url()'");
    }
    if (value.includes('expression(')) {
      throw new TokenCssValueValidationError("CSS value must not contain 'expression()'");
    }
    if (value.includes('import(')) {
      throw new TokenCssValueValidationError("CSS value must not contain 'import()'");
    }
    // Reject angle brackets — they allow </style><script> injection when the value
    // is SSR-injected via dangerouslySetInnerHTML in layout.tsx (Audit A-003-003).
    if (value.includes('<') || value.includes('>')) {
      throw new TokenCssValueValidationError('CSS value must not contain < or >');
    }

    return value.replace(/;/g, '');
  }
}
