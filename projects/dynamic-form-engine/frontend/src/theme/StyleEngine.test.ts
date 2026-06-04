// RED â€” failing until StyleEngine is implemented
import { describe, it, expect } from 'vitest';
import { StyleEngine } from './StyleEngine';
import type { DesignPayload } from '@qdb/shared';
import { LIGHT_THEME } from './themes';

function makePayload(
  overrides: Partial<DesignPayload> = {},
): DesignPayload {
  return {
    theme: LIGHT_THEME,
    formDesign: {
      id: 'fd-1',
      layoutType: 'SingleColumn',
      labelPosition: 'Top',
      sectionStyle: 'Card',
      tabStyle: 'Tabs',
      buttonStyle: 'Primary',
      animationEnabled: false,
      alignment: 'Left',
      stickyActionBar: false,
      skeletonLoaderEnabled: false,
      isActive: true,
    },
    sectionDesigns: {},
    fieldDesigns: {},
    buttonDesigns: { Submit: undefined, SaveDraft: undefined, Cancel: undefined },
    layoutGrid: [],
    ...overrides,
  };
}

describe('StyleEngine.resolveSection', () => {
  it('returns_emptyObject_whenSectionDesignMissing', () => {
    const payload = makePayload();

    const result = StyleEngine.resolveSection(payload, 'missing-id');

    expect(result).toEqual({});
  });

  it('returns_sectionCssProperties_whenDesignExists', () => {
    const payload = makePayload({
      sectionDesigns: {
        'sec-1': {
          id: 'sd-1',
          sectionId: 'sec-1',
          backgroundColor: '#f0f0f0',
          borderStyle: '1px solid red',
          padding: '16px',
          margin: '8px',
          columnLayout: 2,
          cardStyle: 'Flat',
          collapsibleStyle: 'None',
          visibilityAnimation: 'None',
          isActive: true,
        },
      },
    });

    const result = StyleEngine.resolveSection(payload, 'sec-1');

    expect(result.backgroundColor).toBe('#f0f0f0');
    expect(result.border).toBe('1px solid red');
    expect(result.padding).toBe('16px');
    expect(result.margin).toBe('8px');
  });
});

describe('StyleEngine.resolveField', () => {
  it('returns_emptyStyles_whenFieldDesignMissing', () => {
    const payload = makePayload();

    const result = StyleEngine.resolveField(payload, 'field-x');

    expect(result.containerStyle).toEqual({});
    expect(result.labelStyle).toEqual({});
    expect(result.inputStyle).toEqual({});
  });

  it('resolves_halfWidth_toFiftyPercent', () => {
    const payload = makePayload({
      fieldDesigns: {
        'field-1': {
          id: 'fld-1',
          fieldId: 'field-1',
          inputStyle: 'Outlined',
          width: 'Half',
          isActive: true,
        },
      },
    });

    const result = StyleEngine.resolveField(payload, 'field-1');

    expect(result.containerStyle.width).toBe('50%');
  });

  it('resolves_fullWidth_toOneHundredPercent', () => {
    const payload = makePayload({
      fieldDesigns: {
        'field-1': {
          id: 'fld-1',
          fieldId: 'field-1',
          inputStyle: 'Outlined',
          width: 'Full',
          isActive: true,
        },
      },
    });

    const result = StyleEngine.resolveField(payload, 'field-1');

    expect(result.containerStyle.width).toBe('100%');
  });

  it('resolves_customWidth_fromCustomWidthProperty', () => {
    const payload = makePayload({
      fieldDesigns: {
        'field-1': {
          id: 'fld-1',
          fieldId: 'field-1',
          inputStyle: 'Outlined',
          width: 'Custom',
          customWidth: '300px',
          isActive: true,
        },
      },
    });

    const result = StyleEngine.resolveField(payload, 'field-1');

    expect(result.containerStyle.width).toBe('300px');
  });
});
