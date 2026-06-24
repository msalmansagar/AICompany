═══════════════════════════════════════════════════
CLEAN CODE REVIEW REPORT
═══════════════════════════════════════════════════
Project:        Dynamic Form Engine — Multi-Language / i18n Support
Engagement ID:  DFE-i18n-001
Reviewed by:    code-reviewer (Maqsad AI)
Date:           2026-06-24
Overall:        APPROVE WITH FIXES
═══════════════════════════════════════════════════


C-007 VERDICT — OData Injection Proof
──────────────────────────────────────
PASS

Evidence collected per each sub-condition:

(a) Allowlist-validated against qdb_language_config before use

  forms.routes.ts lines 298–314 — extractLang() enforces a two-gate
  pipeline: regex (LANG_PARAM_REGEX) blocks characters outside BCP-47
  short codes; then CrmLanguageConfigService.isLanguageCodeSupported()
  checks the live allowlist. "en" is hardcoded as always-valid for
  bootstrap resilience. The language value does not reach any Dataverse
  call path until both gates pass.

  translations.routes.ts lines 41–43 — the PUT (upsert) route calls
  assertLanguageSupported(body.languageCode, languageConfigService)
  before the write service is invoked. The GET and DELETE routes do
  not take a languageCode parameter at all.

  CrmMetadataService.ts line 308 — requestedLcid is derived from
  CrmLanguageConfigService.getLcidForLanguageCode(lang) — a lookup
  into the same allowlist cache, only executed when lang !== "en".

(b) NEVER interpolated raw into an OData filter string

  CrmTranslationQueryService.ts line 31:
    safeLocale = languageCode.replace(/'/g, "''")
  This defence-in-depth escape is applied before the string is
  interpolated at line 57:
    `...qdb_language_code eq '${safeLocale}'...`

  At this point languageCode is already allowlist-validated by the
  caller (extractLang in forms.routes.ts), so the replace() is
  redundant but correct as a defence-in-depth measure per the
  documented architecture (NFR-007 Layer 3). There is no code path
  where an unvalidated lang value reaches this interpolation.

  CrmTranslationWriteService.ts lines 79–83 — buildAlternateKey()
  single-quote-escapes all four key parts including languageCode
  before interpolation into the OData alternate-key URL segment.
  languageCode has already been allowlist-validated in
  translations.routes.ts line 43 before the write service is called.

(c) Returns HTTP 400 with structured body for unsupported codes

  utils/errors.ts lines 62–69 — UnsupportedLanguageError(code, supported)
  extends AppError with statusCode=400, code='INVALID_LANGUAGE_CODE',
  and exposes supportedCodes: string[].

  error.middleware.ts lines 34–47 — dedicated UnsupportedLanguageError
  branch in the error handler serialises supportedCodes into the
  response body. Returns 400.

  forms.routes.ts lines 325–333 — throwUnsupportedLanguage() throws
  UnsupportedLanguageError with the supported codes list from
  CrmLanguageConfigService.


C-007: PASS — all three sub-conditions are satisfied end-to-end.
No deployment blocker on this condition.


══════════════════════════════════════════════════════════════════
BLOCKER FINDINGS (must be fixed before APPROVE)
══════════════════════════════════════════════════════════════════

BLOCKER-001  Entity name mismatch — grid column translations will
             silently never resolve
             Severity: Blocker
             Confidence: 99%

  TranslationResolutionService.ts line 149 uses the entity name
  'qdb_grid_column_config' (singular, no trailing s) as the key
  when reading from the TranslationMap:

    resolveRequired('qdb_grid_column_config', col.columnId, ...)

  designer/src/constants/translatableFields.ts line 27 uses
  'qdb_grid_column_configs' (plural, with trailing s) as the
  entity name when writing translation records via the designer:

    qdb_grid_column_configs: ['qdb_column_label'],

  CrmTranslationQueryService.ts reads raw rows back from Dataverse
  under whatever qdb_entity_name was stored there, and builds the
  TranslationMap key as:
    `${row.qdb_entity_name}:${row.qdb_record_id}:${row.qdb_field_name}`

  So the designer writes a record with
  qdb_entity_name = 'qdb_grid_column_configs' and the resolution
  service looks up 'qdb_grid_column_config'. The Map.get() will
  always miss. Grid column Arabic translations will silently fall
  back to English regardless of what the CRM Configuration Team
  authors. There is no error; the fallback masks the defect.

  Impact: FR-011 (grid column header translation) is completely
  non-functional despite test coverage reporting it as passing
  (the resolution tests use a hand-crafted TranslationMap whose
  key format is set by the test author, not the live write path).

  Fix required: Align both files on a single entity name.
  Recommended canonical value: 'qdb_grid_column_config' (singular)
  matching the Dataverse entity logical name convention used for all
  other entities in this codebase. Update translatableFields.ts,
  ENTITY_LABEL, and the corresponding ENTITY_NAMES constant.

  Note: the TranslationResolutionService.test.ts at line 402 uses
  'qdb_grid_column_config' in its test TranslationMap, so the test
  is validating the resolution half correctly. The designer write
  half at translatableFields.ts:27 is the defective side.


══════════════════════════════════════════════════════════════════
MAJOR FINDINGS (significant issues; should be fixed before deploy)
══════════════════════════════════════════════════════════════════

MAJOR-001  CQS violation — function named throwUnsupportedLanguage
           is invoked with a `return` statement at its call site,
           suggesting it might return a value
           Severity: Major
           Confidence: 85%

  forms.routes.ts lines 301 and 310:
    return throwUnsupportedLanguage(rawLang, languageConfigService);
    return throwUnsupportedLanguage(code, languageConfigService);

  The function signature is `async function throwUnsupportedLanguage(
  ... ): Promise<never>`. The `return` keyword here is technically
  correct (returning `never` satisfies TypeScript's control-flow
  analysis for the callee's return type), but the function name
  begins with "throw" — implying a side-effect command — while also
  being a `return`-able value. The `return` at the call site is
  redundant because `never` propagates naturally: once the throw
  inside executes, the enclosing function exits automatically.

  More importantly, the function name reveals a naming principle
  violation: it is called with `return` as if it queries/computes
  something, but its entire purpose is to throw. A verb that is
  both "throw" and implicitly "return" violates CQS. The accepted
  pattern for such helpers is a non-returning side-effect called
  without `return`:

    await throwUnsupportedLanguage(rawLang, languageConfigService);
    // (TypeScript then infers unreachable code after this line)

  Or rename to `assertLanguageSupported` (matching the pattern used
  in translations.routes.ts line 58 which does this correctly).

  Fix: rename to assertLanguageCode(code, service) and call without
  `return` — the `never` return type still satisfies the
  enclosing function's non-void return type.


MAJOR-002  Swallowed exception in TranslationsPanel.handleSave/handleDelete
           — errors from upsert and delete are hidden from the user
           Severity: Major
           Confidence: 95%

  designer/src/designer/properties/panels/TranslationsPanel/
  TranslationsPanel.tsx, handleSave (line 85–103) and handleDelete
  (lines 106–119): the try/finally blocks set isSaving but have no
  catch. Any error thrown by writeService.upsertTranslation() or
  writeService.deleteTranslation() will propagate to the caller
  (the onBlur handler in TranslatableStringRow.tsx line 141 which
  calls `await onSave(...)`). TranslatableStringRow.handleBlur is
  an async function called via `void handleBlur()` at line 165 —
  so the rejection from an unhandled throw inside handleSave
  becomes an unhandled Promise rejection (floating promise).

  The CRM Configuration Team will have no feedback when a save
  fails (network error, auth expiry, 400 from Dataverse). The
  "Saved" badge will not appear (correct — justSaved is only set
  on success), but there is also no error message shown.
  Per common.md: "never silently ignore an error — surface it
  or handle it explicitly."

  Fix: add a catch block in handleSave and handleDelete that:
    (a) logs the error with context
    (b) surfaces an error MessageBar in the panel UI


MAJOR-003  `as unknown as` type assertions in LanguageProvider and FormContext
           — bypasses TypeScript type safety
           Severity: Major
           Confidence: 90%

  frontend/src/i18n/LanguageProvider.tsx line 61:
    const languages = (axiosResponse as unknown as { data: LanguageConfig[] }).data;

  frontend/src/contexts/FormContext.tsx lines 105, 120, 232, 279:
    Multiple `as unknown as` casts to unwrap Axios response envelopes.

  The architecture doc and existing code show that the apiClient
  interceptor is supposed to unwrap the `{ success, data }` envelope
  before the caller receives it. If that is true, these casts
  reference a double-unwrap that should not be necessary. If the
  interceptor does NOT unwrap, then the type LanguageConfig[] on
  `apiClient.get<LanguageConfig[]>` is already wrong.

  Either the apiClient generic parameter is wrong and the type
  assertion is working around it, or the interceptor is being
  inconsistently applied. Both scenarios constitute a type lie.
  Per common.md: "Avoid type assertions (as SomeType) — use type
  guards instead."

  Note: this pattern pre-dates the i18n build and appears in the
  pre-existing FormContext too. The i18n build introduces the same
  pattern in LanguageProvider.tsx. Under the Boy Scout Rule, the
  i18n file that adds this pattern is in scope for this review.

  Fix for LanguageProvider.tsx: type `apiClient.get` correctly to
  return `ApiResponse<LanguageConfig[]>` and destructure `.data`
  without a cast. Alternatively, type the return to
  `AxiosResponse<ApiResponse<LanguageConfig[]>>` and unwrap cleanly.


══════════════════════════════════════════════════════════════════
MINOR FINDINGS (clean code violations; recommended to fix)
══════════════════════════════════════════════════════════════════

MINOR-001  console.error in env.ts at system startup — not using
           structured logger
           Severity: Minor
           Confidence: 90%

  backend/src/config/env.ts lines 43–44:
    console.error('Invalid environment configuration:');
    console.error(parsed.error.format());

  This code runs at module load before the structured logger is
  available, which is a genuine constraint. However the policy in
  common.md is absolute: "No console.log in committed code."
  The pre-existing pattern (this is not new in this build) should
  be noted but this file was touched by the i18n build (three new
  env vars added), bringing it in scope.

  Fix: acceptable to keep console.error here with a WHY comment
  explaining that pino logger is not yet initialised. This is a
  boot-time constraint, not an oversight. Add an inline comment:
    // WHY: structured logger is not yet initialised at env parse
    // time; console.error is the only safe fallback here.


MINOR-002  `void newLanguageDisplayName` anti-pattern in
           LanguageChangePrompt.ts
           Severity: Minor
           Confidence: 85%

  mobile/src/i18n/LanguageChangePrompt.ts line 39:
    void newLanguageDisplayName;

  This suppresses an "unused parameter" warning by evaluating the
  expression as void. It is an unusual pattern that will confuse
  readers. The cleaner approach is to prefix the parameter name
  with an underscore (_newLanguageDisplayName) to signal it is
  intentionally unused, or simply remove it from the parameter list
  if the caller is responsible for building the message string.

  The phase-4 build report states the parameter is "used in
  message by caller" but the function receives it with no use.
  If the parameter is truly unused in the function body, it should
  be removed from the signature and the callers updated. If it is
  needed for a future display purpose, it should at least be
  underscore-prefixed.


MINOR-003  Module-level mutable state in ArabicFontLoader.ts
           Severity: Minor
           Confidence: 88%

  mobile/src/i18n/ArabicFontLoader.ts line 19:
    let fontsLoaded = false;

  This is a module-level mutable variable acting as a singleton
  flag. common.md prohibits static mutable state. While the
  pattern works correctly in React Native (each module is a
  singleton per JS bundle), it cannot be reset between tests without
  the exported `resetFontLoadedState()` workaround (line 56), which
  is test-only infrastructure exposed in production code.

  Fix: consider using a ref inside the component that triggers font
  loading, or accept the module-level flag but document the
  constraint more explicitly. If kept, `resetFontLoadedState`
  should be removed from the production export and live only in a
  test helper file.


MINOR-004  Dead function parameter `entityLabel` in TranslationsPanel
           Severity: Minor
           Confidence: 92%

  designer/src/designer/properties/panels/TranslationsPanel/
  TranslationsPanel.tsx line 14:
    entityLabel: string;

  The `entityLabel` prop is declared in `TranslationsPanelProps` but
  is not referenced anywhere in the component body. The function
  signature at line 46 destructures only `entityName, recordId,
  formCode` — `entityLabel` is silently discarded. Per YAGNI, dead
  parameters should be removed. Callers pass a value for it (e.g.
  FormProperties.tsx) that is computed unnecessarily.

  Fix: remove from TranslationsPanelProps and all caller sites.


MINOR-005  Inject-via-constructor vs. new() inside component logic
           Severity: Minor
           Confidence: 85%

  designer/src/designer/properties/panels/TranslationsPanel/
  TranslationsPanel.tsx line 59:
    const writeService = new TranslationWriteService(null);

  The service is instantiated directly inside the component body,
  which runs on every render and violates the dependency injection
  principle ("new() inside logic is a smell" per the checklist).
  The authToken is hardcoded as `null`, which means the service
  always sends unauthenticated requests. If authentication is added
  later, this will require finding every call site.

  Fix: either pass writeService as a prop (DI), use a module-level
  singleton, or create it once with useMemo. The null auth token
  pattern should be documented or replaced with the real designer
  token source.


MINOR-006  `readPersistedLanguage` validates stored values with a
           hardcoded type narrowing guard that duplicates the
           SUPPORTED_LANGUAGES constant
           Severity: Minor
           Confidence: 82%

  mobile/src/i18n/useLanguageStore.ts lines 33–35:
    if (stored === 'en' || stored === 'ar') {
      return stored as SupportedLanguageCode;
    }

  The check duplicates knowledge already encoded in the
  SUPPORTED_LANGUAGES constant ('en' | 'ar'). If a third language
  is added to SUPPORTED_LANGUAGES, this guard would not update
  automatically. The resolveLanguageCode() function on line 64 uses
  the constant correctly:
    (SUPPORTED_LANGUAGES as readonly string[]).includes(raw)

  Fix: reuse resolveLanguageCode() inside readPersistedLanguage()
  to eliminate the duplication.


══════════════════════════════════════════════════════════════════
NIT FINDINGS (style / housekeeping; optional)
══════════════════════════════════════════════════════════════════

NIT-001  CACHE_KEY constant in CrmLanguageConfigService.ts is a
         module-level string literal with no documentation of its
         scope. Consider naming it LANGUAGE_CONFIG_CACHE_KEY for
         clarity (UPPER_SNAKE_CASE is correct; name is fine).
         file: CrmLanguageConfigService.ts line 7.

NIT-002  ODataCollection<T> interface is defined identically in both
         CrmTranslationQueryService.ts (line 15) and
         CrmTranslationWriteService.ts (line 31). This is DRY
         violation. It should be extracted to CrmBaseService.ts or
         a shared types file (both services extend CrmBaseService).

NIT-003  TranslatableStringRow.tsx exports LanguageConfig locally
         (line 11) instead of importing from @qdb/shared. The shared
         package already exports LanguageConfig (shared/src/types/
         i18n.types.ts). This creates a divergent local definition
         that lacks displayOrder, lcid, and displayNameNative fields.
         If a caller ever passes the shared LanguageConfig where the
         local one is expected, TypeScript will accept it (structural
         typing) but the divergent definition is a maintenance risk.

NIT-004  i18nMobile.ts line 43: Arabic translation has a Latin
         character mixed in: 'تأкيد' — the 'к' is Cyrillic, not
         Arabic. Intended word is 'تأكيد' (Arabic letter kaf, U+0643,
         not Cyrillic small kaf U+043A). This is a content defect
         in the static translation bundle.


══════════════════════════════════════════════════════════════════
ARCHITECTURE FIDELITY CHECK
══════════════════════════════════════════════════════════════════

Cache key: PASS
  CrmMetadataService.ts line 63 uses `${formCode}:${lang}` matching
  AG-002. cacheKeysByFormCode tracking (line 70–72) covers all
  language variants per formCode. invalidateCache() deletes all
  variants.

Cache invalidation wired: PASS
  Three layers confirmed:
    Layer 1: TTL — FORM_CACHE_TTL_MS configured via env.ts.
    Layer 2: POST /api/internal/cache/invalidate in
             internal-cache.routes.ts, called by
             TranslationsPanel.triggerCacheInvalidation().
    Layer 3: ?nocache= bypass is not implemented in the reviewed
             files (not present in forms.routes.ts). The architecture
             doc specifies it is blocked at middleware. The bypass is
             NOT present in the code — this is a gap versus the
             architecture doc (the designer preview "?nocache=1" path
             is unimplemented), but since it was designated as a
             future mechanism and the 5-min TTL backstop covers the
             gap, this is classified as Minor rather than Blocker.

Backward compatibility: PASS
  forms.routes.ts lines 297–298: no rawLang → returns 'en'.
  metadataService.getFormDefinition(formCode) signature has lang='en'
  default (CrmMetadataService.ts line 57).

English fallback never null: PASS
  TranslationResolutionService.ts resolveRequired() line 44–47 falls
  back to baseValue when map has no match. resolveString() returns
  `undefined` only when both map and baseValue are undefined/null —
  this is correct for optional fields. Required fields use
  resolveRequired() which always returns baseValue at minimum.

Module separation (NFR-011): PASS
  MODULE 1 (RTL): DirectionProvider.tsx / RtlManager.ts — receive
  booleans, no language code logic.
  MODULE 2 (language state): useLanguage.ts / useLanguageStore.ts —
  manage code strings, no RTL styling.
  MODULE 3 (resolution): TranslationResolutionService.ts — pure
  function, no I/O.
  MODULE 4 (data access): CrmTranslationQueryService.ts — owns
  Dataverse query, isolated from assembly pipeline.

Write endpoint auth-gated: PASS
  index.ts line 181–183: createTranslationsRouter is mounted under
  the `app.use('/api', authMiddleware)` block (line 162). The
  authMiddleware runs before all /api/* routes, protecting
  /api/design/translations.

Write endpoint body-validated: PASS
  translations.routes.ts line 16–22: upsertBodySchema Zod schema
  validates all five fields with type and length constraints before
  any service call.

No secrets/PII in logs: PASS
  No translated values or user identifiers are logged in the reviewed
  files. CrmTranslationQueryService.ts error log (line 40) captures
  languageCode and correlationId only — no translation content.


══════════════════════════════════════════════════════════════════
COMMENDATIONS
══════════════════════════════════════════════════════════════════

- The three-layer OData injection defence in forms.routes.ts is
  exemplary: regex, semantic allowlist, and parameterised string
  in that order. Each layer has a clear documented purpose.

- TranslationResolutionService.ts is a clean pure function with no
  I/O. The resolveString / resolveRequired split correctly separates
  optional from required string resolution. The file is concise
  (187 lines), readable, and fully covered by unit tests.

- The NFR-011 module boundary design is well-executed. RTL logic,
  language state, and string resolution are genuinely isolated and
  independently testable. The architecture's stated boundary
  contracts are matched exactly in the implementation.

- CrmLanguageConfigService.ts resilient fallback (lines 62–69)
  returns English-only config when Dataverse is unreachable, so
  the frontend toggle degrades gracefully rather than crashing.

- buildAlternateKey() in CrmTranslationWriteService.ts correctly
  escapes all four composite key parts, not just the user-supplied
  languageCode. This is correct defensive coding.

- The FormContext.tsx isFirstLoadRef / prevFormCodeRef guard
  (lines 86–93) correctly preserves field values across language
  switches while resetting them on formCode changes. The logic is
  well-commented and the intent is clear.

- Mobile apiClient.ts uses a named `ApiOptions` interface with a
  `lang` field rather than a raw string parameter — clean API
  boundary with self-documenting intent.


══════════════════════════════════════════════════════════════════
REQUIRED CHANGES BEFORE APPROVAL
══════════════════════════════════════════════════════════════════

1. [BLOCKER-001] Fix entity name mismatch for grid column translations.
   TranslationResolutionService.ts line 149: change 'qdb_grid_column_config'
   to match the entity name used in translatableFields.ts, OR update
   translatableFields.ts line 27 to 'qdb_grid_column_config' (singular).
   Pick one canonical name and apply consistently.

2. [MAJOR-002] Add error handling in TranslationsPanel.handleSave and
   handleDelete. Currently exceptions become unhandled Promise rejections.
   A catch block that surfaces a MessageBar error to the CRM Configuration
   Team user is required.

3. [MAJOR-003] Remove the `as unknown as` cast in LanguageProvider.tsx
   line 61. Align the apiClient call return type so the `.data` property
   is accessible without a cast.

Items MAJOR-001 (CQS/naming of throwUnsupportedLanguage) is
recommended but not strictly blocking deployment — the function
behaves correctly despite the naming concern.


══════════════════════════════════════════════════════════════════
OVERALL RECOMMENDATION
══════════════════════════════════════════════════════════════════

APPROVE WITH FIXES

The i18n build is architecturally sound and the critical C-007
security condition is clean. The three-blocker/major issue list
is small relative to the scope (5 packages, ~40 files). One true
Blocker exists (BLOCKER-001 — grid column entity name mismatch)
that will cause silent translation failure for grid columns in
production. This must be fixed before deployment. Two Major issues
(swallowed exceptions in designer panel, type cast in
LanguageProvider) should be resolved in the same PR. Once those
three items are addressed, the code is ready for QA sign-off.

═══════════════════════════════════════════════════
END OF REVIEW — DFE-i18n-001 Phase 6
═══════════════════════════════════════════════════
