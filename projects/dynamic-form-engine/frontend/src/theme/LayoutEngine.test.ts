// RED — failing until LayoutEngine is implemented
import { describe, it, expect } from 'vitest';
import { LayoutEngine } from './LayoutEngine';
import type { FormDesign, LayoutGrid } from '@dfe/shared';

function makeFormDesign(
  layoutType: FormDesign['layoutType'] = 'SingleColumn',
): FormDesign {
  return {
    id: 'fd-1',
    layoutType,
    labelPosition: 'Top',
    sectionStyle: 'Card',
    tabStyle: 'Tabs',
    buttonStyle: 'Primary',
    animationEnabled: false,
    alignment: 'Left',
    stickyActionBar: false,
    skeletonLoaderEnabled: false,
    isActive: true,
  };
}

describe('LayoutEngine.buildGrid', () => {
  it('returns_singleColumnGrid_forSingleColumnLayout', () => {
    const formDesign = makeFormDesign('SingleColumn');

    const result = LayoutEngine.buildGrid(formDesign, [], 'desktop');

    expect(result.containerStyle.gridTemplateColumns).toBe('repeat(1, 1fr)');
  });

  it('returns_twoColumnGrid_forTwoColumnLayout', () => {
    const formDesign = makeFormDesign('TwoColumn');

    const result = LayoutEngine.buildGrid(formDesign, [], 'desktop');

    expect(result.containerStyle.gridTemplateColumns).toBe('repeat(2, 1fr)');
  });

  it('returns_threeColumnGrid_forInlineCompactLayout', () => {
    const formDesign = makeFormDesign('InlineCompact');

    const result = LayoutEngine.buildGrid(formDesign, [], 'desktop');

    expect(result.containerStyle.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });

  it('appliesDesktopSpan_forDesktopBreakpoint', () => {
    const formDesign = makeFormDesign('TwoColumn');
    const layoutGrid: LayoutGrid[] = [
      {
        id: 'lg-1',
        formDesignId: 'fd-1',
        fieldId: 'field-1',
        columnsTotal: 2,
        spanMobile: 2,
        spanTablet: 2,
        spanDesktop: 1,
      },
    ];

    const result = LayoutEngine.buildGrid(formDesign, layoutGrid, 'desktop');

    expect(result.getFieldStyle('field-1', 'desktop').gridColumn).toBe('span 1');
  });

  it('appliesMobileSpan_forMobileBreakpoint', () => {
    const formDesign = makeFormDesign('TwoColumn');
    const layoutGrid: LayoutGrid[] = [
      {
        id: 'lg-1',
        formDesignId: 'fd-1',
        fieldId: 'field-1',
        columnsTotal: 2,
        spanMobile: 2,
        spanTablet: 1,
        spanDesktop: 1,
      },
    ];

    const result = LayoutEngine.buildGrid(formDesign, layoutGrid, 'mobile');

    expect(result.getFieldStyle('field-1', 'mobile').gridColumn).toBe('span 2');
  });

  it('defaults_toSpanOne_forUnknownFieldId', () => {
    const formDesign = makeFormDesign('TwoColumn');

    const result = LayoutEngine.buildGrid(formDesign, [], 'desktop');

    expect(result.getFieldStyle('unknown-field', 'desktop').gridColumn).toBe('span 1');
  });
});
