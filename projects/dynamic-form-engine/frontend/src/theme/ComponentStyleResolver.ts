// Pure utility â€” no React imports, no side effects.
// Maps FieldDesign + ThemeDefinition to Fluent UI component props.
import type { CSSProperties } from 'react';
import type { FieldDesign, ThemeDefinition, InputStyleType } from '@qdb/shared';

export interface ResolvedComponentProps {
  appearance: 'outline' | 'filled-darker' | 'underline';
  style?: CSSProperties;
}

const INPUT_APPEARANCE_MAP: Record<
  InputStyleType,
  ResolvedComponentProps['appearance']
> = {
  Outlined: 'outline',
  Filled: 'filled-darker',
  Standard: 'underline',
};

function resolveAppearance(
  inputStyle: InputStyleType,
): ResolvedComponentProps['appearance'] {
  return INPUT_APPEARANCE_MAP[inputStyle] ?? 'outline';
}

export const ComponentStyleResolver = {
  resolve(
    fieldDesign: FieldDesign | undefined,
    _theme: ThemeDefinition,
  ): ResolvedComponentProps {
    if (!fieldDesign) return { appearance: 'outline' };

    return {
      appearance: resolveAppearance(fieldDesign.inputStyle),
      style: fieldDesign.focusStyle as CSSProperties | undefined,
    };
  },
};
