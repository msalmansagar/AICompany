/**
 * TokenDefinitionService — business logic for token definition CRUD.
 *
 * Responsibilities (Section 7.3 of phase-3-arch.md):
 *  - Slug kebab-case validation
 *  - Soft-limit guard (ADR-003-006) — countActive() before create
 *  - Duplicate slug rejection (409)
 *  - Cascade deactivation of child values on definition deactivation (AC-017)
 *  - Draft cache invalidation on deactivation
 */

import type { ITokenDefinitionRepository } from './TokenDefinitionRepository.js';
import type { ITokenValueRepository } from './TokenValueRepository.js';
import type { ITokenCacheService } from './ITokenCacheService.js';
import type {
  TokenDefinition,
  CreateTokenDefinitionPayload,
  UpdateTokenDefinitionPayload,
} from './TokenTypes.js';
import {
  TokenNotFoundError,
  TokenDuplicateSlugError,
  TokenDefinitionLimitError,
} from './TokenErrors.js';

const KEBAB_CASE_PATTERN = /^[a-z0-9-]+$/;

/**
 * Service handling all business rules for the qdb_token_definitions entity.
 */
export class TokenDefinitionService {
  private readonly definitionRepo: ITokenDefinitionRepository;
  private readonly valueRepo: ITokenValueRepository;
  private readonly cacheService: ITokenCacheService;
  private readonly softLimit: number;

  constructor(
    definitionRepo: ITokenDefinitionRepository,
    valueRepo: ITokenValueRepository,
    cacheService: ITokenCacheService,
    softLimit: number,
  ) {
    this.definitionRepo = definitionRepo;
    this.valueRepo = valueRepo;
    this.cacheService = cacheService;
    this.softLimit = softLimit;
  }

  /**
   * Returns all token definitions.
   *
   * @param activeOnly - When true, returns only records with statecode=0
   */
  async listDefinitions(activeOnly: boolean): Promise<TokenDefinition[]> {
    return this.definitionRepo.findAll({ activeOnly });
  }

  /**
   * Returns a single token definition by its kebab-case slug.
   *
   * @throws TokenNotFoundError when no active definition with this slug exists
   */
  async getDefinitionBySlug(slug: string): Promise<TokenDefinition> {
    const definition = await this.definitionRepo.findBySlug(slug);
    if (!definition) throw new TokenNotFoundError(slug);
    return definition;
  }

  /**
   * Creates a new token definition after validating business rules.
   *
   * Business rules enforced (in order):
   *  1. Slug must match kebab-case pattern ^[a-z0-9-]+$
   *  2. Active count must be below TOKEN_DEFINITION_SOFT_LIMIT (ADR-003-006)
   *  3. Slug must be unique across active definitions
   *
   * @throws Error with statusCode=400 when slug is not kebab-case
   * @throws TokenDefinitionLimitError when count >= softLimit
   * @throws TokenDuplicateSlugError when slug already exists
   */
  async createDefinition(payload: CreateTokenDefinitionPayload): Promise<TokenDefinition> {
    this.validateSlug(payload.slug);

    const activeCount = await this.definitionRepo.countActive();
    if (activeCount >= this.softLimit) {
      throw new TokenDefinitionLimitError(
        `Active token definition count (${activeCount}) has reached the configured ceiling ` +
          `(${this.softLimit}). A performance review is required before adding more definitions.`,
      );
    }

    const existing = await this.definitionRepo.findBySlug(payload.slug);
    if (existing) throw new TokenDuplicateSlugError(payload.slug);

    return this.definitionRepo.create(payload);
  }

  /**
   * Updates mutable fields (name, description, defaultValue) on a definition.
   * slug and tokenType are immutable — the Zod schema excludes them from the payload.
   *
   * @throws TokenNotFoundError when no active definition with this slug exists
   */
  async updateDefinition(slug: string, patch: UpdateTokenDefinitionPayload): Promise<void> {
    const definition = await this.getDefinitionBySlug(slug);
    await this.definitionRepo.update(definition.id, patch);
  }

  /**
   * Soft-deletes a token definition and cascades deactivation to all its child values.
   * Also flushes the draft cache so admin preview reflects the removal immediately.
   *
   * @throws TokenNotFoundError when no active definition with this slug exists
   */
  async deactivateDefinition(slug: string): Promise<void> {
    const definition = await this.getDefinitionBySlug(slug);

    await this.valueRepo.deactivateAllForDefinition(definition.id);
    await this.definitionRepo.deactivate(definition.id);
    await this.cacheService.flushDraftCache();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private validateSlug(slug: string): void {
    if (!KEBAB_CASE_PATTERN.test(slug)) {
      const error = new Error(`Slug '${slug}' is invalid — must match ^[a-z0-9-]+$`);
      (error as Error & { statusCode: number; code: string }).statusCode = 400;
      (error as Error & { statusCode: number; code: string }).code = 'validation_error';
      throw error;
    }
  }
}
