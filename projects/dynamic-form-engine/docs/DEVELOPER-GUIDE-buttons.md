# Developer Guide — DFE-BTN-001: Tab/Section Buttons, Navigation & Final-Submission Parameters

Audience: engineers extending or maintaining the Dynamic Form Engine (DFE).
Scope: how scoped buttons work across all five surfaces, the Dataverse schema, the
security model, how to run/test locally, and how to extend it.

Engagement artifacts (read for the *why*): `brd-buttons.md`, `brd-buttons-approval.md`,
`phase-3-arch-buttons.md` (+ ADR-BTN-001..007), `phase-4-review-buttons.md`,
`phase-5-qa-buttons.md`, `phase-6-audit-buttons.md`, `phase-7-ceo-buttons.md`.

---

## 1. What the feature does

Before this feature, DFE had a single **form-level** action bar (`FormButton`: submit /
saveDraft / cancel / reset) and a flat submission body `{ formData }`. DFE-BTN-001 adds:

1. **Scoped buttons** — buttons attached to an individual **tab** or **section** (not just
   the whole form), enabling wizard-style flows.
2. **Button actions** — `navigate` (tab / section-scroll / nextStep / previousStep /
   externalUrl* / anotherForm*), `finalSubmit`, `saveDraft`, `callApi*`.
   (`*` = gated, see §8.)
3. **Final-submission extra parameters** — a structured envelope sent with FinalSubmit,
   resolved **server-side**: `static` constants, `hiddenField` values, server-stamped
   `runtimeContext`, and `computed` (sandboxed DSL) values.

The feature is rendered on four runtimes (portal, mobile, on-prem CRM, plus the backend
read path) and authored in the designer.

---

## 2. Architecture & data flow

```
            ┌──────────── DESIGNER (authoring) ────────────┐
            │ ScopedButtonsPanel → ScopedButtonDesignService │  immediate CRUD
            └───────────────────────┬──────────────────────┘
                                    ▼
                       Dataverse: qdb_form_scoped_button
                                    ▲
           ┌────────────────────────┼─────────────────────────────┐
   READ PATH (embed into tab/section.buttons[])           SUBMIT PATH (resolve extraParams)
           │                        │                              │
   Backend CrmMetadataService   On-prem FormJsonGenerator    Backend submit route +
   .fetchScopedButtons →        .BuildScopedButtons →        ExtraParamsAssemblyService
   ButtonAssembler              embeds into cache JSON
           │                                                       │
           ▼                                                       ▼
   FormDefinition.tabs[].buttons[] / .sections[].buttons[]   Resolved envelope (logged;
           │                                                  persistence is G-2 gated)
   ┌───────┴────────┬──────────────┐
   ▼                ▼              ▼
 Portal           Mobile        (on-prem HTML runtime)
 ScopedButtonBar  ScopedButtonBar
 useScopedButtonAction (dispatch)
```

**Key principle:** buttons are authored once and read by every runtime from the same
`ScopedButton` shape embedded into each tab/section. The submit-time extra-params are
**always resolved on the backend** from the published button spec — never trusted from
the client.

---

## 3. Dataverse schema

One new entity holds buttons for both scopes. **`qdb_form_tab` / `qdb_form_section` are
NOT modified** — the FK lives on the button record.

**Entity `qdb_form_scoped_button`** (SchemaName `qdb_Form_Scoped_Button`):

| Attribute | Type | Notes |
|---|---|---|
| `qdb_form_scoped_buttonid` | PK | |
| `qdb_label` | String | primary name = button text |
| `qdb_placement_scope` | String | `"tab"` or `"section"` |
| `qdb_display_order` | Integer | ordering |
| `qdb_is_primary`, `qdb_is_visible`, `qdb_is_active` | Boolean | |
| `qdb_confirm_required`, `qdb_confirm_message` | Bool/String | confirmation dialog |
| `qdb_action_type` | String | `navigate` / `finalSubmit` / `saveDraft` / `callApi` |
| `qdb_action_config_json` | Memo | serialized action config (the discriminated union) |

**Lookups (N:1):** `qdb_form_definition_id → qdb_form_definition`,
`qdb_tab_id → qdb_form_tab`, `qdb_section_id → qdb_form_section`.
A button is "on a tab" = `placement_scope='tab'` + `qdb_tab_id` set; "on a section" =
`placement_scope='section'` + `qdb_section_id` set.

**Provisioning:** `scripts/provision-button-schema.mjs` (idempotent; atomic entity-create
with attributes; creates the 3 lookups). Run:
```
node --env-file=scripts/.env scripts/provision-button-schema.mjs --dry-run   # preview
node --env-file=scripts/.env scripts/provision-button-schema.mjs              # deploy
```
Requires `DV_TENANT_ID / DV_CLIENT_ID / DV_CLIENT_SECRET / DV_DATAVERSE_URL` in
`scripts/.env`. **Gotcha (learned the hard way):** a SchemaName must keep underscores
(`qdb_Form_Scoped_Button` → logical `qdb_form_scoped_button`); without them Dataverse
derives the wrong logical name. Create the entity atomically with all attributes to avoid
a metadata-propagation 404 when adding attributes immediately after entity creation.

> The `qdb_api_endpoint` registry (for CallApi/External-URL) is **not** provisioned — gate G-1.

---

## 4. Shared type contract

The types live in BOTH shared barrels and MUST stay identical:
- `shared/src/types/form.types.ts` (backend + frontend/designer, via the `server.ts` barrel)
- `shared/src/types/form.ts` (mobile barrel `index.ts`)

A CI parity check enforces this: `shared/scripts/check-shared-type-sync.mjs` (wired into
`build`/`typecheck`; fails on drift). **Always edit both files together.**

```ts
type ButtonPlacementScope = 'tab' | 'section';
type ScopedButtonActionType = 'navigate' | 'finalSubmit' | 'saveDraft' | 'callApi';
type NavigationTargetType = 'tab' | 'section' | 'nextStep' | 'previousStep' | 'externalUrl' | 'anotherForm';

interface NavigateActionConfig { type: 'navigate'; target: NavigationTargetType; targetTabId?; targetSectionId?; externalUrlKey?; targetFormCode?; requiresPreviousTabsComplete?; unsavedDataPolicy?; }
interface FinalSubmitActionConfig { type: 'finalSubmit'; extraParams: ExtraParamSpec[]; }
interface SaveDraftActionConfig { type: 'saveDraft'; }
interface CallApiActionConfig { type: 'callApi'; endpointKey: string; method: 'GET'|'POST'; ... }
type ScopedButtonAction = NavigateActionConfig | FinalSubmitActionConfig | SaveDraftActionConfig | CallApiActionConfig;

interface ScopedButton { id; placementScope; placementId; label; displayOrder; isPrimary; isVisible; confirmationRequired; confirmationMessage?; action: ScopedButtonAction; isActive; }

type ExtraParamSource = 'static' | 'hiddenField' | 'runtimeContext' | 'computed';
type RuntimeContextKey = 'userId'|'userDisplayName'|'formId'|'formCode'|'formVersion'|'submittedAt'|'sessionId'|'tenantSegment'|'locale';
interface ExtraParamSpec { key; source: ExtraParamSource; staticValue?; fieldSchemaName?; contextKey?: RuntimeContextKey; expression?; }
```

`TabDefinition` and `SectionDefinition` each gain `buttons?: ScopedButton[]` (additive
optional — existing forms are unchanged).

---

## 5. Surface-by-surface implementation

### 5a. Backend — read path
- `backend/src/services/ButtonAssembler.ts` — pure mapper: `qdb_form_scoped_button`
  records → `ScopedButton`, parsing `qdb_action_config_json` and validating the action
  shape per type (`isValidActionConfig`); drops malformed/inactive records (never fails
  the form). Indexes by placement (`byTabId` / `bySectionId`).
- `backend/src/services/CrmMetadataService.ts` — `fetchScopedButtons(formId)` queries the
  entity and embeds into `tab.buttons` / `section.buttons`. Degrades to no buttons (logs
  404 at INFO, real errors at ERROR) so a buttons sub-query never breaks form generation.

### 5b. Backend — submit/extra-params path
- `shared/src/engines/ExpressionEngineServer.ts` — server-only wrapper over the existing
  `ExpressionEngine` (hand-written AST evaluator, **no eval**). Adds op budget, 50 ms
  ceiling, length cap.
- `backend/src/services/ExtraParamsAssemblyService.ts` — resolves a FinalSubmit button's
  `ExtraParamSpec[]` server-side: `static` verbatim, `hiddenField` from `formData`,
  `runtimeContext` **stamped authoritatively** (client values discarded), `computed` via
  the bounded engine. Enforces count caps (50 total / 25 computed) and a 64 KB size cap.
  Computed errors substitute `null` and DO NOT reject (FR-042).
- `backend/src/routes/forms.routes.ts` — `submit` accepts optional `submitButtonId`;
  the backend reads the button spec from the **published** form (ADR-BTN-005) and resolves
  fail-fast (400 invalid / 422 oversized). *Persisting* the resolved envelope is gate G-2.

### 5c. Portal (frontend)
- `frontend/src/components/forms/ScopedButtonBar.tsx` — renders a placement's buttons
  (Fluent v9, confirmation dialog). Mounted in `TabRenderer` (below sections) and
  `SectionRenderer` (below the field grid, full width).
- `frontend/src/components/forms/useScopedButtonAction.ts` — dispatch hook: navigate
  (tab / section-scroll / next / previous — skips invisible tabs per BR-001, blocks a
  `requiresPreviousTabComplete` target per BR-002), finalSubmit (`submitForm(buttonId)`),
  saveDraft. Gated actions log + no-op.
- `frontend/src/components/forms/scopedButtonNavigation.ts` — pure tab-index resolver +
  `arePrecedingTabsComplete` (unit-tested).
- `formApi.submit` + `FormContext.submitForm` thread `submitButtonId`.

### 5d. Mobile (React Native)
- `mobile/src/components/ScopedButtonBar.tsx` — RN renderer (native `Alert` confirmation).
- `mobile/src/components/FormRenderer.tsx` — `dispatchScopedButton`: navigate
  (tab/next/previous — bounded; the **mobile `TabDefinition` has no isVisible/
  requiresPreviousTabComplete**, so BR-001/BR-002 don't apply), finalSubmit, saveDraft.
  Section scroll is gate G-3.
- `submitButtonId` threaded through `FormService.submitForm` (online POST + offline queue)
  and the `app/forms/[id].tsx` screen.

### 5e. On-prem CRM runtime (C#)
- `crm-plugins/.../Core/Generation/FormJsonGenerator.cs` — `BuildScopedButtons` embeds
  buttons into tabs/sections in the generated cache JSON; `BuildScopedButtonAction` parses
  the JSON memo into a `JObject` and forces `type`. Omits empty `buttons` (byte-identical
  cache for button-less forms).
- `crm-plugins/.../Data/CrmMetadataReader.cs` — `FetchScopedButtons` retrieves the entity
  (degrades to empty if unprovisioned).
- `crm-plugins/.../Core/Models/FormDefinitionModel.cs` — `ScopedButton` C# model +
  `buttons?` on Tab/Section.
- Build/test: `dotnet build Qdb.FormEngine.sln` / `dotnet test` (net48).

### 5f. Designer (authoring / write path)
- `designer/src/services/ScopedButtonDesignService.ts` — immediate CRUD against the live
  entity via the WebApi adapter (create binds the form-definition + tab/section lookups
  using the schema-cased nav props `qdb_Form_Definition_Id` / `qdb_Tab_Id` / `qdb_Section_Id`).
- `designer/src/designer/properties/panels/ScopedButtonsPanel.tsx` — list/add/edit/delete;
  mounted as a "Buttons" accordion in `TabProperties.tsx` and `SectionProperties.tsx`.
  v1 offers Next/Previous step, Final submit, Save draft; gated actions are not offered.
- Constants: `designer/src/constants/buttonAttributeNames.ts`,
  `designer/src/constants/entityNames.ts` (`FORM_SCOPED_BUTTON`).

---

## 6. Security model

| Requirement | Mechanism |
|---|---|
| **C-004** context spoofing | `runtimeContext` keys stamped from server context only; client values discarded. Unit-proven (`runtimeContext_cannot_be_spoofed_by_client_formData`). |
| **C-005** expression sandbox | Hand-written AST evaluator, **no eval/Function**; op budget + 50 ms + length cap; computed errors → null. |
| **C-007** size/DoS | 64 KB envelope cap (enforced after expansion → 422) + count caps (50 total / 25 computed). |
| **C-001 / G-1** SSRF + open-redirect | In v1 there is **no live surface** — no CallApi route, no external-URL resolution; the client never sends a URL (only a key). Design: keys resolve server-side against an IT-managed `qdb_api_endpoint` allowlist when G-1 ships. |
| **C-006** cross-surface drift | ts-morph-free CI parity check across both shared type files. |
| ADR-BTN-005 trust model | Submit-time spec is read from the **published** form, not the client body. |

Phase 6 audit verdict: PASS, LOW risk. Open audit follow-ups: SEC-02 (null-prototype
expression context), SEC-03 (trimmed error logging); GOVGAP-01/02 are gated to G-1/G-2.

---

## 7. Tests

| Surface | Command | Coverage |
|---|---|---|
| backend | `cd backend && npx vitest run` | ExtraParamsAssemblyService, ButtonAssembler, ExpressionEngineServer, forms.routes.submit (254 total) |
| frontend | `cd frontend && npx vitest run` | scopedButtonNavigation, useScopedButtonAction (185 total) |
| on-prem | `cd crm-plugins/Qdb.FormEngine && dotnet test` | FormJsonGenerator scoped-button cases (29 total) |
| shared parity | `cd shared && npm run check:types-sync` | C-006 drift gate |

---

## 8. Gated / not-yet-built (by design)

| Gate | Blocks | Needs |
|---|---|---|
| **G-1** | CallApi + Navigate:ExternalURL | QDB IT Director sign-off + `qdb_api_endpoint` registry + IT-only security role |
| **G-2** | ExtraParams **persistence** (audit log column) | OQ-008 on-prem memo measurement; append-only + PII/residency review |
| **G-3** | Mobile Navigate:Section | RN scroll-to-section confirmation |

In code, gated actions render but **log + no-op** (frontend/mobile dispatch); there is no
backend route for CallApi. Designer does not offer gated action types.

Other follow-ups: full **ExtraParams config UI** for FinalSubmit buttons (the panel
currently writes an empty envelope); navigate **tab/section target pickers**; the BR-002
**validation-summary UI** (blocking is implemented; the summary display needs a FormContext hook).

---

## 9. Running & testing locally

Services & ports: designer `:5173`, designer Dataverse proxy `:3001`, **portal `:3000`**,
**backend `:4000`**.

### Authoring (designer)
```
cd designer && npm run dev:proxy           # :3001 Dataverse proxy
cd designer && npm run dev -- --host 0.0.0.0 --strictPort   # :5173
```
Open `http://127.0.0.1:5173` → a form → select a Tab/Section → **▸ Buttons** accordion.

### Rendering + navigation (portal) — requires the backend
The backend can't run via raw `tsx` (see Gotchas). **Bundle it with esbuild** and run:
```
cd backend
npx esbuild src/index.ts --bundle --platform=node --format=esm \
  --outfile=dist/server.mjs --alias:@qdb/shared=../shared/src/server.ts --packages=external
USE_RENDER_CACHE=false node --env-file=.env dist/server.mjs    # :4000, live metadata
```
`USE_RENDER_CACHE=false` serves **live** Dataverse metadata (so freshly-seeded buttons
appear without re-publishing; with the cache on you must re-publish the form).
```
cd frontend && npm run dev -- --host 0.0.0.0 --strictPort      # :3000, proxies /api → :4000
```
Open `http://127.0.0.1:3000` (use `127.0.0.1`, not `localhost`).

### Seeding test data
```
node --env-file=scripts/.env scripts/seed-test-buttons.mjs     # wizard buttons on 'loan-application'
```

---

## 10. Extending the feature

**Add a navigation target:** add to `NavigationTargetType` (BOTH shared files) → handle in
`useScopedButtonAction` (portal) + `FormRenderer.dispatchScopedButton` (mobile) + the
designer panel's type list. Update `ButtonAssembler.isValidActionConfig` validation.

**Add an ExtraParam source:** add to `ExtraParamSource` (both files) → handle in
`ExtraParamsAssemblyService.resolveOne`. If it's security-sensitive, stamp it server-side.

**Add an action type:** extend `ScopedButtonActionType` + the `ScopedButtonAction` union
(both files) → backend `ButtonAssembler` validation → each renderer's dispatch → designer
panel. Run the parity check.

Always: edit **both** shared type files, run `npm run check:types-sync`, and add tests.

---

## 11. Gotchas (hard-won)

1. **Dual shared type files** — `form.types.ts` (server) and `form.ts` (mobile) diverge on
   *existing* member names (`id`/`tabId`, `label`/`displayLabel`) but new BTN-001 types must
   be identical. The CI parity check guards only the new types.
2. **`@qdb/shared` resolution is per-consumer.** Frontend/designer alias it to
   `server.ts` in their Vite configs; vitest aliases it; backend uses tsconfig `paths`.
   The package `"main"` is the *mobile* barrel (`index.ts`). If a value import (e.g.
   `calculateContrastRatio`, `ExpressionEngineServer`) resolves to `index.ts`, it throws a
   module-graph error. The **designer blank-page bug** was a missing alias in
   `designer/vite.config.ts` — fixed by aliasing to `server.ts`.
3. **Backend can't run via raw `tsx`** against the source shared package (CJS/ESM + named
   exports). **Bundle with esbuild** (§9). Do not add `"type":"module"` to shared — it
   cascades into requiring `.js` extensions across all of shared and breaks NodeNext
   typechecks.
4. **IPv4/IPv6** — Vite may bind `[::1]` only; use `--host 0.0.0.0` and open via
   `127.0.0.1`, not `localhost`.
5. **Render cache** — `USE_RENDER_CACHE=true` serves the published cache; seeded/edited
   buttons won't appear until re-publish. Use live metadata for quick testing.
6. **On-prem `qdb_is_active`** — the read queries filter `qdb_is_active eq true`; ensure the
   attribute exists (it was initially omitted from the provisioning script and backfilled).

---

## 12. File map (quick reference)

```
shared/src/types/{form.types.ts, form.ts}            # ScopedButton + ExtraParams types (both!)
shared/src/engines/ExpressionEngine{,Server}.ts      # sandboxed computed-param engine
shared/scripts/check-shared-type-sync.mjs            # C-006 parity gate
backend/src/services/ButtonAssembler.ts              # read-path mapper
backend/src/services/ExtraParamsAssemblyService.ts   # submit-time resolution (C-004/5/7)
backend/src/services/CrmMetadataService.ts           # fetchScopedButtons + embed
backend/src/routes/forms.routes.ts                   # submit wiring (submitButtonId)
frontend/src/components/forms/{ScopedButtonBar,useScopedButtonAction,scopedButtonNavigation}.*
mobile/src/components/{ScopedButtonBar,FormRenderer,scopedButtonNavigation}.*
crm-plugins/Qdb.FormEngine/.../Generation/FormJsonGenerator.cs   # on-prem embed
designer/src/services/ScopedButtonDesignService.ts   # designer CRUD
designer/src/designer/properties/panels/ScopedButtonsPanel.tsx   # authoring UI
scripts/provision-button-schema.mjs                  # Dataverse schema
scripts/seed-test-buttons.mjs                        # test data
```

---

## Appendix A — Authoring `qdb_action_config_json` directly

When creating/editing a `qdb_form_scoped_button` record by hand (maker portal / API), the
`qdb_action_config_json` (Memo) field holds a **JSON object whose shape MUST match
`qdb_action_type`**. The read path validates it; a malformed config or a missing required
field for the action type causes the button to be **silently dropped** (it won't render).

The `type` discriminator is auto-set by the reader from `qdb_action_type`, so you do **not**
need to include `"type"` in the JSON (`qdb_action_type` is the source of truth).

### `qdb_action_type = 'navigate'`
Must contain `target`, plus a required field for some targets:

| `target` | required field | example `qdb_action_config_json` |
|---|---|---|
| `nextStep` | — | `{"target":"nextStep"}` |
| `previousStep` | — | `{"target":"previousStep"}` |
| `tab` | `targetTabId` (a `qdb_form_tab` GUID) | `{"target":"tab","targetTabId":"<guid>"}` |
| `section` | `targetSectionId` (a `qdb_form_section` GUID) | `{"target":"section","targetSectionId":"<guid>"}` |
| `externalUrl` ⚠️ G-1 | `externalUrlKey` | `{"target":"externalUrl","externalUrlKey":"<key>"}` |
| `anotherForm` ⚠️ G-1/router | `targetFormCode` | `{"target":"anotherForm","targetFormCode":"buy-house"}` |

Optional on any navigate: `"requiresPreviousTabsComplete": true`,
`"unsavedDataPolicy": "warn" | "discard" | "block"`.

### `qdb_action_type = 'finalSubmit'`
Must contain an `extraParams` **array** (may be empty `[]`). Each entry: `key` + `source`
(+ the source's value field).

```json
{"extraParams":[
  {"key":"channel","source":"static","staticValue":"portal"},
  {"key":"amount","source":"hiddenField","fieldSchemaName":"qdb_amount"},
  {"key":"submittedBy","source":"runtimeContext","contextKey":"userId"},
  {"key":"fullName","source":"computed","expression":"concat({firstName},' ',{lastName})"}
]}
```
`source` → required field: `static`→`staticValue`, `hiddenField`→`fieldSchemaName`,
`runtimeContext`→`contextKey` (one of the `RuntimeContextKey`s), `computed`→`expression`
(safe DSL, evaluated server-side). Limits: ≤50 params, ≤25 computed, 64 KB resolved.

### `qdb_action_type = 'saveDraft'`
No config required — use `{}`.

### `qdb_action_type = 'callApi'` ⚠️ gated (G-1)
`{"endpointKey":"<key>","method":"GET"|"POST"}` — validated but **no-ops** (no backend
route, no rendering action) until G-1 ships. Do not use yet.

### Validation rules (read path — `ButtonAssembler.isValidActionConfig`)
- JSON must parse and be an object.
- `navigate` → `target` must be one of the six; `tab`/`section`/`externalUrl`/`anotherForm`
  require their respective non-empty field.
- `finalSubmit` → `extraParams` must be an array.
- `callApi` → `endpointKey` (non-empty) + `method` in {`GET`,`POST`}.
- Any failure → the button is dropped (not rendered) and logged.

> ⚠️ targets/actions = render but **no-op** in the runtime until their gate clears
> (externalUrl/callApi → G-1; anotherForm → portal router; mobile section scroll → G-3).
> The **designer Buttons panel** writes valid config automatically for Next/Previous step,
> Final submit, and Save draft — hand-edit this field only for `tab`/`section` targets or
> custom extra-params.
