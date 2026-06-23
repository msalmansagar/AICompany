// RED → GREEN → REFACTOR — TokenDefinitionService unit tests
//
// All external dependencies are mocked with vi.fn() — no real Dataverse or cache calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenDefinitionService } from './TokenDefinitionService.js';
import { TokenNotFoundError, TokenDuplicateSlugError, TokenDefinitionLimitError } from './TokenErrors.js';
import type { ITokenDefinitionRepository } from './TokenDefinitionRepository.js';
import type { ITokenValueRepository } from './TokenValueRepository.js';
import type { ITokenCacheService } from './ITokenCacheService.js';
import type { TokenDefinition } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeDefinition(overrides: Partial<TokenDefinition> = {}): TokenDefinition {
  return {
    id: 'def-0000-0000-0000-000000000001',
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

function makeMockDefinitionRepo(
  overrides: Partial<ITokenDefinitionRepository> = {},
): ITokenDefinitionRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findBySlug: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    countActive: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(makeDefinition()),
    update: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ITokenDefinitionRepository;
}

function makeMockValueRepo(
  overrides: Partial<ITokenValueRepository> = {},
): ITokenValueRepository {
  return {
    findAllActive: vi.fn().mockResolvedValue([]),
    findByDefinitionId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findMatchingContext: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
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
// TokenDefinitionService.createDefinition
// ---------------------------------------------------------------------------

describe('TokenDefinitionService.createDefinition', () => {
  it('should_throw_TokenDefinitionLimitError_when_active_count_equals_soft_limit', async () => {
    const defRepo = makeMockDefinitionRepo({ countActive: vi.fn().mockResolvedValue(200) });
    const service = new TokenDefinitionService(
      defRepo,
      makeMockValueRepo(),
      makeMockCacheService(),
      200,
    );

    await expect(
      service.createDefinition({ name: 'Test', slug: 'test-token', tokenType: 860005001 }),
    ).rejects.toBeInstanceOf(TokenDefinitionLimitError);
  });

  it('should_throw_error_with_statusCode_400_when_slug_is_not_kebab_case', async () => {
    const service = new TokenDefinitionService(
      makeMockDefinitionRepo(),
      makeMockValueRepo(),
      makeMockCacheService(),
      200,
    );

    await expect(
      service.createDefinition({ name: 'Test', slug: 'CamelCase', tokenType: 860005001 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'validation_error' });
  });

  it('should_throw_error_with_statusCode_400_when_slug_contains_underscore', async () => {
    const service = new TokenDefinitionService(
      makeMockDefinitionRepo(),
      makeMockValueRepo(),
      makeMockCacheService(),
      200,
    );

    await expect(
      service.createDefinition({ name: 'Test', slug: 'my_token', tokenType: 860005001 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should_throw_TokenDuplicateSlugError_when_slug_already_exists', async () => {
    const defRepo = makeMockDefinitionRepo({
      countActive: vi.fn().mockResolvedValue(5),
      findBySlug: vi.fn().mockResolvedValue(makeDefinition()),
    });
    const service = new TokenDefinitionService(
      defRepo,
      makeMockValueRepo(),
      makeMockCacheService(),
      200,
    );

    await expect(
      service.createDefinition({ name: 'Color Primary', slug: 'color-primary', tokenType: 860005001 }),
    ).rejects.toBeInstanceOf(TokenDuplicateSlugError);
  });

  it('should_create_definition_when_all_validations_pass', async () => {
    const created = makeDefinition({ slug: 'new-token' });
    const defRepo = makeMockDefinitionRepo({
      countActive: vi.fn().mockResolvedValue(0),
      findBySlug: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
    });
    const service = new TokenDefinitionService(
      defRepo,
      makeMockValueRepo(),
      makeMockCacheService(),
      200,
    );

    const result = await service.createDefinition({
      name: 'New Token',
      slug: 'new-token',
      tokenType: 860005001,
    });

    expect(result).toEqual(created);
    expect(defRepo.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TokenDefinitionService.getDefinitionBySlug
// ---------------------------------------------------------------------------

describe('TokenDefinitionService.getDefinitionBySlug', () => {
  it('should_throw_TokenNotFoundError_when_slug_does_not_exist', async () => {
    const service = new TokenDefinitionService(
      makeMockDefinitionRepo({ findBySlug: vi.fn().mockResolvedValue(null) }),
      makeMockValueRepo(),
      makeMockCacheService(),
      200,
    );

    await expect(service.getDefinitionBySlug('no-such-slug')).rejects.toBeInstanceOf(
      TokenNotFoundError,
    );
  });

  it('should_return_definition_when_slug_exists', async () => {
    const def = makeDefinition();
    const service = new TokenDefinitionService(
      makeMockDefinitionRepo({ findBySlug: vi.fn().mockResolvedValue(def) }),
      makeMockValueRepo(),
      makeMockCacheService(),
      200,
    );

    const result = await service.getDefinitionBySlug('color-primary');
    expect(result).toEqual(def);
  });
});

// ---------------------------------------------------------------------------
// TokenDefinitionService.deactivateDefinition — cascade
// ---------------------------------------------------------------------------

describe('TokenDefinitionService.deactivateDefinition', () => {
  it('should_call_deactivateAllForDefinition_before_deactivating_the_definition', async () => {
    const def = makeDefinition();
    const defRepo = makeMockDefinitionRepo({
      findBySlug: vi.fn().mockResolvedValue(def),
      deactivate: vi.fn().mockResolvedValue(undefined),
    });
    const valueRepo = makeMockValueRepo({
      deactivateAllForDefinition: vi.fn().mockResolvedValue(undefined),
    });

    const service = new TokenDefinitionService(
      defRepo,
      valueRepo,
      makeMockCacheService(),
      200,
    );

    await service.deactivateDefinition('color-primary');

    expect(valueRepo.deactivateAllForDefinition).toHaveBeenCalledWith(def.id);
    expect(defRepo.deactivate).toHaveBeenCalledWith(def.id);
  });

  it('should_flush_draft_cache_after_deactivation', async () => {
    const def = makeDefinition();
    const defRepo = makeMockDefinitionRepo({ findBySlug: vi.fn().mockResolvedValue(def) });
    const cacheService = makeMockCacheService({
      flushDraftCache: vi.fn().mockResolvedValue(undefined),
    });

    const service = new TokenDefinitionService(
      defRepo,
      makeMockValueRepo(),
      cacheService,
      200,
    );

    await service.deactivateDefinition('color-primary');

    expect(cacheService.flushDraftCache).toHaveBeenCalledTimes(1);
  });

  it('should_throw_TokenNotFoundError_when_slug_does_not_exist_on_deactivate', async () => {
    const service = new TokenDefinitionService(
      makeMockDefinitionRepo({ findBySlug: vi.fn().mockResolvedValue(null) }),
      makeMockValueRepo(),
      makeMockCacheService(),
      200,
    );

    await expect(service.deactivateDefinition('ghost-token')).rejects.toBeInstanceOf(
      TokenNotFoundError,
    );
  });
});
