/**
 * Stands in for `GET /api/tokens/resolve` (DXP-P1-003).
 *
 * The real endpoint returns exactly this shape — a flat slug → CSS value map,
 * already sanitised by `sanitiseResolvedMap`. Keeping the same shape means the
 * wiring below drops into portal-shell by swapping this one module for
 * `resolveTokensForSSR`.
 *
 * Token types exercised here (qdb_token_type option set):
 *   TYPOGRAPHY_FAMILY = 860005002
 *   DIRECTION         = 860005008
 */

import { colorTokenMap } from '../theme.tokens';

export interface TokenResolutionContext {
  renderTarget: 'portal' | 'admin' | 'mobile';
  locale: 'ar' | 'en';
}

/**
 * Level 1 (global) values — the platform defaults.
 *
 * The Reyada palette is merged in here rather than living in a stylesheet, so
 * every brand colour arrives through the same resolution path as typography
 * and direction. That is what makes per-service and per-locale palettes
 * possible without touching a page or a component.
 */
const GLOBAL_TOKENS: Record<string, string> = {
  'text-direction': 'ltr',
  'font-family-base': "'Segoe UI', Tahoma, sans-serif",
  'font-size-body': '16px',
  ...colorTokenMap(),
};

/**
 * Level 2 (render target + locale) overrides. The Arabic cascade swaps the
 * font family and flips direction — the same cascade the real
 * TokenResolutionService computes from Dataverse records.
 */
const ARABIC_OVERRIDES: Record<string, string> = {
  'text-direction': 'rtl',
  // GE Dinar first, then a licensed-safe OFL fallback, then a system Arabic face.
  // NOTE: this value carries the font NAME only — never an @font-face src.
  // See fonts.css for why.
  'font-family-base': "'GE Dinar One', 'Noto Sans Arabic', Tahoma, sans-serif",
};

/**
 * Resolves the token map for a rendering context.
 * Mirrors `resolveTokensForSSR` — returns `{}` rather than throwing on failure,
 * so the page renders unstyled instead of crashing.
 */
export function resolveTokens(context: TokenResolutionContext): Record<string, string> {
  if (context.locale !== 'ar') return { ...GLOBAL_TOKENS };
  return { ...GLOBAL_TOKENS, ...ARABIC_OVERRIDES };
}
