/**
 * Brand palette as DXP-P1-003 theme tokens.
 *
 * WHY THESE ARE NOT PUCK COLOUR FIELDS:
 * if an editor can type a hex value, brand governance is gone — nothing stops
 * `#ff00ff` reaching a QDB page. Instead the editor picks a token SLUG from a
 * fixed list, and the token system decides what colour that slug resolves to.
 *
 * That keeps two properties the product needs:
 *   1. Only approved colours can ever render.
 *   2. Rebranding, or a per-service / per-locale palette, is a change to token
 *      VALUES in Dataverse — no page is edited and no code is deployed.
 *
 * Token type in the real schema: qdb_token_type = COLOR (860005001).
 */

export interface ColorToken {
  /** Becomes the CSS custom property name: `--{slug}`. */
  slug: string;
  labelEn: string;
  labelAr: string;
  value: string;
}

export const COLOR_TOKENS: ColorToken[] = [
  { slug: 'rey-green', labelEn: 'Brand green', labelAr: 'الأخضر الأساسي', value: '#3d8a72' },
  { slug: 'rey-green-dark', labelEn: 'Brand green (dark)', labelAr: 'الأخضر الداكن', value: '#2f7d68' },
  { slug: 'rey-green-soft', labelEn: 'Brand green (soft)', labelAr: 'الأخضر الفاتح', value: '#e6f2ee' },
  { slug: 'rey-navy', labelEn: 'Navy', labelAr: 'الكحلي', value: '#1b3a63' },
  { slug: 'rey-navy-soft', labelEn: 'Navy (soft)', labelAr: 'الكحلي الفاتح', value: '#e9f0fb' },
  { slug: 'rey-purple', labelEn: 'Purple', labelAr: 'البنفسجي', value: '#6b4bb0' },
  { slug: 'rey-purple-soft', labelEn: 'Purple (soft)', labelAr: 'البنفسجي الفاتح', value: '#f2ecfb' },
  { slug: 'rey-canvas', labelEn: 'Page background', labelAr: 'خلفية الصفحة', value: '#f4f6f8' },
  { slug: 'rey-surface', labelEn: 'Card surface', labelAr: 'سطح البطاقة', value: '#ffffff' },
  { slug: 'rey-border', labelEn: 'Border', labelAr: 'الحدود', value: '#e5e8eb' },
  { slug: 'rey-border-soft', labelEn: 'Border (soft)', labelAr: 'حدود فاتحة', value: '#eef1f4' },
  { slug: 'rey-ink', labelEn: 'Text', labelAr: 'النص', value: '#1a2129' },
  { slug: 'rey-muted', labelEn: 'Text (muted)', labelAr: 'نص ثانوي', value: '#5d6b7a' },
  { slug: 'rey-strip', labelEn: 'Strip background', labelAr: 'خلفية الشريط', value: '#f3f5f7' },
];

/**
 * Palette subset offered where a component exposes a colour choice. Deliberately
 * narrower than the full token set — an editor should not be able to paint a
 * heading in "border grey".
 */
const SELECTABLE = [
  'rey-green',
  'rey-green-dark',
  'rey-navy',
  'rey-purple',
  'rey-ink',
  'rey-muted',
];

/** Select options for a Puck colour field, labelled in both languages. */
export const COLOR_TOKEN_OPTIONS = COLOR_TOKENS.filter((t) => SELECTABLE.includes(t.slug)).map(
  (t) => ({ label: `${t.labelEn} — ${t.labelAr}`, value: t.slug }),
);

/** Soft/background tints, offered where a component needs a fill rather than ink. */
export const SURFACE_TOKEN_OPTIONS = COLOR_TOKENS.filter((t) =>
  ['rey-green-soft', 'rey-navy-soft', 'rey-purple-soft', 'rey-canvas', 'rey-surface', 'rey-strip'].includes(t.slug),
).map((t) => ({ label: `${t.labelEn} — ${t.labelAr}`, value: t.slug }));

/**
 * Resolves a token slug to a CSS `var()` reference — never to a literal colour.
 * Keeping the indirection all the way to the DOM is what lets the token system
 * re-theme a rendered page without touching stored content.
 */
export function colorVar(slug: string | undefined, fallback = 'rey-ink'): string {
  return `var(--${slug || fallback})`;
}

/** The token map this palette contributes to `GET /api/tokens/resolve`. */
export function colorTokenMap(): Record<string, string> {
  return Object.fromEntries(COLOR_TOKENS.map((t) => [t.slug, t.value]));
}
