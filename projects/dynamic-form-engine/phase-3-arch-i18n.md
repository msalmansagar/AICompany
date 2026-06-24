═══════════════════════════════════════════════════
ARCHITECTURE DOCUMENT
═══════════════════════════════════════════════════
Project:        Dynamic Form Engine — Multi-Language / i18n Support
Engagement ID:  DFE-i18n-001
Prepared by:    Maqsad AI — Solution Architect
Date:           2026-06-24
Version:        1.0
Parent arch:    DFE Phase 3 (2026-05-08) — APPROVED
═══════════════════════════════════════════════════


SYSTEM OVERVIEW
─────────────────────────────────────────────────────────────────────
The i18n layer adds language-aware string resolution on top of the
existing DFE form-definition pipeline without altering any existing
entity relationships. A single universal translation table in Dataverse
stores overrides keyed by entity name, record GUID, field name, and
language code; the backend loads all translation rows for a form in
one batched query, applies English fallback in-process, and caches
the resolved FormDefinition per (formCode, languageCode). The frontend
and mobile surfaces receive a fully resolved, single-language payload
and require no knowledge of the translation storage layout. Adding a
third language requires one Dataverse configuration record and
translation data entry — no schema change, no code deployment.


COMPONENT MAP
─────────────────────────────────────────────────────────────────────

  ┌─────────────────────────────────────────────────────────────────┐
  │  Frontend (React/Vite/Fluent v9)                                │
  │  LanguageToggle → DirectionProvider (FluentProvider dir=rtl)   │
  │  i18nManager (i18next + react-i18next)                         │
  │  useLanguage hook — reads ?lang= URL param, localStorage        │
  └──────────────────────────┬──────────────────────────────────────┘
                             │ GET /api/forms/:code/metadata?lang=ar
  ┌──────────────────────────▼──────────────────────────────────────┐
  │  Backend (Node.js/Express/TypeScript)                           │
  │  forms.routes — validates lang param against allowlist          │
  │  CrmMetadataService — orchestrates form assembly                │
  │  TranslationResolutionService — applies per-entity overrides    │
  │  CrmLanguageConfigService — fetches + caches supported langs    │
  │  LRU Cache keyed by formCode:languageCode                       │
  └──────────────────────────┬──────────────────────────────────────┘
                             │ OData Web API v9.2
  ┌──────────────────────────▼──────────────────────────────────────┐
  │  Dataverse (org5869857f.crm4.dynamics.com)                      │
  │  Existing form entities (qdb_form_definition, _tab, _section…) │
  │  NEW: qdb_translation (universal translation table)             │
  │  NEW: qdb_language_config (supported languages registry)        │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │  Mobile (React Native/Expo)                                     │
  │  shared i18next instance from packages/shared                   │
  │  RtlManager — wraps I18nManager + Updates.reloadAsync()        │
  │  onboarding language select + restart prompt on change          │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │  Designer (React/Vite/Fluent v9)                                │
  │  TranslationsPanel — per-entity, config-driven language inputs  │
  │  TranslationWriteService — upserts qdb_translation records      │
  └─────────────────────────────────────────────────────────────────┘


TECHNOLOGY STACK
─────────────────────────────────────────────────────────────────────
| Layer                  | Technology                          | Reason / ADR        |
|------------------------|-------------------------------------|---------------------|
| Backend API            | Node.js + TypeScript + Express      | ADR-001 (existing)  |
| i18n runtime (web)     | i18next + react-i18next + i18next-http-backend + i18next-icu | dependencies-i18n.md ADOPT |
| RTL (web)              | Fluent UI v9 FluentProvider dir=    | dependencies-i18n.md ADOPT (built-in) |
| i18n runtime (mobile)  | i18next shared core                 | dependencies-i18n.md ADOPT |
| RTL (mobile)           | I18nManager + thin RtlManager       | dependencies-i18n.md BUILD |
| Arabic fonts (web)     | @fontsource-variable/cairo + @fontsource/noto-sans-arabic | dependencies-i18n.md ADOPT |
| Arabic fonts (mobile)  | expo-font loading Fontsource assets | dependencies-i18n.md ADOPT |
| Translation loader     | dataverseTranslationLoader (~15 lines) | dependencies-i18n.md BUILD |
| Translation storage    | qdb_translation (universal table)   | ADR-i18n-001 (this document) |
| Language config        | qdb_language_config entity          | AG-004 (this document) |


═══════════════════════════════════════════════════
ARCHITECTURE DECISION RECORDS
═══════════════════════════════════════════════════


ADR-i18n-001: Universal Translation Table over Sibling Columns or Per-Entity Child Tables
─────────────────────────────────────────────────────────────────────
Date:       2026-06-24
Status:     Accepted
Decided by: Architect (pending QDB IT Director approval per C-004 / DEPENDENCY-001)
AG gate:    AG-001


CONTEXT

The DFE stores all form content as DATA in Dataverse custom entities
(qdb_form_definition, qdb_form_tab, qdb_form_section, qdb_form_field,
qdb_form_option_value, qdb_grid_column_config, qdb_info_card_screen,
qdb_info_card_section, qdb_info_card_item, qdb_form_validation_rule,
qdb_form_button — 11 entity types in total). Every user-visible string
in any of these entities must become translatable. The chosen storage
approach determines whether adding a third language requires a schema
change, and whether a form's full translation set can be loaded in a
single Dataverse round-trip.

Three candidates were evaluated.


OPTION A — SIBLING COLUMNS ON EACH EXISTING ENTITY

Each qdb_ entity gets additional columns for each language:
e.g. qdb_label_ar, qdb_placeholder_ar, qdb_tooltip_ar on
qdb_form_field; qdb_label_ar on qdb_form_tab; and so on.

Pros:
- Simple OData queries — no join needed; strings come back with the
  parent entity fetch.
- Zero new entities.

Cons:
- Adding a third language (e.g. French) requires new columns on ALL 11
  entity types — that is a schema migration across the entire solution,
  requiring a PAC CLI deployment and solution version bump. This
  violates NFR-009 directly.
- Column count per entity grows multiplicatively with language count.
- The designer's Translations Panel would need to know the column name
  per language — impossible to make config-driven without schema change.
- Dataverse column limits (400 per entity) are not a concern at two
  languages, but become a design ceiling.

VERDICT: REJECTED — violates NFR-009 (N-language extensibility).


OPTION B — PER-ENTITY CHILD TRANSLATION TABLES

Each qdb_ entity type gets a dedicated child translation table:
e.g. qdb_form_field_translation (_field_id, languageCode, qdb_label,
qdb_placeholder, qdb_tooltip, qdb_prefix, qdb_suffix…),
qdb_form_tab_translation, qdb_form_section_translation, etc.

Pros:
- Strongly typed — each child table has only the columns relevant to
  its parent entity.
- OData $expand can retrieve translations inline with the parent
  (at the cost of query complexity).

Cons:
- 11 new translation entities required — one per translatable entity
  type.
- Adding a third language still requires no schema change (only new
  records), so NFR-009 is satisfied.
- However, each form load requires up to 11 additional Dataverse
  requests (one per entity type) unless all are fetched via $expand
  on their respective parent queries. $expand depth in Dataverse OData
  v4 is limited and does not compose well across levels
  (tabs → sections → fields → translations).
- The backend fetch graph becomes a tree of 5–6 recursive parallel
  calls (existing) plus 11 translation sub-queries, increasing
  coupling and fan-out. This threatens the 600 ms NFR.
- The designer's Translations Panel must know which child table to
  write to based on entity type — introduces entity-type dispatch
  logic that must be updated if a new entity type becomes translatable.

VERDICT: REJECTED — operational complexity and fan-out risk outweigh
the typing benefit. 11-table proliferation is harder to govern than a
well-indexed universal table.


OPTION C — UNIVERSAL TRANSLATION TABLE (CHOSEN)

A single qdb_translation table stores all translation overrides for
all entity types, keyed by a composite:
(qdb_entity_name, qdb_record_id, qdb_field_name, qdb_language_code).

Schema:

  qdb_translation
  ──────────────────────────────────────────────────────────────────
  qdb_translationid        GUID (PK, auto)
  qdb_entity_name          Text(100)   e.g. "qdb_form_field"
  qdb_record_id            Text(36)    GUID of the source record
  qdb_field_name           Text(100)   e.g. "qdb_label"
  qdb_language_code        Text(10)    e.g. "ar", "fr"
  qdb_translated_value     Memo(4000)  the translated string
  qdb_is_active            Boolean     default true
  created_by               (standard Dataverse audit field)
  created_on               (standard Dataverse audit field)
  modified_by              (standard Dataverse audit field)
  modified_on              (standard Dataverse audit field)

  Alternate key (unique constraint enforced in Dataverse):
    qdb_entity_name + qdb_record_id + qdb_field_name + qdb_language_code

  Indexes:
    - Alternate key index (auto-created by Dataverse)
    - Recommended: additional index on qdb_record_id for fan-in queries
      when fetching all translations for a set of record IDs

Pros:
- Adding a third language: create one qdb_language_config record +
  enter translation data. Zero schema change, zero code deployment.
  Satisfies NFR-009 in full.
- One batched Dataverse query retrieves ALL translation overrides for
  an entire form in one round-trip (see AG-005 read pattern).
- The designer's Translations Panel is fully config-driven: it reads
  the supported language list from qdb_language_config and writes to
  qdb_translation using (entityName, recordId, fieldName, languageCode)
  — no entity-type dispatch, no hardcoded column names.
- The backend TranslationResolutionService uses a single generic
  fallback algorithm regardless of entity type.
- No constitutional deviation required.

Cons:
- The composite key must be validated to prevent OData injection
  (fieldName and entityName are controlled strings — not user input —
  but the languageCode IS user-supplied and must be allowlist-validated
  before any query).
- qdb_translated_value is a Memo field (4000 chars) — sufficient for
  all field-level strings; validation error messages and button labels
  are well within this limit.
- The alternate-key uniqueness constraint is enforced at the Dataverse
  layer, which is the correct place for it.

VERDICT: ADOPTED.


WORKED 3RD-LANGUAGE EXAMPLE (FRENCH)

Demonstrating AG-001 requirement: adding French requires only records,
no schema change and no code deployment.

Step 1 — Add language configuration record (Dataverse admin):

  qdb_language_config record:
    qdb_language_code    = "fr"
    qdb_display_name     = "Français"
    qdb_lcid             = 1036
    qdb_is_active        = true
    qdb_display_order    = 3

Step 2 — Translations Panel surfaces French inputs automatically:
  The designer calls GET /api/languages, receives ["en","ar","fr"].
  The Translations Panel renders an additional "Français" input row
  for every translatable string — no UI code change.

Step 3 — Author enters translations:
  For field record {id: "abc123", label: "Full Name"}:
    qdb_translation record:
      qdb_entity_name     = "qdb_form_field"
      qdb_record_id       = "abc123"
      qdb_field_name      = "qdb_label"
      qdb_language_code   = "fr"
      qdb_translated_value = "Nom complet"

Step 4 — Runtime: GET /api/forms/loan/metadata?lang=fr
  Backend validates "fr" against allowlist — passes.
  LRU cache misses on key "loan:fr".
  TranslationResolutionService fetches all qdb_translation rows where
  qdb_language_code = 'fr' AND qdb_record_id IN (all child record IDs
  for this form). One Dataverse query. Applies French labels, falls
  back to English for any untranslated string.
  Response is cached under "loan:fr".

No schema change. No code deployment. No backend restart.


TRANSLATABLE FIELDS PER ENTITY TYPE

The following table maps each entity to its translatable field names
stored in qdb_translation.qdb_field_name:

| Entity (qdb_entity_name)    | Translatable field names (qdb_field_name)                                           |
|-----------------------------|--------------------------------------------------------------------------------------|
| qdb_form_definition         | qdb_title, qdb_description, qdb_confirmation_message, qdb_infocard_back_label, qdb_infocard_continue_label, qdb_infocard_start_label, qdb_infocard_skip_label |
| qdb_form_tab                | qdb_label                                                                            |
| qdb_form_section            | qdb_label, qdb_description                                                           |
| qdb_form_field              | qdb_label, qdb_placeholder, qdb_tooltip, qdb_prefix, qdb_suffix, qdb_true_label, qdb_false_label, qdb_info_card_title, qdb_info_card_body, qdb_info_card_download_label, qdb_file_download_label |
| qdb_form_option_value       | qdb_label, qdb_description, qdb_notes                                               |
| qdb_grid_column_config      | qdb_column_label                                                                     |
| qdb_info_card_screen        | qdb_heading, qdb_sub_heading, qdb_icon_alt_text                                     |
| qdb_info_card_section       | qdb_section_title, qdb_note_text                                                    |
| qdb_info_card_item          | qdb_item_title, qdb_item_description                                                |
| qdb_form_validation_rule    | qdb_error_message                                                                   |
| qdb_form_button             | qdb_label, qdb_confirmation_message                                                 |

Note: qdb_form_option_value.qdb_notes refers to the designer-visible
notes field exposed in FR-009. The downloadLabel on InfoCardItem is
stored on qdb_info_card_item as qdb_item_title (the item itself IS the
download link label in the current schema — confirm with backend team).


═══════════════════════════════════════════════════
AG-002 — LRU CACHE KEY STRUCTURE AND INVALIDATION STRATEGY
═══════════════════════════════════════════════════
AG gate: AG-002


CACHE KEY STRUCTURE

The existing LRU cache (ADR-006, node-lru-cache) is extended with
language awareness. The cache key is:

  `${formCode}:${languageCode}`

Examples:
  "loan-application:en"   — English form definition (resolved)
  "loan-application:ar"   — Arabic form definition (resolved)
  "loan-application:fr"   — French form definition (resolved, future)

The English path without a lang parameter resolves to language code
"en" internally before cache lookup, ensuring:

  getFormDefinition("loan-application")
    → cacheKey = "loan-application:en"

  getFormDefinition("loan-application", "en")
    → cacheKey = "loan-application:en"  (same entry, no duplication)

This means the existing call sites in forms.routes.ts that call
getFormDefinition without a locale still hit the "en" cache entry.
No regression on the English path.

The existing cacheKeysByFormCode map (Map<string, Set<string>>) in
CrmMetadataService already tracks all cache keys per formCode:

  "loan-application" → Set{"loan-application:en", "loan-application:ar"}

invalidateCache(formCode) deletes all language variants at once, which
is the correct behaviour — a form structure change invalidates every
language's resolved payload.


CACHE INVALIDATION STRATEGY

This is a live banking portal. Stale translations shown to customers
after an author has corrected them is a compliance risk. Three
invalidation mechanisms are layered:

LAYER 1 — TTL (background expiry, primary mechanism)
  The LRU cache is configured with a TTL. The recommended value for
  the i18n-augmented cache is 5 minutes (300 seconds). This is a
  relaxation from the existing cache (which has no TTL — purely LRU
  eviction). A 5-minute TTL means a translation correction becomes
  visible to all users within 5 minutes without any explicit action.
  This is acceptable for a banking portal where form content is
  configuration, not real-time data.

  Implementation: pass { ttl: 300_000 } to the LRUCache constructor.
  This is a constitutional non-deviation — it is a parameter change
  on an existing cache instance, not a new caching infrastructure.

LAYER 2 — Explicit invalidation endpoint (on-demand, secondary)
  A new internal endpoint allows the designer to trigger immediate
  cache eviction after saving translations:

    POST /api/internal/cache/invalidate
    Body: { formCode: string }
    Auth: designer service account (not customer-facing)

  The designer's TranslationWriteService calls this endpoint after a
  successful upsert to qdb_translation. This ensures an author sees
  their change immediately when they preview the form.

  The endpoint calls metadataService.invalidateCache(formCode), which
  deletes all language variants for that form from the LRU cache
  (using the existing cacheKeysByFormCode tracking).

LAYER 3 — Cache bypass for designer preview (design-time only)
  When the designer previews a form, it appends ?nocache=1 to the
  metadata request. The backend skips the LRU lookup and fetches
  fresh from Dataverse. This is not available to customer-facing
  portal routes (it is blocked at the middleware layer).


CACHE SIZING

With the language dimension added:
  50 forms × 2 languages = 100 cache entries at full saturation.
  Each resolved FormDefinition is ~100–150 KB serialised.
  Total cache memory: ~15 MB at full saturation.
  The existing LRU max (1000 entries) is not exceeded.


═══════════════════════════════════════════════════
AG-003 — API CONTRACT: LANGUAGE PARAMETER, BACKWARD COMPATIBILITY,
         FR-025 LANGUAGE CONFIG ENDPOINT, FR-024 ENGLISH FALLBACK
═══════════════════════════════════════════════════
AG gate: AG-003


1. EXISTING FORM DEFINITION ENDPOINT — LANGUAGE EXTENSION

  GET /api/forms/:formCode/metadata

  Before (existing, unchanged behaviour):
    GET /api/forms/loan-application/metadata
    Authorization: Bearer <token>
    → returns FormDefinition with English strings (as today)

  After (backward-compatible extension):
    GET /api/forms/loan-application/metadata?lang=ar
    Authorization: Bearer <token>
    → returns FormDefinition with Arabic strings (English fallback
      for any untranslated string)

    GET /api/forms/loan-application/metadata
    → returns FormDefinition with English strings IDENTICAL to today
      (no lang param → defaults to "en" → same cache entry as today)

    GET /api/forms/loan-application/metadata?lang=xx
    → HTTP 400
      { "success": false, "error": { "code": "INVALID_LANGUAGE_CODE",
        "message": "Language code 'xx' is not supported",
        "supportedCodes": ["en", "ar"] } }

BACKWARD COMPATIBILITY PROOF

  The extractLocale function in forms.routes.ts currently reads from
  Accept-Language header. This is REPLACED by a new extractLang
  function that:
    1. Reads ?lang= query parameter first (URL precedence, OQ-002).
    2. Falls back to localStorage preference passed in a custom header
       X-Preferred-Language (optional, client-supplied).
    3. Defaults to "en" if neither is present.

  The lang value is allowlist-validated against the live
  qdb_language_config records (fetched via CrmLanguageConfigService,
  cached separately with a 60-minute TTL — this list changes rarely).

  Critically: callers that send no ?lang= parameter receive the exact
  same English FormDefinition they receive today. The response schema
  does not change. The FormDefinition DTO shape is unchanged — strings
  are still plain string properties, not translation objects. The
  translation resolution is done server-side before the DTO is built.

REQUEST SCHEMA (Zod, in forms.routes.ts):

  const SUPPORTED_LANG_CODES = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).max(10);
  // Then validated against the runtime allowlist before use in any query.

  Any lang value that passes the regex but is not in the allowlist
  returns HTTP 400. The regex prevents OData injection at the character
  level; the allowlist prevents semantically invalid codes.


2. LANGUAGE CONFIGURATION ENDPOINT (FR-025)

  GET /api/languages

  No auth required (public configuration — the toggle must render
  before the user is authenticated in some portal flows).

  Response:
  {
    "success": true,
    "data": [
      { "code": "en", "displayName": "English", "isDefault": true,  "displayOrder": 1 },
      { "code": "ar", "displayName": "Arabic",  "isDefault": false, "displayOrder": 2 }
    ]
  }

  This endpoint is backed by CrmLanguageConfigService, which caches
  the result for 60 minutes (the language list changes at most a few
  times per year). Cache key: "language-config". Invalidated by the
  same POST /api/internal/cache/invalidate mechanism (body:
  { target: "languages" }).

  When a new language is added to Dataverse (qdb_language_config
  record created), the next cache miss after TTL expiry returns the
  new language automatically. No frontend code change required.
  (Satisfies AC-022, NFR-009.)


3. ENGLISH FALLBACK AT API LAYER (FR-024)

  The TranslationResolutionService applies the following algorithm
  for every translatable string on every entity in the assembled form:

    resolvedValue = translationMap.get(entityName, recordId, fieldName, requestedLang)
                    ?? englishBaseValue

  The english base value is the raw string already on the Dataverse
  entity record (e.g. qdb_form_field.qdb_label). It is never null
  in a well-formed form definition. The DTO property therefore never
  receives null or undefined for any translatable string.

  If the translation table is unreachable (Dataverse timeout), the
  service catches the error, logs it with correlation ID, and returns
  the form definition using English base values throughout. The form
  remains functional. (Satisfies NFR-004.)


═══════════════════════════════════════════════════
AG-004 — LANGUAGE CONFIGURATION DATA MODEL (Dataverse)
═══════════════════════════════════════════════════
AG gate: AG-004


ENTITY: qdb_language_config

Purpose: authoritative registry of supported languages. Drives the
FR-025 endpoint, the designer's Translations Panel language tabs, and
the backend's lang parameter allowlist.

  qdb_language_config
  ──────────────────────────────────────────────────────────────────
  qdb_language_configid   GUID (PK, auto)
  qdb_language_code       Text(10), required, e.g. "ar", "en", "fr"
                          Alternate key (unique constraint)
  qdb_display_name        Text(100), required, e.g. "Arabic"
  qdb_display_name_native Text(100), optional, e.g. "العربية"
  qdb_lcid                Integer, optional, e.g. 1025 for ar-SA
                          Used by FR-010 CRM OptionSet LCID lookup
  qdb_is_active           Boolean, default true
  qdb_is_default          Boolean, default false
                          Exactly one record should have this = true
                          (English at launch)
  qdb_display_order       Integer, for ordering toggle options
  qdb_rtl_direction       Boolean, default false
                          True for Arabic, Hebrew, and other RTL langs
                          Allows the frontend to derive dir= from config
                          without hardcoding language codes
  created_by / created_on / modified_by / modified_on (standard)

SEED DATA AT LAUNCH:

  Record 1:
    qdb_language_code = "en"
    qdb_display_name  = "English"
    qdb_lcid          = 1033
    qdb_is_default    = true
    qdb_rtl_direction = false
    qdb_display_order = 1
    qdb_is_active     = true

  Record 2:
    qdb_language_code = "ar"
    qdb_display_name  = "Arabic"
    qdb_display_name_native = "العربية"
    qdb_lcid          = 1025
    qdb_is_default    = false
    qdb_rtl_direction = true
    qdb_display_order = 2
    qdb_is_active     = true


HOW THIS DRIVES THE SYSTEM

URL precedence (OQ-002 default):
  Frontend reads ?lang=ar from URL → sends ?lang=ar to backend.
  Backend validates "ar" against allowlist from qdb_language_config.

English default (OQ-003 default):
  No URL param + no localStorage → frontend defaults to "en".
  Backend receives no ?lang= → defaults to "en".
  Cache hit: "loan:en" — existing behaviour, no change.

RTL direction:
  Frontend fetches GET /api/languages on app init.
  For the active language, reads qdb_rtl_direction.
  Passes dir="rtl" or dir="ltr" to FluentProvider accordingly.
  This means adding Hebrew in future requires no frontend code change
  — just set qdb_rtl_direction=true on the Hebrew config record.

Language toggle population:
  Toggle renders languages from GET /api/languages in
  qdb_display_order order. No hardcoded language list in the UI.


═══════════════════════════════════════════════════
AG-005 — 600ms P95 FEASIBILITY ASSESSMENT AND READ PATTERN
═══════════════════════════════════════════════════
AG gate: AG-005


BASELINE QUERY GRAPH (English, today)

The existing form load executes these Dataverse calls in sequence/
parallel:

  1. qdb_form_definitions (1 record by formCode)            ~50ms
  2. qdb_form_tabs (all tabs for formId)                    ~40ms
  3. qdb_form_sections (all sections for N tab IDs)         ~50ms
  4. qdb_form_fields (all fields for M section IDs)         ~50ms
     In parallel:
  4a. qdb_form_option_values (for non-CRM fields)           ~50ms
  4b. qdb_form_validation_rules (for all field IDs)         ~40ms
  4c. qdb_form_lookup_configs                               ~30ms
  4d. qdb_form_business_rules                               ~30ms
  4e. qdb_grid_column_configs                               ~40ms
  5. qdb_form_buttons (for formId)                          ~30ms
  6. qdb_info_card_screens + sections + items (parallel)    ~60ms

Estimated total (sequential steps + longest parallel branch): ~350ms
Matches the existing 500ms P95 budget with network jitter headroom.


TRANSLATION QUERY DESIGN (single batched round-trip)

The key constraint is: the translation query must not add a sequential
round-trip per entity type. The universal table (ADR-i18n-001) enables
a single query that fetches ALL translation overrides for the entire
form in one call.

After step 4 assembles the full set of child record IDs
(tabIds, sectionIds, fieldIds, optionIds, columnIds, screenIds,
sectionIds, itemIds, ruleIds, buttonIds), a single translation query
is issued in parallel with step 5 (buttons):

  GET /qdb_translations
    ?$filter=qdb_language_code eq 'ar'
    AND (
      qdb_record_id eq '<tab1>' OR qdb_record_id eq '<tab2>'
      OR qdb_record_id eq '<section1>' OR ...
      OR qdb_record_id eq '<field1>' OR ...
      [all record IDs across all entity types for this form]
    )
    &$select=qdb_entity_name,qdb_record_id,qdb_field_name,qdb_translated_value

For a form with 500 translatable string instances across ~100 records
(generous estimate: 50 fields × 5 translatable props + 50 other
entity records × 3 props), the IN-list filter contains ~100 GUIDs.
Dataverse OData handles IN-lists of this size well within 100ms on
standard tier. The response is at most ~500 rows × ~200 bytes = ~100KB.

This query runs in parallel with the existing step 5 (buttons fetch).
The translation map is built in-process (O(n) hash map construction).
TranslationResolutionService applies overrides as it assembles each DTO.

REVISED QUERY TIMELINE:

  Steps 1–4 (existing, unchanged)                           ~340ms
  Step 5 (buttons) + Step T (translations) in PARALLEL:
    buttons:      ~30ms
    translations: ~80ms  ← new, parallel
  Step 6 (info cards, already parallel)                     ~60ms
  In-process fallback application (CPU, not I/O):           ~5ms
  LRU cache write:                                          ~1ms
                                                   ─────────────
  ESTIMATED TOTAL:                                          ~426ms

This is comfortably within the 600ms P95 budget (with ~174ms
headroom for network jitter at P95 under 100 concurrent users).

NFR-003 PAYLOAD SIZE CHECK:
  A form with 500 string instances, each string averaging 50 chars:
  500 × 50 bytes = 25KB of string data.
  Existing form definition (structure, IDs, config): ~80KB.
  Total single-language resolved payload: ~105KB.
  Well within the 150KB NFR-003 limit.
  Payload is ≤120% of English payload (AC-023) because both carry
  the same structure and the translated strings are the same length
  as or shorter than English strings on average.

DENORMALISED READ MODEL — NOT REQUIRED

Given the single-query design above achieves ~426ms estimated P95,
a denormalised read model is not required at launch. If profiling
on staging reveals the translation query consistently exceeds 120ms
(due to IN-list size on very large forms), the mitigation is to
add a composite Dataverse index on
(qdb_language_code, qdb_record_id) — this is a configuration change,
not a schema change.


═══════════════════════════════════════════════════
BACKEND TRANSLATION RESOLUTION LAYER
═══════════════════════════════════════════════════
Covers FR-001 through FR-014 string types


ARCHITECTURE

A new TranslationResolutionService is introduced. It is stateless and
receives the assembled English FormDefinition and a TranslationMap
(built from the single batched qdb_translation query). It returns a
new FormDefinition with all translatable string properties replaced
with their resolved values.

  TranslationMap = Map<`${entityName}:${recordId}:${fieldName}`, string>

  resolve(entityName, recordId, fieldName, baseValue, map): string
    key = `${entityName}:${recordId}:${fieldName}`
    return map.get(key) ?? baseValue

This function is called once per translatable property, per record,
during the DTO mapping phase. It is a pure function with no I/O.

The service is injected into CrmMetadataService. When lang !== "en",
after the form is assembled, the service applies translations in a
single pass. When lang === "en", the pass is skipped entirely —
no overhead on the English path.


STRING RESOLUTION PER FR-001..FR-014

FR-001 — Form Root Strings (qdb_form_definition record):
  Properties resolved: title, description, confirmationMessage
  entityName: "qdb_form_definition", recordId: form.id
  fieldNames: "qdb_title", "qdb_description", "qdb_confirmation_message"

FR-002 — Info-Card Navigation Button Labels (qdb_form_definition):
  Properties: infocardBackLabel, infocardContinueLabel,
              infocardStartLabel, infocardSkipLabel
  entityName: "qdb_form_definition", recordId: form.id
  fieldNames: "qdb_infocard_back_label", "qdb_infocard_continue_label",
              "qdb_infocard_start_label", "qdb_infocard_skip_label"
  Fallback: if the English base value itself is undefined/null,
            the resolved property remains undefined (these labels
            are optional — they fall back to built-in component
            defaults in the frontend).

FR-003 — Tab Labels (qdb_form_tab):
  Property: label
  entityName: "qdb_form_tab", recordId: tab.id
  fieldName: "qdb_label"

FR-004 — Section Labels and Descriptions (qdb_form_section):
  Properties: label, description
  entityName: "qdb_form_section", recordId: section.id
  fieldNames: "qdb_label", "qdb_description"

FR-005 — Field Labels, Placeholders, Tooltips (qdb_form_field):
  Properties: label, placeholder, tooltip
  entityName: "qdb_form_field", recordId: field.id
  fieldNames: "qdb_label", "qdb_placeholder", "qdb_tooltip"

FR-006 — Field Prefix and Suffix (qdb_form_field):
  Properties: prefix, suffix
  entityName: "qdb_form_field", recordId: field.id
  fieldNames: "qdb_prefix", "qdb_suffix"

FR-007 — Boolean Field Labels (qdb_form_field):
  Properties: trueLabel, falseLabel
  entityName: "qdb_form_field", recordId: field.id
  fieldNames: "qdb_true_label", "qdb_false_label"

FR-008 — Checkbox Field Labels (qdb_form_field):
  Property: label (same as FR-005 — checkbox label is the field label)
  Resolved as part of FR-005 pass. No additional handling needed.

FR-009 — Manual OptionSet Values (qdb_form_option_value):
  Properties: label, description, notes
  entityName: "qdb_form_option_value", recordId: option.value
  NOTE: option.value is the string value key stored in Dataverse
  (qdb_form_option_value.qdb_form_option_valueid is the actual record
  GUID — the resolution service uses the record GUID, not qdb_value).
  The OptionValue DTO must carry the record GUID alongside value.
  This requires a minor DTO extension: add optionRecordId?: string
  to OptionValue in shared/src/types/form.types.ts.
  fieldNames: "qdb_label", "qdb_description", "qdb_notes"

FR-010 — CRM-Sourced OptionSet Values (native Dataverse LCID):
  See separate FR-010 LCID section below.

FR-011 — Grid Column Headers (qdb_grid_column_config):
  Property: columnLabel
  entityName: "qdb_grid_column_config", recordId: col.columnId
  fieldName: "qdb_column_label"

FR-012 — Info-Card Screen, Section, Item Text:
  InfoCardScreen (qdb_info_card_screen):
    Properties: heading, subHeading, iconAltText
    fieldNames: "qdb_heading", "qdb_sub_heading", "qdb_icon_alt_text"

  InfoCardSection (qdb_info_card_section):
    Properties: sectionTitle, noteText
    fieldNames: "qdb_section_title", "qdb_note_text"

  InfoCardItem (qdb_info_card_item):
    Properties: itemTitle, itemDescription
    fieldNames: "qdb_item_title", "qdb_item_description"

FR-013 — Validation Rule Error Messages (qdb_form_validation_rule):
  Property: errorMessage
  entityName: "qdb_form_validation_rule", recordId: rule.id
  fieldName: "qdb_error_message"
  NOTE: rules merged with templates (mergeRuleWithTemplate) get their
  errorMessage from the INSTANCE record if set, or from the template
  if not. The translation applies to the instance record ID. If the
  rule uses a template and has no instance-level errorMessage, the
  translation should be authored against the template record ID.
  The designer must surface both instance and template translation
  slots. Architecture defers the template vs. instance precedence
  detail to the backend team with this note.

FR-014 — Form Button Labels (qdb_form_button):
  Properties: label, confirmationMessage
  entityName: "qdb_form_button", recordId: button.id
  fieldNames: "qdb_label", "qdb_confirmation_message"


RECORD ID COLLECTION PASS

Before the TranslationResolutionService can query qdb_translation,
all child record IDs across the assembled form must be collected.
CrmMetadataService adds a collectRecordIds(form) step that walks the
assembled (English) FormDefinition and builds a flat Set<string> of
all record GUIDs. This set is passed into the batched translation
query as the IN-list filter.

  collectRecordIds(form: FormDefinition): Set<string>
    — form.id
    — each tab.id
    — each section.id
    — each field.id, field.validationRules[*].id, field.options[*].optionRecordId
    — each field.gridConfig?.columnConfigs[*].columnId
    — each infoCard screen.screenId, section.sectionId, item.itemId
    — each button.id


═══════════════════════════════════════════════════
FR-010 — CRM-SOURCED OPTIONSET VALUES (LCID-BASED)
═══════════════════════════════════════════════════

For fields where optionSourceEntity and optionSourceAttribute are set,
the existing fetchCrmOptionSetValues method retrieves labels using the
Dataverse PicklistAttributeMetadata endpoint. Currently it reads only
the first LocalizedLabel (index 0), which is the fallback/base label.

The language-aware version passes the LCID for the requested language:

  Requested:
    GET /EntityDefinitions(LogicalName='${entity}')/Attributes
        (LogicalName='${attribute}')
        /Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet

  The response contains OptionSet.Options[*].Label.LocalizedLabels[]
  Each entry: { Label: string, LanguageCode: number }

  Resolution per option:
    1. Find LocalizedLabel where LanguageCode = requestedLcid (e.g. 1025 for AR)
    2. If found, use it.
    3. If not found, fall back to LanguageCode = 1033 (EN).
    4. If neither found, use String(option.Value).

  The LCID is derived from qdb_language_config.qdb_lcid for the
  requested language code. CrmLanguageConfigService provides
  getLcidForLanguageCode(langCode): number lookup.

C-003 DEPENDENCY PATH:
  If the Dataverse Arabic Language Pack (LCID 1025) is NOT installed,
  LocalizedLabels for LCID 1025 will be absent. The fallback to
  LCID 1033 (English) will apply automatically — no error, no empty
  label. The backend team must confirm pack installation per C-003
  before implementing and must document the fallback behaviour in
  phase-4-tech.md if the pack is absent.

  If the pack is confirmed absent, the temporary path is: treat
  CRM-sourced option set fields as manual fields and require the
  CRM Configuration Team to author Arabic labels via qdb_translation
  records. The TranslationResolutionService handles these identically
  to FR-009 (manual option values).


═══════════════════════════════════════════════════
FRONTEND + MOBILE: RTL CONTEXT, TOGGLE, PERSISTENCE, URL PRECEDENCE
═══════════════════════════════════════════════════


WEB FRONTEND (React/Vite/Fluent v9)

Module: packages/frontend/src/i18n/

  i18n.ts — i18next initialisation
    Configures i18next with i18next-http-backend and i18next-icu.
    loadPath: "/api/forms/{formCode}/metadata?lang={{lng}}"
    NOTE: The i18next translation namespace is not used for per-key
    static strings. Instead, the backend returns a fully resolved
    FormDefinition. i18next is used for any static UI chrome strings
    (toggle labels, loading text, error banners) that live in the
    frontend package itself. Form content strings come from the API.

  useLanguage.ts — React hook (independently testable per NFR-011)
    Reads language from:
      1. URL ?lang= query parameter (highest precedence — OQ-002)
      2. localStorage key "qdb_lang" (fallback)
      3. Default "en" (if neither present — OQ-003)
    Writes to localStorage on change.
    Syncs ?lang= to URL on change (replaceState, no history entry).
    Exports: { language, setLanguage, isRtl, dir }
    isRtl and dir are derived from qdb_language_config.qdb_rtl_direction
    for the active language (fetched once from GET /api/languages).

  DirectionProvider.tsx — wrapper component (independently testable)
    Renders FluentProvider with dir={dir} and lang={language}.
    Also sets document.documentElement.lang and
    document.documentElement.dir on every language change.
    Wraps the entire form render surface.

  LanguageToggle.tsx — UI component
    Positioned at form top-right (OQ-001 decision).
    Reads languages from GET /api/languages (cached in React Query).
    Renders language options in qdb_display_order.
    On select: calls setLanguage(code) from useLanguage hook.
    Triggers a new API call for GET /api/forms/:code/metadata?lang=<new>
    Field values in React form state are preserved (AC-007) because
    the language switch only re-fetches metadata — form state is
    managed separately in the form engine's state store.

FONT LOADING (FR-018)
    fonts/arabic.ts — lazy import (independently testable per NFR-011)
    On language switch to any RTL or Arabic-script language:
      import('@fontsource-variable/cairo/index.css')
      import('@fontsource/noto-sans-arabic/400.css')
    Both use font-display: swap (provided by Fontsource) — FOUT is
    acceptable, FOIT is not.
    Font CSS is not loaded for English sessions.

HTML LANG AND DIR (FR-019)
    DirectionProvider sets document.documentElement.lang and .dir.
    Each rendered form field container also receives lang={language}
    and dir={dir} via a context-driven prop spread, ensuring ARIA
    tree correctness for screen readers (FR-020, AC-016).


MOBILE (React Native/Expo)

Module: packages/mobile/src/i18n/

  i18nMobile.ts — shared i18next instance imported from packages/shared
    Same namespace structure as web. HTTP backend configured to call
    the same /api endpoint with the bearer token from the mobile auth
    session.

  RtlManager.ts — thin RTL wrapper (~20 lines, independently testable)
    Wraps I18nManager + Updates.reloadAsync().

    applyRtlIfChanged(isRtl: boolean): Promise<void>
      if (I18nManager.isRTL === isRtl) return  // no change needed
      I18nManager.allowRTL(isRtl)
      I18nManager.forceRTL(isRtl)
      // Show confirmation dialog before reload (CEO condition C-002 path)
      await Updates.reloadAsync()

    This is called only when the user changes language and the RTL
    state changes (e.g. switching from EN to AR for the first time).

  LanguageOnboarding.tsx — first-launch language selection screen
    Shown once at first app launch (no AsyncStorage "qdb_lang" key).
    User selects EN or AR. Persists to AsyncStorage.
    If AR is selected, calls RtlManager.applyRtlIfChanged(true).
    The reload happens before the main app shell mounts, so the user
    sees the app launch directly in Arabic with correct RTL layout.

  Post-onboarding language change:
    If the user changes language post-onboarding, a confirmation
    dialog warns: "The app will restart to apply the layout change."
    On confirm: AsyncStorage.setItem('qdb_lang', newCode) →
    RtlManager.applyRtlIfChanged(newIsRtl).

  COLD START BEHAVIOUR:
    On every cold start, the mobile app reads AsyncStorage 'qdb_lang'.
    If 'ar', calls I18nManager.allowRTL(true) + forceRTL(true)
    synchronously BEFORE the React tree renders. This prevents the
    LTR flash that occurs if RTL is applied after the first render.
    The RtlManager.initRtlFromStorage() call must be the FIRST thing
    in the App.tsx entry point, before any navigation or UI mount.


═══════════════════════════════════════════════════
DESIGNER: TRANSLATIONS PANEL ARCHITECTURE
═══════════════════════════════════════════════════


DESIGN PRINCIPLE

The Translations Panel must require NO code change to add a language.
It is entirely config-driven: it reads supported languages from
GET /api/languages and renders one input per language per translatable
string. When a French config record is added to qdb_language_config,
the panel renders a French input automatically.


MODULE STRUCTURE (packages/designer/src/translations/)

  TranslationsPanel.tsx — container component
    Props: { entityName: string, recordId: string, entityLabel: string }
    Fetches: GET /api/languages (to know which languages to render)
    Fetches: GET /api/translations?entityName=...&recordId=...
             (fetches existing translation records for this entity)
    Renders: TranslatableStringRow for each translatable field
             for this entity type (looked up from TRANSLATABLE_FIELDS
             constant keyed by entityName).

  TranslatableStringRow.tsx — per-field row
    Shows:
      - Field name label
      - English base value (read-only, from the entity record)
      - One editable input per non-English supported language
    Arabic inputs render with dir="rtl" and Cairo font (FR-022, AC-019)
    Calls TranslationWriteService.upsert() on blur/save.

  TRANSLATABLE_FIELDS constant:
    A static map: Record<entityName, string[]> listing the field names
    that are translatable for each entity. This is maintained in code
    once — it is not config-driven (the list of translatable fields
    is an architecture decision, not a data decision). Adding a new
    entity's fields to this map requires a designer code change, but
    adding a new LANGUAGE does not.

  TranslationWriteService.ts — Dataverse write service
    upsert(entityName, recordId, fieldName, languageCode, value):
      POST /api/design/translations  (new backend endpoint)
      Body: { entityName, recordId, fieldName, languageCode, value }
      Backend upserts to qdb_translation using the alternate key.
      On success: fires POST /api/internal/cache/invalidate
                  { formCode: <current form being edited> }
                  to evict the LRU cache for all language variants.

  BACKEND ENDPOINT (designer-facing, auth-gated):
    PUT /api/design/translations
    Body:
    {
      "entityName": "qdb_form_field",
      "recordId":   "abc123-...",
      "fieldName":  "qdb_label",
      "languageCode": "ar",
      "value": "الاسم الكامل"
    }
    Auth: designer roles only (same auth guard as other /api/design/* routes)
    Validates languageCode against allowlist.
    Upserts qdb_translation using Dataverse alternate key upsert
    (PATCH with Prefer: return=representation or POST with alternate key).
    Returns 200 with the saved translation record.

    DELETE /api/design/translations/:translationId
    For clearing a translation entry (reverts to English fallback).

  COMPLETENESS INDICATOR (non-blocking, OQ-004 default)
    The panel shows a completion indicator per entity:
    "3 of 5 Arabic strings translated" — purely informational.
    Publication is not blocked. This satisfies OQ-004 (no hard gate).


═══════════════════════════════════════════════════
MODULE BOUNDARIES — NFR-011
═══════════════════════════════════════════════════

NFR-011 requires RTL logic, toggle state, and string resolution each
to be independently testable modules. The following boundaries are
enforced:

MODULE 1 — RTL LOGIC
  Web: DirectionProvider.tsx + useLanguage.ts (dir derivation)
  Mobile: RtlManager.ts
  Boundary: receives a boolean isRtl as input. Has no knowledge of
  language codes, API calls, or string content.
  Test: unit test with isRtl=true verifies FluentProvider dir="rtl"
  and document.dir="rtl" are set. No API mocking needed.

MODULE 2 — LANGUAGE TOGGLE STATE
  Web: useLanguage.ts hook
  Mobile: LanguageOnboarding.tsx + AsyncStorage read in App.tsx
  Boundary: manages the active language code string. Reads URL param
  and localStorage/AsyncStorage. Has no knowledge of RTL or string
  content — it only manages the code.
  Test: unit test verifies URL param takes precedence over localStorage;
  localStorage takes precedence over default; default is "en".

MODULE 3 — STRING RESOLUTION (BACKEND)
  TranslationResolutionService.ts
  Boundary: pure function. Input: FormDefinition (English) +
  TranslationMap. Output: FormDefinition (resolved). No I/O.
  Test: unit test with a synthetic FormDefinition and a partial
  TranslationMap verifies translated strings replace English values
  and missing translations fall back to English base values.

MODULE 4 — TRANSLATION DATA ACCESS
  CrmTranslationQueryService.ts (new service)
  Boundary: owns the batched qdb_translation OData query.
  Separated from CrmMetadataService so it can be tested independently
  against a mock Dataverse response without standing up a full form
  assembly pipeline.


═══════════════════════════════════════════════════
SECURITY ARCHITECTURE ADDITIONS
═══════════════════════════════════════════════════

NFR-007 — LANG PARAMETER VALIDATION

Three-layer defence:

  Layer 1 — Regex validation (character-level):
    /^[a-z]{2}(-[A-Z]{2})?$/ — rejects anything not a BCP-47 short code.
    Applied via Zod schema in forms.routes.ts before any processing.

  Layer 2 — Allowlist validation (semantic):
    After regex, the code is checked against the live
    qdb_language_config allowlist (cached 60 min).
    Unsupported codes → HTTP 400 with structured error body.
    Applies before the code is used in any Dataverse query.

  Layer 3 — Parameterised OData filter (injection prevention):
    The language code is passed as a literal value in the OData filter
    string. Because it is already validated against an exact-match
    allowlist (e.g. "en", "ar"), it cannot contain OData metacharacters.
    The existing safeLocale = locale.replace(/'/g, "''") pattern from
    fetchLocalizedLabels is retained for defence-in-depth.

NFR-008 — TRANSLATION DATA RESIDENCY
  All qdb_translation records are created in the QDB Dataverse
  environment (org5869857f.crm4.dynamics.com, Qatar region).
  No translation data is sent to external services.
  The i18next-http-backend is configured to call the DFE backend only
  (same origin) — it does not call Dataverse directly.


═══════════════════════════════════════════════════
DATAVERSE SOLUTION PACKAGING
═══════════════════════════════════════════════════

Per constitution Article XI, all Dataverse customisations are deployed
via PAC CLI in the QDB managed solution (never the Default Solution).

New components in this engagement:
  - qdb_translation entity + all attributes + alternate key
  - qdb_language_config entity + all attributes + alternate key
  - Security role additions: CRM Configuration Team — Read/Write on
    qdb_translation; Read on qdb_language_config.
    Portal service account — Read on qdb_translation and
    qdb_language_config (least privilege).

Each entity must be declared in solution.xml RootComponents
individually (per CRM solution packaging memory note — no wildcards).


═══════════════════════════════════════════════════
DEPLOYMENT ARCHITECTURE ADDITIONS
═══════════════════════════════════════════════════

New environment variables (backend):
  LANGUAGE_CONFIG_CACHE_TTL_MS=3600000   (60 min, language list)
  TRANSLATION_QUERY_TIMEOUT_MS=5000      (Dataverse translation query)
  FORM_CACHE_TTL_MS=300000               (5 min, per-language form cache)

New backend routes registered at app startup:
  GET  /api/languages              (CrmLanguageConfigService)
  PUT  /api/design/translations    (designer write, auth-gated)
  DELETE /api/design/translations/:id (designer delete, auth-gated)
  POST /api/internal/cache/invalidate (internal only, bound to loopback)

CI/CD: no new pipeline stages. The Dataverse solution deployment
(PAC CLI) is an existing pipeline step; the two new entities are
added to the solution file and deployed in the same step.

Arabic font assets (WOFF2) are served as static assets from the
frontend Vite build output — they are bundled with the application
and served via the existing CDN/static asset path. No separate CDN
configuration is required.


═══════════════════════════════════════════════════
ARCHITECTURE GATE CONFIRMATION SUMMARY
═══════════════════════════════════════════════════

AG-001: SATISFIED
  Universal translation table (qdb_translation) chosen and justified
  over sibling columns (schema change per language — rejected) and
  per-entity child tables (11-table proliferation, fan-out risk —
  rejected). Worked French example demonstrates zero schema change,
  zero code deployment for a third language. Satisfies NFR-009.

AG-002: SATISFIED
  Cache key: "${formCode}:${languageCode}" (e.g. "loan:en", "loan:ar").
  Three-layer invalidation: 5-min TTL (primary), explicit invalidation
  endpoint POST /api/internal/cache/invalidate (on designer save),
  and ?nocache=1 bypass for designer preview. English path unchanged.

AG-003: SATISFIED
  GET /api/forms/:code/metadata?lang=ar is backward-compatible.
  No ?lang= → "en" → same cache entry as today, identical response.
  Unsupported lang → HTTP 400 with structured error.
  GET /api/languages endpoint defined (FR-025), config-driven,
  60-min cache. FR-024 English fallback applied in
  TranslationResolutionService (pure function, no null output).

AG-004: SATISFIED
  qdb_language_config entity defined with qdb_rtl_direction boolean
  (config-driven RTL, no hardcoded language codes in frontend).
  Drives FR-025 endpoint, lang allowlist, toggle population, and URL
  precedence (OQ-002) + English default (OQ-003) without additional
  frontend state management complexity.

AG-005: SATISFIED
  Single batched translation query runs in parallel with the existing
  buttons fetch. Estimated P95 total: ~426ms, within the 600ms budget
  with ~174ms headroom. No denormalised read model required at launch.
  Payload size for 500-string form: ~105KB, within 150KB NFR-003 limit.


═══════════════════════════════════════════════════
ADR INDEX UPDATE
═══════════════════════════════════════════════════

See projects/dynamic-form-engine/adrs/index.md for the updated index.

New ADRs from this engagement:
  ADR-i18n-001: Universal Translation Table (qdb_translation) —
                Accepted — 2026-06-24


═══════════════════════════════════════════════════
SKEPTIC REVIEW
═══════════════════════════════════════════════════

CHALLENGE 1 — qdb_translation IN-list query at scale:
  We assume a form has ~100 child records. A very large form
  (say, 300 fields × multiple option values) could produce an
  IN-list with 800–1000 GUIDs. Dataverse OData IN-lists of that
  size have known performance variability. At 1000 GUIDs the filter
  URL length may exceed IIS request limits on some CRM deployments.
  MITIGATION: The backend must chunk the IN-list into batches of
  200 GUIDs and issue 1–4 parallel requests if the form exceeds
  200 translatable records. This adds ~20ms per additional batch
  but remains within budget.

CHALLENGE 2 — 5-minute TTL and compliance:
  We claim 5-minute stale translations are acceptable for a banking
  portal. What if a CRM author corrects a legally incorrect Arabic
  term (e.g. an incorrect interest rate label)? The stale version
  is shown for up to 5 minutes. The explicit invalidation endpoint
  (Layer 2) mitigates this, but only if the designer reliably calls
  it. If the Dataverse admin edits qdb_translation directly (not via
  the designer), the cache is not invalidated until TTL. QDB IT
  Director must acknowledge this risk in writing.

CHALLENGE 3 — OptionRecordId on OptionValue DTO:
  We require adding optionRecordId to the OptionValue DTO in
  shared/src/types/form.types.ts to enable translation of
  qdb_form_option_value records. This is a shared-types change
  that affects frontend, mobile, and backend simultaneously.
  If the DTO change is not coordinated across all packages,
  TypeScript compilation will fail. This is a breaking change
  risk in the monorepo. Must be the first backend PR in Phase 4.

CHALLENGE 4 — Mobile cold-start RTL:
  We rely on I18nManager.forceRTL being called synchronously before
  the React tree mounts. In Expo managed workflow, App.tsx runs after
  the Expo Go / native bootstrap. If AsyncStorage.getItem is async
  (it always is), there is a window where the React tree begins
  mounting before the RTL state is applied. This produces a visible
  LTR flash on cold start in Arabic. A synchronous RTL initialisation
  mechanism (e.g. storing RTL preference in a native module with
  synchronous read) may be needed. The C-002 spike must test this
  explicitly.

CHALLENGE 5 — Designer cache invalidation race:
  The designer calls PUT /api/design/translations (upserts record)
  then POST /api/internal/cache/invalidate (evicts cache). If the
  invalidation call fails (network error, backend restart), the cache
  holds a stale resolved form. The 5-min TTL is the backstop, but
  during active translation authoring sessions the author may see
  their own saves not reflected for 5 minutes. MITIGATION: the
  designer should optimistically update its local form preview
  without waiting for the backend cache to invalidate.

CHALLENGE 6 — qdb_language_config allowlist cache TTL:
  The lang allowlist is cached for 60 minutes. If a language is
  REMOVED (set to inactive) in qdb_language_config, the backend
  will continue accepting that language code for up to 60 minutes.
  This is a minor issue but could expose a deprecated language.
  The invalidation endpoint should also accept { target: "languages" }
  to force an immediate language-config cache eviction.

CHALLENGE 7 — Validation rule template translations:
  We noted that FR-013 validation rule error messages can come from
  either the rule instance or its template. The translation is
  authored against the instance record ID. If a rule uses a template
  and the instance errorMessage is empty (so the template message is
  used), no translation for that message will be found in
  qdb_translation. The author would need to know to translate the
  TEMPLATE record, not the instance. The designer's Translations Panel
  must handle this edge case explicitly or the fallback-to-English
  will silently win for template-derived messages.

These challenges must be addressed before Phase 4 begins.


═══════════════════════════════════════════════════
END OF DOCUMENT — DFE-i18n-001 Phase 3 Architecture v1.0
═══════════════════════════════════════════════════
