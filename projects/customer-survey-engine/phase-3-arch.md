# Phase 3 — Solution Architecture: Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| Prepared by | MSS Technologies, Solution Architect |
| Version | 1.0 |
| Date | 2026-11-09 |
| Status | DRAFT for the CEO Phase-3 → Phase-4 gate |
| Inputs | `phase-2-ba.md` v1.1 (APPROVED), `approach-decision.md`, `trigger-decisions.md`, `brd-answers.md`, `dependencies.md`, `phase-2-ceo-brd-decision.md` |
| ADRs | `adr/ADR-001` … `adr/ADR-006` (this phase) |
| Grounded in | DFE `dfe-baseline-2026-11-08` (`773f32be`): `submitEngine.ts`, `FormSaveService.ts`, `RENDER-CACHE-SCHEMA.md`, `entityNames.ts` |

> Requirement traceability: every FR/NFR id (FR-CSE-nnn / NFR-CSE-nnn) is referenced inline so coverage is checkable against the BRD. The cross-artifact analysis report is section 17.

---

## 1. System overview

The Customer Survey Engine is a **configuration-driven CRM engine** that attaches surveys to business moments. It is built as a **hybrid on the Dynamic Form Engine (DFE)**: survey *content* reuses the DFE designer, renderer and render cache unchanged (forms carry a new additive `Form Type = Survey`), while survey *orchestration* — sources, setups, triggers, invitations, responses and the suppression log — lives in a **separate, independently-removable `SurveyEngine` solution** (C-5, NFR-CSE-004). A single generic async plugin evaluates every trigger from configuration; a daily "Run Due Surveys" Custom API handles schedules and postponed releases; and a small set of Custom APIs is the integration surface for QDB's own portal, backend and mobile teams, who build the UI (FR-CSE-055).

The design is **async, config-first and org-portable**: it targets two on-prem Dynamics CRM 9.1 orgs and one Dataverse cloud org from one codebase, resolves all table/field/status values from configuration rows (never code — Article V, ARC-M-001, GOT-023), and degrades gracefully where optional schema is absent (PAT-003).

## 2. Component diagram (structured text)

```
                           ┌──────────────────────────────────────────────┐
  Source tables (config)   │  SurveyEngine solution (new, removable)        │
  qdb_loan_application      │                                                │
  qdb_payment_auth_ticket ──┤  [P1] SurveyTriggerPlugin (async, Create+Update)
  qdb_cheque_clearing       │        ├─ transition check (pre-image)         │
  …unlimited more           │        ├─ fatigue / priority / duplicate       │
                            │        ├─ milestone live-count query           │
                            │        └─ InvitationService → invitation row   │
                            │                                                │
  Scheduler                 │  [A1] qdb_srv_RunDueSurveys (daily Custom API) │
  Win Task (on-prem) ───────┤        ├─ scheduled-trigger population         │
  Power Automate (cloud) ───┤        ├─ postponed-invitation release         │
                            │        └─ retention job (delete/anonymise)     │
                            │                                                │
  Portal / Backend / Mobile │  [A2] Integration Custom APIs                  │
  (QDB teams build UI) ─────┤        ├─ qdb_srv_ListPendingSurveys           │
                            │        ├─ qdb_srv_GetSurvey                     │
                            │        ├─ qdb_srv_SubmitResponse               │
                            │        └─ qdb_srv_ValidateLinkToken            │
                            │                                                │
  Admin (Survey Admin role) │  [A3] qdb_srv_ActivateSource / Deactivate      │
                            │        └─ auto (de)register plugin steps        │
                            │                                                │
                            │  Config + data tables (section 4)              │
                            │   source · setup · trigger · invitation ·      │
                            │   response · answer · suppression_log ·        │
                            │   settings · sms_config                        │
                            └───────────────┬───────────────┬───────────────┘
                                            │               │
                        shared (read-only)  │               │  hand-off
                            ▼               ▼               ▼
                  ┌───────────────────┐  SMS: per-org    Email: CRM
                  │  DFE core (shared) │  config table    email activity
                  │  designer · runtime│  (SurveyEngine   (Email Router /
                  │  render cache      │   writes a row)  server-side sync)
                  │  qdb_PublishForm   │
                  │  qdb_GetPublished… │
                  └───────────────────┘
```

| # | Component | Responsibility | Key connections |
|---|---|---|---|
| P1 | `SurveyTriggerPlugin` (C#) | One generic async plugin. On source Create/Update, decides whether to create an invitation. Owns transition check, fatigue/priority/duplicate, milestone count. | Source tables (step target + pre-image), config tables, InvitationService |
| A1 | `qdb_srv_RunDueSurveys` Custom API | Daily batch: scheduled-trigger populations, postponed release, retention. Idempotent. | Scheduler (Win Task / Power Automate), config + invitation + response tables |
| A2 | Integration Custom APIs | The four QDB-facing operations (list, get, submit, validate-token). | Portal/backend/mobile; DFE render cache (get); response tables (submit) |
| A3 | `qdb_srv_ActivateSource` / `…DeactivateSource` | Register/remove the plugin steps for a source on activation. SysAdmin only. | PluginStep metadata, `qdb_survey_source` |
| S1 | DFE designer (shared, +additive) | Build survey forms. Adds `Form Type = Survey`, `SRV-` validation, the Save-defect fix. | `qdb_form_definition`, DFE services |
| S2 | DFE runtime / renderer (shared, +additive) | Render + submit. Survey submit **branches** to A2 instead of entity mapping. | render cache, `qdb_srv_SubmitResponse` |
| S3 | DFE render cache (shared, unchanged) | Pins one published JSON per form code + version + language. The version-pinning mechanism (AC16 / FR-CSE-046). | `qdb_form_render_cache` |

## 3. Technology stack

| Layer | Technology | Reason / ADR |
|---|---|---|
| Survey content (designer, renderer, translations, versioning, cache) | Existing DFE core | Constitution default for this estate; reuse over rebuild (Article XVII, PAT-004). ADR-001 |
| Orchestration plugin + Custom APIs | C#, .NET Framework **4.6.2** → built at **4.7.1**, Organization Service SDK | Article X; cloud caps at 4.7.1 (GOT-005, TSD-002); one merged+signed artifact for both runtimes (GOT-006) |
| Dependencies in the plugin | **None** (base library + CRM SDK only) | `dependencies.md`: sandbox-safe; opaque token from `RandomNumberGenerator`, calendar math inline. ADR-003, ADR-004 |
| Data store | Dataverse tables (cloud) / CRM SQL (on-prem), prefix `qdb_survey_*` | Hybrid lives in the same QDB orgs; no DB deviation. ADR-002 |
| Scheduler | Windows Scheduled Task (on-prem) / Power Automate recurrence (cloud) calling one Custom API | C-2; no native recurrence on-prem; avoids a host process (ADR-005) |
| Solution packaging | Unmanaged→managed hand-built ZIP, dynamic RootComponents, deterministic GUIDs | GOT-001..004, PAT-001, ANTI-003 |
| Integration auth | Cloud: OAuth S2S application user. On-prem: AD service account / IFD OAuth | Article VII; section 10 |
| Tests | Vitest (DFE TS additions), Supertest-style API checks via Custom API round-trip, C# unit tests (FakeXrmEasy-style, no live calls in CI) | Article IV, NFR-CSE-007 |

No deviation from the constitution default stack requires an ADR *of itself* here — the stack **is** the estate default (Dynamics/Dataverse + C# + DFE). The ADRs below record the *design* decisions the BRD left to architecture.

## 4. Data architecture — SurveyEngine tables

All tables: `qdb_` prefix + `survey` product segment (ADR-002), `OrganizationOwned`, no notes/activities (except where email activities are regarding the invitation). Every table carries the platform audit columns `createdby / createdon / modifiedby / modifiedon` plus `ownerid`; response/invitation state transitions additionally log to the suppression log or an audit note (Article VI). GUID primary keys only (Article V enterprise rule). Option-set codes are 100000000-based (GOT-011) — codes below are illustrative; the provisioning manifest is authoritative.

### 4.1 `qdb_survey_source` — source configuration (FR-CSE-001..006)

| Logical name | Type | Notes |
|---|---|---|
| qdb_survey_sourceid | GUID | PK |
| qdb_name | String | Primary name (e.g. "Applications") |
| qdb_table_logical_name | String(128) | Source CRM table, e.g. `qdb_loan_application`. Read at runtime (ARC-M-001 — name, not GUID) |
| qdb_customer_lookup_field | String(128) | Lookup field to the customer, e.g. `qdb_customerid`. Target entity is read from the EntityReference at runtime, so the design is target-agnostic (OQ-A2a) |
| qdb_type_field | String(128) | Optional option-set field, e.g. `qdb_loanappl_type` |
| qdb_status_field | String(128) | Status field, default `statuscode` |
| qdb_origin_field | String(128) | Field identifying Digital vs Legacy (OQ-A2d); nullable → see fallback 4.11 |
| qdb_origin_digital_values | Memo | Comma-separated codes that mean "Digital". Others = Legacy |
| qdb_counts_toward_milestones | Boolean | Default false; true for Disbursements |
| qdb_is_active | Boolean | Activation (FR-CSE-003) — provisions/removes plugin steps via A3 |
| qdb_step_registration_json | Memo | Records the plugin-step ids created on activation, so deactivation removes exactly those |

Ships three seed rows (FR-CSE-005) from section 3.4. Alternate key `qdb_survey_source_key` = (`qdb_table_logical_name`) to stop two sources binding the same table.

### 4.2 `qdb_survey_setup` — survey definition (FR-CSE-007..018)

| Logical name | Type | Notes |
|---|---|---|
| qdb_survey_setupid | GUID | PK |
| qdb_name | String | Setup name |
| qdb_form_code | String(100) | The survey form (must start `SRV-`, FR-CSE-023); references the DFE form by **code**, not GUID (cache is keyed by code) |
| qdb_notif_title_en / qdb_notif_title_ar | String(200) | Bilingual title (FR-CSE-012) — required to activate |
| qdb_notif_message_en / qdb_notif_message_ar | Memo | Bilingual message (FR-CSE-013) |
| qdb_delivery_digital | Picklist | Portal=1 / SecureLink=2 / None=3 (FR-CSE-010). Default Portal |
| qdb_delivery_legacy | Picklist | Same set. Default Portal |
| qdb_active_from / qdb_active_to | DateTime (DateOnly) | Window (FR-CSE-014) |
| qdb_expiry_days | Integer | Expiry from generation (FR-CSE-015) |
| qdb_is_active | Boolean | Activate/deactivate (FR-CSE-017). No approval in R1 (FR-CSE-018) |

One setup → one form (FR-CSE-008). Validation that the form's type = Survey is enforced in the setup form / plugin, reading `qdb_form_definition.qdb_form_type` for `qdb_form_code`.

### 4.3 `qdb_survey_trigger` — triggers (child of setup) (FR-CSE-026..044)

| Logical name | Type | Notes |
|---|---|---|
| qdb_survey_triggerid | GUID | PK |
| qdb_survey_setup_id | Lookup → setup | Parent (N:1, cascade) |
| qdb_trigger_kind | Picklist | Event=1 / Created=2 / Scheduled=3 / Milestone=4 |
| qdb_source_id | Lookup → qdb_survey_source | For Event/Created/Milestone |
| qdb_status_values | Memo | Status codes forming the "inside" set (FR-CSE-026/027). Per-org configurable (FR-CSE-006, OQ-A2b) |
| qdb_type_values | Memo | Optional type codes filter |
| qdb_schedule_period | Picklist | Monthly=1 / Quarterly=2 / Annually=3 (FR-CSE-031) |
| qdb_schedule_population | Picklist | AllActive=1 / ActiveInPeriod=2 (FR-CSE-032) |
| qdb_schedule_population_source_id | Lookup → source | For ActiveInPeriod |
| qdb_milestone_every_n | Integer | Default 5 (FR-CSE-034) |
| qdb_milestone_type_values / qdb_milestone_status_values | Memo | Default WBS,LC / Completed (FR-CSE-035) |
| qdb_milestone_count_from | DateTime | Empty = all history (FR-CSE-036) |
| qdb_milestone_skip_reached | Boolean | Default true = skip (FR-CSE-037) |
| qdb_fatigue_action | Picklist | Drop=1 / Postpone=2. Default Event=Drop, Milestone/Scheduled=Postpone (FR-CSE-041) |
| qdb_priority | Integer | Lower wins; milestone ranks first by default (FR-CSE-043) |

### 4.4 `qdb_survey_invitation` — invitations (FR-CSE-045..050)

| Logical name | Type | Notes |
|---|---|---|
| qdb_survey_invitationid | GUID | PK |
| qdb_customer_id | Lookup (customer entity) | Polymorphic in practice; stored as the resolved customer reference |
| qdb_survey_setup_id | Lookup → setup | |
| qdb_survey_trigger_id | Lookup → trigger | Which trigger produced it |
| qdb_source_record_id | String(100) | GUID of the source record (string, since source table varies) + `qdb_source_table` |
| qdb_source_table | String(128) | Source table logical name |
| qdb_form_code | String(100) | Copied from setup |
| qdb_pinned_version | Integer | Published version pinned at generation (FR-CSE-046, AC16) |
| qdb_language_code | String(10) | Customer language at generation (OQ-A2c) |
| qdb_status | Picklist | Pending=1 / Postponed=2 / Submitted=3 / Expired=4 / Discarded=5 |
| qdb_channel | Picklist | Portal=1 / SecureLink=2 |
| qdb_generated_on / qdb_expires_on | DateTime | Expiry computed from setup (FR-CSE-015/016) |
| qdb_milestone_index | Integer | For milestone invitations; part of dedupe (FR-CSE-038) |
| qdb_schedule_period_key | String(20) | e.g. `2026-Q2` for scheduled dedupe (FR-CSE-044) |
| qdb_token_hash | String(64) | SHA-256 of the secure-link token; **plaintext never stored** (FR-CSE-050, ADR-004) |
| qdb_token_used_on | DateTime | Single-use marker |
| qdb_dedupe_key | String(200) | Deterministic key; **alternate key** enforces one-invitation uniqueness |

**Alternate keys:**
- `qdb_invitation_dedupe` = (`qdb_dedupe_key`). The plugin composes the key: event/milestone → `{setupId}|{customerId}|{sourceTable}:{sourceRecordId}|M{index?}`; scheduled → `{setupId}|{customerId}|{period}`. A collision returns **HTTP 412** (GOT-024), which the plugin catches as "already exists" → no duplicate (FR-CSE-044, NFR-CSE-002).
- `qdb_invitation_token` = (`qdb_token_hash`) for O(1) token validation.

### 4.5 `qdb_survey_response` — one per submitted invitation (FR-CSE-056, ADR-007)

| Logical name | Type | Notes |
|---|---|---|
| qdb_survey_responseid | GUID | PK |
| qdb_survey_invitation_id | Lookup → invitation | 1:1 in practice; alt key below |
| qdb_survey_setup_id | Lookup → setup | Denormalised for reporting/filtering (FR-CSE-057) |
| qdb_customer_id | Lookup | Denormalised |
| qdb_source_record_id / qdb_source_table | String | Denormalised |
| qdb_form_code / qdb_pinned_version / qdb_language_code | String/Int | Denormalised |
| qdb_answers_json | Memo (1,048,576) | Full answers as JSON (Power BI-ready + fidelity) (OQ-08) |
| qdb_submitted_on | DateTime | |

Alternate key `qdb_response_invitation` = (`qdb_survey_invitation_id`) → one response per invitation (NFR-CSE-002).

### 4.6 `qdb_survey_answer` — one per question (FR-CSE-056, 057)

| Logical name | Type | Notes |
|---|---|---|
| qdb_survey_answerid | GUID | PK |
| qdb_survey_response_id | Lookup → response | Parent (cascade) |
| qdb_question_code | String(100) | The DFE field code |
| qdb_question_label | String(400) | Snapshot label (reporting without a join) |
| qdb_answer_text | Memo | Normalised answer value (for views/charts/Excel) |
| qdb_answer_numeric | Decimal | For rating/number answers → chartable (FR-CSE-057) |
| qdb_question_order | Integer | Page→section→field order (FR-CSE-021) |

### 4.7 `qdb_survey_suppression_log` — append-only (NFR-CSE-001)

| Logical name | Type | Notes |
|---|---|---|
| qdb_survey_suppression_logid | GUID | PK |
| qdb_customer_id | Lookup | |
| qdb_survey_trigger_id / qdb_survey_setup_id | Lookup | |
| qdb_source_record_id / qdb_source_table | String | |
| qdb_reason | Picklist | Fatigue=1 / PriorityLost=2 / Duplicate=3 / ChannelNone=4 / PostponedExpired=5 / OutsideWindow=6 / Inactive=7 |
| qdb_detail | Memo | Human-readable context |
| qdb_logged_on | DateTime | |

**Append-only enforced** by security role (create only; no write/delete for any role) — Article VI. No UPDATE/DELETE plugin guard needed beyond role config, but a pre-operation guard plugin on Update/Delete is added for defence in depth.

### 4.8 `qdb_survey_settings` — global, single row per org (FR-CSE-040, 058)

| Logical name | Type | Notes |
|---|---|---|
| qdb_fatigue_min_days | Integer | Default 30; 0 = off (FR-CSE-040) |
| qdb_language_field | String(128) | Customer entity field holding preferred language (OQ-A2c). Nullable → fallback to org base language |
| qdb_default_language | String(10) | Fallback language code |
| qdb_retention_days | Integer | Retention (FR-CSE-058, OQ-A1). 0/empty = retention off until Compliance sets it |
| qdb_retention_mode | Picklist | Delete=1 / Anonymise=2 |
| qdb_securelink_enabled | Boolean | **Default false** — gated by NFR-CSE-009 security sign-off |
| qdb_securelink_base_url | String | Portal token-page base URL (per org) |

### 4.9 `qdb_survey_sms_config` — per-org SMS hand-off (FR-CSE-048, OQ-A2e)

| Logical name | Type | Notes |
|---|---|---|
| qdb_sms_table_logical_name | String(128) | The per-org SMS activity table (differs per org — see memory: HL=letter, BFD/QDB1=fax) |
| qdb_recipient_field | String(128) | Column holding the recipient number/ref |
| qdb_message_field | String(128) | Column holding the message body |
| qdb_customer_link_field | String(128) | Optional regarding/customer lookup column |
| qdb_static_columns_json | Memo | Extra required columns for that org's SMS table (key→value), set as constants on create |

### 4.10 Relationships

```
qdb_survey_setup 1───N qdb_survey_trigger
qdb_survey_setup 1───N qdb_survey_invitation
qdb_survey_source 1──N qdb_survey_trigger (source + population-source)
qdb_survey_invitation 1──1 qdb_survey_response
qdb_survey_response 1───N qdb_survey_answer
(email activity) N──1 qdb_survey_invitation  (Regarding)
```

### 4.11 Config fallbacks (ARC-M-001, PAT-003)

- **No origin field on a source** → the source row leaves `qdb_origin_field` empty; the plugin treats the request as the configured default channel (Digital), and the design still honours per-channel delivery. OQ-A2d then affects *data*, not code.
- **No language field** → `qdb_survey_settings.qdb_default_language` is used.
- **SMS table differs per org** → only `qdb_survey_sms_config` rows change; no code change (FR-CSE-048).
- **Source table/field/status values differ per org** → only `qdb_survey_source` / `qdb_survey_trigger` rows change (FR-CSE-006).

## 5. The exact additive DFE changes (design only — no code written this phase)

All changes ship in a **DFE release** (C-6, shared release train) and are **additive**: survey behaviour switches on only when `Form Type = Survey` (FR-CSE-019, ADR-001). An existing non-survey form must behave identically (proven by FR-CSE-025 gate).

**Survey content is pure DFE reuse (no change needed):** survey questions are built in the DFE designer as pages and sections using any question type (FR-CSE-020), shown in designer page→section→field order (FR-CSE-021), with the DFE's existing Arabic/English translation and RTL support (FR-CSE-022). These requirements are satisfied by the hybrid decision (ADR-001) with no new code — which is the point of the hybrid. The additive items below are only the switch, the submit branch, the prefix guard and the two fixes.

### 5.1 `Form Type` column on `qdb_form_definition` (FR-CSE-019)

- New optional local picklist `qdb_form_type`: `Standard=1` (default) / `Survey=2`. Absence or `Standard` → unchanged DFE behaviour (PAT-003: no form breaks if the column is unprovisioned on an org).
- Added to both parallel shared type files — **`form.ts` AND `form.types.ts`** (GOT-019) — as an optional field, and to `FormSaveService` step 7 (`updateForm`) and `FormDefinitionService`.
- Designer surfaces it on the form-properties panel (read by the setup validation, FR-CSE-008).

### 5.2 Survey submit branch in the runtime (FR-CSE-053, ADR-001)

- Branch point: the caller of `submitEngine.ts` `submitForm()` (the runtime submit handler). Today `submitForm()` **requires** a parent-entity submission mapping and writes to mapped CRM entities (lines 249-299).
- Additive change: **before** calling `submitForm`, if `form.formType === 'Survey'`, route to a new `submitSurvey(invitationContext, values)` that calls `qdb_srv_SubmitResponse` (A2) instead. `submitForm` is left untouched for standard forms. Survey forms carry **no** submission mappings, so the existing "no parent mapping" error is never hit on the survey path.
- The invitation context (invitation id or token, language) is supplied by the host page (the QDB portal) when it loads the renderer — it is a renderer input, not read from CRM by the web resource.

### 5.3 `SRV-` validation (FR-CSE-023)

- In the designer save path: when `qdb_form_type === Survey`, reject a `code` that does not start with `SRV-`; and reject a non-`SRV-` form being switched to Survey. A standard form keeps any code. Implemented as a guard in the form-properties validation and mirrored server-side where the code is written.
- Rationale: the render cache is keyed by form code (S3); a reserved prefix keeps survey and standard caches from ever colliding.

### 5.4 Save-defect fix (FR-CSE-024, ADR-001 condition 6)

**Confirmed in code.** `FormSaveService.save()` `createField` (lines 181-229) and `updateField` (lines 307-353) pass a long field list but **omit** `radioRenderStyle`, `captureMode` (fileCaptureMode), `componentKey` and `numberDisplayStyle`. All four exist in the shared types (`form.types.ts` lines 437, 502, 515, 539 and `form.ts` 184, 196) but are never persisted, so a Rating question (a radio rendered as `rating`) loses its display style on save+reload.

- Fix: add the four properties to **both** the `createField` and `updateField` payloads in `FormSaveService`, and to `FieldService.createField/updateField` + the underlying attribute writes.
- This is a **genuine DFE defect fix**, valuable to every DFE form, not only surveys — but it is a prerequisite (rating questions are core to surveys), so it is done first (A-03).
- Covered by a designer round-trip test: set all four, save, reload, assert retained (FR-CSE-024 testable criterion).

### 5.5 Content-comparison regression gate (FR-CSE-025, NFR-CSE-003)

- Before every DFE deploy carrying survey changes: re-publish **all** existing forms via `qdb_PublishForm`, read back each `qdb_form_render_cache.qdb_runtime_json`, and compare against a pre-deploy baseline.
- **Comparison is content, not byte-for-byte** (brd-answers correction 5): gunzip + Base64-decode both sides, parse JSON, strip volatile stamps (`qdb_published_on`, `generator_version`, `qdb_last_generated_on`, timestamps, version ids), then deep-compare.
- Any difference in any existing form **blocks** the release. This is the cache-vs-live parity discipline from ARC-M-002 (the cache path once silently dropped fields) made an executable gate: `.claude/scripts/` gate script + a CI step. Baseline captured from the current live org before the first survey deploy.

## 6. Trigger plugin design (`SurveyTriggerPlugin`)

One generic plugin class, driven entirely by `qdb_survey_source` + `qdb_survey_trigger` config (ADR-006). Runs **async** so it never blocks or fails the source save (FR-CSE-030, C-7, NFR-CSE-006). Finishes well inside the 2-minute limit at ~900 events/month (volumes 9.2).

### 6.1 Step registration (FR-CSE-003, auto-registration)

- The plugin is registered **per source table** by `qdb_srv_ActivateSource` (A3), which runs as System Administrator (A-07). On activation it registers, for the source's table:
  - **Update** step, async, post-operation, **filtered to the status field** (`qdb_status_field`), with a **pre-image** capturing the status field + customer + type fields.
  - **Create** step, async, post-operation (for the "record created" trigger FR-CSE-029; active only if a Created trigger exists, but registered so configuration alone enables it, OQ-04).
- Deactivation removes exactly the steps recorded in `qdb_step_registration_json` (FR-CSE-003). Non-admin activation is refused (role check in A3).
- Why not one step on all tables: CRM registers steps per message+entity; there is no wildcard. Auto-registration keeps "add a source with no deployment" true (FR-CSE-002, NFR-CSE-005).

### 6.2 Transition check (FR-CSE-027, 028)

- On Update: read **old** status from the pre-image and **new** status from the target. For each Event trigger on this source, fire only if `old ∉ statusSet` AND `new ∈ statusSet` (outside→inside). A move inside→inside or any save without a status change does not fire (FR-CSE-028).
- On Create: evaluate Created triggers only; optionally require `new ∈ initialStatusSet` (FR-CSE-029).
- Type filter: if `qdb_type_values` set, the record's type must be in it (FR-CSE-026).

### 6.3 Evaluation pipeline (per firing trigger)

For each candidate trigger that passes 6.2, in this order:

1. **Resolve customer** via `qdb_customer_lookup_field` (EntityReference → id; target entity taken from the reference, OQ-A2a).
2. **Resolve channel**: read `qdb_origin_field` on the record → Digital/Legacy (FR-CSE-011, fallback 4.11); pick `qdb_delivery_digital/legacy`. If **None** → log `ChannelNone`, stop (FR-CSE-010, NFR-CSE-001).
3. **Window check**: now within `active_from..active_to`? else log `OutsideWindow`, stop (FR-CSE-014).
4. **Milestone count** (if milestone trigger): live query (6.5). If `floor(count/N) <= lastMilestoneFired` → no fire (FR-CSE-039).
5. **Duplicate check**: compose `qdb_dedupe_key`; the create (step 8) relies on the alternate key, but a pre-check short-circuits and logs `Duplicate` when the row already exists (FR-CSE-044).
6. **Fatigue check**: last invitation for this customer within `qdb_fatigue_min_days`? If blocked → apply the trigger's `Drop` or `Postpone` (FR-CSE-040/041). Drop → log `Fatigue`, stop. Postpone → create invitation with status `Postponed` (released by A1).
7. **Priority resolution**: if several triggers fire for the same customer at the same moment, sort by `qdb_priority` (milestone first by default); the winner proceeds, losers follow their Drop/Postpone setting and are logged `PriorityLost` (FR-CSE-043).
8. **Create invitation**: pin published version (6.4), resolve language (OQ-A2c), set expiry, set channel, compose dedupe key. If SecureLink channel → generate token (section 8). Catch 412 on the alternate key → treat as duplicate, log, do not throw (GOT-024).
9. **Dispatch** (section 9): Portal → nothing to send (API exposes it); SecureLink/email → create email activity and/or SMS row.

All "nothing happened" outcomes write a suppression-log row — nothing is dropped silently (NFR-CSE-001).

### 6.4 Version pinning (FR-CSE-046, AC16)

- At generation, read the currently-active `qdb_form_render_cache` for (`qdb_form_code`, language) and copy its `qdb_published_version` onto the invitation. The invitation thereafter always renders that version (S3 is already keyed this way — the reuse that justified the hybrid).

### 6.5 Milestone live-count query and baseline (FR-CSE-034..039)

- **Live query, not a tally** (FR-CSE-039): count the customer's qualifying records = source marked `counts_toward_milestones`, type ∈ `milestone_type_values`, status ∈ `milestone_status_values`, created ≥ `milestone_count_from`, across all facilities (FR-CSE-035). Fund transfers never qualify (their source row has the flag false).
- Fire when `floor(count / N) > lastMilestoneFired`, where `lastMilestoneFired` = max `qdb_milestone_index` among this customer+setup's existing milestone invitations. Each index fires at most once (the dedupe key includes `M{index}`, FR-CSE-038).
- **Baseline / skip** (FR-CSE-037): at activation, if `skip_reached`, the first eligible index = `floor(qualifyingBefore / N)` so already-passed milestones are skipped — computed from the query by date, **no go-live batch job** needed (trigger-decisions 3). The alternative setting (`skip_reached=false`) lets the next evaluation fire the overdue index immediately.
- Because counting is live, changing N or a record leaving `Completed` self-corrects on the next evaluation (FR-CSE-039).

## 7. Daily "Run Due Surveys" Custom API (`qdb_srv_RunDueSurveys`) + scheduler

### 7.1 Responsibilities (FR-CSE-033, 042, 058)

One unbound Custom API, run once a day, doing three idempotent passes:

1. **Scheduled triggers** (FR-CSE-031/032): for each active scheduled trigger whose calendar date is "today" (1st of month / quarter / year), build the population (AllActive customers, or ActiveInPeriod via a query on the chosen source+statuses in the period), then create one invitation per customer, subject to the same fatigue/duplicate pipeline (6.3). Dedupe key uses `schedule_period_key` (e.g. `2026-Q2`), so **running twice the same day creates no duplicates** (FR-CSE-033) — the alternate key guarantees it even under overlap.
2. **Postponed release** (FR-CSE-042): find `Postponed` invitations whose customer fatigue window has now ended; if still within expiry, flip to `Pending` and dispatch; if expired first, set `Discarded` and log `PostponedExpired`.
3. **Retention** (FR-CSE-058): if `qdb_retention_days > 0`, find responses/answers older than the period and delete or anonymise per `qdb_retention_mode`. Until Compliance sets the value (OQ-A1), the pass is a no-op — the gate is a **data** decision (PAT-003).

Idempotency: every create goes through the dedupe alternate key; every status flip is conditional on current status. Re-running is safe (FR-CSE-033). Quarterly expiry (AC14.1/FR-CSE-016): expiry for a quarterly invitation is set to one month into the next quarter at generation, not by this job.

### 7.2 How it is called (C-2, A-04)

| Org | Caller | Mechanism |
|---|---|---|
| On-prem 9.1 (×2) | **Windows Scheduled Task** on an app/CRM server | A small PowerShell/console step authenticates as the AD service account and calls `qdb_srv_RunDueSurveys` via the Organization Service (on-prem OAuth/IFD or Windows auth). Daily at a quiet hour |
| Cloud | **Power Automate** scheduled (recurrence) flow | Daily recurrence → "Perform an unbound action" → `qdb_srv_RunDueSurveys` |

Fallback (A-04): if a Windows Scheduled Task cannot be created on-prem, alternatives are a CRM Recurring Bulk Deletion job trick (rejected — abuses the feature) or an on-prem recurring workflow calling a custom action; the Scheduled Task is preferred because it is observable and owned by QDB IT. The API is **self-contained and caller-agnostic** so the scheduler choice never affects logic.

### 7.3 Volume / time budget

~450 invitations max per scheduled run, ~450 customers for retention scans (9.2). Comfortably one execution; the API batches reads and creates. Not plugin-sandbox-bound in the same way (Custom API can run longer), but designed to finish in minutes (NFR-CSE-006).

## 8. Token design (secure link) (FR-CSE-050, NFR-CSE-009, ADR-004)

- **Opaque random token**, not a JWT (ADR-004): 256 bits from `System.Security.Cryptography.RandomNumberGenerator`, Base64URL-encoded (~43 chars). No business data inside.
- **Stored hashed only**: the plugin stores `SHA-256(token)` in `qdb_survey_invitation.qdb_token_hash` (alt key `qdb_invitation_token`). The plaintext exists only in the generated link; it is **never** persisted or logged (ANTI-005).
- **Single-use**: on successful submit, `qdb_token_used_on` is set and status → Submitted; a used token is refused thereafter (FR-CSE-050).
- **Expiring**: the token is valid only while the invitation is `Pending` and `now < qdb_expires_on` (FR-CSE-015).
- **Unguessable / rate**: 256-bit entropy makes guessing infeasible; the portal/API layer rate-limits token validation and the security review (NFR-CSE-009) signs off entropy, expiry, single-use and guess-rate before the channel is enabled. `qdb_survey_settings.qdb_securelink_enabled` defaults **false**, so the channel is disabled in every org until sign-off.
- **Identified, not anonymous** (C-3): the token maps to exactly one invitation and therefore one customer. The validate-token API resolves it server-side; the customer never authenticates but is always identified.

## 9. Integration API contracts (for QDB portal / backend / mobile)

All four are **Dataverse Custom APIs** (callable via the org Web API `POST /api/data/v9.2/qdb_srv_*` on cloud, or the Organization Service `Execute` on-prem). MSS delivers them + the renderer + docs; QDB builds the UI (FR-CSE-055). **The APIs never write to a mapped CRM entity** — survey submit only ever writes response tables (FR-CSE-053).

### 9.1 Auth model

| Target | Cloud | On-prem 9.1 |
|---|---|---|
| Portal **backend** → CRM | OAuth client-credentials, a dedicated **application user** (S2S), least-privilege (section 11) | AD **service account** (CRM app user); OAuth via AD FS / IFD, or Windows auth from the portal server |
| Who the call runs as | The portal backend's service identity, **not** the customer. The customer is identified by the invitation/token passed in the payload, validated server-side | Same |
| Caller-supplied identity | `customerId` (list) or `invitationId`/`token` (get/submit/validate) in the body; the API authorises that the invitation belongs to the named customer / the token resolves (FR-CSE-052/053) | Same |

The customer portal authenticates its own users (OQ-A2f — portal tech TBC); the portal backend is trusted to pass the authenticated customer id. The secure-link path needs no login: the token is the authorisation (section 8).

### 9.2 `qdb_srv_ListPendingSurveys` (FR-CSE-051)

- Request: `{ customerId: string (GUID), language?: "ar"|"en" }`
- Response: `{ surveys: [ { invitationId, setupId, formCode, title, message, pinnedVersion, language, expiresOn, channel } ] }`
- Returns only `Pending`, not expired, belonging to the customer. Title/message in requested language (fallback to default). Expired/submitted excluded (FR-CSE-051 criteria).
- This is the mechanism for **Portal delivery** (FR-CSE-047): a Portal-channel invitation is simply exposed here, and the QDB portal/app renders it as the pending-survey popup or notification item. No push is sent for Portal channel.

### 9.3 `qdb_srv_GetSurvey` (FR-CSE-052)

- Request: `{ invitationId?: string, token?: string, language?: "ar"|"en", callerCustomerId?: string }`
- Response: `{ formCode, version, language, renderJson }` where `renderJson` is the gunzipped DFE render-cache JSON for the invitation's **pinned** version + language.
- Authorisation: invitation must belong to `callerCustomerId` **or** be unlocked by a valid `token`. A request for another customer's invitation → `403 survey_forbidden` (FR-CSE-052). Expired → `410 survey_expired`.

### 9.4 `qdb_srv_SubmitResponse` (FR-CSE-053)

- Request: `{ invitationId?: string, token?: string, callerCustomerId?: string, answers: [ { questionCode, value } ], answersJson: string }`
- Validates: invitation open, not expired, belongs to caller/token (FR-CSE-015/050). Then writes **1 Response + N Answer rows + JSON** (FR-CSE-056), flips invitation → Submitted, sets `token_used_on`. Idempotent on re-submit via the response alt key (one response per invitation).
- Response: `{ responseId, status: "submitted" }`. Never writes to a mapped entity (FR-CSE-053).

### 9.5 `qdb_srv_ValidateLinkToken` (FR-CSE-054)

- Request: `{ token: string }`
- Response: `{ valid: true, invitationId, setupId, formCode, language } | { valid: false, reason: "used"|"expired"|"unknown" }`
- Hashes the token, looks up by alt key, checks single-use + expiry (section 8).

### 9.6 Error codes (consistent across all four)

| HTTP | code | Meaning |
|---|---|---|
| 400 | `survey_bad_request` | Missing/invalid parameters |
| 401 | `survey_unauthenticated` | Caller identity not established |
| 403 | `survey_forbidden` | Invitation does not belong to the caller |
| 404 | `survey_not_found` | Unknown invitation/token |
| 410 | `survey_expired` | Invitation/token past expiry |
| 409 | `survey_already_submitted` | Re-submit of a closed invitation |

> On-prem note: a CRM Custom API surfaces faults as `OrganizationServiceFault`; the thin REST facade (if the portal calls Web API) maps these to the HTTP codes above. The *codes* are the contract; the transport differs per org.

## 10. SMS hand-off and email activities (FR-CSE-048, 049, OQ-07)

### 10.1 SMS — per-org configured table (FR-CSE-048, OQ-A2e)

- The engine **never builds a gateway** (out of scope). It hands off by **creating a row in the per-org SMS table** described by `qdb_survey_sms_config` (4.9). The recipient, message and customer-link columns, plus any required static columns, are all config — so Org A (e.g. `letter`) and Org B (e.g. `fax`) work with **no code change** (FR-CSE-048; memory: DCP SMS table differs per org — HL=`letter`, BFD/QDB1=`fax`).
- The engine composes the message from the setup's bilingual title/message + the secure link (if SecureLink channel), in the customer's language, and writes the row. The existing QDB SMS service picks it up.
- If `qdb_survey_sms_config` is absent/incomplete on an org, SMS dispatch is skipped and logged (PAT-003); portal/email still work.

### 10.2 Email — CRM email activity (FR-CSE-049)

- The engine creates a standard CRM **email activity** addressed to the customer, Regarding the invitation, in the customer's language, carrying the message + secure link.
- Delivery is the org's existing channel: **Email Router** on-prem, **server-side synchronisation** on cloud (FR-CSE-049). No code difference — creating the activity is the engine's whole responsibility.

## 11. Security architecture (FR-CSE-059, 060, Article VII)

### 11.1 Roles

| Role | Can | Cannot | Req |
|---|---|---|---|
| **Survey Admin** | CRUD setups, triggers, settings, sms_config; read sources; read suppression log | **Activate/deactivate a source** (needs System Administrator — plugin-step registration, FR-CSE-003); **read Response/Answer content** | FR-CSE-059 |
| **Survey Analyst** | **Read** Response + Answer (the only role that can); read setups for context; Excel export | Write/alter setups or triggers | FR-CSE-060 |
| **System Administrator** | Activate/deactivate sources (A3) | — | FR-CSE-003, A-07 |
| Integration **application/service user** | Minimal: read render cache, read/write invitation + response + answer + suppression log, read config | Alter setups/sources; read nothing outside the survey tables it needs | section 9.1, least-privilege Article VII |

- **Answer-content restriction** (FR-CSE-060): `qdb_survey_response` and `qdb_survey_answer` read privilege is granted **only** to Survey Analyst (and the service user for write). A user with full access to the *customer* record does not inherit answer access — the tables are not parented to the customer for cascade, and answer read is role-gated, not ownership-gated. Verified by the FR-CSE-060 test (full-customer-access user cannot read answers).
- **Suppression log append-only** (NFR-CSE-001, Article VI): all roles get Create only; no Write/Delete. Defence-in-depth guard plugin on Update/Delete.

### 11.2 Secrets, boundaries, service accounts

- No secrets in code/logs (ANTI-005, Article VII). Service-principal secrets live in each org's secure store / `.env` on the portal backend, referenced by name only.
- The only external boundary is the secure-link token page, hosted **inside the existing internet-facing portal** (OQ-13) — no new DMZ component. Token path gated by NFR-CSE-009.
- The engine makes **no outbound network calls from plugins** (Article X) — SMS/email are CRM-record hand-offs, not HTTP.

## 12. Retention (FR-CSE-058, OQ-A1)

Implemented as pass 3 of the daily API (7.1). Config in `qdb_survey_settings` (`qdb_retention_days`, `qdb_retention_mode`). **Hard release gate** (NFR-CSE-008): the value and PDPPL classification come from QDB Compliance (OQ-A1); until set, the pass is a no-op and the gate is open at the data level, not blocking the build (ARC-P-003 — residency/compliance named at architecture time with an owner). Anonymise mode clears `qdb_customer_id`, `qdb_answers_json` PII and answer text, keeping aggregate-safe numeric/code columns for reporting.

## 13. Deployment and ALM (2 on-prem 9.1 + 1 cloud)

### 13.1 Solutions and layering

| Solution | Contents | Managed? |
|---|---|---|
| **DFE** (existing, `dfe-baseline-2026-11-08`) | Designer, runtime, cache, plugin, Custom APIs + the **additive** survey changes (section 5) | Managed in client orgs |
| **SurveyEngine** (new) | All `qdb_survey_*` tables, `SurveyTriggerPlugin`, the Custom APIs (A1/A2/A3), seed source rows, roles | Managed; **removable without touching DFE** (C-5, NFR-CSE-004) |

- SurveyEngine **depends on** DFE (reads the render cache, reads `qdb_form_definition.qdb_form_type`) but DFE has **zero** dependency on SurveyEngine — removing SurveyEngine leaves every DFE form publishing and rendering (NFR-CSE-004 test).
- Prefix `qdb_` + `survey` segment (ADR-002); publisher must match each org's `qdb` publisher or names must be recreated (cannot rename — RENDER-CACHE-SCHEMA on-prem note, reference_publisher_prefix trap).

### 13.2 Upgrade order (per org)

1. Deploy **DFE** release (carries section-5 changes) **first**.
2. Run the **FR-CSE-025 regression gate**; a diff on any existing form blocks the release.
3. Deploy **SurveyEngine** second (it needs `qdb_form_type` to exist).
4. Import seed config (source rows, settings row); set per-org values (status codes, origin field, language field, SMS config) — data, not code (OQ-A2, section 18).
5. Register the daily scheduler (7.2). Activate sources (A3) only after config is set.

### 13.3 Packaging (GOT-001..004, PAT-001, ANTI-003)

- Hand-built ZIP for on-prem: `<Managed>` per stage, `[Content_Types].xml` at root, **every** component listed individually in `RootComponents` with both id and schemaName, `FileName` leading `/`, deterministic md5-derived GUIDs. Generate the manifest from build output every run.
- Alternate keys (`qdb_invitation_dedupe`, `qdb_invitation_token`, `qdb_response_invitation`, `qdb_survey_source_key`) need their key columns present before the key component imports (RENDER-CACHE-SCHEMA on-prem note).
- MetadataIds for on-prem RootComponents obtained from the cloud unmanaged export's `customizations.xml` (never guessed).

### 13.4 CI/CD

- On-prem: Azure DevOps + the packaging script (constitution DevOps on-prem). Cloud: PAC CLI (Article XI) + GitHub Actions.
- Pipeline stages: build plugin (4.7.1, merge+sign) → build DFE additions → run tests + coverage (NFR-CSE-007) → run FR-CSE-025 regression gate → package → deploy to a test org → live-org verification round trip (PAT-002, ANTI-002) → promote.
- Never diagnose a plugin fix on the first post-deploy call (GOT-007, ANTI-004); deploys can exit 0 with a failed publish — re-run PublishAllXml with retries (memory: DFE-DEFAULTS).

## 14. Test strategy outline (Article IV, NFR-CSE-007)

| Layer | What | How |
|---|---|---|
| C# unit | Transition check, fatigue/priority/duplicate, milestone count+baseline, token hash/entropy, dedupe-key composition | FakeXrmEasy-style in-memory, no live calls in CI. ≥80% branch on survey code (NFR-CSE-007) |
| DFE TS unit | Save-defect fix round trip (FR-CSE-024), `SRV-` validation (FR-CSE-023), survey submit branch (FR-CSE-053) | Vitest; both shared type files kept in sync (GOT-019) |
| Custom API integration | List/Get/Submit/Validate happy + validation + auth failures (Article IV minimum: happy + validation + auth) | Round trip against a test org via Execute/Web API |
| Regression gate | FR-CSE-025 content comparison | The gate script itself is the test; run before every DFE deploy |
| Live-org acceptance | Every CRM-facing FR (ANTI-002, PAT-002): fire a real trigger, read the real invitation, submit through the real API, read response+answer rows back | **Mandatory** — test-suite green is necessary, never sufficient |
| Idempotency | RunDueSurveys twice same day → no duplicates (FR-CSE-033); re-submit → one response | Live round trip |
| Isolation | Remove SurveyEngine → all DFE forms still publish/render (NFR-CSE-004) | Test org |

Traceability: each test name carries its FR/NFR id (Article XV). Coverage report is the NFR-CSE-007 evidence.

## 15. Phased build plan with estimates

Estimates in dev-days for one engineer; CRM/plugin + DFE TS work. Excludes QDB-side portal/app build (their scope) and the external security review (gated, parallel).

| Phase | Scope | FRs | Est (days) |
|---|---|---|---|
| **B0 — DFE prerequisites** | Save-defect fix (5.4); `Form Type` column + types (5.1); `SRV-` validation (5.3); regression gate script + baseline (5.5) | 019, 023, 024, 025 | 5–7 |
| **B1 — Schema + solution skeleton** | All `qdb_survey_*` tables, alt keys, roles, seed source rows, settings/sms_config; SurveyEngine solution + packaging | 001, 005, 056, 059, 060, NFR-004 | 5–6 |
| **B2 — Trigger plugin core** | Generic plugin, transition check, config resolution, invitation create + dedupe, version pin, channel resolve, suppression log | 026–030, 044, 045, 046, NFR-001/002 | 7–9 |
| **B3 — Fatigue / priority / milestone** | Fatigue, drop/postpone, priority, milestone live-count + baseline | 034–043 | 5–7 |
| **B4 — Activation + auto-registration** | `ActivateSource`/`Deactivate` (A3), step registration, SysAdmin gate | 002, 003, 004, 006, 029 | 3–4 |
| **B5 — Daily API + scheduler** | `RunDueSurveys` (scheduled population, postponed release, retention); Win Task + Power Automate wiring | 031–033, 042, 058 | 5–6 |
| **B6 — Integration APIs + submit branch** | List/Get/Submit/Validate; survey submit branch in runtime; token design | 047, 050–055 | 6–8 |
| **B7 — Dispatch** | SMS per-org hand-off; email activity | 048, 049 | 2–3 |
| **B8 — Reporting + retention finish** | Views, charts, Excel export; answer normalisation (text/numeric) | 057 | 3–4 |
| **B9 — Hardening + ALM** | Live-org verification across 3 orgs, regression gate runs, docs for QDB teams, deployment runbooks | NFR-003/006/007 | 5–7 |
| | **Total** | | **46–61 dev-days** (~9–12 weeks) |

**Gated, not estimated here:** NFR-CSE-009 secure-link security review (external, blocks SecureLink enablement — B6/B7 build it disabled); OQ-A1 retention value (Compliance, blocks release not build); OQ-A2 per-org values (QDB IT/CRM admin, blocks go-live config not code).

Critical path: B0 → B1 → B2 → B3. B5/B6 can parallelise after B2. B0 is a hard prerequisite (A-03).

## 16. Architectural risks (ranked)

| # | Risk | Likelihood×Impact | Mitigation |
|---|---|---|---|
| R1 | **DFE regression** — an additive change silently alters an existing form's published JSON (ARC-M-002 precedent) | Med × High | FR-CSE-025 content-comparison gate blocks the release; additive-only rule; both type files kept in sync (GOT-019); live-org parity (PAT-002) |
| R2 | **Per-org status/field drift** — a status code or origin field differs across the 3 orgs and config is wrong → triggers mis-fire or never fire | High × High | All table/field/status values are config rows (FR-CSE-006); OQ-A2 confirmation per org before activation; a "dry-run" validation of a source row against live metadata before activate |
| R3 | **Secure-link token abuse** — guessing, replay, or a leaked link | Low × High | 256-bit opaque token, hashed storage, single-use, expiry, rate-limit; NFR-CSE-009 review gate; channel disabled by default (section 8) |
| R4 | **PDPPL / retention not signed off** blocks go-live late | Med × High | Raised at architecture (ARC-P-003); configurable retention built now; named gate with Compliance owner (OQ-A1, NFR-CSE-008) |
| R5 | **Scheduler not available on-prem** (A-04) | Low × Med | API is caller-agnostic; Win Task preferred, documented fallbacks; cloud uses Power Automate |
| R6 | **Plugin-step auto-registration** fails or lacks rights in an org (A-07) | Med × Med | A3 runs as SysAdmin; service account rights checked at deploy; registration recorded in `qdb_step_registration_json` for clean removal |
| R7 | **Milestone live-count cost** grows if a customer has many qualifying records | Low × Med | Volumes low (9.2, ~1.1 disb/customer/month); indexed query on customer+status+type+date; count query bounded |
| R8 | **Duplicate under concurrency** — two events for one customer at once | Med × Med | DB-level alternate key (412, GOT-024) is the real guard; pre-check is only an optimisation |
| R9 | **SMS table contract wrong** (OQ-A2e) → hand-off rows rejected by the SMS service | Med × Med | Per-org `qdb_survey_sms_config`; confirm the contract with QDB IT before enabling SMS; skip+log if misconfigured |
| R10 | **Language field unknown** (OQ-A2c) → wrong-language invitations | Med × Low | Config `qdb_language_field` + default fallback; absorbs any answer |

## 17. OQ-A2 resolution

The architecture resolves OQ-A2 **by making every unknown a configuration value**, so the client's answer changes *data*, never *code* (Article V, ARC-M-001, PAT-003). Each item below states the assumption the design makes and the absorbing mechanism.

| OQ-A2 | Design assumption | How a different answer is absorbed | Still needs client? |
|---|---|---|---|
| (a) target entity of `qdb_Customer_Name`, `qdb_CIF_No` | Assumed **Account** | The plugin reads the target entity from the lookup's `EntityReference.LogicalName` at runtime — it is never hardcoded. If the lookup targets Contact or a custom entity, the engine works unchanged | **Confirmation only** — design is target-agnostic. Needed to set up Analyst views and the integration customer-id contract |
| (b) `statuscode` values per source per org | None hardcoded | `qdb_survey_trigger.qdb_status_values` per trigger, per org (FR-CSE-006). A validation step checks codes against live metadata before activation | **Yes — values required** per source per org before activation (go-live config, not code). QDB CRM admin |
| (c) customer preferred-language field | Assumed a field exists; **fallback to `qdb_default_language`** | `qdb_survey_settings.qdb_language_field`; if empty, default language used | **Yes — field name** (or confirm none exists → default). QDB CRM admin |
| (d) Digital vs Legacy origin field | Assumed per-source field; **fallback = default channel (Digital)** | `qdb_survey_source.qdb_origin_field` + `qdb_origin_digital_values`; empty → default (4.11) | **Yes — field name per source** (or confirm none → all treated as default). QDB CRM admin |
| (e) QDB SMS service hand-off contract | Assumed a per-org SMS activity table (memory: `letter`/`fax`) | `qdb_survey_sms_config` (table + columns + static columns) per org (FR-CSE-048) | **Yes — the table + column contract** per org before SMS is enabled. QDB IT |
| (f) customer portal technology + auth, token page hosting | Assumed existing internet-facing portal hosts the token page (OQ-13); APIs are portal-agnostic Custom APIs | QDB builds UI (FR-CSE-055); only the S2S app-user / service-account setup and `qdb_securelink_base_url` are per-org config | **Yes — portal tech + auth** to finalise S2S setup and the secure-link review (NFR-CSE-009). QDB IT + QDB teams |

**Net:** none of OQ-A2 blocks the **build** (B0–B9 proceed on the config-driven design). (a) is confirmation-only. (b)–(f) are **go-live configuration** the client must supply per org; they gate *activation* of the affected capability, not the code. This is the ARC-P-003 pattern — the unknowns are named gates with owners, not audit-phase surprises.

## 18. Cross-artifact analysis (Article XIX)

Per `.claude/protocols/cross-artifact-analysis.md`, run before the CEO Phase-3→4 gate. No QA document exists yet (QA is Phase 5), so the mechanical gate's QA column is expectedly empty; the QA plan must cover every FR/NFR when written, and this architecture names the required test layers (section 14) to seed it.

**Mechanical subset (`gate-analyze.sh customer-survey-engine`):** the script counts only 6 ids and flags them, because its id regex matches `FR-nnn`/`NFR-nnn`, **not** this BRD's `FR-CSE-nnn` / `NFR-CSE-nnn` format. This is a **tooling-format mismatch, not a coverage gap** — verified manually below. (Recommendation: generalise the gate regex to the `-CSE-` segment form; logged in section 19.)

**Manual coverage (authoritative):**
- Architecture references **56 of 60** FR-CSE ids and **all 9** NFR-CSE ids directly; the 4 initially unreferenced (011, 020, 022, 047) were added in sections 5, 6.3 and 9.2. **All 60 FR + 9 NFR are now addressed by an architecture element.** Full BRD coverage.
- No placeholders (`NEEDS CLARIFICATION` / TODO / TBD) in this architecture.

**Semantic passes (architect's reading):**

| Pass | Finding | Severity |
|---|---|---|
| A. Duplication | No requirement is implemented two ways. Dedupe is single-sourced in the alternate key (one mechanism, FR-CSE-044/NFR-CSE-002). | OK |
| B. Terminology drift | One name per concept, aligned with the BRD: *source / setup / trigger / invitation / response / answer / suppression log*. "Secure link" = token channel throughout (not "magic link"). "Pinned version" used consistently. | OK |
| C. Coverage (semantic) | Every BO maps: BO-01→triggers; BO-02→DFE designer reuse; BO-03→fatigue/priority/duplicate+log; BO-04→setup lifecycle; BO-05→config sources; BO-06→roles+retention+residency; BO-07→APIs+renderer. | OK |
| D. Scope creep | No architecture element lacks a requirement. Items that could look like additions (sms_config, settings row) exist to satisfy FR-CSE-048/040/058. Recommendations are kept out of the design (section 19). | OK |
| E. Constitution MUSTs | No conflict. Async plugin (Art X, C-7); SolutionUniqueName/no-Default-solution (Art XI); audit columns + append-only log (Art VI); no hardcoded ids/rules (Art V); least-privilege + secrets-by-ref (Art VII); observability via ITracingService + correlation (Art XIV — see §19 note); reuse before rebuild (Art XVII, Art XX). | OK — no CRITICAL |
| F. Residency/PDPPL | Named gate with owner (OQ-A1, NFR-CSE-008), raised at architecture time (ARC-P-003). | OK |

**Result: no CRITICAL finding.** The gate is **not blocked**. One mechanical-tool limitation (id-format) is noted for fixing but does not affect coverage, which is verified manually at 69/69.

## 19. Recommendations (not designed in — Article: no scope beyond BRD)

Listed, not built, per the hard constraint. For the CEO / a later BRD:

1. **Observability (Art XIV):** the design uses `ITracingService` + a correlation id per trigger evaluation and per API call; formal metrics (trigger p95, suppression rate, API error rate) and alert thresholds should be defined before go-live. Suggest a lightweight `qdb_survey_health` view over the suppression log. *In spirit of NFR-CSE-006 but not an explicit FR.*
2. **Generalise `gate-analyze.sh`** to recognise the `FR-<PRODUCT>-nnn` id format so future `-CSE-`/`-DCP-` style engagements get mechanical coverage.
3. **Activation dry-run** (not required by an FR): before activating a source, validate its configured field/status codes against live metadata and warn — prevents R2 mis-fires. Small, high-value; candidate for B4.
4. **Survey activation approval workflow** — already out of scope (BRD §8), flagged as the natural R2 release.
5. **Computed scores (NPS/CSAT/CES)** — out of scope; the numeric answer column (4.6) makes them cheap later.

## Skeptic Review

> CHALLENGE 1 — Hybrid/DFE coupling: We assume "additive only" keeps DFE forms untouched, but the Save-defect fix (5.4) edits `createField`/`updateField` that **every** form save runs through. That is not additive — it changes a shared code path. What proves no existing form's behaviour shifts when four previously-dropped properties suddenly persist? At 3am, a standard form that *happened* to rely on the drop could change. Is the FR-CSE-025 gate run after the Save fix too, not only after survey additions?

> CHALLENGE 2 — Trigger plugin at 10×: volumes say ~900 events/month, so we sized for almost nothing. If QDB onboards a fourth high-volume source (the design *invites* this — FR-CSE-002), the milestone live-count query (6.5) runs per qualifying event per customer. At 10× with large per-customer histories, is the indexed count still inside the 2-minute async window, or do we need a bounded/paged count? We asserted "low cost" from today's numbers, not from the unlimited-sources promise we made.

> CHALLENGE 3 — Dedupe alternate key as the only real guard: we lean on a string `qdb_dedupe_key` + 412. If the plugin composes that key even slightly differently for the pre-check vs the create (e.g. casing of a GUID, null milestone index vs "M"), we get either silent duplicates or false collisions that drop legitimate invitations into the suppression log forever. One composition function, one test — but is there a single source of truth for the key, or two call sites that can drift?

> CHALLENGE 4 — Token path we built but disabled: SecureLink is off by default and gated on a review, yet B6/B7 build it. The simplest attack isn't the token (256-bit) — it's the **portal token page** QDB builds, outside our control (OQ-A2f), and the rate-limit we hand-waved to "the API layer". Who actually enforces guess-rate limiting — our Custom API, or a portal we don't own? If it's theirs, our NFR-CSE-009 sign-off is signing off half a system.

> CHALLENGE 5 — "Config absorbs OQ-A2" optimism: we claim every unknown is config, so nothing blocks build. But if the Digital/Legacy origin field simply **does not exist** on a source (plausible — no table had a submitted flag either), the fallback makes *everything* Digital, and per-channel delivery (a headline feature, FR-CSE-010) silently collapses to one channel. Is "absorbed by config" hiding a requirement that can't actually be met on real QDB data?

> CHALLENGE 6 — Async means the user sees nothing: triggers are async so they never block the save (correct). But an admin who misconfigures a trigger gets **no feedback** — the failure is a suppression-log row or a plugin trace nobody reads. At 3am a whole quarter's scheduled run could half-fail and the first signal is "customers didn't get surveys". Where is the operational alarm, given Art XIV metrics are only a *recommendation* (§19) and not a built requirement?

> CHALLENGE 7 — Simpler alternative to auto-registration: `ActivateSource` programmatically registers plugin steps (6.1) — powerful, and a well-known source of "works in dev, no-ops in prod" when the service account lacks prvCreateSdkMessageProcessingStep (R6). Could we instead ship steps for the three known sources in the solution and make only *additional* sources use dynamic registration? We took the harder, riskier path for a "unlimited sources with no deployment" promise that §9.2 volumes suggest will rarely be exercised.

> CHALLENGE 8 — One response per invitation vs real life: the response alt key enforces one submission. But surveys get partially filled, abandoned, resumed. We designed submit as atomic (1 Response + N Answers). Did we design for **draft/resume** at all, or will the first production complaint be "I lost my half-finished survey" — a case the BRD didn't name but production certainly will?

These challenges must be addressed before Phase 4 begins.

### Resolutions

- **CHALLENGE 5 — RESOLVED (user, 2026-11-09).**
  - Every request table has a flag identifying a Digital or Legacy request, so per-channel delivery (FR-CSE-010) can be met on real QDB data.
  - The flag's field name per source is still go-live configuration (`qdb_survey_source.qdb_origin_field`, OQ-A2d). It is a confirmation, not a risk.

**The remaining challenges are resolved as follows. Approved by the CEO (user), 2026-11-09, with the architecture.**

| # | Resolution |
|---|---|
| 1 | Run the FR-CSE-025 content regression gate **after the Save-defect fix (B0)** as well as after each survey change. Capture the baseline BEFORE the Save fix. |
| 2 | Index the milestone count query (customer + status + type + date) and bound it. It is fine at the current volumes; re-check if a high-volume source is added. |
| 3 | **One** function composes `qdb_dedupe_key`, used by both the pre-check and the create, with a dedicated unit test. |
| 4 | Rate-limiting the token page is a **stated integration requirement on QDB's portal team**, recorded in the integration docs (FR-CSE-055). Guessing is already infeasible with 256-bit tokens. NFR-CSE-009 reviews both sides. |
| 5 | Resolved (above). |
| 6 | **Approved scope addition:** a "Survey health" view (suppression reasons, plugin and job errors) so admins see failures. Built in B8. Traced to this approval, not to a BRD FR. |
| 7 | **The plugin steps for the three known sources ship pre-registered in the solution.** `ActivateSource` registers steps dynamically only for sources added later. This removes go-live dependence on step-registration rights (R6). |
| 8 | Check whether the runtime's existing Save Draft works for survey forms. If it does, keep it. If not, there is no draft/resume in release 1. |

### Implementation decisions (B0, 2026-11-10)

| Topic | Decision | Why |
|---|---|---|
| Survey code prefix (FR-CSE-023, §5.3) | `srv-` **or** `srv_`, lowercase, not `SRV-` | Publish rule PV-002 accepts only lowercase codes, so an `SRV-` code could never publish. The designer's Code box turns hyphens into underscores, while existing org codes use hyphens, so both separators count. |
| `qdb_form_type` values (§5.1) | Standard = 100000000, Survey = 100000001 | Matches every other DFE picklist (100000000 range), instead of the 1 / 2 sketched in §5.1. |
| Save defect scope (FR-CSE-024, §5.4) | 17 properties fixed, not 4 | FormSaveService also dropped the bar fields, document view/download toggles, info-card list style and download icon, file download label/icon, document settings and Label content. One mapper now feeds create and update. Unset values are omitted so an org lacking a newer column is not broken. |
| Unprovisioned column | Load falls back to a select without `qdb_form_type`; Save writes it only when a type was chosen | The column exists on no org yet. Naming a missing column fails the whole request. |
| Regression gate stamps (§5.5) | Strips `version` and `modifiedAt`, the keys the C# publisher actually emits | The first draft listed field names the publisher never writes. Re-publish bumps `version`, which would have failed every form. |
