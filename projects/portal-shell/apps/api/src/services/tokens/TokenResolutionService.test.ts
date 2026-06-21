// RED → GREEN → REFACTOR — TokenResolutionService unit tests
//
// Pure function tests — no Dataverse calls, no cache, no I/O.
// Fixture factories create minimal valid records to keep tests focused.

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenResolutionService } from './TokenResolutionService.js';
import { TOKEN_LEVEL } from './TokenTypes.js';
import type { TokenDefinition, TokenValue, TokenResolutionContext } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `aaaaaaaa-0000-0000-0000-${String(idCounter).padStart(12, '0')}`;
}

function makeDefinition(overrides: Partial<TokenDefinition> = {}): TokenDefinition {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: 'Color Primary',
    slug: 'color-primary',
    tokenType: 860005001,
    description: null,
    defaultValue: '#000000',
    isActive: true,
    createdOn: '2026-01-01T00:00:00Z',
    modifiedOn: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeValue(
  definitionId: string,
  level: number,
  value: string,
  overrides: Partial<TokenValue> = {},
): TokenValue {
  return {
    id: nextId(),
    definitionId,
    definitionSlug: 'color-primary',
    level,
    renderTarget: null,
    category: null,
    componentSlug: null,
    serviceSlug: null,
    locale: null,
    value,
    publishedOn: null,
    publishedBy: null,
    isActive: true,
    createdOn: '2026-01-01T00:00:00Z',
    modifiedOn: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultContext: TokenResolutionContext = {
  renderTarget: 'portal',
  locale: null,
  service: null,
  category: null,
  componentSlug: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenResolutionService.resolve', () => {
  let service: TokenResolutionService;

  beforeEach(() => {
    service = new TokenResolutionService();
    idCounter = 0;
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('should_return_empty_map_when_definitions_array_is_empty', () => {
    const result = service.resolve([], [], defaultContext);
    expect(result).toEqual({});
  });

  it('should_return_empty_string_when_no_value_matches_and_no_defaultValue', () => {
    const def = makeDefinition({ defaultValue: null, slug: 'font-size' });
    const result = service.resolve([def], [], defaultContext);
    expect(result['font-size']).toBe('');
  });

  it('should_return_defaultValue_when_no_value_record_matches_context', () => {
    const def = makeDefinition({ defaultValue: '#1a4d8f', slug: 'color-primary' });
    const result = service.resolve([def], [], defaultContext);
    expect(result['color-primary']).toBe('#1a4d8f');
  });

  it('should_skip_inactive_definitions', () => {
    const def = makeDefinition({ isActive: false, slug: 'color-border' });
    const result = service.resolve([def], [], defaultContext);
    expect(result).not.toHaveProperty('color-border');
  });

  // -------------------------------------------------------------------------
  // Level 1 — Global
  // -------------------------------------------------------------------------

  it('should_resolve_level_1_global_value_for_all_contexts', () => {
    const def = makeDefinition({ slug: 'spacing-md' });
    const val = makeValue(def.id, TOKEN_LEVEL.GLOBAL, '16px');

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: null,
      category: null,
      componentSlug: null,
    };

    const result = service.resolve([def], [val], ctx);
    expect(result['spacing-md']).toBe('16px');
  });

  // -------------------------------------------------------------------------
  // Level 2 — Render target
  // -------------------------------------------------------------------------

  it('should_resolve_level_2_render_target_value_when_renderTarget_matches', () => {
    const def = makeDefinition({ slug: 'font-size-body' });
    const globalVal = makeValue(def.id, TOKEN_LEVEL.GLOBAL, '14px');
    const portalVal = makeValue(def.id, TOKEN_LEVEL.RENDER_TARGET, '16px', {
      renderTarget: 'portal',
    });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: null,
      category: null,
      componentSlug: null,
    };

    const result = service.resolve([def], [globalVal, portalVal], ctx);
    expect(result['font-size-body']).toBe('16px');
  });

  it('should_not_select_render_target_value_when_renderTarget_does_not_match', () => {
    const def = makeDefinition({ defaultValue: '14px', slug: 'font-size-body' });
    const mobileVal = makeValue(def.id, TOKEN_LEVEL.RENDER_TARGET, '12px', {
      renderTarget: 'mobile',
    });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: null,
      category: null,
      componentSlug: null,
    };

    const result = service.resolve([def], [mobileVal], ctx);
    expect(result['font-size-body']).toBe('14px');
  });

  // -------------------------------------------------------------------------
  // Level 3 — Category
  // -------------------------------------------------------------------------

  it('should_resolve_level_3_category_value_when_category_matches', () => {
    const def = makeDefinition({ slug: 'color-primary' });
    const globalVal = makeValue(def.id, TOKEN_LEVEL.GLOBAL, '#1a4d8f');
    const categoryVal = makeValue(def.id, TOKEN_LEVEL.CATEGORY, '#ff0000', {
      renderTarget: 'portal',
      category: 860005021, // widget
    });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: null,
      category: '860005021',
      componentSlug: null,
    };

    const result = service.resolve([def], [globalVal, categoryVal], ctx);
    expect(result['color-primary']).toBe('#ff0000');
  });

  // -------------------------------------------------------------------------
  // Level 4 — Component
  // -------------------------------------------------------------------------

  it('should_resolve_level_4_component_value_when_componentSlug_matches', () => {
    const def = makeDefinition({ slug: 'color-primary' });
    const globalVal = makeValue(def.id, TOKEN_LEVEL.GLOBAL, '#1a4d8f');
    const componentVal = makeValue(def.id, TOKEN_LEVEL.COMPONENT, '#003399', {
      renderTarget: 'portal',
      componentSlug: 'hero-banner',
    });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: null,
      category: null,
      componentSlug: 'hero-banner',
    };

    const result = service.resolve([def], [globalVal, componentVal], ctx);
    expect(result['color-primary']).toBe('#003399');
  });

  it('should_not_select_component_value_when_componentSlug_does_not_match', () => {
    const def = makeDefinition({ defaultValue: '#1a4d8f', slug: 'color-primary' });
    const componentVal = makeValue(def.id, TOKEN_LEVEL.COMPONENT, '#003399', {
      renderTarget: 'portal',
      componentSlug: 'footer',
    });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: null,
      category: null,
      componentSlug: 'hero-banner',
    };

    const result = service.resolve([def], [componentVal], ctx);
    expect(result['color-primary']).toBe('#1a4d8f');
  });

  // -------------------------------------------------------------------------
  // Level 5 — Service
  // -------------------------------------------------------------------------

  it('should_resolve_level_5_service_value_when_service_matches', () => {
    const def = makeDefinition({ slug: 'color-primary' });
    const globalVal = makeValue(def.id, TOKEN_LEVEL.GLOBAL, '#1a4d8f');
    const serviceVal = makeValue(def.id, TOKEN_LEVEL.SERVICE, '#003300', {
      serviceSlug: 'loan-services',
    });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: 'loan-services',
      category: null,
      componentSlug: null,
    };

    const result = service.resolve([def], [globalVal, serviceVal], ctx);
    expect(result['color-primary']).toBe('#003300');
  });

  it('should_not_select_level_5_service_value_when_service_does_not_match_context', () => {
    const def = makeDefinition({ defaultValue: '#1a4d8f', slug: 'color-primary' });
    const serviceVal = makeValue(def.id, TOKEN_LEVEL.SERVICE, '#003300', {
      serviceSlug: 'savings-services',
    });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: 'loan-services',
      category: null,
      componentSlug: null,
    };

    const result = service.resolve([def], [serviceVal], ctx);
    expect(result['color-primary']).toBe('#1a4d8f');
  });

  // -------------------------------------------------------------------------
  // Locale specificity
  // -------------------------------------------------------------------------

  it('should_prefer_locale_specific_value_over_locale_neutral_at_same_level', () => {
    const def = makeDefinition({ slug: 'font-family-body' });
    const neutral = makeValue(def.id, TOKEN_LEVEL.GLOBAL, 'IBM Plex Sans', { locale: null });
    const arabic = makeValue(def.id, TOKEN_LEVEL.GLOBAL, 'IBM Plex Sans Arabic', { locale: 'ar' });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: 'ar',
      service: null,
      category: null,
      componentSlug: null,
    };

    const result = service.resolve([def], [neutral, arabic], ctx);
    expect(result['font-family-body']).toBe('IBM Plex Sans Arabic');
  });

  it('should_not_select_locale_specific_value_when_locale_does_not_match_context', () => {
    const def = makeDefinition({ slug: 'font-family-body' });
    const neutral = makeValue(def.id, TOKEN_LEVEL.GLOBAL, 'IBM Plex Sans', { locale: null });
    const english = makeValue(def.id, TOKEN_LEVEL.GLOBAL, 'Helvetica', { locale: 'en' });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: 'ar',
      service: null,
      category: null,
      componentSlug: null,
    };

    const result = service.resolve([def], [neutral, english], ctx);
    // locale=en must NOT be selected when context.locale=ar; fallback to neutral
    expect(result['font-family-body']).toBe('IBM Plex Sans');
  });

  it('should_select_locale_neutral_value_when_context_locale_is_null', () => {
    const def = makeDefinition({ slug: 'text-direction' });
    const neutral = makeValue(def.id, TOKEN_LEVEL.GLOBAL, 'ltr', { locale: null });
    const arabic = makeValue(def.id, TOKEN_LEVEL.GLOBAL, 'rtl', { locale: 'ar' });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: null,
      category: null,
      componentSlug: null,
    };

    const result = service.resolve([def], [neutral, arabic], ctx);
    expect(result['text-direction']).toBe('ltr');
  });

  // -------------------------------------------------------------------------
  // Specificity hierarchy
  // -------------------------------------------------------------------------

  it('should_prefer_higher_specificity_level_over_lower_when_both_match', () => {
    const def = makeDefinition({ slug: 'color-primary' });
    const globalVal = makeValue(def.id, TOKEN_LEVEL.GLOBAL, '#global');
    const renderTargetVal = makeValue(def.id, TOKEN_LEVEL.RENDER_TARGET, '#render-target', {
      renderTarget: 'portal',
    });
    const componentVal = makeValue(def.id, TOKEN_LEVEL.COMPONENT, '#component', {
      renderTarget: 'portal',
      componentSlug: 'hero-banner',
    });

    const ctx: TokenResolutionContext = {
      renderTarget: 'portal',
      locale: null,
      service: null,
      category: null,
      componentSlug: 'hero-banner',
    };

    const result = service.resolve([def], [globalVal, renderTargetVal, componentVal], ctx);
    expect(result['color-primary']).toBe('#component');
  });

  // -------------------------------------------------------------------------
  // Multiple definitions
  // -------------------------------------------------------------------------

  it('should_resolve_all_definitions_in_a_single_call', () => {
    const def1 = makeDefinition({ slug: 'color-primary', defaultValue: '#blue' });
    const def2 = makeDefinition({ slug: 'spacing-md', defaultValue: '16px' });

    const val1 = makeValue(def1.id, TOKEN_LEVEL.GLOBAL, '#1a4d8f');

    const result = service.resolve([def1, def2], [val1], defaultContext);
    expect(result['color-primary']).toBe('#1a4d8f');
    expect(result['spacing-md']).toBe('16px');
  });
});
