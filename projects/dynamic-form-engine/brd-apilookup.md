═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-APILOOKUP-001 — API-Sourced Lookup Field
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-07-20
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
─────────────────────────────────────────────────

The Dynamic Form Engine's `lookup` field today fetches selectable records
exclusively from a CRM/Dataverse entity via an OData query proxied by the Node
backend. This constraint forces form designers who need data from external
systems — HR directories, ERP catalogues, partner registries, third-party
reference data — to either keep stale static option lists or build bespoke CRM
synchronisation jobs. The proposed feature adds an "API source" mode to the
existing lookup field: the form maker chooses, per field, whether the lookup
draws from a CRM entity (the unchanged default) or from a pre-registered
external REST API. The browser never contacts the external API directly; the
Node backend resolves an opaque `endpointKey` against a server-side allowlist
and proxies the call. A normalised `LookupResult[]` response is returned to the
frontend, which renders it using the existing searchable-lookup UI. The business
outcome is that makers can wire lookup fields to live external data without
engineering intervention, while the security posture (no raw URLs in form
config, no browser-to-third-party calls) remains intact.


2. BUSINESS OBJECTIVES
─────────────────────────────────────────────────

BO-001: Enable form makers to configure a lookup field whose records come from
        an external REST API so that forms can present live reference data from
        non-CRM systems without a synchronisation job.

BO-002: Enable the IT/DevOps team to register, audit, and remove approved
        external API endpoints in a single administrator-controlled allowlist so
        that form makers can never introduce an unapproved outbound call.

BO-003: Enable end users completing a form to search and select from
        API-sourced lookup results with the same typeahead experience as an
        entity-sourced lookup so that no training change is required.

BO-004: Ensure all existing entity-sourced lookup fields continue to work
        without modification so that existing deployed forms carry zero
        regression risk from this feature.

BO-005: Ensure the API-lookup configuration is fully represented in both the
        Node backend form-definition assembly path (CrmMetadataService) and the
        C# in-CRM render-cache path (FieldBuilder) so that the form JSON is
        correct regardless of which path generates it.


3. STAKEHOLDERS
─────────────────────────────────────────────────

| Stakeholder            | Role                       | Interest                                                    |
|------------------------|----------------------------|-------------------------------------------------------------|
| Form Maker / Designer  | Primary user               | Configure API source per lookup field; pick endpoint key    |
| End User (Portal)      | Consumer                   | Search and select records from the lookup at runtime        |
| IT / DevOps Team       | Administrator              | Register and manage approved API endpoints in the allowlist |
| QDB IT Director        | Governance approver        | Sign off on data-egress and PDPPL compliance posture        |
| Backend Engineer       | Builder                    | Node proxy route, endpoint registry, CrmMetadataService     |
| CRM Developer          | Builder                    | C# FieldBuilder, FormDefinitionModel, provision scripts     |
| Frontend Engineer      | Builder                    | Designer panel, runtime hook/control changes                |
| Security / Audit       | Reviewer                   | Verify no raw URL injection surface, PII handling           |
| CEO                    | Decision authority         | BRD approval; OQ resolution before architecture begins      |


4. SCOPE
─────────────────────────────────────────────────

4.1 In Scope
  - A new `source` discriminator (`'entity'` | `'api'`) on the `LookupConfig`
    shared type, additive and backward-compatible (absent = `'entity'`).
  - New `LookupConfig` fields for API mode: `apiEndpointKey`, `apiValuePath`,
    `apiLabelPath`, `apiSearchParamName`, `apiSearchMode`.
  - An administrator-managed endpoint registry (mechanism TBD per OQ-001)
    that maps `endpointKey` strings to URL + auth + timeout configuration.
  - A new backend proxy route (`GET /api/lookups/api-lookup`) that resolves
    the endpointKey, calls the external API server-side, and returns
    normalised `LookupResult[]`.
  - Server-side response caching for API lookups (TTL configurable per OQ-004).
  - Error-handling for external API failures at the proxy layer (timeout,
    non-2xx, malformed JSON) with graceful empty-result fallback.
  - Designer UI changes in `LookupFieldPanel` / `LookupConfigScreen` to show
    a "Source" selector (Entity vs API) and the new API config fields.
  - Updates to `CrmMetadataService.fetchLookupConfigs()` (Node) to read and
    pass through the new columns from `qdb_form_lookup_configs`.
  - Updates to `FieldBuilder.BuildLookupConfig()` (C# plugin) to read and
    serialise the new columns.
  - New nullable columns on `qdb_form_lookup_configs` in Dataverse.
  - An additive, idempotent provision script
    (`scripts/provision-apilookup-schema.mjs`) following the existing pattern.
  - Designer persistence via `LookupConfigService` of the new fields.
  - Frontend runtime: the lookup control (`LookupControl.tsx`,
    `MultiLookupControl.tsx`) and `useLookupSearch` hook branching on `source`
    to call either the entity path or the new API proxy path.
  - Accessibility: ARIA attributes on the lookup dropdown must remain compliant
    (WCAG 2.1 AA) regardless of data source.
  - Unit and integration tests covering the proxy route, endpoint-registry
    resolution, path-mapping, and error scenarios.
  - The `multiLookup` field type (which shares `lookupConfig`) must also
    support API source mode by virtue of reading the same config object.

4.2 Out of Scope
  - Changes to entity-sourced lookup behaviour — zero modifications.
  - Authentication types beyond what is agreed in OQ-005 (initial scope is
    API Key header and Bearer token header; OAuth 2.0 client-credentials
    flows are deferred to a future phase).
  - A maker-facing UI to register new endpoints — endpoint registration
    remains an IT/DevOps operation.
  - Business-rule `filterLookup` action applied to API-sourced lookups —
    deferred pending architecture review of how server-side filter expressions
    translate to API query params.
  - Paginated external API responses — V1 will call once and return up to
    `maxResults` records; pagination is a future enhancement.
  - Submission-time validation of the selected value against the API
    (re-fetching to confirm the chosen record still exists) — deferred.
  - Mobile (React Native) changes — the mobile form runtime uses the
    shared `form.ts` type file; only `form.types.ts` is updated in V1.
    Mobile support requires a separate task to sync `shared/src/types/form.ts`.
  - The `dependsOnFieldId` / `dependsOnFilterTemplate` cascade pattern
    (which passes a parent field's value as a filter) for API-sourced lookups —
    deferred; the API-source equivalent (injecting a field value as a query
    param) requires additional design.
  - Power Automate flow changes.
  - SSRS / report impact.


5. FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────

5.1 Source Selection (Designer)

FR-001: The system shall present the form maker with a "Data Source" choice
        (values: "CRM Entity" / "External API") on the lookup field properties
        panel and the full lookup config screen when the field type is `lookup`
        or `multiLookup`.

FR-002: The system shall persist the chosen source as a string column
        (`qdb_lookup_source`, values `'entity'` | `'api'`) on the
        `qdb_form_lookup_configs` record in Dataverse when the maker saves.

FR-003: The system shall treat `qdb_lookup_source` absent or null as `'entity'`
        so that all existing lookup-config records continue to function without
        migration.

FR-004: The system shall show the CRM Entity configuration fields
        (Target Entity, Display Field, Value Field, Filter Query,
        Search Min Chars, Max Results) only when source is `'entity'`,
        and hide them when source is `'api'`.

FR-005: The system shall show the API configuration fields (Endpoint Key,
        Value Path, Label Path, Search Param Name, Search Mode) only when
        source is `'api'`, and hide them when source is `'entity'`.

5.2 Endpoint Registry (Administration)

FR-006: The system shall resolve an `endpointKey` string to a registered
        endpoint record via a server-side registry inaccessible to the browser
        or the form maker when the backend proxy route is called.

FR-007: The system shall reject any lookup proxy request whose `endpointKey`
        does not exist in the registry with HTTP 400, logging the unrecognised
        key and the requesting form code.

FR-008: Each registered endpoint entry shall store: the target URL, the HTTP
        method to use (GET), any static request headers (e.g. API key header
        name and value), and a per-endpoint timeout in milliseconds.

FR-009: The system shall expose no endpoint URL, credentials, or registry
        contents to the browser at any point — not in the form JSON, not in
        error responses, and not in frontend-visible logs.

5.3 Backend Proxy Route

FR-010: The system shall provide a new route `GET /api/lookups/api-lookup`
        that accepts `endpointKey`, `search` (optional), and `formCode`
        (for audit) as query parameters and returns `LookupResult[]` inside
        the standard `ApiResponse<T>` envelope.

FR-011: The system shall, when `apiSearchMode` is `'typeahead'`, append the
        `search` query parameter to the external API call using the configured
        `apiSearchParamName`, sending the user's typed term to the external API
        to perform server-side filtering.

FR-012: The system shall, when `apiSearchMode` is `'fetchAll'`, call the
        external API once with no search parameter, cache the response (per
        OQ-004), and filter the results in memory by whether the resolved label
        field contains the `search` term (case-insensitive), returning at most
        `maxResults` records.

FR-013: The system shall extract the value and label from each API response
        item using `apiValuePath` and `apiLabelPath` respectively, treating
        these as dot-notation paths (e.g. `id`, `name`, `address.city`)
        resolving into the response item object.

FR-014: The system shall map each extracted value/label pair to a
        `LookupResult` (`{ id, displayName, entityLogicalName: endpointKey }`)
        so the frontend lookup control receives a type-consistent response
        regardless of source.

FR-015: The system shall time out the external API call after the configured
        per-endpoint timeout (default 5 000 ms) and return an empty `data: []`
        with `success: true` and a structured warning in the response `meta`
        field, so the form remains usable when the external API is slow.

FR-016: The system shall return HTTP 200 with `data: []` (and log the error
        server-side with the correlation ID) when the external API returns a
        non-2xx status or malformed JSON, rather than propagating a 5xx to the
        browser.

FR-017: The system shall apply a per-endpoint-key rate limit (default: 30
        calls per minute per form-code) to prevent a single form from exhausting
        the external API budget, returning HTTP 429 when exceeded.

5.4 Form Definition Assembly — Node Path

FR-018: The system shall read the new columns (`qdb_lookup_source`,
        `qdb_lookup_api_endpoint_key`, `qdb_lookup_api_value_path`,
        `qdb_lookup_api_label_path`, `qdb_lookup_api_search_param`,
        `qdb_lookup_api_search_mode`) from `qdb_form_lookup_configs` in
        `CrmMetadataService.fetchLookupConfigs()` and populate the
        corresponding properties on the returned `LookupConfig` object.

FR-019: The system shall omit the API-specific fields from the serialised
        `LookupConfig` in the form definition JSON (the `endpointKey` goes to
        the browser, but the resolved URL and credentials must not).

5.5 Form Definition Assembly — C# Plugin Path

FR-020: The system shall read `qdb_lookup_source` and the five API-config
        columns from the `qdb_form_lookup_configs` entity in
        `FieldBuilder.BuildLookupConfig()` and assign them to corresponding
        properties on the C# `LookupConfig` model.

FR-021: The C# `LookupConfig` model in `FormDefinitionModel.cs` shall declare
        `Source`, `ApiEndpointKey`, `ApiValuePath`, `ApiLabelPath`,
        `ApiSearchParamName`, and `ApiSearchMode` properties with
        `NullValueHandling.Ignore` so that entity-sourced lookups produce a
        byte-identical JSON shape to the current output.

FR-022: The system shall include the updated C# model and plugin in the same
        deployment unit as the provision script, so that the render-cache path
        is never ahead of or behind the Node path in terms of field support.

5.6 Runtime — Frontend

FR-023: The system shall, when rendering a `lookup` or `multiLookup` field
        whose `lookupConfig.source` is `'api'`, call
        `GET /api/lookups/api-lookup?endpointKey=<key>&search=<term>` instead
        of `GET /api/lookups/:entityName`.

FR-024: The system shall, when `lookupConfig.source` is absent or `'entity'`,
        use the existing `CrmLookupService` path unchanged.

FR-025: The system shall debounce the typeahead search call for API-sourced
        lookups using the same 300 ms debounce as the entity path.

FR-026: The system shall display a user-facing "Unable to load options" inline
        message within the lookup dropdown when the API proxy returns an empty
        result due to a backend error, without exposing the error detail or
        the external URL.

FR-027: The system shall not allow the end user to submit the form with a
        lookup field in an error state — the field must either have a valid
        selection or be empty (subject to its `isRequired` flag).

5.7 Data Model — Dataverse

FR-028: The system shall add six nullable columns to `qdb_form_lookup_configs`
        (see Section 9) via an additive, idempotent provision script that
        checks for column existence before creating, following the pattern of
        `scripts/provision-grid-source-schema.mjs`.

FR-029: The system shall not modify, drop, or change any existing column on
        `qdb_form_lookup_configs` so that existing records are unaffected.

5.8 Designer Persistence

FR-030: The system shall persist `source`, `apiEndpointKey`, `apiValuePath`,
        `apiLabelPath`, `apiSearchParamName`, and `apiSearchMode` to the
        `qdb_form_lookup_configs` record in Dataverse via
        `LookupConfigService.saveLookupConfig()` when the maker saves the field.

FR-031: The system shall load all new fields from the Dataverse record and
        populate the designer form state via `LookupConfigService.loadLookupConfig()`
        so that re-opening the designer shows the previously saved API config.

FR-032: The system shall validate that `apiEndpointKey` is not empty when
        source is `'api'` and prevent the maker from saving the field config
        without it, showing an inline validation error on the designer panel.

FR-033: The system shall populate the "Endpoint Key" input in the designer
        using a dropdown list of registered endpoint keys loaded from
        `GET /api/admin/endpoint-registry/keys` (returns `string[]`), not a
        free-text input, so makers can only select approved keys.


6. NON-FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────

NFR-001: Performance — The backend proxy call to the external API (plus
         path-mapping) must complete and return to the browser within 2 000 ms
         under normal conditions. External API timeout is capped at 5 000 ms.
         The form definition assembly overhead of reading the new columns must
         not increase `GET /api/forms/:code` median latency by more than 20 ms.

NFR-002: Availability — A failure of any registered external API must degrade
         gracefully to an empty lookup with a user-facing inline message. It
         must not cause a form load failure or a 5xx from the DFE backend.

NFR-003: Security — (a) No external URL, credential, or endpoint registry
         content may appear in any browser-visible payload, log line, or error
         message. (b) The backend must reject requests with an unrecognised
         `endpointKey` before any network call is made. (c) The endpoint
         registry itself must not be writable by a form maker or portal user —
         it is administrator-only. (d) All outbound proxy calls must use HTTPS.
         (e) The proxy must send only the explicitly configured request headers
         to the external API — no JWT, no session cookie, no internal secrets.

NFR-004: Scalability — The proxy route must support at least 100 concurrent
         lookup searches per second without degrading form-load response times.
         `fetchAll` cached results must not grow beyond 10 000 items per
         registered endpoint (configurable hard cap).

NFR-005: Compliance — Responses from external APIs may contain personal data.
         The backend must not log response bodies at INFO level or below. DEBUG
         logging of response bodies must be guarded by an explicit opt-in flag
         (`APILOOKUP_DEBUG_LOG_RESPONSES=true`) that is OFF by default and must
         not be enabled in production. This is a PDPPL data-egress hard gate.

NFR-006: Observability — Every proxy call must emit a structured log entry
         containing: `correlationId`, `endpointKey`, `formCode`, `searchMode`,
         `searchTermProvided` (boolean, not the term itself), `httpStatus`,
         `durationMs`, `resultCount`. No PII fields (search term, results) at
         INFO level.

NFR-007: Backward Compatibility — All existing `lookup` and `multiLookup`
         fields must produce identical behaviour after this change. The shared
         `LookupConfig` type additions must be additive (optional fields only).
         The C# `LookupConfig` serialisation must use
         `NullValueHandling.Ignore` for all new properties so that unaffected
         render-cache entries are byte-identical.

NFR-008: Accessibility — The API-sourced lookup dropdown must implement the
         same ARIA pattern (combobox role, `aria-expanded`, `aria-activedescendant`,
         keyboard navigation) as the entity-sourced lookup. WCAG 2.1 AA compliance
         is required.

NFR-009: Testability — Minimum coverage: unit tests for proxy route (happy path,
         timeout, non-2xx, bad JSON, rate-limit), endpoint-registry resolution
         (found, not-found), path-mapping (`apiValuePath`, `apiLabelPath`),
         `fetchAll` in-memory filter, and C# `FieldBuilder` new-column mapping.
         Integration tests for the full Node path (mocked external API) and
         the designer round-trip (save → load → verify).


7. BUSINESS RULES
─────────────────────────────────────────────────

BR-001: A lookup field may have exactly one active `qdb_form_lookup_configs`
        record. This constraint is unchanged; the `source` column is added to
        that existing record.

BR-002: A `source = 'api'` lookup field is invalid unless `apiEndpointKey`
        resolves to a registered endpoint at runtime. If the key is not in the
        registry, the field must render an error state and return zero results —
        it must not fall back to an entity query.

BR-003: A `source = 'entity'` lookup field must never trigger a call to the
        API proxy route. The source discriminator is resolved at form-render
        time from the form JSON; there is no runtime path that calls both sources.

BR-004: The endpoint registry is append-and-deactivate only from the maker/user
        perspective. Keys may be added or deactivated by administrators but
        never edited (URL or auth change = new key, old key deactivated) to
        preserve audit traceability.

BR-005: A `maxResults` cap applies to API-sourced lookups identically to
        entity lookups. The proxy must not return more results than `maxResults`
        to the browser even if the external API returns more.

BR-006: When `apiSearchMode = 'typeahead'`, the system must not issue a proxy
        call until the user has typed at least `searchMinChars` characters
        (default 3), consistent with entity-lookup behaviour.

BR-007: When `apiSearchMode = 'fetchAll'`, the proxy call is issued once on
        lookup field focus (no minimum-char restriction); subsequent filtering
        is client-side. The cached result set must be invalidated when the
        browser page is refreshed or when the server-side TTL expires.

BR-008: A form whose render-cache was generated before the C# plugin was
        updated (i.e. the new columns are absent from the cached JSON) must
        produce `source: 'entity'` behaviour for all lookup fields, never
        `source: 'api'`. This is guaranteed by `NullValueHandling.Ignore` and
        the absent-null-equals-entity rule (FR-003).

BR-009: The PII non-logging rule (NFR-005) applies regardless of environment.
        Even in development, response bodies must not appear in log output
        unless `APILOOKUP_DEBUG_LOG_RESPONSES=true` is explicitly set.


8. USER STORIES
─────────────────────────────────────────────────

US-01: As a form maker, I want to switch a lookup field's data source from
       "CRM Entity" to "External API" so that the lookup presents live records
       from a system outside CRM without me needing to build a sync job.
       Priority: Must Have
       Acceptance criteria:
         Given I am editing a lookup field in the form designer
         When I select "External API" as the data source
         Then the entity-config fields (Target Entity, Display Field, Value
         Field, Filter Query) are hidden and replaced with API config fields
         (Endpoint Key, Value Path, Label Path, Search Param, Search Mode).

US-02: As a form maker, I want to choose an endpoint key from a dropdown of
       pre-approved options so that I cannot accidentally point a lookup at an
       unapproved external URL.
       Priority: Must Have
       Acceptance criteria:
         Given I have selected "External API" as the data source
         When the Endpoint Key field renders
         Then the field is a dropdown populated from the server-registered key
         list, not a free-text input, and I cannot type an arbitrary value.

US-03: As a form maker, I want to configure which JSON field from the API
       response becomes the lookup value and which becomes the display label
       so that I can map any API response shape without engineering support.
       Priority: Must Have
       Acceptance criteria:
         Given I am configuring an API-sourced lookup
         When I enter "id" in "Value Path" and "fullName" in "Label Path"
         Then the designer stores these paths and the runtime uses them to
         extract value and label from each API response item.

US-04: As a form end user, I want to type in a lookup field sourced from an
       external API and see matching options appear in a dropdown so that the
       experience is identical to selecting from a CRM-entity lookup.
       Priority: Must Have
       Acceptance criteria:
         Given a form with an API-sourced lookup field
         When I type at least 3 characters in the lookup input
         Then within 2 000 ms a dropdown appears showing matching records
         returned from the external API, formatted as display labels.

US-05: As a form end user, I want to see an inline message if the external
       API is unavailable rather than a crashed form so that I can still
       complete other fields and understand what happened.
       Priority: Must Have
       Acceptance criteria:
         Given the registered external API returns a non-2xx status or times out
         When I type in the lookup field
         Then an inline "Unable to load options" message appears in the dropdown,
         the form remains fully interactive, and no error detail or URL is shown.

US-06: As an IT administrator, I want to add a new approved external API
       endpoint to the registry without redeploying the form engine so that
       the team can onboard new integrations independently. (Depends on OQ-001
       resolution.)
       Priority: Should Have
       Acceptance criteria:
         Given I am an administrator with appropriate access
         When I add a new entry to the endpoint registry (via agreed mechanism)
         Then form makers can immediately select the new key in the designer
         without requiring a Node backend restart or a new deployment.

US-07: As a security auditor, I want every proxy call to an external API to
       produce a structured log entry with correlation ID, endpoint key, form
       code, duration, and result count so that I can trace every outbound call
       and detect anomalies.
       Priority: Must Have
       Acceptance criteria:
         Given any API-sourced lookup search is triggered at runtime
         When the proxy call completes (success or failure)
         Then a structured INFO log entry exists containing correlationId,
         endpointKey, formCode, httpStatus, durationMs, resultCount, and
         searchTermProvided (boolean) — no search term value, no response body.


9. DATA REQUIREMENTS
─────────────────────────────────────────────────

New columns on existing entity `qdb_form_lookup_configs` (additive; all nullable):

| Column Schema Name               | Type         | Max Length | Description                                              | Sensitivity |
|----------------------------------|--------------|------------|----------------------------------------------------------|-------------|
| qdb_lookup_source                | String       | 10         | 'entity' (default/null) or 'api'                         | Internal    |
| qdb_lookup_api_endpoint_key      | String       | 100        | Key resolving to the external API in the server registry | Internal    |
| qdb_lookup_api_value_path        | String       | 200        | Dot-notation path to the value field in API response items | Internal  |
| qdb_lookup_api_label_path        | String       | 200        | Dot-notation path to the label field in API response items | Internal  |
| qdb_lookup_api_search_param      | String       | 100        | Query param name sent to the external API for typeahead  | Internal    |
| qdb_lookup_api_search_mode       | String       | 20         | 'typeahead' or 'fetchAll'                                | Internal    |

New shared type additions to `LookupConfig` (additive; all optional):

| Property          | Type                      | Default   | Notes                                              |
|-------------------|---------------------------|-----------|----------------------------------------------------|
| source            | 'entity' \| 'api'         | 'entity'  | Discriminator; absent = 'entity'                   |
| apiEndpointKey    | string                    | undefined | Required when source = 'api'                       |
| apiValuePath      | string                    | undefined | e.g. 'id', 'data.id'                              |
| apiLabelPath      | string                    | undefined | e.g. 'name', 'data.displayName'                   |
| apiSearchParamName| string                    | undefined | e.g. 'q', 'search'; used in typeahead mode        |
| apiSearchMode     | 'typeahead' \| 'fetchAll' | undefined | Absent = 'typeahead' (recommended default)         |

Endpoint registry (new construct; structure depends on OQ-001 resolution):

| Field          | Type    | Notes                                             | Sensitivity |
|----------------|---------|---------------------------------------------------|-------------|
| endpointKey    | String  | Unique opaque key; immutable after creation       | Internal    |
| targetUrl      | String  | HTTPS URL of the external API endpoint            | Restricted  |
| httpMethod     | String  | 'GET' (V1 only)                                   | Internal    |
| authHeaderName | String  | e.g. 'X-Api-Key', 'Authorization'                | Restricted  |
| authHeaderValue| String  | Encrypted at rest; never logged                   | Restricted  |
| timeoutMs      | Integer | Default 5 000; configurable per endpoint          | Internal    |
| isActive       | Boolean | Inactive keys reject all calls immediately        | Internal    |
| registeredBy   | String  | Identity of the administrator who added this key  | Internal    |
| registeredAt   | DateTime| Timestamp of registration                         | Internal    |

Estimated volumes: The endpoint registry is expected to hold 5–50 entries.
Lookup search results are transient (not persisted). No new submission data
is stored; the selected `id` and `displayName` are stored the same way as an
entity-lookup selection.

Retention: Endpoint registry entries are retained indefinitely (deactivated,
never deleted) for audit traceability (BR-004). Proxy call logs follow the
existing DFE audit log retention policy.


10. INTEGRATION DEPENDENCIES
─────────────────────────────────────────────────

| System                        | Integration Type      | Data Exchanged                                      | Direction          |
|-------------------------------|-----------------------|-----------------------------------------------------|--------------------|
| External REST API (registered)| HTTPS/REST (outbound) | Search term (optional); receives JSON array          | DFE backend → API  |
| Dataverse (qdb_form_lookup_configs) | OData Web API  | New column values (read/write)                      | Node backend ↔ DV  |
| Dataverse (qdb_form_lookup_configs) | SDK/plugin     | New column values (read only — render-cache path)   | C# plugin ← DV     |
| Endpoint Registry             | Internal (read only)  | endpointKey → URL + auth + timeout                  | Node backend ← reg |
| DFE Designer                  | Internal REST         | New lookup config fields (GET/PATCH)                | Designer ↔ backend |
| DFE Frontend Runtime          | Internal REST         | LookupResult[] via proxy route                      | Frontend ← backend |
| Audit Log Service             | Internal              | Structured proxy-call log entries                   | Node backend → log |


11. ASSUMPTIONS
─────────────────────────────────────────────────

A-001: External APIs targeted by this feature are REST/HTTP APIs that return
       JSON. Non-JSON (XML, SOAP) APIs are not supported in V1.

A-002: External APIs support GET requests. POST-based lookup APIs are out of
       scope for V1.

A-003: The external API response shape is a JSON array at the root level,
       or a JSON object containing an array at a known path. Nested-envelope
       responses (e.g. `{ data: { items: [...] } }`) are handled by
       dot-notation `apiValuePath` and `apiLabelPath` (e.g. `data.items[0].id`
       — bracket notation for arrays is an open sub-question for architecture).

A-004: Registered endpoints are reachable from the Node backend host network.
       Network egress rules are the responsibility of IT/DevOps.

A-005: The endpoint registry mechanism (OQ-001) will be decided before
       architecture begins. This BRD is written to be mechanism-agnostic.

A-006: The `multiLookup` field type uses the same `lookupConfig` object as
       `lookup` and will therefore inherit API-source support without a
       separate implementation path.

A-007: The DFE-BTN-001 `CallApiActionConfig.endpointKey` pattern is
       intentionally aligned with this feature but is a separate call surface
       (button actions vs lookup typeahead). The endpoint registry built here
       will also satisfy the future button-action endpoint resolution, but
       button-action integration is not in scope for this ticket.

A-008: No existing `qdb_form_lookup_configs` record has `qdb_lookup_source`
       set at the time of deployment, so all existing lookups default to
       `'entity'` behaviour (FR-003).

A-009: The form designer is already deployed and the `LookupConfigService`
       layer is the correct place to persist and load lookup config; no new
       persistence abstraction is required.

A-010: The `SecurityStripper` in the C# pipeline does not strip `lookupConfig`
       from field definitions; this behaviour must be verified before the C#
       changes are merged (prior audit finding: SecurityStripper dropped
       non-reconstructed fields).


12. CONSTRAINTS
─────────────────────────────────────────────────

C-001: (Non-negotiable security) The browser must never receive the external
       API URL, authentication credentials, or any partial information that
       would allow it to reconstruct the URL. The `endpointKey` is the only
       API-identity token that reaches the browser.

C-002: (Non-negotiable security) Raw URL entry by form makers is prohibited.
       The designer must present only a dropdown of pre-approved endpoint keys
       sourced from the server registry (FR-033).

C-003: (Compliance / PDPPL) API response bodies must not be logged at INFO
       level or above in any environment. DEBUG logging is opt-in and off by
       default (NFR-005).

C-004: (Architecture — dual path) Both the Node backend and the C# in-CRM
       plugin must be updated in the same release. A partial deployment where
       one path knows about API-source lookups and the other does not is
       explicitly forbidden to prevent cache-path inconsistency.

C-005: (Schema — additive only) The provision script must not alter, rename, or
       drop any existing column on `qdb_form_lookup_configs`. All additions are
       nullable with no default required.

C-006: (Timeout) The external API call must be bounded. The backend must not
       allow an uncapped outbound request that could block a Node event-loop
       thread. A hard upper limit of 10 000 ms applies to all endpoints even
       if configured higher.

C-007: (Rate limit) The per-endpoint-key rate limit must exist from day one
       (FR-017). Shipping without a rate limit on the proxy route is not
       acceptable regardless of timeline pressure.

C-008: (HTTPS only) The endpoint registry must refuse to store or resolve
       any URL with a non-HTTPS scheme. An http:// URL in the registry is
       a configuration error, not a runtime decision.


13. RISKS AND OPEN QUESTIONS
─────────────────────────────────────────────────

| Risk / Question                                                         | Impact | Owner          | Resolution needed by   |
|-------------------------------------------------------------------------|--------|----------------|------------------------|
| OQ-001: Endpoint registry mechanism — env-variable JSON vs Dataverse    | High   | CEO + IT Dir   | Before architecture    |
|   entity. Env-var: simpler, no Dataverse entity, requires redeployment  |        |                |                        |
|   to add an endpoint. Dataverse entity: no redeployment, maker can see  |        |                |                        |
|   the keys list live, but adds a new entity and increases CRM surface.  |        |                |                        |
| OQ-002: Search strategy default — should `typeahead` be mandatory, or   | Medium | CEO + Arch     | Before architecture    |
|   should makers be able to choose `fetchAll`? `fetchAll` risks loading  |        |                |                        |
|   thousands of records on field focus. A hard cap (NFR-004) mitigates.  |        |                |                        |
| OQ-003: PII / data-egress governance — does QDB require a data-egress   | High   | CEO + IT Dir   | Before architecture    |
|   impact assessment before any live API can be registered, or is the    |        |                |                        |
|   PDPPL log-scrubbing rule (C-003) sufficient?                          |        |                |                        |
| OQ-004: Server-side caching — should `fetchAll` responses be cached     | Medium | CEO + Arch     | Before architecture    |
|   server-side (Redis / in-memory LRU)? What is the acceptable TTL?      |        |                |                        |
|   `typeahead` mode typically does not need caching. Decision affects     |        |                |                        |
|   NFR-001 latency budgets.                                              |        |                |                        |
| OQ-005: Supported auth types for V1 — API Key header and Bearer token   | Medium | CEO + Arch     | Before architecture    |
|   header are assumed. Should OAuth 2.0 client-credentials be in V1 or  |        |                |                        |
|   deferred? Deferring simplifies the registry model significantly.      |        |                |                        |
| R-001: External API instability degrading form UX. Mitigation: FR-015,  | Medium | Backend Eng    | Design phase           |
|   FR-016 (timeout + empty-result graceful fallback).                    |        |                |                        |
| R-002: C# plugin render-cache produces different JSON from Node path    | High   | CRM Developer  | Code-review gate       |
|   if FieldBuilder is not updated in lockstep. Mitigation: C-004.       |        |                |                        |
| R-003: SecurityStripper drops lookupConfig for API-sourced fields if    | High   | CRM Developer  | Design phase           |
|   it treats them as non-reconstructed. Must be verified against A-010.  |        |                |                        |
| R-004: Makers registering high-volume `fetchAll` endpoints without a    | Medium | Backend Eng    | Before go-live         |
|   result-set cap cause memory pressure on the Node process. Mitigation: |        |                |                        |
|   NFR-004 (10 000 item cap) + per-endpoint rate limit (FR-017, C-007). |        |                |                        |
| R-005: Mobile `form.ts` type file is not updated in V1 (out of scope). | Low    | Mobile Eng     | Next mobile release    |
|   Forms using API-sourced lookups served to the mobile runtime will     |        |                |                        |
|   receive the new config fields as unexpected properties (harmless in   |        |                |                        |
|   practice if the mobile lookup falls back to entity-source behaviour). |        |                |                        |


14. GLOSSARY
─────────────────────────────────────────────────

endpointKey: An opaque string token (e.g. "hr-staff-directory") that the form
  maker selects in the designer and that the backend resolves to an external
  API URL via the endpoint registry. The key is visible to makers and in the
  form JSON; the URL is not.

Endpoint Registry: A server-side, administrator-managed store mapping each
  endpointKey to the full URL, auth credentials, HTTP method, and timeout for
  a registered external API. Inaccessible to browsers or form makers except as
  a list of key names.

apiValuePath / apiLabelPath: Dot-notation paths (e.g. "id", "address.city")
  into an API response item object, used to extract the value stored on selection
  and the label displayed to the user respectively.

apiSearchMode: Determines how the search term is used. "typeahead" sends the
  term to the external API as a query parameter on each keystroke. "fetchAll"
  loads all records once and filters in memory.

apiSearchParamName: The query parameter name the external API expects for its
  search term in typeahead mode (e.g. "q", "search", "filter").

LookupResult: The normalised type (`{ id, displayName, entityLogicalName }`)
  returned by both entity-lookup and API-lookup proxy paths to the browser.
  entityLogicalName is set to the endpointKey for API-sourced results.

source discriminator: The `qdb_lookup_source` column / `LookupConfig.source`
  property that controls which lookup path (entity or API) is used for a field.
  Absent or null = 'entity'.

Render-cache path: The C# plugin path (`FormJsonGenerator` / `FieldBuilder`)
  that generates and stores the form definition JSON in the Dataverse render
  cache entity, bypassing the Node backend for forms served from the CRM
  web resource. Must produce an identical JSON shape to the Node path.

fetchAll mode: An API search mode where all records are fetched from the
  external API once on field focus, cached, and filtered client-side.
  Suited for small, stable lists where the external API does not support a
  search parameter.

typeahead mode: An API search mode where the user's typed term is forwarded
  to the external API as a query parameter on each keystroke (debounced).
  Suited for large lists and APIs that support server-side search.

PDPPL: Pakistan's Personal Data Protection and Privacy Law — the data privacy
  regulation that governs PII handling in QDB's operational context.


15. REQUIREMENTS TRACEABILITY MATRIX
─────────────────────────────────────────────────

| User Story | Functional Req                          | Business Obj | Test Case (QA fills) | Status |
|------------|-----------------------------------------|--------------|----------------------|--------|
| US-01      | FR-001, FR-004, FR-005                  | BO-001       | TC-001 (pending)     | Draft  |
| US-02      | FR-002, FR-033                          | BO-002       | TC-002 (pending)     | Draft  |
| US-03      | FR-003, FR-013, FR-014, FR-030          | BO-001       | TC-003 (pending)     | Draft  |
| US-04      | FR-010, FR-011, FR-012, FR-023, FR-025  | BO-001, BO-003| TC-004 (pending)    | Draft  |
| US-05      | FR-015, FR-016, FR-026                  | BO-003       | TC-005 (pending)     | Draft  |
| US-06      | FR-006, FR-008, FR-033                  | BO-002       | TC-006 (pending)     | Draft  |
| US-07      | NFR-006, FR-010                         | BO-002       | TC-007 (pending)     | Draft  |
| —          | FR-018, FR-019                          | BO-004, BO-005| TC-008 (pending)    | Draft  |
| —          | FR-020, FR-021, FR-022                  | BO-004, BO-005| TC-009 (pending)    | Draft  |
| —          | FR-024, FR-028, FR-029                  | BO-004       | TC-010 (pending)    | Draft  |
| —          | FR-007, FR-009                          | BO-002       | TC-011 (pending)     | Draft  |
| —          | FR-017 (rate limit)                     | BO-002       | TC-012 (pending)     | Draft  |
| —          | FR-027 (invalid state blocks submit)    | BO-003       | TC-013 (pending)     | Draft  |
| —          | FR-031, FR-032                          | BO-001       | TC-014 (pending)     | Draft  |


16. APPROVAL
─────────────────────────────────────────────────

| Role          | Name              | Decision  | Date |
|---------------|-------------------|-----------|------|
| CEO           | Pending           | PENDING   |      |
| Requestor     | Pending           | PENDING   |      |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
