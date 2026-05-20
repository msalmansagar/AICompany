// Pure utility — no React imports, no side effects.
// Builds CSS grid templates from FormDesign + LayoutGrid records.
import type { CSSProperties } from 'react';
import type { FormDesign, LayoutGrid, LayoutType } from '@dfe/shared';
import type { Breakpoint } from '../contexts/ResponsiveContext';

export interface GridTemplate {
  containerStyle: CSSProperties;
  getFieldStyle(fieldId: string, breakpoint: Breakpoint): CSSProperties;
}

const COLUMN_COUNT_BY_LAYOUT: Record<LayoutType, number> = {
  SingleColumn: 1,
  TwoColumn: 2,
  Grid: 12, // full-grid — field spans drive the layout
  Stepper: 1,
  Wizard: 1,
  Accordion: 1,
  TabBased: 1,
  InlineCompact: 3,
};

function buildSpanIndex(
  layoutGrid: LayoutGrid[],
  breakpoint: Breakpoint,
): Record<string, number> {
  const index: Record<string, number> = {};

  for (const entry of layoutGrid) {
    const span =
      breakpoint === 'mobile'
        ? entry.spanMobile
        : breakpoint === 'tablet'
          ? entry.spanTablet
          : entry.spanDesktop;

    index[entry.fieldId] = span;
  }

  return index;
}

export const LayoutEngine = {
  buildGrid(
    formDesign: FormDesign,
    layoutGrid: LayoutGrid[],
    breakpoint: Breakpoint,
  ): GridTemplate {
    const totalColumns = COLUMN_COUNT_BY_LAYOUT[formDesign.layoutType] ?? 1;
    const spanIndex = buildSpanIndex(layoutGrid, breakpoint);

    const containerStyle: CSSProperties = {
      display: 'grid',
      gridTemplateColumns: `repeat(${totalColumns}, 1fr)`,
      gap: '16px',
    };

    return {
      containerStyle,
      getFieldStyle(fieldId: string): CSSProperties {
        const span = Math.min(spanIndex[fieldId] ?? 1, totalColumns);
        return { gridColumn: `span ${span}` };
      },
    };
  },
};
