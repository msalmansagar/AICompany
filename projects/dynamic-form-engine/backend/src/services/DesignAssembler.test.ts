import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DesignAssembler, DEFAULT_DESIGN_PAYLOAD } from './DesignAssembler.js';

vi.mock('../config/env.js', () => ({
  config: {
    DATAVERSE_URL: 'https://test.crm.dynamics.com',
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const mockAuthService = {
  getAccessToken: vi.fn().mockResolvedValue('mock-token'),
};

function spyCrmFetch(
  service: DesignAssembler,
  handler: (path: string) => Promise<unknown>,
) {
  return vi.spyOn(
    service as unknown as { crmFetch: (path: string) => Promise<unknown> },
    'crmFetch',
  ).mockImplementation(handler);
}

function buildRawFormDesign(overrides: Record<string, unknown> = {}) {
  return {
    qdb_form_designid: 'fd-001',
    _qdb_form_definition_id_value: '11111111-1111-4111-8111-111111111111',
    _qdb_theme_id_value: null,
    qdb_theme_id: null,
    qdb_layout_type: 100000001,
    qdb_label_position: 100000001,
    qdb_section_style: 100000001,
    qdb_tab_style: 100000001,
    qdb_button_style: 100000001,
    qdb_animation_enabled: true,
    qdb_alignment: 100000001,
    qdb_sticky_action_bar: false,
    qdb_skeleton_loader_enabled: true,
    qdb_is_active: true,
    ...overrides,
  };
}

describe('DesignAssembler', () => {
  let assembler: DesignAssembler;

  beforeEach(() => {
    vi.clearAllMocks();
    assembler = new DesignAssembler(
      mockAuthService as unknown as ConstructorParameters<typeof DesignAssembler>[0],
    );
  });

  // ── No form design in Dataverse ───────────────────────────────────────────

  it('assembleDesignPayload_noFormDesign_returnsDefaultPayload', async () => {
    spyCrmFetch(assembler, async () => ({ value: [] }));

    const result = await assembler.assembleDesignPayload('11111111-1111-4111-8111-111111111111');

    expect(result.theme.themeCode).toBe('light');
    expect(result.theme.primaryColor).toBe('#0078d4');
    expect(result.formDesign.layoutType).toBe('SingleColumn');
    expect(result.sectionDesigns).toEqual({});
    expect(result.fieldDesigns).toEqual({});
    expect(result.layoutGrid).toEqual([]);
  });

  // ── Full assembly with theme ──────────────────────────────────────────────

  it('assembleDesignPayload_withExpandedTheme_usesFormTheme', async () => {
    spyCrmFetch(assembler, async (path) => {
      if (path.includes('qdb_form_designs')) {
        return {
          value: [buildRawFormDesign({
            _qdb_theme_id_value: 'theme-dark-001',
            qdb_theme_id: {
              qdb_themeid: 'theme-dark-001',
              qdb_theme_code: 'dark',
              qdb_theme_name: 'Dark Mode',
              qdb_primary_color: '#ffffff',
              qdb_is_dark_mode: true,
              qdb_is_active: true,
            },
          })],
        };
      }
      return { value: [] };
    });

    const result = await assembler.assembleDesignPayload('11111111-1111-4111-8111-111111111111');

    expect(result.theme.themeCode).toBe('dark');
    expect(result.theme.isDarkMode).toBe(true);
  });

  // ── Sub-query failure — graceful fallback ─────────────────────────────────

  it('assembleDesignPayload_sectionQueryFails_returnsEmptySectionDesigns', async () => {
    spyCrmFetch(assembler, async (path) => {
      if (path.includes('qdb_form_designs')) return { value: [buildRawFormDesign()] };
      if (path.includes('qdb_form_tabs')) return { value: [{ qdb_form_tabid: 'tab-1' }] };
      if (path.includes('qdb_form_sections')) return { value: [{ qdb_form_sectionid: 'sec-1' }] };
      if (path.includes('qdb_form_fields')) return { value: [] };
      if (path.includes('qdb_section_designs')) throw new Error('Dataverse unavailable');
      return { value: [] };
    });

    const result = await assembler.assembleDesignPayload('11111111-1111-4111-8111-111111111111');

    expect(result.sectionDesigns).toEqual({});
    expect(result.formDesign.layoutType).toBe('SingleColumn');
  });

  // ── Picklist mapping ──────────────────────────────────────────────────────

  it('assembleDesignPayload_picklistCodes_mapToCorrectEnumValues', async () => {
    spyCrmFetch(assembler, async (path) => {
      if (path.includes('qdb_form_designs')) {
        return {
          value: [buildRawFormDesign({
            qdb_layout_type: 100000002,    // TwoColumn
            qdb_label_position: 100000002, // Left
            qdb_section_style: 100000003,  // Outlined
            qdb_tab_style: 100000002,      // Stepper
            qdb_button_style: 100000002,   // Outline
            qdb_alignment: 100000002,      // Center
          })],
        };
      }
      return { value: [] };
    });

    const result = await assembler.assembleDesignPayload('11111111-1111-4111-8111-111111111111');

    expect(result.formDesign.layoutType).toBe('TwoColumn');
    expect(result.formDesign.labelPosition).toBe('Left');
    expect(result.formDesign.sectionStyle).toBe('Outlined');
    expect(result.formDesign.tabStyle).toBe('Stepper');
    expect(result.formDesign.buttonStyle).toBe('Outline');
    expect(result.formDesign.alignment).toBe('Center');
  });

  // ── DEFAULT_DESIGN_PAYLOAD export ─────────────────────────────────────────

  it('DEFAULT_DESIGN_PAYLOAD_hasExpectedShape', () => {
    expect(DEFAULT_DESIGN_PAYLOAD.theme.themeCode).toBe('light');
    expect(DEFAULT_DESIGN_PAYLOAD.formDesign.layoutType).toBe('SingleColumn');
    expect(DEFAULT_DESIGN_PAYLOAD.sectionDesigns).toEqual({});
    expect(DEFAULT_DESIGN_PAYLOAD.layoutGrid).toEqual([]);
    expect(DEFAULT_DESIGN_PAYLOAD.buttonDesigns.Submit).toBeUndefined();
  });
});
