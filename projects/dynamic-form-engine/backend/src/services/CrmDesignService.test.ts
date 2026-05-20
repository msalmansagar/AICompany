import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmDesignService } from './CrmDesignService.js';
import { CssSanitiserService } from '../utils/cssSanitiser.js';
import { ValidationError } from '../utils/errors.js';
import type { DesignPayload, ThemeDefinition } from '@dfe/shared';

vi.mock('../config/env.js', () => ({
  config: {
    DATAVERSE_URL: 'https://test.crm.dynamics.com',
    QDB_CSS_ALLOWED_DOMAINS: '',
    DESIGN_CACHE_TTL_SECONDS: 300,
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// The DesignCacheValue union is private to CrmDesignService so we mirror it here.
type DesignCacheValue = DesignPayload | ThemeDefinition[];

const buildCache = () => new LRUCache<string, DesignCacheValue>({ max: 10, ttl: 30_000 });

const mockAuthService = {
  getAccessToken: vi.fn().mockResolvedValue('mock-token'),
};

const mockCssSanitiser = {
  sanitise: vi.fn((css: string, _formCode: string) => css),
} as unknown as CssSanitiserService;

// Helper to build a minimal raw form design Dataverse response
function buildFormDesignResponse(overrides: Record<string, unknown> = {}) {
  return {
    value: [
      {
        qdb_form_designid: 'fd-001',
        _qdb_form_definition_id_value: 'form-def-001',
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
      },
    ],
  };
}

// Spy on the protected crmFetch method via unknown cast —
// private method access is required for unit testing without integration harness.
function spyCrmFetch(
  service: CrmDesignService,
  handler: (path: string) => Promise<unknown>,
) {
  return vi.spyOn(service as unknown as { crmFetch: (path: string) => Promise<unknown> }, 'crmFetch')
    .mockImplementation(handler);
}

describe('CrmDesignService', () => {
  let service: CrmDesignService;
  let cache: LRUCache<string, DesignCacheValue>;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = buildCache();
    // LRUCache is covariant on its value type in practice — the cast is safe here
    // because the test cache and service cache share the same union value type.
    service = new CrmDesignService(
      mockAuthService as unknown as ConstructorParameters<typeof CrmDesignService>[0],
      cache as unknown as ConstructorParameters<typeof CrmDesignService>[1],
      mockCssSanitiser,
    );
  });

  // ── getDesignPayload — happy path ─────────────────────────────────────────

  it('getDesignPayload_validFormCode_returnsDefaultLightThemeWhenNoThemeInDataverse', async () => {
    const fetchSpy = spyCrmFetch(service, async (path) => {
      if (path.includes('qdb_form_designs')) return buildFormDesignResponse();
      return { value: [] };
    });

    const result = await service.getDesignPayload('test-form', 'form-def-001');

    expect(result.theme.themeCode).toBe('light');
    expect(result.theme.primaryColor).toBe('#0078d4');
    expect(result.formDesign.layoutType).toBe('SingleColumn');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('getDesignPayload_withExpandedTheme_usesFormSpecificTheme', async () => {
    spyCrmFetch(service, async (path) => {
      if (path.includes('qdb_form_designs')) {
        return buildFormDesignResponse({
          _qdb_theme_id_value: 'theme-dark-001',
          qdb_theme_id: {
            qdb_themeid: 'theme-dark-001',
            qdb_theme_code: 'dark',
            qdb_theme_name: 'Dark Mode',
            qdb_primary_color: '#ffffff',
            qdb_is_dark_mode: true,
            qdb_is_active: true,
          },
        });
      }
      return { value: [] };
    });

    const result = await service.getDesignPayload('dark-form', 'form-def-dark');

    expect(result.theme.themeCode).toBe('dark');
    expect(result.theme.isDarkMode).toBe(true);
  });

  it('getDesignPayload_cacheHit_doesNotCallCrmFetchForSecondCall', async () => {
    const fetchSpy = spyCrmFetch(service, async (path) => {
      if (path.includes('qdb_form_designs')) return buildFormDesignResponse();
      return { value: [] };
    });

    await service.getDesignPayload('cached-form', 'form-def-001');
    await service.getDesignPayload('cached-form', 'form-def-001');

    // The second call is served from the LRU cache — crmFetch should only
    // run for the first call's qdb_form_designs query.
    const formDesignCallCount = fetchSpy.mock.calls
      .filter(([path]) => (path as string).includes('qdb_form_designs'))
      .length;
    expect(formDesignCallCount).toBe(1);
  });

  // ── getDesignPayload — validation failure ─────────────────────────────────

  it('getDesignPayload_invalidFormCode_throwsValidationError', async () => {
    await expect(
      service.getDesignPayload('../../etc/passwd', 'form-def-001'),
    ).rejects.toThrow(ValidationError);
  });

  it('getDesignPayload_emptyFormCode_throwsValidationError', async () => {
    await expect(
      service.getDesignPayload('', 'form-def-001'),
    ).rejects.toThrow(ValidationError);
  });

  // ── Design payload structure ───────────────────────────────────────────────

  it('getDesignPayload_withSectionDesigns_populatesSectionDesignsMap', async () => {
    spyCrmFetch(service, async (path) => {
      if (path.includes('qdb_form_designs')) return buildFormDesignResponse();
      if (path.includes('qdb_section_designs')) {
        return {
          value: [{
            qdb_section_designid: 'sd-001',
            _qdb_form_section_id_value: 'sec-abc',
            _qdb_form_definition_id_value: 'form-def-001',
            qdb_column_layout: 100000002,
            qdb_card_style: 100000001,
            qdb_collapsible_style: 100000001,
            qdb_visibility_animation: 100000001,
            qdb_is_active: true,
          }],
        };
      }
      return { value: [] };
    });

    const result = await service.getDesignPayload('sectioned-form', 'form-def-001');
    expect(result.sectionDesigns['sec-abc']).toBeDefined();
    expect(result.sectionDesigns['sec-abc'].columnLayout).toBe(2);
  });

  it('getDesignPayload_sectionDesignFetchFails_returnsEmptySectionDesigns', async () => {
    spyCrmFetch(service, async (path) => {
      if (path.includes('qdb_form_designs')) return buildFormDesignResponse();
      if (path.includes('qdb_section_designs')) throw new Error('Dataverse unavailable');
      return { value: [] };
    });

    // Promise.allSettled in the service ensures design sub-query failures do not propagate
    const result = await service.getDesignPayload('resilient-form', 'form-def-001');
    expect(result.sectionDesigns).toEqual({});
  });

  // ── getAllThemes ───────────────────────────────────────────────────────────

  it('getAllThemes_returnsThemeList', async () => {
    spyCrmFetch(service, async () => ({
      value: [{
        qdb_themeid: 'theme-001',
        qdb_theme_code: 'corporate',
        qdb_theme_name: 'Corporate Blue',
        qdb_primary_color: '#003087',
        qdb_is_dark_mode: false,
        qdb_is_active: true,
      }],
    }));

    const themes = await service.getAllThemes();
    expect(themes).toHaveLength(1);
    expect(themes[0].themeCode).toBe('corporate');
  });

  // ── invalidateCache ───────────────────────────────────────────────────────

  it('invalidateCache_removesFormEntryFromCache', async () => {
    spyCrmFetch(service, async () => ({ value: [] }));

    await service.getDesignPayload('evict-me', 'form-def-001');
    expect(cache.has('design:evict-me')).toBe(true);

    service.invalidateCache('evict-me');
    expect(cache.has('design:evict-me')).toBe(false);
  });

  it('invalidateAllCache_clearsEntireCache', async () => {
    spyCrmFetch(service, async () => ({ value: [] }));

    await service.getDesignPayload('form-a', 'form-def-001');
    await service.getDesignPayload('form-b', 'form-def-002');
    expect(cache.size).toBeGreaterThan(0);

    service.invalidateAllCache();
    expect(cache.size).toBe(0);
  });

  // ── getDefaultPayload ─────────────────────────────────────────────────────

  it('getDefaultPayload_returnsDefaultLightThemeWithEmptyDesigns', () => {
    const payload = service.getDefaultPayload();
    expect(payload.theme.themeCode).toBe('light');
    expect(payload.theme.isDarkMode).toBe(false);
    expect(payload.sectionDesigns).toEqual({});
    expect(payload.fieldDesigns).toEqual({});
    expect(payload.layoutGrid).toEqual([]);
  });

  // ── CSS sanitisation ───────────────────────────────────────────────────────

  it('getDesignPayload_withCustomCss_callsCssSanitiser', async () => {
    spyCrmFetch(service, async (path) => {
      if (path.includes('qdb_form_designs')) {
        return buildFormDesignResponse({ qdb_custom_css: '.qdb-btn { color: red; }' });
      }
      return { value: [] };
    });

    await service.getDesignPayload('css-form', 'form-def-001');
    expect(mockCssSanitiser.sanitise).toHaveBeenCalledWith('.qdb-btn { color: red; }', 'css-form');
  });
});
