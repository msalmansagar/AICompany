# DFE Render Cache Runtime — Phase 4

Engagement: DFE-RC-001
Date: 2026-06-26

## Overview

The render cache read path serves pre-generated form JSON from the Dataverse
`qdb_form_render_cache` entity instead of running the live multi-table assembly
on every request.  The feature is disabled by default (`USE_RENDER_CACHE=false`)
and the live path is preserved as a transparent fallback.

---

## Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `USE_RENDER_CACHE` | boolean string | `false` | Master feature flag. Set `true` to enable the hot path. |
| `RENDER_CACHE_TTL_SECONDS` | number | `300` | In-process cache TTL for decoded form JSON (5 min default). |
| `REDIS_URL` | string | unset | When set, `RedisRenderCacheStore` is used. Absent = `MemoryRenderCacheStore`. |

---

## Service: `PublishedFormService`

File: `backend/src/services/PublishedFormService.ts`

Extends `CrmBaseService`.

### Constructor

```typescript
new PublishedFormService(
  authService: CrmAuthService,
  cacheStore: IRenderCacheStore,
  languageConfigService: CrmLanguageConfigService | null,
)
```

### Method: `getPublishedJson(formCode, lang, version?)`

1. Validates `formCode` against `/^[a-zA-Z0-9_-]{1,100}$/` — throws `ValidationError` on failure.
2. Validates `lang` against BCP-47 pattern `/^[a-z]{2}(-[A-Z]{2})?$/` — throws `ValidationError` on failure.  The raw `lang` value is never interpolated into OData.
3. Checks the in-process `IRenderCacheStore` by key `${formCode}:${version ?? 'latest'}:${lang}`.  Cache hit returns immediately without a Dataverse call.
4. On miss: queries `qdb_form_render_caches` via OData with filter `qdb_form_code eq '{formCode}' and qdb_is_active eq true and qdb_status eq 2`.
5. Selects the record whose `qdb_language_code` matches `lang`.  If absent, falls back to the default language from `CrmLanguageConfigService` (field `isDefault === true`), then to `'en'`.
6. Decodes the payload: `base64 → Buffer → gunzipSync (if qdb_is_compressed) → JSON.parse → FormDefinition`.
7. Stores the decoded JSON in the cache store at the computed key.
8. Throws `CacheMissError` when: no active records exist, or `qdb_runtime_json` is empty.

### Error: `CacheMissError`

```typescript
class CacheMissError extends AppError  // HTTP 503, code: RENDER_CACHE_MISS
```

Thrown when no active published cache record is found or when the stored JSON
is empty/malformed.  The forms route catches this error and falls back to the
live `CrmMetadataService.getFormDefinition` path.

---

## Cache Store: `IRenderCacheStore`

File: `backend/src/services/RenderCacheStore.ts`

```typescript
interface IRenderCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  invalidate(formCode: string): Promise<void>;
}
```

Key format: `${formCode}:${version}:${lang}` where `version` is either the
integer published version or the literal string `latest`.

### `MemoryRenderCacheStore`

Default implementation. Uses `LRUCache<string, string>` (lru-cache v10).
`invalidate(formCode)` scans all keys for prefix `${formCode}:` and deletes
matching entries.  Max 500 entries.

### `RedisRenderCacheStore`

Cloud/multi-instance implementation.  Uses `ioredis` as an **optional** peer
dependency — the backend starts without it installed.  If `REDIS_URL` is set
but `ioredis` is not installed, startup fails with an explicit error message.

`invalidate(formCode)` uses Redis `SCAN` + `DEL` with pattern `${formCode}:*`.

### Factory

```typescript
createRenderCacheStore(ttlSeconds: number, redisUrl?: string): Promise<IRenderCacheStore>
```

Returns a connected `RedisRenderCacheStore` when `redisUrl` is provided, or a
`MemoryRenderCacheStore` otherwise.

---

## Feature Flag Wiring — `GET /api/forms/:formCode/metadata`

When `USE_RENDER_CACHE=true` the metadata route attempts:

```
PublishedFormService.getPublishedJson(formCode, lang)
  → success: return cached FormDefinition + design
  → CacheMissError: warn log + fall back to CrmMetadataService.getFormDefinition
  → any other error: propagate (returns 5xx)
```

When `USE_RENDER_CACHE=false` (default) the live path runs unchanged.
All existing behaviour — auth, `?lang=`, C-007 validation, design fallback,
access policy — is preserved in both paths.

---

## Cache Invalidation — `POST /api/internal/cache/invalidate`

The existing internal cache route now accepts an additional optional `renderCacheStore`
dependency and handles render-cache invalidation:

```jsonc
// Request body examples
{ "formCode": "loan-application" }                // invalidates metadata + render cache
{ "target": "renderCache", "formCode": "loan-application" }  // explicit render-cache only
{ "target": "languages" }                          // language config only
```

A publish webhook should POST to this endpoint after writing a new
`qdb_form_render_cache` record for a form.

---

## Startup Sequence

`index.ts` calls `initRenderCacheServices()` before `app.listen`.  If
`USE_RENDER_CACHE=true` and Redis fails to connect, the process exits with
code 1 to prevent a degraded startup.  When `USE_RENDER_CACHE=false` (default),
`renderCacheStore` and `publishedFormService` are `null` and no Redis connection
is attempted.

---

## Test Coverage

| File | Tests | Notes |
|---|---|---|
| `RenderCacheStore.test.ts` | 6 | MemoryRenderCacheStore get/set/invalidate/expiry |
| `PublishedFormService.test.ts` | 11 | Cache hit/miss, language fallback, gzip round-trip, validation |

Total after Phase 4: **175 tests** (158 pre-existing + 17 new).
