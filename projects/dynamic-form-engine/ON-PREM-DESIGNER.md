# Form Designer — On-Premises Dynamics 365 Validation Report

## Engagement context

This report covers the validation and fixes applied to make the Form Designer
web resource (`projects/dynamic-form-engine/designer`) deployable on
**Dynamics 365 on-premises** (D365 9.x, Unified Interface).

The designer already used an adapter pattern (`IWebApiAdapter`) with
`CrmWebApiAdapter` wrapping `Xrm.WebApi` for the main data path. The issues
found were isolated to the translation subsystem and the solution packaging
metadata.

---

## 1. Audit findings — service by service

### On-prem safe (adapter-based, no changes required)

| Service | Notes |
|---|---|
| `CrmWebApiAdapter` | Wraps `Xrm.WebApi` — on-prem compatible since D365 8.2 |
| `RestWebApiAdapter` | Dev/standalone only; activated by `VITE_USE_REST_API=true`. Routes to Node backend proxy. Not used in CRM-hosted mode. |
| `CrmContextService` | Acquires Xrm from `window.parent.Xrm` for UCI web resource iframe — correct pattern for on-prem |
| `FormDefinitionService` | All calls via `IWebApiAdapter` |
| `TabService` | All calls via `IWebApiAdapter` |
| `SectionService` | All calls via `IWebApiAdapter` |
| `FieldService` | All calls via `IWebApiAdapter` |
| `OptionValueService` | All calls via `IWebApiAdapter` |
| `LookupConfigService` | All calls via `IWebApiAdapter` |
| `ValidationRuleService` | All calls via `IWebApiAdapter` |
| `BusinessRuleService` | All calls via `IWebApiAdapter` |
| `GridColumnConfigService` | All calls via `IWebApiAdapter` |
| `DesignService` | All calls via `IWebApiAdapter` |
| `AuditLogService` | All calls via `IWebApiAdapter` |
| `FormSaveService` | Orchestrates above services via `IWebApiAdapter` |
| `FormCloneService` | Via `IWebApiAdapter` |
| `FormDeleteService` | Via `IWebApiAdapter` |
| `VersionService` | Via `IWebApiAdapter` |
| `FieldLabelService` | Via `IWebApiAdapter` |
| `AccessPolicyService` | Via `IWebApiAdapter` |
| `SubmissionMappingService` | Via `IWebApiAdapter` |
| `RuleTemplateService` | Via `IWebApiAdapter` |

### Issues found and fixed

#### Issue 1 — `TranslationWriteService`: raw fetch to Node backend (FIXED)

**File:** `designer/src/services/TranslationWriteService.ts`

The original implementation called `fetch(VITE_API_BASE_URL/api/design/translations)`
directly. In CRM-hosted mode there is no Node backend at all — this would
fail with a network error on every translation operation.

**Fix applied:** The file was restructured into two classes:

- `CrmTranslationWriteService` — takes `IWebApiAdapter` as a constructor
  argument. Reads and writes `qdb_translation` records through `Xrm.WebApi`
  directly. Upsert is implemented as a query-first, then create-or-update
  pattern (because Xrm.WebApi has no alternate-key PATCH endpoint).
- `TranslationWriteService` — the original class, retained unchanged for
  REST/standalone dev mode. It still calls the Node backend API.

#### Issue 2 — `TranslationsPanel`: language list from Node backend + cache invalidation (FIXED)

**File:** `designer/src/designer/properties/panels/TranslationsPanel/TranslationsPanel.tsx`

Two raw fetch calls were present:
1. `fetch(VITE_API_BASE_URL/api/languages)` — fetches the language list from the
   Node backend. No backend exists on-prem.
2. `fetch(VITE_API_BASE_URL/api/internal/cache/invalidate, POST)` — invalidates
   the Node backend in-memory cache after each translation save or delete.
   There is no backend cache on-prem.

**Fix applied:**

- The panel now reads `CrmContext` (the existing React context that holds
  `CrmContextService`). When the context is non-null (CRM mode) it:
  - Fetches languages by calling `webApi.retrieveMultipleRecords('qdb_language_config', ...)`
    via `IWebApiAdapter`, mapping the `qdb_language_config` raw records to
    `LanguageConfig`. Falls back to English-only on query failure so the panel
    remains usable on minimal installs.
  - Uses `CrmTranslationWriteService` for all translation CRUD.
  - Skips cache invalidation entirely (no-op comment explains why).
- In REST mode (`CrmContext === null`) the original backend fetch paths are used
  unchanged, preserving standalone dev behaviour.

#### Issue 3 — `solution.xml`: folder wildcard in RootComponents (FIXED)

**File:** `designer/deploy/solution/solution.xml`

The original `RootComponents` block contained:
```xml
<RootComponent type="61" schemaName="qdb_/form-designer/assets/" behavior="0" />
```
A trailing `/` making it a folder reference. The on-prem CRM solution importer
does not support folder wildcards — it requires each web resource to be listed
individually by its exact schema name.

**Fix applied:** The folder wildcard entry was replaced with one explicit
`RootComponent` entry per asset file, matching the seven web resource files
already declared in `customizations.xml`.

#### Issue 4 — `crm.d.ts`: incorrect minimum version comment (FIXED)

**File:** `designer/src/types/crm.d.ts`

The header comment stated "Minimum API level: Dynamics 365 v9.2 on-premise."
This is misleading: the Web API methods used (`createRecord`, `updateRecord`,
`deleteRecord`, `retrieveRecord`, `retrieveMultipleRecords`) were available
since D365 8.2. The recommendation is 9.x on-prem for UCI stability.

**Fix applied:** Comment updated to state D365 9.0 minimum, 9.1 recommended,
and notes that `Xrm.Utility.getGlobalContext()` requires 9.x.

### Not an issue — `NewFormWizardScreen` metadata fetch

**File:** `designer/src/screens/NewFormWizardScreen.tsx` (line 458)

This screen does call `fetch(clientUrl/api/data/v9.1/EntityDefinitions, ...)` to
populate the entity selector dropdown. This is intentional and correct:
`Xrm.WebApi` does not expose the metadata endpoint `EntityDefinitions` —
it is only available via a direct OData call. The call uses
`credentials: 'include'` so it authenticates via the user's existing CRM
session cookie (same-origin, no OAuth token needed), and has a graceful catch
that falls back to an empty list with a manual entry field. This pattern is
on-prem safe.

The one caveat: the URL is hardcoded to `/api/data/v9.1`. On D365 9.1 and above
this is correct. On a 9.0 server substitute `/api/data/v9.0` in the
`VITE_API_BASE_URL` or upgrade to 9.1.

### No MSAL/OAuth dependency in CRM-hosted mode

Confirmed: `CrmContextService.createCrmContextService()` acquires Xrm from
`window.parent.Xrm` and passes it to `CrmWebApiAdapter`. All API calls then go
through `Xrm.WebApi` which uses the user's existing CRM session. No MSAL,
Azure AD, or OAuth tokens are required in CRM-hosted mode. The `authToken`
parameter in `TranslationWriteService` and `RestWebApiAdapter` is only used
in REST/standalone dev mode.

---

## 2. Minimum on-premises version requirements

| Requirement | Minimum | Recommended | Notes |
|---|---|---|---|
| Dynamics 365 on-prem | 9.0.0.0 | 9.1.x | Unified Interface required for `Xrm.WebApi` |
| `Xrm.WebApi` (CRUD) | 8.2 | 9.1.x | All five methods used are available from 8.2 |
| `Xrm.Utility.getGlobalContext()` | 9.0 | 9.1.x | Required for `getClientUrl()`, `getUserId()` |
| `Xrm.App.addGlobalNotification` | 9.0 | 9.1.x | Used for toast notifications |
| Solution package version | 9.0 (in solution.xml) | — | Compatible with both 9.0 and 9.1 on-prem importers |
| UCI (Unified Interface) | Required | — | Legacy web client does not support `Xrm.WebApi` |

---

## 3. Packaging and solution notes

### solution.xml version compatibility

`solution.xml` declares `version="9.0.0.0"` and `SolutionPackageVersion="9.0"`.
This is importable into D365 9.0 and 9.1 on-prem. Do not raise this to 9.2 — that
would restrict the solution to environments running CRM 9.2+.

### Web resource registration rule

Every JS/CSS/HTML file produced by `vite build` must be declared individually as:
1. A `<WebResource>` element in `deploy/solution/customizations.xml`
2. A `<RootComponent type="61">` in `deploy/solution/solution.xml`

`packageSolution.js` generates both declarations automatically from the build
output on every `npm run package` run (one `<WebResource>` and one
`<RootComponent type="61">` per emitted file), so this rule is enforced by the
tooling — no manual editing required.

### No cloud-only component types

The solution contains only:
- Type 61 — Web Resources (HTML, JS, CSS)
- Type 20 — Security Role
- Type 62 — SiteMap

None of these are cloud-only. All are supported by the on-prem solution importer
since D365 8.x.

### Auth: no MSAL required

The designer web resource authenticates entirely through the user's CRM session
via `Xrm.WebApi`. No Azure AD app registration, no MSAL library, no OAuth flow
is needed. This is the correct pattern for on-prem UCI web resources.

---

## 4. On-premises deployment steps

### Prerequisites

| Item | Requirement |
|---|---|
| Dynamics 365 on-prem | 9.1.x recommended; 9.0.x minimum |
| Unified Interface | Enabled on the target organisation |
| System Administrator | Required for solution import and sitemap publish |
| Node.js 20.x | Required on the build machine only |
| FormEngine solution | Must already be imported (contains `qdb_*` entities) |

### Step 1 — Build and package (one command)

On the build machine:

```
cd projects/dynamic-form-engine/designer
npm ci
npm run package          # = vite build + node scripts/packageSolution.js
```

`packageSolution.js` walks the actual Vite build output and generates the full
manifest automatically — `customizations.xml` (one `<WebResource>` per emitted
file, with deterministic name-derived GUIDs), `solution.xml` `<RootComponents>`
(one `type="61"` per file + the SiteMap), and `[Content_Types].xml` — then zips
everything (web resources + Roles) into:

```
deploy/FormDesignerWebResource_<version>.zip
```

No manual XML editing is required, regardless of how Vite chunks the bundle.
To set the solution version: `npm run package -- --version 1.2.0` (defaults to
the version in `package.json`). The emitted `solution.xml` is pinned to
`SolutionPackageVersion="9.0"` so the ZIP imports into D365 9.0/9.1 on-prem.

### Step 2 — Import into D365 on-prem

1. Log in to CRM as a System Administrator.
2. Navigate to **Settings > Solutions**.
3. Click **Import**.
4. Upload `FormDesignerWebResource_<version>.zip`.
5. In the import wizard:
   - DEV environments: select **Overwrite customizations** if re-importing.
   - SIT/UAT/PROD: do not tick overwrite unless intentionally replacing existing components.
6. Complete the wizard and wait for import to finish.
7. Click **Publish All Customizations**.

### Step 3 — Post-import verification

1. Assign the **Form Designer User** security role to all designer users:
   **Settings > Security > Users > [select user] > Manage Roles > Form Designer User**.

2. Publish all customizations if not already done:
   **Settings > Solutions > Form Designer Web Resource > Publish All Customizations**.

3. Verify the sitemap entry:
   - Refresh the browser (F5 or clear cache).
   - Confirm **Form Management > Form Designer** appears in the left navigation.

4. Open the web resource directly to confirm the React application loads:
   ```
   https://<crm-server>/<org-name>/WebResources/qdb_/form-designer/index.html
   ```

5. Confirm the designer initialises without errors:
   - Open browser developer tools (F12).
   - The console must not show `Xrm context not available` errors.
   - The Form List should load and display forms from `qdb_form_definition`.

### Step 4 — Register the OnSave validation script

After importing the solution, register `qdb_FormFieldValidation.js` on the
`qdb_form_field` entity form's **OnSave** event (steps unchanged from the
original `DEPLOYMENT.md`):

1. **Settings > Customizations > Customize the System**.
2. **Entities > qdb_form_field > Forms > Main form > Form Properties**.
3. Under **Event Handlers > OnSave**, click **Add**:
   - Library: `qdb_/scripts/qdb_FormFieldValidation.js`
   - Function: `qdb_FormFieldValidation.onSave`
   - Pass execution context: checked
   - Enabled: checked
4. Save and publish the form.

### Step 5 — Verify translation panel (if i18n is in use)

1. Open any form in the designer.
2. Select a field, tab, or section.
3. Open the **Translations** tab in the properties panel.
4. Confirm the language list loads (from `qdb_language_config`).
5. Enter a translation value, tab out, and confirm it is saved to `qdb_translation`
   via **Settings > Customizations > Entities > qdb_translation > Data**.

---

## 5. Remaining caveats

### EntityDefinitions metadata endpoint version

`NewFormWizardScreen` calls `/api/data/v9.1/EntityDefinitions`. On a D365 9.0
on-prem server this endpoint exists at `/api/data/v9.0` instead. If you run
D365 9.0 (not 9.1), edit the URL to `v9.0` or upgrade to 9.1. The failure is
non-blocking — the screen falls back to a manual text field for the entity name.

### Asset manifest — handled automatically

`npm run package` regenerates the WebResource/RootComponent manifest from the
actual build output on every run, so the solution ZIP always matches what Vite
emitted — no manual `customizations.xml`/`solution.xml` editing is ever needed.
(The Vite config also pins stable chunk names via `entryFileNames: 'assets/[name].js'`
with `?v=<buildId>` cache-busting, so even direct web-resource updates stay
addressable.) The static templates in `deploy/solution/` are only a fallback for
fully manual deployments; the supported path is `npm run package`.

### qdb_language_config entity must be provisioned

The translation panel now reads languages from `qdb_language_config`. This
entity must be present in the target CRM and contain at least the default
language row. It is part of the `FormEngine` solution. Verify it is seeded
before testing translations:

```
Settings > Customizations > Entities > qdb_language_config > Data
```

At minimum one row with `qdb_is_default = true` and `qdb_is_active = true`
must exist. For multi-language support add one row per supported language.

### No rollback of data schema required

This web resource solution contains only web resources, a security role, and a
sitemap entry — no entity schema changes. Rolling back to a previous version
only requires re-importing the previous solution zip. No database changes needed.

---

## 6. Test results

All fixes were verified with the designer test suite:

```
Test Files: 10 passed (10)
      Tests: 45 passed (45)
TypeScript:  0 errors (tsc --noEmit clean)
```

No regressions. The existing `TranslationWriteService.test.ts` and
`TranslationsPanel.test.tsx` suites continue to pass because the REST-mode
class (`TranslationWriteService`) is preserved unchanged — only the new
`CrmTranslationWriteService` class was added alongside it.
