/**
 * TokenResolutionService — pure function resolution of theme tokens.
 *
 * Given a set of raw Dataverse records and a resolution context, computes the
 * winning CSS value for each active token definition. No I/O — deterministic,
 * easily unit-testable.
 *
 * Algorithm source: Section 7.5 of phase-3-arch.md (authoritative contract).
 */

import type { TokenDefinition, TokenValue, TokenResolutionContext } from './TokenTypes.js';
import { TOKEN_LEVEL } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Resolves a token map (slug → CSS value) from raw Dataverse records and a context.
 *
 * Pure function — no side effects, no I/O. Safe to call from any context.
 */
export class TokenResolutionService {
  /**
   * Computes the resolved token map for the given context.
   *
   * For each active token definition:
   *   1. Gather active value records scoped to this definition that match the context.
   *   2. Sort by specificity (level) descending, then by locale specificity descending.
   *   3. Take the first (highest-specificity, most locale-specific) candidate.
   *   4. Fall back to definition.defaultValue if no candidate exists.
   *
   * @param definitions - All active qdb_token_definitions records
   * @param values      - All active qdb_token_values records
   * @param context     - Resolution context from the request query
   * @returns A flat map of { slug: cssValue } for all active definitions
   */
  resolve(
    definitions: TokenDefinition[],
    values: TokenValue[],
    context: TokenResolutionContext,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const definition of definitions) {
      if (!definition.isActive) continue;

      const winner = this.resolveDefinition(definition, values, context);
      result[definition.slug] = winner ?? definition.defaultValue ?? '';
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private — per-definition resolution
  // ---------------------------------------------------------------------------

  private resolveDefinition(
    definition: TokenDefinition,
    values: TokenValue[],
    context: TokenResolutionContext,
  ): string | null {
    const candidates = values.filter(
      (v) =>
        v.definitionId === definition.id &&
        v.isActive &&
        this.matchesContext(v, context) &&
        this.localeSpecificityOf(v, context) > 0,
    );

    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort(
      (a, b) =>
        this.specificityOf(b) - this.specificityOf(a) ||
        this.localeSpecificityOf(b, context) - this.localeSpecificityOf(a, context),
    );

    return sorted[0]?.value ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private — context matching
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the given value record is applicable to the resolution context.
   * Implements the level-specific matching rules from Section 7.5.
   */
  private matchesContext(value: TokenValue, context: TokenResolutionContext): boolean {
    switch (value.level) {
      case TOKEN_LEVEL.GLOBAL:
        return true;

      case TOKEN_LEVEL.RENDER_TARGET:
        return value.renderTarget === context.renderTarget;

      case TOKEN_LEVEL.CATEGORY:
        return (
          (value.renderTarget === context.renderTarget || value.renderTarget === null) &&
          value.category !== null &&
          String(value.category) === String(context.category)
        );

      case TOKEN_LEVEL.COMPONENT:
        return (
          (value.renderTarget === context.renderTarget || value.renderTarget === null) &&
          (value.category === null ||
            String(value.category) === String(context.category)) &&
          value.componentSlug === context.componentSlug
        );

      case TOKEN_LEVEL.SERVICE:
        return value.serviceSlug === context.service;

      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — scoring
  // ---------------------------------------------------------------------------

  /**
   * Returns the specificity score for the token's level.
   * Higher number = higher priority when multiple values match the context.
   */
  private specificityOf(value: TokenValue): number {
    switch (value.level) {
      case TOKEN_LEVEL.SERVICE:       return 50;
      case TOKEN_LEVEL.COMPONENT:     return 40;
      case TOKEN_LEVEL.CATEGORY:      return 30;
      case TOKEN_LEVEL.RENDER_TARGET: return 20;
      case TOKEN_LEVEL.GLOBAL:        return 10;
      default:                        return 0;
    }
  }

  /**
   * Returns the locale specificity score for the token value given the context locale.
   *
   * Locale exclusion rule (Section 7.5):
   *   - locale matching context.locale → 2 (highest priority)
   *   - locale = null (neutral)        → 1 (beats mismatched locale)
   *   - locale ≠ context.locale        → 0 (excluded — filter removes these)
   *
   * Returning 0 for a non-matching specific locale effectively excludes it:
   * the pre-filter in resolveDefinition removes all candidates where
   * localeSpecificityOf returns 0.
   */
  private localeSpecificityOf(value: TokenValue, context: TokenResolutionContext): number {
    if (value.locale === context.locale) return 2;
    if (value.locale === null) return 1;
    return 0;
  }
}
