// RED → GREEN → REFACTOR — TokenValueService unit tests
//
// All external dependencies are mocked with vi.fn() — no real Dataverse or cache calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenValueService, extractServiceSlug } from './TokenValueService.js';
import {
  TokenNotFoundError,
  TokenValueNotFoundError,
  TokenDuplicateContextError,
  TokenServiceSlugMismatchError,
  TokenNoServiceSlugError,
  TokenCssValueValidationError,
} from './TokenErrors.js';
import { TOKEN_LEVEL } from './TokenTypes.js';
import type { ITokenDefinitionRepository } from './TokenDefinitionRepository.js';
import type { ITokenValueRepository } from './TokenValueRepository.js';
import type { ITokenCacheService } from './ITokenCacheService.js';
import type { TokenDefinition, TokenValue, CallerContext } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeDefinition(overrides: Partial<TokenDefinition> = {}): TokenDefinition {
  return {
    id: 'def-0001-0000-0000-000000000001',
    name: 'Color Primary',
    slug: 'color-primary',
    tokenType: 860005001,
    description: null,
    defaultValue: '#1a4d8f',
    isActive: true,
    createdOn: '2026-01-01T00:00:00Z',
    modifiedOn: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeValue(overrides: Partial<TokenValue> = {}): TokenValue {
  return {
    id: 'val-0001-0000-0000-000000000001',
    definitionId: 'def-0001-0000-0000-000000000001',
    definitionSlug: 'color-primary',
    level: TOKEN_LEVEL.GLOBAL,
    renderTarget: null,
    category: null,
    componentSlug: null,
    serviceSlug: null,
    locale: null,
    value: '#1a4d8f',
    publishedOn: null,
    publishedBy: null,
    isActive: true,
    createdOn: '2026-01-01T00:00:00Z',
    modifiedOn: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const adminCaller: CallerContext = { role: 'portal-admin', serviceSlug: null, userId: 'u1' };
const serviceCaller: CallerContext = {
  role: 'service-owner',
  serviceSlug: 'loan-services',
  userId: 'u2',
};

function makeMockDefinitionRepo(
  overrides: Partial<ITokenDefinitionRepository> = {},
): ITokenDefinitionRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findBySlug: vi.fn().mockResolvedValue(makeDefinition()),
    findById: vi.fn().mockResolvedValue(makeDefinition()),
    countActive: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(makeDefinition()),
    update: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ITokenDefinitionRepository;
}

function makeMockValueRepo(overrides: Partial<ITokenValueRepository> = {}): ITokenValueRepository {
  return {
    findAllActive: vi.fn().mockResolvedValue([]),
    findByDefinitionId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(makeValue()),
    findMatchingContext: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(makeValue()),
    deactivate: vi.fn().mockResolvedValue(undefined),
    deactivateAllForDefinition: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ITokenValueRepository;
}

function makeMockCacheService(
  overrides: Partial<ITokenCacheService> = {},
): ITokenCacheService {
  return {
    getRawDefinitions: vi.fn().mockResolvedValue(null),
    setRawDefinitions: vi.fn().mockResolvedValue(undefined),
    getRawValues: vi.fn().mockResolvedValue(null),
    setRawValues: vi.fn().mockResolvedValue(undefined),
    getResolvedMap: vi.fn().mockResolvedValue(null),
    setResolvedMap: vi.fn().mockResolvedValue(undefined),
    getLastPublishedAt: vi.fn().mockResolvedValue(null),
    setLastPublishedAt: vi.fn().mockResolvedValue(undefined),
    flushLiveCache: vi.fn().mockResolvedValue(undefined),
    flushDraftCache: vi.fn().mockResolvedValue(undefined),
    flushAllResolvedMaps: vi.fn().mockResolvedValue(undefined),
    acquirePublishLock: vi.fn().mockResolvedValue(true),
    releasePublishLock: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ITokenCacheService;
}

// ---------------------------------------------------------------------------
// extractServiceSlug (module-level helper)
// ---------------------------------------------------------------------------

describe('extractServiceSlug', () => {
  it('should_return_slug_suffix_when_role_starts_with_service_owner_prefix', () => {
    expect(extractServiceSlug('service-owner:loan-services')).toBe('loan-services');
  });

  it('should_return_null_when_role_does_not_start_with_service_owner_prefix', () => {
    expect(extractServiceSlug('portal-admin')).toBeNull();
  });

  it('should_return_empty_string_when_role_is_service_owner_with_no_suffix', () => {
    // 'service-owner:' with nothing after the colon
    expect(extractServiceSlug('service-owner:')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// TokenValueService.createValue — service slug enforcement
// ---------------------------------------------------------------------------

describe('TokenValueService.createValue — service slug enforcement', () => {
  it('should_throw_TokenServiceSlugMismatchError_when_serviceSlug_in_body_does_not_match_caller', async () => {
    const service = new TokenValueService(
      makeMockDefinitionRepo(),
      makeMockValueRepo(),
      makeMockCacheService(),
    );

    await expect(
      service.createValue(
        {
          definitionSlug: 'color-primary',
          level: TOKEN_LEVEL.SERVICE,
          serviceSlug: 'savings-services', // does not match caller
          value: '#ff0000',
        },
        serviceCaller, // serviceSlug = 'loan-services'
      ),
    ).rejects.toBeInstanceOf(TokenServiceSlugMismatchError);
  });

  it('should_throw_TokenNoServiceSlugError_when_service_level_value_but_caller_has_no_service_slug', async () => {
    const service = new TokenValueService(
      makeMockDefinitionRepo(),
      makeMockValueRepo(),
      makeMockCacheService(),
    );

    await expect(
      service.createValue(
        {
          definitionSlug: 'color-primary',
          level: TOKEN_LEVEL.SERVICE,
          serviceSlug: 'some-service',
          value: '#ff0000',
        },
        adminCaller, // serviceSlug = null
      ),
    ).rejects.toBeInstanceOf(TokenNoServiceSlugError);
  });

  it('should_create_value_when_service_slug_matches_caller_context', async () => {
    const created = makeValue({ serviceSlug: 'loan-services', level: TOKEN_LEVEL.SERVICE });
    const valueRepo = makeMockValueRepo({
      findMatchingContext: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
    });
    const cacheService = makeMockCacheService();

    const service = new TokenValueService(
      makeMockDefinitionRepo(),
      valueRepo,
      cacheService,
    );

    const result = await service.createValue(
      {
        definitionSlug: 'color-primary',
        level: TOKEN_LEVEL.SERVICE,
        serviceSlug: 'loan-services',
        value: '#003300',
      },
      serviceCaller,
    );

    expect(result).toEqual(created);
    expect(cacheService.flushDraftCache).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TokenValueService.createValue — context uniqueness
// ---------------------------------------------------------------------------

describe('TokenValueService.createValue — context uniqueness', () => {
  it('should_throw_TokenDuplicateContextError_when_matching_context_already_exists', async () => {
    const service = new TokenValueService(
      makeMockDefinitionRepo(),
      makeMockValueRepo({
        findMatchingContext: vi.fn().mockResolvedValue(makeValue()),
      }),
      makeMockCacheService(),
    );

    await expect(
      service.createValue(
        { definitionSlug: 'color-primary', level: TOKEN_LEVEL.GLOBAL, value: '#ff0000' },
        adminCaller,
      ),
    ).rejects.toBeInstanceOf(TokenDuplicateContextError);
  });
});

// ---------------------------------------------------------------------------
// TokenValueService.createValue — draft cache invalidation
// ---------------------------------------------------------------------------

describe('TokenValueService.createValue — cache invalidation', () => {
  it('should_call_flushDraftCache_after_successful_creation', async () => {
    const cacheService = makeMockCacheService({
      flushDraftCache: vi.fn().mockResolvedValue(undefined),
    });
    const service = new TokenValueService(
      makeMockDefinitionRepo(),
      makeMockValueRepo({ findMatchingContext: vi.fn().mockResolvedValue(null) }),
      cacheService,
    );

    await service.createValue(
      { definitionSlug: 'color-primary', level: TOKEN_LEVEL.GLOBAL, value: '#1a4d8f' },
      adminCaller,
    );

    expect(cacheService.flushDraftCache).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TokenValueService.createValue — definition not found
// ---------------------------------------------------------------------------

describe('TokenValueService.createValue — definition not found', () => {
  it('should_throw_TokenNotFoundError_when_definition_slug_does_not_exist', async () => {
    const service = new TokenValueService(
      makeMockDefinitionRepo({ findBySlug: vi.fn().mockResolvedValue(null) }),
      makeMockValueRepo(),
      makeMockCacheService(),
    );

    await expect(
      service.createValue(
        { definitionSlug: 'no-such-slug', level: TOKEN_LEVEL.GLOBAL, value: '#ff0000' },
        adminCaller,
      ),
    ).rejects.toBeInstanceOf(TokenNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// TokenValueService.sanitizeCssValue — static method
// ---------------------------------------------------------------------------

describe('TokenValueService.sanitizeCssValue', () => {
  it('should_strip_semicolons_from_css_value', () => {
    const result = TokenValueService.sanitizeCssValue('16px; color: red');
    expect(result).toBe('16px color: red');
  });

  it('should_throw_TokenCssValueValidationError_when_value_contains_url_function', () => {
    expect(() => TokenValueService.sanitizeCssValue('url(http://evil.com)')).toThrow(
      TokenCssValueValidationError,
    );
  });

  it('should_throw_TokenCssValueValidationError_when_value_contains_expression_function', () => {
    expect(() => TokenValueService.sanitizeCssValue('expression(alert(1))')).toThrow(
      TokenCssValueValidationError,
    );
  });

  it('should_throw_TokenCssValueValidationError_when_value_contains_import_function', () => {
    expect(() => TokenValueService.sanitizeCssValue('@import(styles.css)')).toThrow(
      TokenCssValueValidationError,
    );
  });

  it('should_return_unchanged_valid_css_value', () => {
    expect(TokenValueService.sanitizeCssValue('#1a4d8f')).toBe('#1a4d8f');
    expect(TokenValueService.sanitizeCssValue('16px')).toBe('16px');
    expect(TokenValueService.sanitizeCssValue('rgba(0,0,0,0.8)')).toBe('rgba(0,0,0,0.8)');
  });
});

// ---------------------------------------------------------------------------
// TokenValueService.deactivateValue
// ---------------------------------------------------------------------------

describe('TokenValueService.deactivateValue', () => {
  it('should_throw_TokenValueNotFoundError_when_value_id_does_not_exist', async () => {
    const service = new TokenValueService(
      makeMockDefinitionRepo(),
      makeMockValueRepo({ findById: vi.fn().mockResolvedValue(null) }),
      makeMockCacheService(),
    );

    await expect(service.deactivateValue('no-such-id', adminCaller)).rejects.toBeInstanceOf(
      TokenValueNotFoundError,
    );
  });

  it('should_throw_TokenServiceSlugMismatchError_when_service_owner_tries_to_delete_another_services_value', async () => {
    const value = makeValue({ serviceSlug: 'savings-services', level: TOKEN_LEVEL.SERVICE });
    const service = new TokenValueService(
      makeMockDefinitionRepo(),
      makeMockValueRepo({ findById: vi.fn().mockResolvedValue(value) }),
      makeMockCacheService(),
    );

    await expect(
      service.deactivateValue('val-001', serviceCaller), // caller serviceSlug = 'loan-services'
    ).rejects.toBeInstanceOf(TokenServiceSlugMismatchError);
  });

  it('should_flush_draft_cache_after_successful_deactivation', async () => {
    const value = makeValue({ serviceSlug: 'loan-services', level: TOKEN_LEVEL.SERVICE });
    const cacheService = makeMockCacheService();
    const service = new TokenValueService(
      makeMockDefinitionRepo(),
      makeMockValueRepo({ findById: vi.fn().mockResolvedValue(value) }),
      cacheService,
    );

    await service.deactivateValue('val-001', serviceCaller);

    expect(cacheService.flushDraftCache).toHaveBeenCalledTimes(1);
  });
});
