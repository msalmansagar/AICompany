# DXP-P1-003 — Phase 5 QA Test Strategy
**Engagement:** DXP-P1-003 — Theme Token System
**Phase:** 5 — QA
**QA Engineer:** Maqsad AI QA Agent
**Date:** 2026-06-21
**Status:** Complete — Pending CEO Phase 5 → 6 gate

---

## 1. Test Strategy Summary

### Approach

TDD enforcement: all new tests must be written RED before any implementation they describe.
The 51 existing tests were written as part of the Phase 4 RED→GREEN cycle and serve as the green baseline from which this strategy extends.

The system under test has three distinct concern boundaries that require separate testing strategies:

1. **Pure business logic** (TokenResolutionService, cssUtils, injectTokenStyles) — property-based unit tests; no I/O; deterministic.
2. **Service orchestration** (TokenDefinitionService, TokenValueService, TokenQueryService, NodeCacheTokenCache) — unit tests with vi.fn() mocks for Dataverse and cache; real NodeCache instances where the behaviour under test is TTL or key management.
3. **HTTP contract** (11 route handlers) — Supertest integration tests against a running Fastify instance with injected mocked repositories; real NodeCacheTokenCache; no live Dataverse.

E2E tests (Playwright) target the two highest-risk cross-layer scenarios: CSS injection into the portal layout and ISR revalidation after publish.

Performance tests (k6) target the two NFRs with numeric commitments: warm-cache latency (AC-009, NFR-001) and publish duration (NFR-003).

### Tools

| Layer | Tool | Notes |
|---|---|---|
| Unit | Vitest | Existing pattern — vi.fn() mocks, AAA, MethodName_Scenario_ExpectedResult naming |
| Integration (API) | Supertest + Vitest | Real Fastify app; NodeCacheTokenCache; mocked Dataverse client |
| E2E | Playwright | Next.js dev server; API server; NodeCache (no Redis required) |
| Performance | k6 | NodeCache environment; latency assertions via k6 thresholds |
| Coverage | Vitest --coverage (v8) | Statement ≥ 80%, Branch ≥ 75% |

### Coverage Targets

| Metric | Target | Rationale |
|---|---|---|
| Statement coverage | ≥ 80% | Constitution Article IV minimum |
| Branch coverage | ≥ 75% | Token resolution has many conditional paths |
| Function coverage | ≥ 90% | Every public method must have at least one test |
| Line coverage | ≥ 80% | Derived from statement target |

Files hardest to cover and why:

- `TokenValueRepository.ts` — OData filter builder branches (17 parameter combinations in `buildContextFilter`) are only exercisable with a live Dataverse connection; unit tests cannot reach them. Branch coverage for this file is expected to be 30-40%. Marked as `/* c8 ignore */` at the OData HTTP call sites; the service-layer mocks cover all paths above the repository.
- `createTokenCacheService.ts` — Has only two branches: Redis URL present (throws) and absent (returns NodeCache). Both are covered. 100% coverage expected.
- `resolveTokens.ts` (Next.js RSC) — The `console.error` path and the `next: { revalidate }` options require a Next.js test runtime; unit tests cannot reach them. Excluded from Vitest coverage (Next.js RSC files). Covered by E2E tests only.
- `app/api/revalidate/route.ts` — Next.js Route Handler; excluded from Vitest coverage; covered by E2E tests.

### CI Integration Plan

```
push / pull_request:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - vitest run --coverage
      - coverage gate: ≥ 80% statement, ≥ 75% branch
    notes: No Dataverse, no Redis required. NodeCache used throughout.

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - Start Fastify test server (TOKEN_DEFINITION_SOFT_LIMIT=200, no REDIS_URL)
      - vitest run --project=integration
    notes: Uses NodeCacheTokenCache; mocked DataverseClient injected via DI.

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - Start Fastify API + Next.js dev server
      - playwright test
    notes: Long-running; runs on PR to main only (not every push).

  performance-tests:
    runs-on: ubuntu-latest
    when: scheduled (nightly) or release candidate
    steps:
      - k6 run k6/token-resolve-warm.js
      - k6 run k6/token-publish.js
    notes: Not blocking CI — produces report artifact only.
```

---

## 2. Test Environment Requirements

### API Test Environment

| Requirement | Value |
|---|---|
| Node.js | 20 LTS |
| Environment mode | `NODE_ENV=test` |
| REDIS_URL | Not set (NodeCache fallback active) |
| TOKEN_DEFINITION_SOFT_LIMIT | 200 |
| TOKEN_PUBLISH_MIN_INTERVAL_MS | 100 (reduced for debounce tests — default is 10000) |
| NEXTJS_BASE_URL | http://localhost:3000 |
| NEXTJS_REVALIDATE_SECRET | test-secret-abc |
| Dataverse | Mocked via ITokenDefinitionRepository and ITokenValueRepository interfaces |
| JWT | Test tokens signed with TEST_JWT_SECRET; fixture tokens for portal-admin and service-owner roles |

### Web (E2E) Test Environment

| Requirement | Value |
|---|---|
| Playwright browsers | Chromium only for CI; all three browsers on release |
| API URL | http://localhost:3001 |
| Next.js URL | http://localhost:3000 |
| Token seed data | 5 token definitions with known values seeded via POST /api/admin/tokens/definitions |
| Admin credentials | JWT fixture: `{ role: "portal-admin", sub: "admin-test-user" }` |
| Service-owner credentials | JWT fixture: `{ role: "service-owner:elearning", sub: "elearning-owner" }` |

### Test Data Factories

Extend existing `makeDefinition()` and `makeValue()` factories from the unit test files. All factories must produce deterministic IDs using the existing `nextId()` counter pattern. Shared factories live in `apps/api/src/services/tokens/testFixtures.ts` (new file, import into all test files).

---

## 3. Existing Tests Inventory (51 tests — baseline GREEN)

### TokenResolutionService.test.ts (17 tests — all [EXISTS])

| Test name |
|---|
| [EXISTS] should_return_empty_map_when_definitions_array_is_empty |
| [EXISTS] should_return_empty_string_when_no_value_matches_and_no_defaultValue |
| [EXISTS] should_return_defaultValue_when_no_value_record_matches_context |
| [EXISTS] should_skip_inactive_definitions |
| [EXISTS] should_resolve_level_1_global_value_for_all_contexts |
| [EXISTS] should_resolve_level_2_render_target_value_when_renderTarget_matches |
| [EXISTS] should_not_select_render_target_value_when_renderTarget_does_not_match |
| [EXISTS] should_resolve_level_3_category_value_when_category_matches |
| [EXISTS] should_resolve_level_4_component_value_when_componentSlug_matches |
| [EXISTS] should_not_select_component_value_when_componentSlug_does_not_match |
| [EXISTS] should_resolve_level_5_service_value_when_service_matches |
| [EXISTS] should_not_select_level_5_service_value_when_service_does_not_match_context |
| [EXISTS] should_prefer_locale_specific_value_over_locale_neutral_at_same_level |
| [EXISTS] should_not_select_locale_specific_value_when_locale_does_not_match_context |
| [EXISTS] should_select_locale_neutral_value_when_context_locale_is_null |
| [EXISTS] should_prefer_higher_specificity_level_over_lower_when_both_match |
| [EXISTS] should_resolve_all_definitions_in_a_single_call |

### TokenDefinitionService.test.ts (8 tests — all [EXISTS])

| Test name |
|---|
| [EXISTS] should_throw_TokenDefinitionLimitError_when_active_count_equals_soft_limit |
| [EXISTS] should_throw_TokenSlugValidationError_when_slug_is_not_kebab_case |
| [EXISTS] should_throw_TokenSlugValidationError_with_statusCode_400_when_slug_contains_underscore |
| [EXISTS] should_throw_TokenDuplicateSlugError_when_slug_already_exists |
| [EXISTS] should_create_definition_when_all_validations_pass |
| [EXISTS] should_throw_TokenNotFoundError_when_slug_does_not_exist (getDefinitionBySlug) |
| [EXISTS] should_return_definition_when_slug_exists |
| [EXISTS] should_call_deactivateAllForDefinition_before_deactivating_the_definition |
| [EXISTS] should_flush_draft_cache_after_deactivation |
| [EXISTS] should_throw_TokenNotFoundError_when_slug_does_not_exist_on_deactivate |

Note: count above is 10 (8 stated in Phase 4 but the file contains 10 assertions across 3 describe blocks). The strategy counts 10 for accuracy.

### TokenValueService.test.ts (14 tests — all [EXISTS])

| Test name |
|---|
| [EXISTS] should_return_slug_suffix_when_role_starts_with_service_owner_prefix |
| [EXISTS] should_return_null_when_role_does_not_start_with_service_owner_prefix |
| [EXISTS] should_return_empty_string_when_role_is_service_owner_with_no_suffix |
| [EXISTS] should_throw_TokenServiceSlugMismatchError_when_serviceSlug_in_body_does_not_match_caller |
| [EXISTS] should_throw_TokenNoServiceSlugError_when_service_level_value_but_caller_has_no_service_slug |
| [EXISTS] should_create_value_when_service_slug_matches_caller_context |
| [EXISTS] should_throw_TokenDuplicateContextError_when_matching_context_already_exists |
| [EXISTS] should_call_flushDraftCache_after_successful_creation |
| [EXISTS] should_throw_TokenNotFoundError_when_definition_slug_does_not_exist |
| [EXISTS] should_strip_semicolons_from_css_value |
| [EXISTS] should_throw_TokenCssValueValidationError_when_value_contains_url_function |
| [EXISTS] should_throw_TokenCssValueValidationError_when_value_contains_expression_function |
| [EXISTS] should_throw_TokenCssValueValidationError_when_value_contains_import_function |
| [EXISTS] should_return_unchanged_valid_css_value |
| [EXISTS] should_throw_TokenValueNotFoundError_when_value_id_does_not_exist |
| [EXISTS] should_throw_TokenServiceSlugMismatchError_when_service_owner_tries_to_delete_another_services_value |
| [EXISTS] should_flush_draft_cache_after_successful_deactivation |

Note: file contains 17 test cases (14 stated in Phase 4); strategy counts all 17.

### injectTokenStyles.test.ts (12 tests — all [EXISTS])

| Test name |
|---|
| [EXISTS] should_convert_true_to_1_for_icon_mirror |
| [EXISTS] should_convert_false_to_0_for_icon_mirror |
| [EXISTS] should_convert_unknown_value_to_0_for_icon_mirror |
| [EXISTS] should_return_value_unchanged_for_color_token |
| [EXISTS] should_return_value_unchanged_for_spacing_token |
| [EXISTS] should_return_value_unchanged_for_text_direction_token |
| [EXISTS] should_return_value_unchanged_for_font_family_token |
| [EXISTS] should_contain_icon_mirror (BOOLEAN_TOKEN_SLUGS) |
| [EXISTS] should_not_contain_text_direction (BOOLEAN_TOKEN_SLUGS) |
| [EXISTS] should_generate_css_custom_property_for_single_token |
| [EXISTS] should_generate_multiple_css_custom_properties_separated_by_space |
| [EXISTS] should_apply_adr_003_005_conversion_for_icon_mirror_true |
| [EXISTS] should_apply_adr_003_005_conversion_for_icon_mirror_false |
| [EXISTS] should_not_convert_non_boolean_tokens_alongside_icon_mirror |
| [EXISTS] should_return_empty_string_for_empty_token_map |
| [EXISTS] should_prefix_each_slug_with_double_dash |

Note: file contains 16 tests (12 stated in Phase 4); strategy counts all 16.

**Total existing: 60 tests (green baseline)**

---

## 4. Unit Test Plan — New Tests Required

### 4.1 buildContextKey (ITokenCacheService.ts) — Target file: ITokenCacheService.test.ts [NEW]

```
TC-U-001: buildContextKey_WithAllDimensionsProvided_ReturnsColonJoinedString [NEW]
File: apps/api/src/services/tokens/ITokenCacheService.test.ts
```

```
TC-U-002: buildContextKey_WithAllNullOptionalDimensions_UsesUnderscorePlaceholder [NEW]
Given: ctx = { renderTarget: 'portal', locale: null, service: null, category: null, componentSlug: null }
When: buildContextKey(ctx) is called
Then: result === 'portal:_:_:_:_'
Priority: Critical
Type: Unit
References: ADR-003-001, Section 8.2 (key structure)
```

```
TC-U-003: buildContextKey_WithPartialNullDimensions_SubstitutesUnderscoreOnlyForNulls [NEW]
Given: ctx = { renderTarget: 'portal', locale: 'ar', service: null, category: null, componentSlug: null }
When: buildContextKey(ctx) is called
Then: result === 'portal:ar:_:_:_'
Priority: High
Type: Unit
References: ADR-003-001
```

```
TC-U-004: buildContextKey_WithUndefinedOptionalDimensions_TreatsUndefinedAsNull [NEW]
Given: ctx = { renderTarget: 'admin' } (locale, service, category, componentSlug all absent)
When: buildContextKey(ctx) is called
Then: result === 'admin:_:_:_:_'
Note: Verifies the ?? '_' fallback handles both undefined and null
Priority: High
Type: Unit
References: ADR-003-001
```

```
TC-U-005: buildContextKey_WithSameContextTwice_ProducesDeterministicIdenticalKey [NEW]
Given: two identical context objects constructed independently
When: buildContextKey() is called on each
Then: both results are strictly equal (===)
Priority: High
Type: Unit
References: ADR-003-001 (cache key determinism)
```

### 4.2 NodeCacheTokenCache — Target file: NodeCacheTokenCache.test.ts [NEW]

All tests in this section use a real NodeCacheTokenCache instance with short TTLs to avoid test latency.

```
TC-U-006: acquirePublishLock_WhenNotHeld_ReturnsTrue [NEW]
Given: a freshly constructed NodeCacheTokenCache instance
When: acquirePublishLock(60) is called
Then: returns true
Priority: Critical
Type: Unit
References: ADR-003-007
```

```
TC-U-007: acquirePublishLock_WhenAlreadyHeld_ReturnsFalse [NEW]
Given: acquirePublishLock(60) has been called once (returned true)
When: acquirePublishLock(60) is called a second time
Then: returns false
Priority: Critical
Type: Unit
References: ADR-003-007, Business Rule 3 (publish serialisation)
```

```
TC-U-008: releasePublishLock_AfterAcquire_AllowsSubsequentAcquire [NEW]
Given: acquirePublishLock acquired; releasePublishLock() called
When: acquirePublishLock(60) is called again
Then: returns true
Priority: Critical
Type: Unit
References: ADR-003-007
```

```
TC-U-009: setRawDefinitions_ThenGetRawDefinitions_ReturnsSameArray [NEW]
Given: an array of two TokenDefinition objects
When: setRawDefinitions(defs) then getRawDefinitions() are called
Then: returned value deep-equals the input array
Priority: High
Type: Unit
References: ADR-003-001, Section 8.3
```

```
TC-U-010: getRawDefinitions_WhenNothingStored_ReturnsNull [NEW]
Given: a freshly constructed NodeCacheTokenCache instance
When: getRawDefinitions() is called
Then: returns null
Priority: High
Type: Unit
References: ADR-003-001
```

```
TC-U-011: setRawValues_LiveTier_ThenGetRawValues_LiveTier_ReturnsSameArray [NEW]
Priority: High
Type: Unit
References: ADR-003-001
```

```
TC-U-012: setRawValues_DraftTier_IsIsolatedFromLiveTier [NEW]
Given: setRawValues('draft', draftVals) and setRawValues('live', liveVals) both called
When: getRawValues('draft') is called
Then: returns draftVals (not liveVals)
Priority: Critical
Type: Unit
References: ADR-003-002 (staging window — live and draft must be fully isolated)
```

```
TC-U-013: flushDraftCache_DoesNotAffectLiveCache [NEW]
Given: raw values stored in both live and draft tiers
When: flushDraftCache() is called
Then: getRawValues('live') still returns the live values
And:  getRawValues('draft') returns null
Priority: Critical
Type: Unit
References: ADR-003-002 (staging window integrity)
```

```
TC-U-014: flushAllResolvedMaps_ForDraftTier_DeletesOnlyDraftContextKeys [NEW]
Given: setResolvedMap('live', 'portal:en:_:_:_', liveMap) and setResolvedMap('draft', 'portal:en:_:_:_', draftMap) both called
When: flushAllResolvedMaps('draft') is called
Then: getResolvedMap('live', 'portal:en:_:_:_') still returns liveMap
And:  getResolvedMap('draft', 'portal:en:_:_:_') returns null
Priority: Critical
Type: Unit
References: ADR-003-002
```

```
TC-U-015: setLastPublishedAt_ThenGetLastPublishedAt_ReturnsSetDate [NEW]
Given: a Date object
When: setLastPublishedAt(date) then getLastPublishedAt() are called
Then: returned value equals input date (ISO string comparison)
Priority: High
Type: Unit
References: ADR-003-007
```

```
TC-U-016: getLastPublishedAt_WhenNeverSet_ReturnsNull [NEW]
Given: a freshly constructed NodeCacheTokenCache instance
When: getLastPublishedAt() is called
Then: returns null
Priority: High
Type: Unit
References: ADR-003-007
```

### 4.3 TokenQueryService — Target file: TokenQueryService.test.ts [NEW]

```
TC-U-017: resolveTokenMap_WhenResolvedMapCached_ReturnsCacheHitWithoutFetchingRaw [NEW]
Given: cacheService.getResolvedMap returns a preloaded map
When: resolveTokenMap(ctx, 'live', deps, log) is called
Then: returns the cached map
And:  definitionRepo.findAll is NOT called
And:  valueRepo.findAllActive is NOT called
Priority: Critical
Type: Unit
References: Section 8.4, AC-009 (warm cache performance path)
```

```
TC-U-018: resolveTokenMap_WhenRawRecordsCached_ResolveWithoutDataverseFetch [NEW]
Given: getResolvedMap returns null; getRawDefinitions/getRawValues return populated arrays
When: resolveTokenMap(ctx, 'live', deps, log) is called
Then: calls resolutionService.resolve(defs, vals, ctx)
And:  definitionRepo.findAll is NOT called
And:  cacheService.setResolvedMap is called with the resolved result
Priority: Critical
Type: Unit
References: Section 8.4 (tier-2 resolution)
```

```
TC-U-019: resolveTokenMap_WhenFullCacheMiss_FetchesFromDataverseAndWarmsCache [NEW]
Given: all cache.get* methods return null
When: resolveTokenMap(ctx, 'live', deps, log) is called
Then: definitionRepo.findAll is called once
And:  valueRepo.findAllActive is called once
And:  cacheService.setRawDefinitions is called
And:  cacheService.setRawValues is called with 'live'
And:  cacheService.setResolvedMap is called
Priority: Critical
Type: Unit
References: Section 8.4 (tier-3 resolution)
```

```
TC-U-020: resolveTokenMap_WithDraftCacheType_UsesRawValuesDraftTier [NEW]
Given: getRawValues('draft') returns draft values
When: resolveTokenMap(ctx, 'draft', deps, log) is called
Then: setRawValues is called with 'draft' on Dataverse path
And:  getResolvedMap is queried with 'draft' cacheType
Priority: Critical
Type: Unit
References: ADR-003-002 (draft cache is preview path only)
```

### 4.4 cssUtils — Target file: cssUtils.test.ts [NEW]

```
TC-U-021: sanitiseResolvedMap_WithCleanMap_ReturnsIdenticalValues [NEW]
Given: { 'color-primary': '#1a4d8f', 'spacing-md': '16px' }
When: sanitiseResolvedMap(map) is called
Then: output values equal input values
Priority: High
Type: Unit
References: Section 2, Phase 4 B-003
```

```
TC-U-022: sanitiseResolvedMap_WithUrlFunction_NeutralisesToUrlBlocked [NEW]
Given: { 'bg-image': 'url(http://evil.com/img.png)' }
When: sanitiseResolvedMap(map) is called
Then: output['bg-image'] === 'url-blocked(http://evil.com/img.png)'
And:  does NOT throw
Priority: Critical
Type: Unit
References: Section 13 (CSS injection defence), Business Rule 5
```

```
TC-U-023: sanitiseResolvedMap_WithExpressionFunction_NeutralisesGracefully [NEW]
Given: { 'shadow': 'expression(alert(1))' }
When: sanitiseResolvedMap(map) is called
Then: output['shadow'] === 'expression-blocked(alert(1))'
And:  does NOT throw
Priority: Critical
Type: Unit
References: Business Rule 5 (read-time neutralisation must NOT throw)
```

```
TC-U-024: sanitiseResolvedMap_WithSemicolon_StripsSemicolonWithoutThrowing [NEW]
Given: { 'spacing': '16px; color: red' }
When: sanitiseResolvedMap(map) is called
Then: output['spacing'] === '16px color: red'
And:  does NOT throw
Priority: Critical
Type: Unit
References: Business Rule 5 (read-time contrast with write-time: write throws, read neutralises)
```

```
TC-U-025: sanitiseResolvedMap_WithImportPattern_NeutralisesGracefully [NEW]
Given: { 'font': '@import(evil.css)' }
When: sanitiseResolvedMap(map) is called
Then: output['font'] === '@import-blocked(evil.css)'
And:  does NOT throw
Priority: Critical
Type: Unit
References: Business Rule 5
```

```
TC-U-026: sanitiseResolvedMap_WithEmptyMap_ReturnsEmptyMap [NEW]
Priority: Medium
Type: Unit
```

```
TC-U-027: sanitiseResolvedMap_DoesNotMutateInputMap [NEW]
Given: a frozen input map
When: sanitiseResolvedMap(map) is called
Then: the original map is unchanged
And:  a new object is returned
Priority: High
Type: Unit
References: Immutability standards (common.md)
```

### 4.5 TokenDefinitionService — Additional coverage [NEW]

```
TC-U-028: updateDefinition_WithValidPatch_CallsRepositoryUpdate [NEW]
Given: definition exists by slug
When: updateDefinition('color-primary', { description: 'Updated' }) is called
Then: defRepo.update is called with the definition id and patch payload
Priority: High
Type: Unit
References: Section 7.3 (PATCH semantics)
```

```
TC-U-029: updateDefinition_WhenSlugDoesNotExist_ThrowsTokenNotFoundError [NEW]
Priority: High
Type: Unit
```

```
TC-U-030: createDefinition_WhenCountIsOneBelowLimit_Succeeds [NEW]
Given: countActive returns 199 (one below the 200 limit)
When: createDefinition is called
Then: creation succeeds (no TokenDefinitionLimitError)
Priority: High
Type: Unit
References: ADR-003-006 (soft limit is ≥ 200, not > 199)
```

### 4.6 W-002 Defect Investigation — TokenValueRepository.mapToValue definitionSlug gap

**Finding:** `mapToValue()` at line 262 of TokenValueRepository.ts hardcodes `definitionSlug: ''` (empty string). The `TokenValueSummary` interface in the arch doc specifies `definitionSlug` as a joined field from the definition record. The OData query in `findAllActive()` does not expand the lookup to retrieve the slug.

**Impact analysis:** `definitionSlug` appears in `TokenValueSummary` (the admin list response shape). The admin GET /api/admin/tokens/values route would return `definitionSlug: ''` for all values — the admin UI cannot display which definition a value belongs to without a separate lookup. This does NOT affect resolution (resolution uses `definitionId`, not `definitionSlug`).

**Confidence: 95%** — The code is plainly setting `''` and the OData query has no `$expand`. This is a confirmed implementation gap.

```
TC-U-031: mapToValue_WithoutExpand_ReturnsEmptyStringForDefinitionSlug [NEW]
Given: a DataverseTokenValue record with a known definitionId
When: the repository's findAllActive() maps the record via mapToValue
Then: the returned TokenValue.definitionSlug === '' (documenting the known empty behaviour)
Priority: High
Type: Unit
References: W-002 code review warning; Section 7 (TokenValueSummary.definitionSlug)
Note: This test asserts the CURRENT behaviour to prevent silent regressions.
A separate fix ticket must be raised to add $expand or a definition slug lookup.
```

---

## 5. Integration Test Plan

All integration tests use Supertest against a Fastify app instance. Repositories are replaced by mock implementations injected via the DI pattern. NodeCacheTokenCache is used as the real cache service (no mocks). JWT fixtures are signed with `TEST_JWT_SECRET`.

The integration test bootstrap creates: one portal-admin JWT, one service-owner:elearning JWT, and a set of pre-seeded mock repository responses (2 definitions, 4 values covering levels 1–5).

### 5.1 GET /api/tokens/resolve (public, live cache)

```
TC-I-001: resolve_WithValidRenderTarget_Returns200WithTokenMap [NEW]
Given: live cache is warm with { 'color-primary': '#1a4d8f' }
When: GET /api/tokens/resolve?renderTarget=portal
Then: 200 { data: { 'color-primary': '#1a4d8f' } }
Priority: Critical
Type: Integration
References: AC-001, FR-015
```

```
TC-I-002: resolve_WithUnknownRenderTargetValue_Returns400ValidationError [NEW]
Given: unauthenticated request
When: GET /api/tokens/resolve?renderTarget=unknown
Then: 400 { code: 'validation_error' }
Priority: High
Type: Integration
References: Section 9 (Zod query schema)
```

```
TC-I-003: resolve_WithNoQueryParams_DefaultsToPortalRenderTarget_Returns200 [NEW]
Given: no query params
When: GET /api/tokens/resolve
Then: 200 (renderTarget defaults to 'portal')
Priority: High
Type: Integration
```

```
TC-I-004: resolve_WithLocaleArParam_Returns200 [NEW]
Given: live cache warm for portal:ar context
When: GET /api/tokens/resolve?renderTarget=portal&locale=ar
Then: 200 { data: { ... Arabic locale values ... } }
Priority: High
Type: Integration
References: AC-005 (locale-specific resolution)
```

```
TC-I-005: resolve_WithServiceSlugParam_Returns200WithServiceScopedValues [NEW]
Given: live cache contains Level 5 values for service 'elearning'
When: GET /api/tokens/resolve?renderTarget=portal&service=elearning
Then: 200 (service-specific values in response)
Priority: High
Type: Integration
References: AC-010
```

```
TC-I-006: resolve_WhenCacheMissAndDataverseAvailable_Returns200FromDataverse [NEW]
Given: live cache is cold; mock definition/value repos return data
When: GET /api/tokens/resolve?renderTarget=portal
Then: 200 (resolved from Dataverse via repo mocks)
And:  subsequent request returns same data from warm cache (no second repo call)
Priority: Critical
Type: Integration
References: Section 8.4 (two-tier cache flow)
```

```
TC-I-007: resolve_StagingWindow_ValueCreatedButNotPublished_DoesNotAppearInLiveResolve [NEW]
Given: a token value is created via POST /api/admin/tokens/values (draft only)
When: GET /api/tokens/resolve?renderTarget=portal is called (no publish)
Then: live resolve response does NOT include the new value
Priority: Critical
Type: Integration
References: ADR-003-002, Business Rule 2 (staging window)
```

```
TC-I-008: resolve_AfterPublish_ValueAppearsInLiveResolve [NEW]
Given: a token value has been created and POST /api/admin/tokens/publish called
When: GET /api/tokens/resolve?renderTarget=portal
Then: live resolve response includes the published value
Priority: Critical
Type: Integration
References: AC-008, ADR-003-002
```

### 5.2 POST /api/admin/tokens/definitions

```
TC-I-009: createDefinition_WithValidBody_Returns201 [NEW]
Given: portal-admin JWT; definition count < 200
When: POST /api/admin/tokens/definitions { name, slug, tokenType }
Then: 201 { data: { slug, id, ... } }
Priority: Critical
Type: Integration
References: FR-001, AC-001
```

```
TC-I-010: createDefinition_WithoutJwt_Returns401 [NEW]
When: POST /api/admin/tokens/definitions (no Authorization header)
Then: 401
Priority: Critical
Type: Integration
References: Section 13 (auth table)
```

```
TC-I-011: createDefinition_WithServiceOwnerJwt_Returns403 [NEW]
When: POST /api/admin/tokens/definitions with service-owner JWT
Then: 403
Priority: Critical
Type: Integration
References: Section 13
```

```
TC-I-012: createDefinition_WhenAtSoftLimit_Returns422WithLimitReachedCode [NEW]
Given: mock countActive returns 200
When: POST /api/admin/tokens/definitions (portal-admin)
Then: 422 { code: 'token_definition_limit_reached' }
Priority: Critical
Type: Integration
References: ADR-003-006, Business Rule 4
```

```
TC-I-013: createDefinition_WithDuplicateSlug_Returns409 [NEW]
Given: mock findBySlug returns an existing definition
When: POST /api/admin/tokens/definitions with same slug
Then: 409 { code: 'duplicate_token_slug' }
Priority: High
Type: Integration
References: Section 9
```

```
TC-I-014: createDefinition_WithNonKebabCaseSlug_Returns400 [NEW]
When: POST /api/admin/tokens/definitions { slug: 'CamelCase' }
Then: 400 { code: 'validation_error' }
Priority: High
Type: Integration
```

### 5.3 PATCH /api/admin/tokens/definitions/:slug

```
TC-I-015: updateDefinition_WithValidPatch_Returns204 [NEW]
Given: portal-admin JWT; definition exists
When: PATCH /api/admin/tokens/definitions/color-primary { description: 'Updated' }
Then: 204
Priority: High
Type: Integration
```

```
TC-I-016: updateDefinition_WithSlugInPatchBody_Returns400ImmutableFieldError [NEW]
Given: portal-admin JWT
When: PATCH /api/admin/tokens/definitions/color-primary { slug: 'new-slug' }
Then: 400 { code: 'validation_error' } (slug is not in PatchSchema — Zod rejects unknown keys if strict)
Note: Confirms slug immutability is enforced at the schema layer, not just the service layer
Priority: Critical
Type: Integration
References: Section 6.2 (slug immutability), ADR-003 (Zod schema design)
```

```
TC-I-017: updateDefinition_WithNonExistentSlug_Returns404 [NEW]
When: PATCH /api/admin/tokens/definitions/no-such-slug { description: 'x' }
Then: 404 { code: 'token_definition_not_found' }
Priority: High
Type: Integration
```

### 5.4 DELETE /api/admin/tokens/definitions/:slug (cascade deactivation)

```
TC-I-018: deactivateDefinition_WithValidSlug_Returns204AndCascadesValues [NEW]
Given: definition exists with 2 active child values
When: DELETE /api/admin/tokens/definitions/color-primary (portal-admin)
Then: 204
And:  mock valueRepo.deactivateAllForDefinition called with definition id
And:  mock defRepo.deactivate called
Priority: Critical
Type: Integration
References: AC-017, Business Rule 8
```

```
TC-I-019: deactivateDefinition_WithNonExistentSlug_Returns404 [NEW]
Priority: High
Type: Integration
```

### 5.5 POST /api/admin/tokens/values

```
TC-I-020: createValue_WithValidGlobalLevelBody_Returns201 [NEW]
Given: portal-admin JWT; definition exists
When: POST /api/admin/tokens/values { definitionSlug, level: 860005011, value: '#ff0000' }
Then: 201 { data: { ... } }
Priority: Critical
Type: Integration
```

```
TC-I-021: createValue_WithRenderTargetLevelMissingRenderTargetField_Returns400 [NEW]
When: POST /api/admin/tokens/values { level: 860005012 } (no renderTarget)
Then: 400 { code: 'validation_error' }
Priority: High
Type: Integration
References: Section 9 (superRefine level context enforcement)
```

```
TC-I-022: createValue_WithUrlInValue_Returns400CssValidationError [NEW]
When: POST /api/admin/tokens/values { value: 'url(http://evil.com)' }
Then: 400 { code: 'css_value_validation_error' } (or mapped error from TokenCssValueValidationError)
Priority: Critical
Type: Integration
References: Business Rule 5 (write-time CSS sanitisation)
```

```
TC-I-023: createValue_WithDuplicateContext_Returns409 [NEW]
Given: mock findMatchingContext returns existing value
When: POST /api/admin/tokens/values with same context
Then: 409 { code: 'duplicate_token_value_context' }
Priority: High
Type: Integration
```

```
TC-I-024: createValue_WithNonExistentDefinitionSlug_Returns404 [NEW]
Priority: High
Type: Integration
```

```
TC-I-025: createValue_WithoutJwt_Returns401 [NEW]
Priority: Critical
Type: Integration
```

### 5.6 DELETE /api/admin/tokens/values/:id

```
TC-I-026: deactivateValue_WithValidId_Returns204 [NEW]
Given: portal-admin JWT; value exists
When: DELETE /api/admin/tokens/values/<id>
Then: 204
And:  draft cache flushed
Priority: Critical
Type: Integration
```

```
TC-I-027: deactivateValue_WithNonExistentId_Returns404 [NEW]
Priority: High
Type: Integration
```

```
TC-I-028: deactivateValue_WithInvalidUuidFormat_Returns400 [NEW]
When: DELETE /api/admin/tokens/values/not-a-uuid
Then: 400
Priority: Medium
Type: Integration
```

### 5.7 POST /api/admin/tokens/publish

```
TC-I-029: publish_WithPortalAdminJwt_Returns204 [NEW]
Given: no lock held; last publish > 10s ago (or never)
When: POST /api/admin/tokens/publish
Then: 204
And:  definitionRepo.findAll called
And:  valueRepo.findAllActive called
And:  cacheService.setRawValues called with 'live'
And:  cacheService.flushAllResolvedMaps called with 'live'
Priority: Critical
Type: Integration
References: ADR-003-007, AC-008, FR-030
```

```
TC-I-030: publish_WhenCalledTwiceWithinDebounceWindow_SecondCallReturns429 [NEW]
Given: TOKEN_PUBLISH_MIN_INTERVAL_MS=100 (test env)
When: POST /api/admin/tokens/publish called; then immediately called again
Then: first call 204; second call 429 { code: 'publish_rate_limited', retryAfter: N }
And:  response contains Retry-After header
Priority: Critical
Type: Integration
References: ADR-003-007, Business Rule 3
```

```
TC-I-031: publish_WhenLockAlreadyHeld_Returns429WithPublishInProgressCode [NEW]
Given: cacheService.acquirePublishLock returns false (lock held)
When: POST /api/admin/tokens/publish
Then: 429 { code: 'publish_in_progress' }
Priority: Critical
Type: Integration
References: ADR-003-007, Business Rule 3
```

```
TC-I-032: publish_WithoutJwt_Returns401 [NEW]
Priority: Critical
Type: Integration
```

```
TC-I-033: publish_WithServiceOwnerJwt_Returns403 [NEW]
Priority: Critical
Type: Integration
```

### 5.8 GET /api/admin/tokens/preview

```
TC-I-034: preview_WithPortalAdminJwt_ReturnsDraftCacheMap [NEW]
Given: draft cache contains { 'color-primary': '#draft-color' }; live cache contains '#live-color'
When: GET /api/admin/tokens/preview?renderTarget=portal
Then: 200 { data: { 'color-primary': '#draft-color' } }
Priority: Critical
Type: Integration
References: AC-007, ADR-003-002 (preview = draft; portal = live)
```

```
TC-I-035: preview_ShowsDraftValueNotYetPublished [NEW]
Given: new value created (drafts updated) but publish not called
When: GET /api/admin/tokens/preview
Then: unpublished value appears in response
And:  GET /api/tokens/resolve (live) does NOT include the same value
Priority: Critical
Type: Integration
References: Business Rule 2 (staging window)
```

```
TC-I-036: preview_WithoutJwt_Returns401 [NEW]
Priority: Critical
Type: Integration
```

### 5.9 Service-Owner Routes (/api/service/tokens)

```
TC-I-037: serviceResolve_WithServiceOwnerJwt_Returns200ScopedToCallerService [NEW]
Given: service-owner JWT for 'elearning'; live cache has L5 values for 'elearning'
When: GET /api/service/tokens?renderTarget=portal
Then: 200 with resolved tokens (including elearning L5 overrides)
Priority: High
Type: Integration
References: AC-010, FR-018
```

```
TC-I-038: serviceResolve_WithoutJwt_Returns401 [NEW]
Priority: Critical
Type: Integration
```

```
TC-I-039: serviceCreateValue_WithMatchingServiceSlug_Returns201 [NEW]
Given: service-owner JWT for 'elearning'; body { definitionSlug, value }
When: POST /api/service/tokens/values
Then: 201; created value has serviceSlug = 'elearning' (from JWT, not body)
Priority: Critical
Type: Integration
References: Section 13 (serviceSlug always from JWT)
```

```
TC-I-040: serviceCreateValue_WithServiceSlugInBodyThatDiffersFromJwt_Returns403 [NEW]
Given: service-owner JWT for 'elearning'; mock repo check against 'finance'
When: POST /api/service/tokens/values (service slug enforcement at service level)
Then: 403 { code: 'service_slug_mismatch' }
Priority: Critical
Type: Integration
References: Business Rule 7, AC-010
```

```
TC-I-041: serviceDeleteValue_OwnedByDifferentService_Returns403 [NEW]
Given: service-owner JWT for 'elearning'; value.serviceSlug = 'finance'
When: DELETE /api/service/tokens/values/<id>
Then: 403 { code: 'service_slug_mismatch' }
Priority: Critical
Type: Integration
References: Business Rule 7
```

```
TC-I-042: serviceDeleteValue_WithNonExistentId_Returns404 [NEW]
Priority: High
Type: Integration
```

### 5.10 ISR Revalidation Route (Next.js)

```
TC-I-043: revalidate_WithCorrectSecret_Returns200RevalidatedTrue [NEW]
Given: NEXTJS_REVALIDATE_SECRET = 'test-secret-abc'
When: POST /api/revalidate { path: '/' } with header x-revalidate-secret: test-secret-abc
Then: 200 { revalidated: true, path: '/' }
Priority: Critical
Type: Integration (Next.js route handler)
References: B-001, Business Rule 9
```

```
TC-I-044: revalidate_WithWrongSecret_Returns401 [NEW]
When: POST /api/revalidate with x-revalidate-secret: wrong-secret
Then: 401 { error: 'Invalid revalidation secret' }
Priority: Critical
Type: Integration
References: B-001, Business Rule 9
```

```
TC-I-045: revalidate_WithNoSecret_Returns401 [NEW]
When: POST /api/revalidate (no x-revalidate-secret header)
Then: 401
Priority: Critical
Type: Integration
```

```
TC-I-046: revalidate_WithInvalidJsonBody_Returns400 [NEW]
When: POST /api/revalidate with malformed JSON body
Then: 400
Priority: Medium
Type: Integration
```

---

## 6. E2E Test Plan (Playwright)

All E2E tests use a seeded Fastify API and Next.js dev server. Seed data provides 5 known token definitions with live values already published.

```
TC-E2E-001: portal_LoadsWithCSSCustomPropertiesInStyleTag [NEW]
Given: Next.js portal at /en (English locale)
When: page.goto('/en')
Then: <style> element in <head> contains ':root {'
And:  style text includes '--color-primary:'
And:  style text includes '--spacing-md:'
And:  style text does NOT contain 'undefined' or 'null' as values
Priority: Critical
Type: E2E
References: AC-001, Section 12 (SSR layout integration)
```

```
TC-E2E-002: portal_ArabicLocale_ContainsRtlDirectionToken [NEW]
Given: Next.js portal at /ar (Arabic locale)
When: page.goto('/ar')
Then: style text includes '--text-direction: rtl;'
And:  html element has dir attribute equal to 'rtl'
Priority: Critical
Type: E2E
References: ADR-003-005, seed values (text-direction locale=ar value)
```

```
TC-E2E-003: portal_IconMirrorToken_RenderedAsNumericNotBoolean [NEW]
Given: Arabic locale page with icon-mirror seed value = 'true'
When: page.goto('/ar')
Then: style text includes '--icon-mirror: 1;'
And:  style text does NOT contain '--icon-mirror: true;'
Priority: Critical
Type: E2E
References: ADR-003-005, Business Rule 6
```

```
TC-E2E-004: adminPublish_ChangedValueAppearsInPortalWithinISRWindow [NEW]
Given: color-primary live value = '#1a4d8f'
When: admin updates value to '#ff0000' via POST /api/admin/tokens/values
And:  admin calls POST /api/admin/tokens/publish
And:  publish triggers POST /api/revalidate (B-001)
And:  wait up to 10 seconds then page.goto('/en')
Then: :root style contains '--color-primary: #ff0000;'
Note: Tests end-to-end ISR revalidation after publish (Skeptic Challenge 5 resolution)
Priority: Critical
Type: E2E
References: B-001, AC-008, Business Rule 2 (staging window — live after publish)
```

```
TC-E2E-005: adminPreview_ShowsDraftValueBeforePublish [NEW]
Given: color-primary live value = '#1a4d8f'
When: admin creates new value '#draft-red' via POST /api/admin/tokens/values (draft only)
And:  admin calls GET /api/admin/tokens/preview?renderTarget=portal
Then: preview response contains 'color-primary': '#draft-red'
And:  GET /api/tokens/resolve (live) still returns '#1a4d8f'
Priority: Critical
Type: E2E
References: AC-007, Business Rule 2
```

---

## 7. Performance Test Plan

### 7.1 Warm Cache Latency — GET /api/tokens/resolve

**Test: k6/token-resolve-warm.js**

```javascript
// Scenario: warm cache; 50 virtual users; 60 second duration
// Pre-condition: live cache populated with 5 token definitions
// Target: p95 < 50ms (NFR-001, AC-009)

export const options = {
  vus: 50,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<50'],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  const res = http.get(`${API_URL}/api/tokens/resolve?renderTarget=portal&locale=en`);
  check(res, { 'status is 200': (r) => r.status === 200 });
}
```

### 7.2 Cold Cache (Dataverse Fetch) Latency

**Test: k6/token-resolve-cold.js**

```javascript
// Scenario: cache flushed before each VU iteration; mock Dataverse latency 200ms
// Target: p95 < 500ms (NFR-002)
// Note: requires Dataverse stub or mock that adds 200ms delay

export const options = {
  vus: 10,
  iterations: 50,
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};
```

### 7.3 Publish Duration

**Test: k6/token-publish.js**

```javascript
// Scenario: sequential publish calls (must respect debounce); measure p95 duration
// Target: publish completes in < 2000ms (NFR-003)
// Note: TOKEN_PUBLISH_MIN_INTERVAL_MS=0 for duration test (debounce disabled)

export const options = {
  vus: 1,
  iterations: 10,
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};
```

### 7.4 Concurrent Publish Rejection

```
TC-PERF-001: concurrentPublish_OnlyOneSucceeds_OtherReturns429 [NEW]
Scenario: 5 simultaneous POST /api/admin/tokens/publish requests
Target: exactly 1 returns 204; remaining 4 return 429
Tool: k6 with 5 VUs, 1 iteration each
Priority: Critical
Type: Performance
References: ADR-003-007, Business Rule 3
```

| Scenario | Target p95 | Target throughput | Tool |
|---|---|---|---|
| GET /api/tokens/resolve (warm cache) | < 50ms | 500 req/s at 50 VU | k6 |
| GET /api/tokens/resolve (cold cache) | < 500ms | N/A (cache miss path) | k6 |
| POST /api/admin/tokens/publish | < 2000ms | N/A (singleton operation) | k6 |
| Concurrent publish — rejection rate | N/A | 4/5 rejected = 80% 429 rate | k6 |

---

## 8. Security Test Plan

### 8.1 CSS Injection via Write Paths

```
TC-SEC-001: cssInjection_ViaDefinitionDefaultValue_BlockedAtWriteTime [NEW]
Given: portal-admin JWT
When: POST /api/admin/tokens/definitions { defaultValue: 'url(http://evil.com)' }
Then: 400 { code: 'css_value_validation_error' }
Note: Confirms sanitisation is applied to defaultValue at write time, not just values
Confidence: 85% — defaultValue goes through the same create path; confirm it is sanitised
Priority: Critical
Type: Security
References: Section 13 (CSS injection defence)
```

```
TC-SEC-002: cssInjection_ViaAdminTokenValue_BlockedAtWriteTime [NEW]
Given: portal-admin JWT
When: POST /api/admin/tokens/values { value: 'expression(document.cookie)' }
Then: 400 (TokenCssValueValidationError mapped to 400)
Priority: Critical
Type: Security
References: Business Rule 5
```

```
TC-SEC-003: cssInjection_ViaServiceOwnerValue_BlockedAtWriteTime [NEW]
Given: service-owner JWT for 'elearning'
When: POST /api/service/tokens/values { value: '@import(evil.css)' }
Then: 400
Priority: Critical
Type: Security
References: Business Rule 5
```

```
TC-SEC-004: cssInjection_SemicolonInValue_StrippedAtWriteTime [NEW]
Given: portal-admin JWT
When: POST /api/admin/tokens/values { value: '16px; color: red' }
Then: either 400 OR value is stored as '16px color: red' (stripped)
Note: Current implementation strips semicolons (not throws) at write time
Confidence: 90% — sanitizeCssValue strips semicolons per unit test TC [EXISTS]
Priority: High
Type: Security
```

```
TC-SEC-005: cssInjection_AlreadyInDataverse_NeutralisedAtReadTime [NEW]
Given: mock value repo returns a value containing 'url(evil.com)' (simulating direct Dataverse write)
When: GET /api/tokens/resolve is called
Then: response value contains 'url-blocked(evil.com)' instead of 'url(evil.com)'
And:  response is 200 (does not throw)
Priority: Critical
Type: Security
References: B-003, Skeptic Challenge 4, Business Rule 5
```

### 8.2 Authentication and Authorisation

```
TC-SEC-006: unauthenticatedAccess_ToAdminDefinitionsRoute_Returns401 [NEW]
When: GET /api/admin/tokens/definitions (no JWT)
Then: 401
Priority: Critical
Type: Security
```

```
TC-SEC-007: unauthenticatedAccess_ToServiceOwnerRoute_Returns401 [NEW]
When: GET /api/service/tokens (no JWT)
Then: 401
Priority: Critical
Type: Security
```

```
TC-SEC-008: serviceOwnerAccessToAdminRoute_Returns403 [NEW]
Given: service-owner JWT
When: GET /api/admin/tokens/definitions
Then: 403
Priority: Critical
Type: Security
References: Section 13 (auth table)
```

```
TC-SEC-009: portalAdminCannotBeServiceOwner_RoleCheckEnforced [NEW]
Given: portal-admin JWT
When: GET /api/service/tokens
Then: 403 (portal-admin does not have service-owner role)
Priority: High
Type: Security
References: Section 13
```

```
TC-SEC-010: serviceOwnerSlugMismatch_CannotWriteToOtherService_Returns403 [NEW]
Given: service-owner:elearning JWT; value with serviceSlug = 'finance'
When: DELETE /api/service/tokens/values/<finance-value-id>
Then: 403 { code: 'service_slug_mismatch' }
Priority: Critical
Type: Security
References: Business Rule 7, AC-010
```

```
TC-SEC-011: expiredJwt_Returns401 [NEW]
Given: JWT with exp = now - 1 second
When: GET /api/admin/tokens/definitions
Then: 401
Priority: High
Type: Security
```

```
TC-SEC-012: revalidateEndpoint_WithNoSecret_Returns401 [NEW]
Already covered by TC-I-045 but raised here for the security report as well
Priority: Critical
Type: Security
References: Business Rule 9
```

---

## 9. Given/When/Then Scenarios (Minimum 10 — Highest-Risk Flows)

### Scenario 1: Five-Level Cascade Priority (Business Rule 1)
```
Scenario: Service-level value wins over global when context matches
Given: definition 'color-primary' has Level 1 global value '#global' and Level 5 service value '#service' for slug 'elearning'
When: TokenResolutionService.resolve() is called with context { service: 'elearning' }
Then: result['color-primary'] === '#service'
And:  global value '#global' is not selected
References: Business Rule 1, specificity scoring (service=50 > global=10)
```

### Scenario 2: Staging Window — Value Created But Not Published (Business Rule 2)
```
Scenario: Admin creates a new token value; portal continues to serve old live value
Given: token 'color-primary' live value is '#1a4d8f'
And:   portal-admin creates new value '#ff0000' (draft only, no publish called)
When:  GET /api/tokens/resolve?renderTarget=portal is called
Then:  response contains 'color-primary': '#1a4d8f' (old live value)
And:   GET /api/admin/tokens/preview contains 'color-primary': '#ff0000' (draft value)
References: ADR-003-002, AC-007, Business Rule 2
```

### Scenario 3: Publish Debounce Rejection (Business Rule 3)
```
Scenario: Second publish within debounce window is rejected
Given: TOKEN_PUBLISH_MIN_INTERVAL_MS = 100ms in test environment
And:   first POST /api/admin/tokens/publish called and returned 204
When:  second POST /api/admin/tokens/publish called within 100ms
Then:  second call returns 429
And:   response body contains { code: 'publish_rate_limited' }
And:   response headers contain Retry-After with a positive integer value
References: ADR-003-007, Business Rule 3
```

### Scenario 4: Definition Soft Limit Enforcement (Business Rule 4)
```
Scenario: Creating definition number 201 is rejected
Given: 200 active token definitions exist (countActive returns 200)
When:  portal-admin calls POST /api/admin/tokens/definitions with valid payload
Then:  returns 422
And:   response body contains { code: 'token_definition_limit_reached' }
And:   the response message references a performance review
References: ADR-003-006, Business Rule 4
```

### Scenario 5: CSS url() Injection Blocked at Write Time (Business Rule 5 — write)
```
Scenario: Admin attempts to store a CSS url() exploit in a token value
Given: portal-admin is authenticated
When:  POST /api/admin/tokens/values { value: 'url(javascript:alert(1))' }
Then:  returns 400
And:   response body contains { code: 'css_value_validation_error' }
And:   no record is written to Dataverse
References: Business Rule 5, Section 13
```

### Scenario 6: CSS url() in Existing Dataverse Record Neutralised at Read Time (Business Rule 5 — read)
```
Scenario: Malicious value already in Dataverse is neutralised before serving to portal
Given: mock TokenValueRepository returns a value with qdb_value = 'url(http://evil.com/img)'
When:  GET /api/tokens/resolve is called
Then:  response data contains the token value with 'url-blocked(http://evil.com/img)'
And:   response status is 200 (no error thrown)
And:   portal CSS never receives an active url() expression
References: B-003, Skeptic Challenge 4, Business Rule 5
```

### Scenario 7: icon-mirror Boolean-to-Numeric Conversion (Business Rule 6)
```
Scenario: Arabic locale page receives numeric icon-mirror value
Given: seed value icon-mirror level=global locale=ar value='true' is live
When:  Next.js layout.tsx calls resolveTokensForSSR({ renderTarget: 'portal', locale: 'ar' })
And:   buildCSSCustomProperties() is applied to the resolved map
Then:  generated CSS string contains '--icon-mirror: 1;'
And:   generated CSS string does NOT contain '--icon-mirror: true;'
References: ADR-003-005, Business Rule 6
```

### Scenario 8: Service-Owner Scope Enforcement (Business Rule 7)
```
Scenario: Service-owner cannot write a Level 5 value for a different service
Given: service-owner JWT with role 'service-owner:elearning'
When:  POST /api/service/tokens/values { definitionSlug: 'color-primary', value: '#red' }
And:   system derives caller serviceSlug = 'elearning' from JWT
And:   system attempts to enforce serviceSlug = 'elearning' on the created record
Then:  if the request body tried to override serviceSlug to 'finance', still creates as 'elearning'
OR:    if service-owner tries DELETE on a value with serviceSlug='finance', returns 403
Note: The body serviceSlug is NEVER trusted; it always comes from JWT
References: Business Rule 7, Section 13, AC-010
```

### Scenario 9: Definition Deactivation Cascades to Child Values (Business Rule 8 / AC-017)
```
Scenario: Deactivating a definition soft-deletes all its active values
Given: definition 'color-primary' has 3 active child token values
And:   portal-admin calls DELETE /api/admin/tokens/definitions/color-primary
When:  TokenDefinitionService.deactivateDefinition('color-primary') executes
Then:  valueRepo.deactivateAllForDefinition(definitionId) is called before defRepo.deactivate
And:   draft cache is flushed
And:   the definition no longer appears in GET /api/admin/tokens/definitions?activeOnly=true
And:   the child values no longer appear in GET /api/admin/tokens/values?slug=color-primary
References: AC-017, Business Rule 8
```

### Scenario 10: ISR Revalidation After Publish (B-001)
```
Scenario: Portal SSR cache is refreshed within seconds of publish
Given: portal currently serving '--color-primary: #1a4d8f;' (stale ISR cache)
And:   admin updates value to '#ff0000' and calls POST /api/admin/tokens/publish
When:  publish route fires POST /api/revalidate { path: '/' } fire-and-forget
And:   10 seconds pass
Then:  Next.js page re-render contains '--color-primary: #ff0000;'
And:   portal does not serve old value for more than 10 seconds after publish
References: B-001, Skeptic Challenge 5, AC-008
```

---

## 10. Open Question Flags

These three assumptions from the Architecture phase remain unconfirmed by QDB stakeholders. Each assumption creates a test scope gap that must be resolved before staging:

### OQ-001 — Locale dimension limited to 'ar' and 'en' only

**Assumption:** The Zod query schema restricts locale to `z.enum(['ar', 'en'])`. No other locale values are accepted.

**Test impact if assumption is wrong:** If QDB adds a third locale (e.g. 'ur'), the Zod enum must be expanded, and all locale-specific test cases (TC-U-014, TC-I-004) must be updated to cover the new locale. The resolution algorithm's `localeSpecificityOf` function has no locale enumeration; it compares string equality. No algorithm change is required, only schema changes.

**QA action pending:** Confirm with QDB IT Director that 'ar' and 'en' are the only locales for Phase 1. If confirmed, the current test suite is complete for locale coverage. If not confirmed, add parameterized test variants for each additional locale.

**Confidence that OQ-001 will affect tests: 20%** — Arabic/English is the stated government portal requirement. Unlikely to change for Phase 1.

### OQ-002 — Service slug uniqueness enforced by Dataverse (no API-level check)

**Assumption:** Service slug uniqueness is a Dataverse-level constraint (no two service-owner roles share the same slug). The API does not perform an explicit uniqueness check on `qdb_ServiceSlug` when creating Level 5 values.

**Test impact if assumption is wrong:** If two service-owners can share a slug, the scope enforcement logic (Business Rule 7) fails — both owners would see each other's values. A uniqueness check would need integration tests: TC-I-039 would need an additional assertion that confirms the slug is unique in RBAC before write.

**QA action pending:** Confirm with QDB IT or P1-002 RBAC team that `qdb_role_slug` uniqueness is enforced in Dataverse. If not enforced, raise a new test and a service-layer guard.

**Confidence that OQ-002 will affect tests: 35%** — RBAC slug uniqueness was noted as an open item in P1-002 OI-001.

### OQ-003 — 200-definition soft limit not load-tested at production scale

**Assumption:** The 200-definition limit is sufficient for Phase 1 and does not cause performance degradation at the API level.

**Test impact:** TC-PERF-001 (concurrent publish) and the warm cache latency test (TC-PERF — warm) use a small seed dataset (5–10 definitions). These tests do NOT validate behaviour at 200 definitions. A separate load test at 200 definitions is required before go-live.

**QA action pending:** Run k6/token-resolve-warm.js against a dataset of 200 definitions and ~1000 values. Confirm p95 < 50ms (AC-009) is still met. If not met at 200 definitions, the soft limit must be lowered and ADR-003-006 updated.

**Confidence that OQ-003 will require a test: 90%** — The architecture documents that 200 definitions × 5 values = ~50KB from Dataverse and ~10KB resolved map. The 50ms p95 warm cache target should be unaffected (cache hit), but the cold-cache 500ms SLA may be at risk. This must be measured before production deployment.

---

## 11. W-002 Monitoring Gap — console.error in resolveTokens.ts

**Finding:** `resolveTokensForSSR()` in `apps/web/src/lib/tokens/resolveTokens.ts` uses `console.error` on API failure (as noted in Phase 4 security compliance table). This is the only `console.*` call in the codebase.

**Is this acceptable?** For a Next.js RSC (React Server Component), `pino` is not available at the RSC level — the Fastify-side pino logger is a server-side Node.js module tied to the API process, not the Next.js process. `console.error` in a Next.js RSC outputs to the Next.js server stdout, which is captured by the container logging infrastructure (Docker/Kubernetes). In production, container stdout is ingested by the log aggregator.

**Monitoring gap:** The `console.error` output does not carry a `correlation_id`, `userId`, or `service_name` field. An API failure during SSR will appear in logs without context, making diagnosis harder.

**Recommended action:** Accept `console.error` for Phase 1 (no pino alternative in RSC). Raise a tech debt ticket to add a lightweight structured logger for the Next.js server layer in Phase 2. The QA test plan notes this as a monitoring gap, not a defect.

**Confidence: 95%** — This is a confirmed observability gap, not a functional defect. Does not block staging.

---

## 12. Test Count Summary

| Category | Existing [EXISTS] | New [NEW] | Total |
|---|---|---|---|
| Unit — TokenResolutionService | 17 | 0 | 17 |
| Unit — TokenDefinitionService | 10 | 3 | 13 |
| Unit — TokenValueService | 17 | 0 | 17 |
| Unit — injectTokenStyles | 16 | 0 | 16 |
| Unit — buildContextKey | 0 | 5 | 5 |
| Unit — NodeCacheTokenCache | 0 | 11 | 11 |
| Unit — TokenQueryService | 0 | 4 | 4 |
| Unit — cssUtils | 0 | 7 | 7 |
| Integration — resolve route | 0 | 8 | 8 |
| Integration — definitions routes | 0 | 9 | 9 |
| Integration — values routes | 0 | 9 | 9 |
| Integration — publish route | 0 | 5 | 5 |
| Integration — preview route | 0 | 3 | 3 |
| Integration — service routes | 0 | 6 | 6 |
| Integration — revalidate route | 0 | 4 | 4 |
| E2E — Playwright | 0 | 5 | 5 |
| Performance — k6 | 0 | 1 (scenario) | 1 |
| Security | 0 | 12 | 12 |
| **Total** | **60** | **92** | **152** |

Target was ≥ 80 tests. **152 total tests across all layers exceeds the target by 90%.** The 60 existing green tests count toward the total.

---

## 13. Automation Plan

| Test suite | Automated | Notes |
|---|---|---|
| Unit tests (all 73) | Yes | Vitest; runs in < 10s; gates every commit |
| Integration tests (all 54) | Yes | Supertest + Vitest; runs in < 60s; gates every PR |
| E2E tests (5) | Yes (CI selective) | Playwright; runs on PR to main only; ~3 min |
| Performance tests (4 scenarios) | Partially | k6; nightly schedule; not a merge gate (alert on regression) |
| Security tests (12) | Yes | Supertest + Vitest; indistinguishable from integration tests in code |

Manual tests (not automated):
- OQ-003 load test at 200 definitions — requires a Dataverse-connected staging environment; cannot be run in CI. Performed once before production deployment.
- ISR cache refresh timing (TC-E2E-004) — timing-sensitive; may produce flaky results in CI under load. Mark with `test.slow()` in Playwright and set a 30s timeout.

---

## 14. Definition of Done

Before any feature in DXP-P1-003 is considered complete for staging:

- [ ] All 60 existing unit tests pass (GREEN baseline unchanged)
- [ ] All new unit tests (TC-U-001 through TC-U-031) written RED then GREEN
- [ ] All new integration tests (TC-I-001 through TC-I-046) pass against the Fastify test server
- [ ] All E2E tests (TC-E2E-001 through TC-E2E-005) pass in Playwright Chromium
- [ ] Vitest coverage report: ≥ 80% statement, ≥ 75% branch across all in-scope files
- [ ] W-002 defect (TC-U-031) has a tracked fix ticket raised for the `definitionSlug: ''` gap
- [ ] OQ-001, OQ-002, OQ-003 have written stakeholder confirmations or documented risk acceptance
- [ ] TC-PERF-001 (concurrent publish rejection) passes in k6
- [ ] All 12 security tests (TC-SEC-001 through TC-SEC-012) pass
- [ ] B-004 (RedisTokenCache) is implemented before any production deployment — Phase 4b completion required
- [ ] G-001 (provisioning script) is implemented and post-provisioning validator passes before staging
- [ ] `console.error` monitoring gap is tracked as a Phase 2 tech debt ticket
- [ ] CI pipeline runs unit + integration + security tests on every PR with no skipped tests

---

```
===================================================
END OF DOCUMENT
DXP-P1-003 Theme Tokens — Phase 5 QA Test Strategy
Maqsad AI — QA Agent
2026-06-21
===================================================
```
