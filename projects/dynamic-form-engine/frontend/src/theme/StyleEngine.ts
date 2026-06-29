// Pure utility — no React imports, no side effects.
// Resolves design tokens from a DesignPayload into CSSProperties objects.
// Memoized at the sub-object level (SC-06): WeakMap keyed on sectionDesigns/fieldDesigns maps.
import type { CSSProperties } from 'react';
import type { DesignPayload, FieldWidthType, SectionDesign, FieldDesign } from '@qdb/shared';

export interface ResolvedFieldStyle {
  containerStyle: CSSProperties;
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
}

// Module-level caches — keyed on the sub-object reference, not the full payload.
// A structural edit to fieldDesigns creates a new fieldDesigns reference but NOT a new
// sectionDesigns reference, so only the field cache is invalidated.
const sectionStyleCache = new WeakMap<
  Record<string, SectionDesign>,
  Map<string, CSSProperties>
>();
const fieldStyleCache = new WeakMap<
  Record<string, FieldDesign>,
  Map<string, ResolvedFieldStyle>
>();

const WIDTH_MAP: Record<FieldWidthType, string> = {
  Full: '100%',
  Half: '50%',
  Custom: '100%',
};

function resolveFieldWidth(width: FieldWidthType, customWidth: string | undefined): string {
  if (width === 'Custom') return customWidth ?? '100%';
  return WIDTH_MAP[width];
}

function buildEmptyStyle(): CSSProperties {
  return {};
}

function buildEmptyFieldStyle(): ResolvedFieldStyle {
  return {
    containerStyle: buildEmptyStyle(),
    labelStyle: buildEmptyStyle(),
    inputStyle: buildEmptyStyle(),
  };
}

/**
 * Substitutes physical directional CSS properties with logical equivalents for RTL layouts.
 * Applied only when isRtl is true (BR-014).
 */
function applyRtlSubstitution(style: CSSProperties): CSSProperties {
  const rtl: CSSProperties = { ...style };
  if (style.paddingLeft !== undefined) { rtl.paddingRight = style.paddingLeft; delete rtl.paddingLeft; }
  if (style.paddingRight !== undefined) { rtl.paddingLeft = style.paddingRight; delete rtl.paddingRight; }
  if (style.marginLeft !== undefined) { rtl.marginRight = style.marginLeft; delete rtl.marginLeft; }
  if (style.marginRight !== undefined) { rtl.marginLeft = style.marginRight; delete rtl.marginRight; }
  if (style.left !== undefined) { rtl.right = style.left; delete rtl.left; }
  if (style.right !== undefined) { rtl.left = style.right; delete rtl.right; }
  if (style.borderLeft !== undefined) { rtl.borderRight = style.borderLeft; delete rtl.borderLeft; }
  if (style.borderRight !== undefined) { rtl.borderLeft = style.borderRight; delete rtl.borderRight; }
  return rtl;
}

function computeSectionStyle(design: SectionDesign, isRtl: boolean): CSSProperties {
  const base: CSSProperties = {
    backgroundColor: design.backgroundColor,
    border: design.borderStyle,
    padding: design.padding,
    margin: design.margin,
  };
  return isRtl ? applyRtlSubstitution(base) : base;
}

function computeFieldStyle(design: FieldDesign, isRtl: boolean): ResolvedFieldStyle {
  const width = resolveFieldWidth(design.width, design.customWidth);
  const base: ResolvedFieldStyle = {
    containerStyle: { width, height: design.height },
    labelStyle: (design.labelStyle as CSSProperties) ?? buildEmptyStyle(),
    inputStyle: buildEmptyStyle(),
  };
  if (!isRtl) return base;
  return {
    ...base,
    containerStyle: applyRtlSubstitution(base.containerStyle),
    labelStyle: applyRtlSubstitution(base.labelStyle),
  };
}

export const StyleEngine = {
  resolveSection(
    payload: DesignPayload,
    sectionId: string,
    isRtl?: boolean,
  ): CSSProperties {
    const { sectionDesigns } = payload;
    const design = sectionDesigns[sectionId];
    if (!design) return buildEmptyStyle();

    const cacheKey = `${sectionId}:${isRtl === true}`;
    let cache = sectionStyleCache.get(sectionDesigns);
    if (!cache) { cache = new Map(); sectionStyleCache.set(sectionDesigns, cache); }

    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = computeSectionStyle(design, isRtl === true);
    cache.set(cacheKey, result);
    return result;
  },

  resolveField(
    payload: DesignPayload,
    fieldId: string,
    isRtl?: boolean,
  ): ResolvedFieldStyle {
    const { fieldDesigns } = payload;
    const design = fieldDesigns[fieldId];
    if (!design) return buildEmptyFieldStyle();

    const cacheKey = `${fieldId}:${isRtl === true}`;
    let cache = fieldStyleCache.get(fieldDesigns);
    if (!cache) { cache = new Map(); fieldStyleCache.set(fieldDesigns, cache); }

    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = computeFieldStyle(design, isRtl === true);
    cache.set(cacheKey, result);
    return result;
  },
};
