# Customer Survey Engine — Technical Assessment: Reusing the Dynamic Form Engine

| | |
|---|---|
| Client | Qatar Development Bank (QDB) |
| Date | 2026-10-11 |
| Status | **Analysis only — awaiting approval. Nothing built.** |
| Source inspected | `projects/dynamic-form-engine`, branch `feat/dfe-apival-camera` @ `dda1eae8` |
| Method | Read-only code inspection (four parallel inspections with file:line evidence; the most surprising finding re-checked by hand). No builds, scripts, deploys or org changes. |
| Resume keyword | `RESUME-SURVEY-ENGINE` |

## Executive summary

**Recommendation: Option B.** Build a separate Survey module on the existing Form Engine core. Changes to the core are additive only (new things added, nothing existing changed). Everything survey-specific goes in its own tables and its own CRM solution.

The decisive finding is this: **the hardest half of a survey engine is not the designer or the renderer.** It is public access, invitations, response storage, scoring and analytics. The Form Engine has none of that. SurveyJS or Form.io would not supply it either. They would replace the one layer QDB already owns, which is the designer and renderer, and leave all the expensive work still to do.

The headline numbers:

- **Weighted scores:** B 85, A 78, C (SurveyJS) 70, D (Form.io) 57.
- **Reuse:** about 40–45% of the whole survey engine, and about 75% of the designer and renderer. Confidence is medium.
- **Effort:** about 145–210 dev-days, in 8 phases. Phase 0 stabilises the Form Engine first.

---

## Deliverable 1: what the Form Engine already has

Status key:

| Mark | Meaning |
|---|---|
| ✅ | Works, with tests |
| ⚠️ | Partial |
| 🔴 | Defect |
| ❌ | Not implemented |

### 1.1 Form Designer

`designer/src` has 174 files and about 28k lines. There are 77 test files with about 637 cases. The stack is React 18, Fluent UI v9, zustand with immer, @dnd-kit, zod and exceljs.

| Capability | Status | Evidence |
|---|---|---|
| Hierarchy: form → tab (can display as wizard steps) → section (1–3 columns) → field (`columnSpan` 1–3) | ✅ | `qdb_form_definition/tab/section/field`. Tabs become steps when `formDesign.tabStyle='Stepper'` (`screens/style/FormStylePanel.tsx:68`, `frontend/.../DynamicFormRenderer.tsx:423,600`). |
| Drag and drop | ⚠️ | Wired at `DesignerScreen.tsx:526`, handled in `handleDragEnd` at `:309-464`. Fields and tabs can be dragged and reordered, and fields can move between sections. Sections can only be reordered by keyboard (Alt+Arrow), because `handleDragEnd` has no section branch even though `SectionContainer.tsx:80` makes them sortable. The layout items Spacer, Divider, Info Text and Header Text (`fieldTypes.ts:29-32`) are created as empty 2-column sections, and the runtime cannot render them. There are no tests for dropping with the mouse. |
| Field types | ✅ 23 types | `constants/fieldTypes.ts`. Picklist codes are in `formAttributeNames.ts:245-271`, the plugin mapping in `PicklistMapper.cs:11-40`, and the runtime switch in `FieldRenderer.tsx:243-320`. |
| Property editors | ⚠️ | `FieldProperties.tsx` has General, Config, Validation and Advanced tabs, with 14 type-specific panels. Several properties are not saved (see 1.4). |
| Business rules (show/hide field, section, tab; required; set or calculate a value; disable options; grid-column actions) | ✅ | `RuleConfigScreen.tsx:169-187`. Rules are stored in `qdb_form_business_rule.qdb_conditions_json`. Tests: `BusinessRuleService*.test.ts`. There is no "go to page" action. |
| Validation authoring | ⚠️ | `ValidationRulesPanel.tsx:36-48` offers 10 rule types. Email, phone and date before/after have codes but are not offered. New fields lose structured rules on first save (see 1.4). |
| Templates | ❌ | `NewFormWizardScreen` has 5 steps and no templates. |
| Clone | ⚠️ | `FormCloneService` is shallow. It skips business rules, design, grid columns, translations, submission mappings, tab flags and structured rule JSON. It has no tests. |
| Preview | ⚠️ | Structure only. `PreviewScreen.tsx:518` says business rules and validation are not evaluated. "Open form" launches the real runtime instead. |
| Undo/redo | ⚠️ | 50 steps (`designerStore.ts:42-52,819-859`). The tooltips mention Ctrl+Z / Ctrl+Y, but there is no keyboard listener. Theme and validation-panel edits are not covered. |
| Versioning | ⚠️ | Publishing writes a whole-store snapshot to `qdb_form_version.qdb_metadata_snapshot_json` (`VersionService.ts:19-40`). Config tables are edited in place. "Restore as Draft" may not re-create rows deleted since that version (assumption). `VersionService` has no tests. |
| Publishing | ✅ | `PublishValidationScreen` runs checks PV-001 to PV-013. It then calls `qdb_PublishForm` via `PublishService.ts:82-109`, which creates a `qdb_publish_job`. The C# `PublishOrchestrator` writes `qdb_form_render_cache`. |
| Multilingual / RTL content | ✅ | Stored in `qdb_translation` and `qdb_language_config` (which has `qdb_rtl_direction`). There is an Excel round trip (`TranslationExchangeDialog`, with a dry-run import), and the render cache is built per language. The designer's own screens are English-only. |
| Custom components | ❌ | `ComponentRegistry` exists, but nothing calls `register`. `componentKey` is never saved. Adding a new question type touches about 5 places. |

### 1.2 Form Renderer / runtime

`frontend/` is a Vite + React 18 SPA using Fluent UI v9. It is not Next.js. It is built two ways: as a portal app, and as `qdb_form_runtime.html`, a single 2 MB CRM web resource built by `vite.config.webresource.ts`. That second build swaps in Xrm adapters for the data layer. There are 76 unit test files and 5 Playwright e2e specs.

| Capability | Status | Evidence |
|---|---|---|
| Rendering from published JSON | ✅ | The in-CRM runtime calls `qdb_GetPublishedFormJson` (`webresource/xrm/formApi.ts:27-35`). The portal reads the render cache when `USE_RENDER_CACHE=true`. The published form has no document-level `schemaVersion`. |
| Field rendering | ✅ | A `switch` in `FieldRenderer.tsx:240-322`, not a registry. Tests cover Rating, NumberBar, Dropdown, TextInput, Boolean, FileUpload and the grids. |
| Conditional questions | ✅ (web) | json-rules-engine plus `shared/src/engines/ExpressionEngine.ts`, a sandboxed parser that uses no `eval`. Rules re-run 150 ms after each change (`FormContext.tsx:245-306`). There are about 449 rule-related tests across 47 files. |
| Page navigation and branching | ⚠️ | Four display styles: Tabs, Stepper, Sidebar and Accordion. Hidden tabs are skipped. There is a system-generated summary step. "Next" does not validate the current tab. There are two suspected index bugs (below). |
| State management | ✅ | A custom React Context (`FormContext.tsx`). `react-hook-form` and `zustand` are declared but not used on the web. |
| Validation | ✅ client side | `ValidationEngine.ts` handles 14 rule types and only runs on submit. API validation uses handlers the host page registers. A custom expression that fails to evaluate passes; this is not tested. |
| Rule-driven required at Submit | 🔴 | `validateField` (`ValidationEngine.ts:76-82`) reads only `field.isRequired`. A field made required by a rule can be submitted empty, and `makeOptional` cannot relax a published required field. |
| Conditional Required rule type (100000013) | 🔴 | The option is missing on the org. Both publishers (`PicklistMapper.cs:150-170`, `CrmMetadataService.ts:1244-1253`) map it to plain `required`, so the field becomes always required. |
| Wrong tab focused after a failed submit | 🔴 suspected | `findFirstErrorTabIndex` (`FormContext.tsx:585-600`) counts hidden tabs, but `activeTabIndex` counts only visible ones. `useScopedButtonAction.ts:60,98-120` has the same mismatch. |
| RTL / Arabic | ✅ | `DirectionProvider.tsx` handles direction and Arabic fonts. The renderer's own labels ("Back", "Next", "Submit", "Review & Submit", "Edit Responses") are hard-coded English. |
| Responsive layout | ⚠️ | Sections collapse to one column below 600 px. `useBreakpoint` is not used by any component, and the Sidebar layout has no mobile fallback. |
| Save a draft and resume it | ⚠️ | Saving works: `qdb_form_submission_draft` is keyed by the Azure AD `oid`, capped at 4,000 characters. There is no endpoint or UI to load a draft back. The in-CRM `saveDraft` throws. |
| Submission | ⚠️ | Always tied to a CRM entity. `CrmSubmissionService.ts:73` throws "No parent entity mapping configured" without one. Each field maps to an entity attribute; there is no store for answers as JSON. Submissions do not record the form version. |
| Anonymous access | ❌ | Every route except `/api/health` and `/api/languages` needs an Azure AD token (`index.ts:229`). |
| Captcha, rate limiting, duplicate prevention | ❌ | Rate limiting covers only related-record and lookup reads. |
| Server-side validation | ❌ | `/submit` trusts the client's validation. `/validate` checks required fields only, and nothing calls it. |
| Mobile rule engine | 🔴 likely inert | `shared/src/engines/RuleEngine.ts` expects a form-level rule shape that the back end doesn't emit. |
| Bundle size | ⚠️ | The web resource is 2.0 MB. The portal's `DynamicIcon` dynamically imports the full icon set, about 15 MB. |

### 1.3 CRM integration

**Tables.** There are about 40 `qdb_` tables, and the on-prem package (`FORM_ENGINE_unmanaged.zip`) ships 34 of them:

- **Core structure:** `qdb_form_definition`, `qdb_form_tab`, `qdb_form_section`, `qdb_form_field`, `qdb_form_option_value`
- **Rules:** `qdb_form_validation_rule`, `qdb_form_business_rule`, `qdb_rule_template`
- **Field and submission config:** `qdb_form_lookup_config`, `qdb_form_submission_mapping`, `qdb_grid_column_config`
- **Buttons:** `qdb_form_button`, `qdb_form_scoped_button`
- **Info cards:** `qdb_info_card_screen`, `qdb_info_card_section`, `qdb_info_card_item`, `qdb_info_card_view_record`
- **Design:** `qdb_theme`, `qdb_form_design`, `qdb_section_design`, `qdb_field_design`, `qdb_button_design`, `qdb_layout_grid`, `qdb_css_allowlist_config`
- **Translation:** `qdb_language_config`, `qdb_translation`, `qdb_fieldlabel`
- **Access:** `qdb_form_access_policy`
- **Publishing and versions:** `qdb_form_version`, `qdb_publish_job`, `qdb_form_render_cache`
- **Drafts, logs and audit:** `qdb_form_submission_draft`, `qdb_form_submission_log`, `qdb_form_audit_log`

`qdb_dfe_audit_log`, `qdb_dfe_edit_lock` and `qdb_lookupendpoint` are created by scripts and are not in the package. `crm-solution/` holds an older, unused schema with the `dfe` prefix.

**Plugins.** The assembly targets .NET 4.6.2, runs in the Sandbox and is ILRepack-merged.

| Message | What it does |
|---|---|
| `qdb_PublishForm` | Asynchronous. Writes the render cache. |
| `qdb_GetPublishedFormJson` | Synchronous and read-only. Returns the published JSON. |
| `TranslationChangePlugin` | Re-publishes a language when a translation changes. |
| `AuditImmutabilityPlugin` | Blocks updates and deletes on audit rows. |

**Render cache.** The JSON is gzip-compressed and Base64-encoded into a 1 MB memo column. A File column isn't used because File columns are unreliable on 9.1. There is one row per form, version and language. Superseded versions are kept, not deleted.

**Authentication.**
- The designer and the in-CRM runtime use `Xrm.WebApi` with the user's own CRM session.
- The Node back end (Express) uses an Entra service principal with a client secret, which has System Administrator rights.
- **The back end has no on-prem CRM path** (no NTLM, ADFS or IFD).

**Security roles.**
- "Form Designer User" is defined, with Basic depth on the configuration tables.
- `qdb_form_access_policy` is enforced only by the Node back end, and a form with no policies is open to everyone.
- The designer proxy (`designer-proxy.routes.ts`) gives create/read/update/delete on about 20 configuration tables to any signed-in user, with no role check.

**Logging.** The back end logs with pino and propagates a correlation id. It writes `qdb_form_audit_log`, but `CrmAuditService` sends the form id as a raw string to what is a lookup column and swallows the error, so these writes probably fail silently (inferred). There is no table for integration logs.

**On-prem risks.**
- The Web API path is hard-coded to `/api/data/v9.2` (`xrmClient.ts:37-41`, `CrmWebApiAdapter.ts:65,110`). Whether that resolves on a real CRM 9.1 server is **unverified**.
- The package is stamped `SolutionPackageVersion 9.2`.

**Survey-related work that already exists.**
- The only thing built is a star "Rating" display style for option-set fields (`qdb_radio_render_style` option 100000002).
- NPS, Matrix and analytics exist only as roadmap items: R-011 and R-015 in `docs/developer-feature-reference.md`, G-08 and G-10 in `assessment-detailed.md`.
- `github-research.md` rejected SurveyJS earlier because of licensing.
- There is no survey, invitation, SMS, email or analytics code.

### 1.4 Confirmed defect: the designer drops properties on Save

`FormSaveService.ts:181-229` (create) and `:307-353` (update) never pass the following properties to `FieldService`, even though `FieldService.ts:220-301` can write all of them:

- `radioRenderStyle` (the Rating style)
- `fileCaptureMode`
- `componentKey`
- `numberDisplayStyle`, `barMaxFieldSchemaName`, `barValueFieldSchemaName`
- `staticContent`, `sourceFieldSchemaName`
- `showDocumentView`, `showDocumentDownload`
- the info-card list properties
- the file download/upload settings

The designer shows these choices, and they are lost on Save. Earlier demos worked because seed scripts wrote the records directly.

Separately, a **new** field's structured validation rules lose everything except type, value and message on first save (`FormSaveService.ts:264-273`). That drops custom expressions, conditions, cross-field settings and API keys.

There is no test that saves these properties and reads them back. This matters directly for surveys, because Rating is exactly this kind of property.

---

## Deliverable 2: survey requirements gap matrix

Sizes are rough: S = small, M = medium, L = large.

| Survey capability | What exists today | Reuse as-is | Needs changes | New | Size |
|---|---|---|---|---|---|
| Single choice, dropdown, text, multiline, number, date, file upload | All exist | ✅ | | | — |
| Multiple choice as checkboxes | The renderer has `CheckboxGroupControl`; the designer cannot set `multiselectRenderStyle` | | Designer property | | S |
| Rating 1–5 / 1–10 | Display style only: N options = N stars, and the style is lost on save | | Fix the save; add scale settings | | S |
| NPS 0–10, CSAT, CES | Nothing. There is no score field on options. | | | ✅ Controls + `qdb_score` | M |
| Likert / matrix | Nothing. A CRM-bound entry grid could only imitate it. | | | ✅ | M–L |
| Ranking, slider | Nothing. dnd-kit is already a dependency. | | | ✅ | M |
| Mandatory / optional questions | `isRequired` works | ✅ | Fix the rule-required bug | | S |
| Conditional questions | Show/hide rules | ✅ | | | — |
| Branching / page skipping | Hide-tab rules | | Fix the index bugs; optional "go to page" action | | S–M |
| Arabic/English, RTL | Translation pipeline + RTL | ✅ | Translate renderer labels | | S |
| Preview | Structure only | | Use the real runtime in preview | | S |
| Templates, duplication | Shallow clone, no templates | | Deep clone + template flag | | M |
| Versioning, immutable published copy | Snapshots + render cache per version | | Fix each survey to one published version; record it on each response | | M |
| Lifecycle (draft → approval → publish → close → archive), dates, owner, product/service, response limit | `qdb_status` only | | | ✅ `qdb_survey` | M |
| Anonymous or identified surveys, public URL | None | | | ✅ Public gateway | L |
| Unique invitation links, customer tokens, expiry, duplicate prevention | None | | | ✅ | M |
| SMS and email invitations, reminders | None in the Form Engine | | | ✅ Reuse QDB's existing CRM channels | M |
| Survey sent automatically after a CRM business event | None | | | ✅ Plugin / process hook | M |
| Partial and completed responses, answers as JSON and as reportable rows, links to customer and record, timestamps | None. Submission needs a field-by-field mapping. | | | ✅ | M–L |
| Server-side validation | None. The engine runs in the browser only. | | Move ValidationEngine and RuleEngine into `shared` | | M |
| NPS / CSAT / CES scores, averages, response rates, question-level analysis | None | | | ✅ | M |
| Dashboards, Power BI, Excel export, trends, product and department comparisons | None | | | ✅ | M–L |
| Data privacy and access control on responses | Field-level CRM security only | | | ✅ Roles + PDPPL review | M |

---

## Deliverable 3: comparison of the four options

### 3.1 How reuse was measured

I estimated what each area of a survey engine would cost to build from scratch, then credited what the Form Engine already covers, judged against the evidence in Deliverable 1.

| Area | From scratch (dev-days) | Form Engine covers |
|---|---|---|
| Designer authoring | ~90 | ~80% |
| Renderer and logic | ~60 | ~70% |
| Survey question types | ~20 | ~10% |
| Lifecycle / management | ~20 | ~15% |
| Distribution | ~30 | 0% |
| Public gateway and security | ~25 | ~10% |
| Response storage | ~15 | ~10% |
| Scoring and analytics | ~25 | ~5% |
| **Total** | **~285** | **~43%** |

The result is **about 40–45% of the whole survey engine, and about 75% of the designer-plus-renderer layer.** Confidence is medium: the area percentages are judgement calls, but the evidence above backs them.

### 3.2 Weighted comparison

**Weighting (out of 100 points):**
- Reuse and effort: 20
- Impact on existing Form Engine users: 15
- Maintainability and long-term technical debt: 15
- CRM 9.1 compatibility: 10
- Security: 10
- Fit to survey needs: 10
- Licensing: 5
- Cloud readiness: 5
- Integration complexity: 5
- Performance: 5

Scores run from 1 to 5 per criterion.

| Criterion | A: Extend in place | **B: Survey module on the shared core** | C: SurveyJS | D: Form.io / open source |
|---|---|---|---|---|
| Reuse / effort | 5 | 5 | 3 | 2 |
| Impact on existing users | 2 | 4 | 5 | 5 |
| Maintainability / debt | 3 | 4 | 2 | 2 |
| CRM 9.1 | 5 | 5 | 4 | 3 |
| Security | 3 | 4 | 4 | 3 |
| Survey fit | 3 | 3 | 5 | 2 |
| Licensing | 5 | 5 | 2 | 4 |
| Cloud readiness | 4 | 4 | 4 | 3 |
| Integration | 4 | 4 | 2 | 2 |
| Performance | 4 | 4 | 3 | 3 |
| **Weighted total (out of 100)** | **78** | **85** | **70** | **57** |

### 3.3 Notes on each option

**A, extend in place.** It reuses the same code as B, but mixing survey lifecycle and response logic into the core puts every existing form at risk on every survey release.

**B, survey module.** It reuses the same code as A. The survey domain is kept out of the core, and the core only gains additive changes, so existing forms are protected.

**C, SurveyJS.**
- It would cut out the question-type work (NPS, matrix and ranking are built in), saving about 20–30 dev-days.
- You would still build all of the following: response storage, the public gateway, distribution, scoring and analytics.
- You would also have to integrate it with `qdb_translation`, the publish plugin, render-cache versioning and CRM web-resource packaging.
- My estimate for C is **about 120–170 dev-days, against about 145–210 for B.** That difference is within estimation error.
- After that, C means maintaining two designers, two rule and expression systems and two translation pipelines permanently. Makers would have to learn two tools.
- The Creator component needs a commercial licence; check current pricing. The runtime library is MIT.
- C only wins if rich survey question types are weighted far above everything else.

**D, Form.io.** Its builder is a form builder, as the Form Engine is. Its survey support is a basic Likert grid. Choosing it would duplicate what you already have without filling the gaps, and its back-end model would not fit CRM.

---

## Deliverable 4: proposed target architecture (Option B)

**The isolation rule:** survey work may add to the Form Engine core but never change existing behaviour. Survey-only logic stays outside the core.

### 4.1 Front end

- **One designer with a "Survey" form type.** For survey forms it:
  - hides CRM mapping, lookups and grids;
  - shows the survey question types and a Survey Settings panel;
  - skips the "must have a target entity" publish check (PV-011).
- **New controls added to `FieldRenderer`:** NPS, Likert matrix, ranking, slider, and CSAT/CES presets. They are new cases in the existing type switch, so existing forms never reach them.
- **A third build of the renderer** for public respondents. The repo already swaps the data layer per build (portal vs web resource); the survey build would talk to the gateway. It needs a slim bundle without the full icon set.
- **Internal, identified surveys inside CRM** use the existing web-resource runtime with a new submission target.

### 4.2 CRM tables (`qdb_` prefix)

**Reused unchanged:**
- `qdb_form_definition`, `qdb_form_tab`, `qdb_form_section`, `qdb_form_field`, `qdb_form_option_value`
- rules, `qdb_translation`, `qdb_language_config`, `qdb_form_version`, `qdb_form_render_cache`, `qdb_publish_job`

**Additive columns on existing tables:**

| Column | Purpose |
|---|---|
| `qdb_form_definition.qdb_form_kind` | Form or Survey. Defaults to Form. |
| `qdb_form_option_value.qdb_score` | Score for NPS/CSAT/CES. Nullable. |

**New tables**, in a separate `SurveyEngine` solution that depends on the Form Engine solution:

| Table | Holds |
|---|---|
| `qdb_survey` | Lifecycle state, start/end dates, owner, product/service, whether it's anonymous, response limit, a link to the form, and the **one published version it is fixed to** |
| `qdb_survey_invitation` | Token **hash** (never the raw token), contact/account, the CRM record it relates to, channel, expiry, status (sent / opened / completed) |
| `qdb_survey_response` | Survey, form version, invitation, customer links, status (partial / complete), timestamps, answers as a JSON memo, calculated NPS/CSAT/CES |
| `qdb_survey_answer` | One row per question: numeric, text, option and score values. This is the reporting source for Power BI. |
| `qdb_survey_trigger` | Business event → survey configuration |

### 4.3 Public submission path

```
Browser ──► Survey Gateway (DMZ, Fastify) ──► qdb_GetSurveyForInvitation  (Custom API)
                                         └──► qdb_SubmitSurveyResponse    (Custom API, C# plugin)
```

- The `qdb_SubmitSurveyResponse` plugin re-validates the answers against the fixed published JSON. It then writes the response and answer rows idempotently and calculates the scores.
- The gateway's CRM account can only execute those two APIs.
- The gateway handles captcha, rate limiting and token checks.
- No CRM credentials reach the browser.
- **The existing Express back end is never exposed publicly.** Its designer proxy and file routes are unsafe for anonymous users.

### 4.4 Integration

- **SMS and email** go through QDB's existing CRM channels, configured per org. From the DCP work, the SMS table differs between orgs. That is not verified in this repo.
- **Triggers** go through a plugin or QDB's existing process engine.
- **Analytics** use Power BI over `qdb_survey_answer`, CRM views for Excel export, and model-driven dashboards.
- **On-prem authentication for the gateway** (IFD, ADFS or NTLM) is **unknown and must be confirmed**.
- **Dataverse migration:** the Custom APIs and tables move as-is; only the gateway's authentication changes.

---

## Impact on the existing Form Engine

- **Published JSON stays byte-identical.** Publishers emit new properties only when they are set, the same pattern DEF-002 used. Regression test: re-publish every existing form and compare render-cache hashes before and after.
- **No existing column changes.** The new columns are nullable or default to existing behaviour.
- **`CrmSubmissionService` is untouched.** Surveys use their own submission target.
- **The renderer only gains new switch cases.** Existing field types are unchanged.
- **Regression risk is in Phase 0.** Those defect fixes change existing behaviour: rule-required fields will now block Submit. Existing forms in both orgs that rely on today's behaviour need to be listed before shipping.
- **Mobile is out of survey scope.** Its rule engine is likely inert.
- **Deployment is a separate solution.** The `SurveyEngine` solution can be imported or removed without touching Form Engine components.

---

## Deliverable 5: roadmap

| Phase | Content | Dev-days |
|---|---|---|
| **0. Form Engine stabilisation** (helps existing users too) | Fix the Save drops; fix new-field rule loss; enforce rule-required at Submit; fix the two tab-index bugs; add Conditional Required option 100000013 (needs the user's go-ahead); translate renderer labels; check `v9.2` on 9.1; move the validation and rule engines into `shared` | 12–18 |
| 1. Survey type and lifecycle | Form-kind column, designer survey mode, `qdb_survey` lifecycle with fixed version, deep clone, templates | 20–28 |
| 2. Survey question types | NPS, Likert matrix, ranking, slider, CSAT/CES presets, `qdb_score`, designer panels | 20–30 |
| 3. Response capture | Response and answer tables, `qdb_SubmitSurveyResponse`, idempotency, partial responses, in-CRM submission target | 18–25 |
| 4. Public gateway | Gateway service, tokens, captcha, rate limiting, server-side validation, slim survey build, penetration test | 25–35 |
| 5. Distribution | Invitations, SMS/email, reminders, expiry, duplicate prevention, CRM event triggers | 20–30 |
| 6. Analytics | Score roll-ups, response rates, Power BI over `qdb_survey_answer`, Excel export, CRM dashboards | 15–22 |
| 7. QA, security, audit, UAT on both orgs | | 15–20 |
| **Total** | | **~145–210 dev-days** |

**Team:** 1 front-end developer, 1 C#/CRM developer, 1 gateway developer and half a QA. That is about 4–6 months.

**The estimate assumes:**
- no offline mobile app;
- Power BI on-prem access already exists;
- QDB's SMS and email channels are reusable;
- the gateway's on-prem authentication is settled early.

**Testing requirements across phases:**
- Re-publish every existing form and compare render-cache hashes.
- A save-and-reload test for every new designer property.
- Server-side validation that agrees with client-side validation.
- Gateway penetration test.
- Idempotency test: replaying the same submission writes it once.
- UAT on both on-prem orgs.

### Readiness of features

1. **Already available:** basic question types, conditional logic, RTL and translation, publishing and render cache.
2. **Minor enhancement:** rating scales, checkbox multi-select, preview, page-skip fixes, renderer label translation.
3. **Significant development:** templates, deep clone, version pinning, server-side validation.
4. **Completely new survey modules:** lifecycle, NPS/Likert/ranking controls, response storage, public gateway, distribution, scoring and analytics.

---

## Deliverable 6: answers to the 10 questions

1. **Reuse or separate engine?** Reuse the core; keep the survey domain separate.
2. **Can the designer support surveys with reasonable enhancements?** Yes. Fix the save defect first.
3. **Can the renderer be reused?** Yes, for logic, navigation and RTL. The public build needs a new data layer and a slimmer bundle.
4. **How much can be reused?** About 40–45% of the whole engine and about 75% of the designer and renderer. Medium confidence.
5. **What must be newly built?** Survey question types, lifecycle, the public gateway, invitations and distribution, response storage, scoring and analytics.
6. **Would SurveyJS or Form.io help significantly?** No. SurveyJS saves about a month on question types. In exchange you would carry a second designer and a commercial licence permanently.
7. **Would a second designer be duplication?** Yes: a second set of rules, translations, publishing and versioning.
8. **Simplest maintainable architecture?** One designer, one renderer, a Survey solution, and a narrow public gateway.
9. **Risks of extending the Form Engine?**
   - Phase 0 changes behaviour for existing forms.
   - Field properties have been lost on save before, so every new property needs a save-and-reload test.
   - A 2 MB bundle on public phones.
   - The unverified `v9.2` vs 9.1 Web API path.
10. **Final recommendation:** Option B, starting with Phase 0. The money goes into what neither the Form Engine nor SurveyJS has, not into a second copy of what QDB already owns.

---

## Confirmed findings vs assumptions

**Confirmed from code:**
- the designer Save drops properties (checked by hand);
- submission is always tied to a CRM entity;
- there is no anonymous route;
- the back end is Azure AD only;
- there is no response, invitation or analytics code;
- `v9.2` is hard-coded;
- Conditional Required is mis-mapped by both publishers.

**Assumptions, not verified at runtime:**
- that Dataverse rejects option 100000013 at save;
- that the mobile rule engine is inert;
- the two tab-index mismatches;
- that `qdb_form_audit_log` writes fail silently;
- that `v9.2` fails on 9.1;
- that "Restore as Draft" does not re-create deleted rows.

**Unknowns to settle before the BRD:**
- on-prem DMZ hosting and authentication for the gateway;
- QDB's existing SMS and email channels;
- expected volumes;
- who approves surveys;
- PDPPL (Qatar data protection law) handling of customer responses;
- whether Power BI on-prem access exists.

## Next step

This is a `new-project` under the company workflow. If it is approved, the next step is a BA requirements document (BRD) and CEO approval. No architecture or build work starts before that.
