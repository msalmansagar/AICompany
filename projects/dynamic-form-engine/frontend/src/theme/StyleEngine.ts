// Pure utility — no React imports, no side effects.
// Resolves design tokens from a DesignPayload into CSSProperties objects.
import type { CSSProperties } from 'react';
import type { DesignPayload, FieldWidthType } from '@dfe/shared';

export interface ResolvedFieldStyle {
  containerStyle: CSSProperties;
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
}

const WIDTH_MAP: Record<FieldWidthType, string> = {
  Full: '100%',
  Half: '50%',
  Custom: '100%', // Custom uses customWidth; falls back to Full
};

function resolveFieldWidth(
  width: FieldWidthType,
  customWidth: string | undefined,
): string {
  if (width === 'Custom') return customWidth ?? '100%';
  return WIDTH_MAP[width];
}

function buildEmptyStyle(): CSSProperties {
  return {};
}

export const StyleEngine = {
  resolveSection(payload: DesignPayload, sectionId: string): CSSProperties {
    const design = payload.sectionDesigns[sectionId];
    if (!design) return buildEmptyStyle();

    return {
      backgroundColor: design.backgroundColor,
      border: design.borderStyle,
      padding: design.padding,
      margin: design.margin,
    };
  },

  resolveField(payload: DesignPayload, fieldId: string): ResolvedFieldStyle {
    const design = payload.fieldDesigns[fieldId];
    if (!design) {
      return {
        containerStyle: buildEmptyStyle(),
        labelStyle: buildEmptyStyle(),
        inputStyle: buildEmptyStyle(),
      };
    }

    const width = resolveFieldWidth(design.width, design.customWidth);

    return {
      containerStyle: { width, height: design.height },
      labelStyle: (design.labelStyle as CSSProperties) ?? buildEmptyStyle(),
      inputStyle: buildEmptyStyle(),
    };
  },
};
