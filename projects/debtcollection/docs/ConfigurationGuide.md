# DCP — Configuration Guide (Phase 0 design)

**Status:** proposal · 2026-09-17 · Master Prompt §12–14 · Correction Prompt §2, §5–8, §22–23.
Purpose: organisation (HL / BFD) and platform (on-prem / cloud) differences are expressed as **rows and
environment settings**, never as branches in Collection code. Nothing here is provisioned.

---

## 1. Startup sequence (CP §5, MP "Platform detection")

```
 Web resource loads
    │
    ▼
 1. Resolve Runtime Context          Xrm.Utility.getGlobalContext():
    org URL · org unique name · user id · roles · CRM version (→ Web API version)
    platform = version-derived + qdb_platformconfiguration.qdb_platformtype (authoritative)
    │
    ▼
 2. Load Platform Configuration      one ACTIVE qdb_platformconfiguration row for this org
    + all ACTIVE qdb_platformmapping rows under it        (cached — §7)
    │
    ▼
 3. Initialise adapters              ICrmAdapter (Xrm.WebApi, version from context)
                                     IAuthContext (Entra | AD FS — for Integration Service calls)
                                     IMisDelinquencyService (Mock | Api via the service)
                                     Engine facades (codes from configuration)
                                     Communication channel → entity map
    │
    ▼
 4. Start the same Collection application   (components never ask "which platform / which org")
```

Failure at 1–3 is a hard stop with a diagnostic screen (no configuration row, more than one active row,
missing mandatory mapping) — never a silent default to HL or cloud.

---

## 2. `qdb_platformconfiguration` — one active row per deployment

| Column | Type | Meaning |
|---|---|---|
| `qdb_name` | string (primary) | e.g. `HL-OnPrem-PROD` |
| `qdb_platformtype` | choice `qdb_platform_type` (OnPrem · Cloud) | authoritative platform flag |
| `qdb_organizationcode` | choice `qdb_organization_code` (HL · BFD) | which book this org holds |
| `qdb_environmentcode` | string | DEV · TEST · PROD (free text, not a secret) |
| `qdb_customertype` | choice `qdb_customer_type` | Individual (HL) · SME/Corporate (BFD) default |
| `qdb_customerentity` | string | `contact` (HL) · `account` (BFD) |
| `qdb_customerprimaryid` | string | `contactid` · `accountid` |
| `qdb_customerbusinessidfield` | string | field holding QID (HL) / CR number (BFD) — `TBD — Requires QDB Confirmation` |
| `qdb_customerdisplaynamefield` | string | `fullname` · `name` |
| `qdb_customerlookupfield` | string | `qdb_customerid` (same on both — Customer type) |
| `qdb_facilityentity` | string | the physical facility master this deployment **resolves against** (resolution only — it is never a branch in Collection logic). **HL Facility Entity = `TBD — Requires QDB Confirmation`**; **BFD Collection Facility/Account Target = likely `qdb_account`, `TBD — Requires QDB Confirmation`** |
| `qdb_facilityprimaryid` | string | `TBD — Requires QDB Confirmation` |
| `qdb_facilitybusinessidfield` | string | field holding the MIS Account Number → canonical `facilityNumber` — `TBD — Requires QDB Confirmation` |
| `qdb_facilitylookupfield` | string | **optional.** Name of the per-deployment `qdb_facilityid` extension relationship, when one is deployed. Empty ⇒ no physical lookup exists and the canonical `facilityNumber` + `sourceSystem` carry the link. Never read by Collection business logic — only by the adapter that resolves `facilityRef`. See §4a |
| `qdb_collectioncaseentity` | string | `qdb_collectioncase` |
| `qdb_collectionactivityentity` | string | `qdb_collectionactivity` |
| `qdb_smsentity` | string | `fax` |
| `qdb_whatsappentity` | string | `fax` |
| `qdb_emailentity` | string | `email` |
| `qdb_documentprovider` | choice (SharePoint · SharePointOnline · None) | document integration |
| `qdb_misintegrationenabled` | bool | master switch for both MIS paths |
| `qdb_misprovider` | choice (Mock · Api) | which `IMisDelinquencyService` implementation the Integration Service should report; the service's own `MIS_PROVIDER` env must agree (§6) |
| `qdb_integrationserviceurl` | string | base URL of the Integration Service for this deployment (not a secret) |
| `qdb_eligibilityrulesetcode` | string | Rule Engine ruleset for **Collection Eligibility / Grace** — §11 |
| `qdb_strategyrulesetcode` | string | Rule Engine ruleset for portfolio/strategy segmentation beyond the strategy rows — §11 |
| `qdb_contactholdrulesetcode` | string | Rule Engine ruleset for **Contact Hold / Special Handling** before any send — §11 |
| `qdb_snapshotpolicy` | choice `qdb_snapshot_policy` (AllReceived · EligibleOnly · ChangedOnly) | which MIS records are persisted as snapshots — §11 |
| `qdb_featureflags` | memo (JSON) | §5 |
| `qdb_isactive` | bool | exactly one active per org |

**Never stored here:** client secrets, passwords, certificates, MIS credentials, connection strings
(MP §13). Those live in the Integration Service environment / secret store only.

---

## 3. `qdb_platformmapping` — normalised child rows (MP §14)

| Column | Type | Meaning |
|---|---|---|
| `qdb_platformconfigurationid` | lookup | parent |
| `qdb_businessobject` | choice `qdb_business_object` (Customer · Facility · Case · Activity · Communication · Document) | canonical object |
| `qdb_canonicalfield` | string | e.g. `CustomerId`, `BusinessId`, `DisplayName`, `Mobile`, `Email`, `StopContact`, `FacilityNumber`, `ProductCode` |
| `qdb_crmentitylogicalname` | string | physical entity |
| `qdb_crmfieldlogicalname` | string | physical field |
| `qdb_datatype` | choice (String · Integer · Decimal · Money · Boolean · Date · DateTime · Lookup · Choice) | for coercion |
| `qdb_isrequired` | bool | startup validation fails if a required mapping is missing |
| `qdb_accessmode` | choice `qdb_mapping_access` (Read · Write · ReadWrite) | Collection may write only `Write`/`ReadWrite` fields |
| `qdb_source` | choice `qdb_mapping_source` (CRM · MIS · Derived) | where the value comes from |
| `qdb_transform` | string (optional) | named normaliser, e.g. `qidNormalise`, `bucketCode` — a registry in code, never an expression evaluated at runtime (no EAV, no eval) |
| `qdb_isactive` | bool | |

The canonical model is fixed in code (`Collection SDK` types); mappings only bind canonical fields to
physical ones. Adding a canonical field is a code change; rebinding it is a row change.

---

## 4. HL and BFD side by side (example rows — physical names only where known)

| Canonical | HL (contact) | BFD (account) |
|---|---|---|
| Customer.CustomerId | `contact.contactid` | `account.accountid` |
| Customer.CustomerType | Individual (config default) | SME / Corporate (`TBD — Requires QDB Confirmation` how distinguished) |
| Customer.DisplayName | `contact.fullname` | `account.name` |
| Customer.BusinessId (QID / CR) | `TBD — Requires QDB Confirmation` | `TBD — Requires QDB Confirmation` |
| Customer.Mobile | `contact.mobilephone` (or QDB field — `TBD`) | `account.telephone1` (or QDB field — `TBD`) |
| Customer.Email | `contact.emailaddress1` | `account.emailaddress1` |
| Customer.StopContact | `contact.qdb_stopcontact` (proposed extension) | `account.qdb_stopcontact` (proposed) |
| Customer.Deceased | `contact.qdb_deceasedflag` / `qdb_dateofdeath` / `qdb_deceasedsource` (proposed) | same on account |
| Customer.Vulnerability / SpecialHandling / Language | `contact.qdb_vulnerabilityflag` / `qdb_specialhandling` / `qdb_collectionlanguage` (proposed) | same on account |
| **Facility.FacilityNumber** (canonical ★) | `qdb_collectioncase.qdb_facilitynumber`, resolved from `<HL facility entity>.<account number field>` — `TBD` (MIS *Account Number*) | same canonical column; source field `TBD` (BFD identifier per MIS/API contract) |
| **Facility.SourceSystem** (canonical ★) | `HL` (from `qdb_organizationcode`) | `BFD` |
| Facility.ProductCode | `TBD` | `TBD` |
| Facility.FacilityRef (optional, resolved) | `<HL facility entity>.<primary id>` — **HL Facility Entity = `TBD — Requires QDB Confirmation`** | **BFD Collection Facility/Account Target = likely `qdb_account`, `TBD — Requires QDB Confirmation`** |
| Case.CustomerLookup | `qdb_collectioncase.qdb_customerid` → contact | `qdb_collectioncase.qdb_customerid` → account |
| Case.FacilityLookup (optional extension) | `qdb_facilityid` → HL facility entity, **only if that deployment extension is installed** | `qdb_facilityid` → BFD target, same condition — **a different physical relationship, not the same schema** |
| Communication.SMS / WhatsApp | `fax` | `fax` |
| Communication.Email | `email` | `email` |

Before any proposed `qdb_` extension is created on contact/account, the existing QDB fields on those
entities must be checked for overlap (the 3C Merging workbook lists 500+ `qdb_` account fields) —
`TBD — Requires QDB Confirmation`.

The React code path for both columns is identical: `customerService.getCustomer(id)` returns the
canonical `CollectionCustomer`; nothing calls `getContact()` or `getAccount()` (MP §12).

### 4a. Facility: canonical contract vs deployment extension (gate correction 4)

★ marks the **canonical** facility keys — `facilityNumber` and `sourceSystem`. Together with the resolved
Facility domain information they are the whole contract that Collection Services, the Rule Engine, MIS
processing and React are allowed to rely on. They are identical in every deployment.

Everything else about facilities is resolution detail:

| | Canonical (shared, portable) | Deployment extension (org-specific, optional) |
|---|---|---|
| What | `facilityNumber`, `sourceSystem`, resolved product/status/amounts/dates/position | a physical `qdb_facilityid` lookup on `qdb_collectioncase` |
| Where | shared core solution, shared domain model, shared contracts | org-specific solution layer, declared in `qdb_facilitylookupfield` |
| Portability | guaranteed | none — a lookup's target entity is **fixed metadata** and cannot be re-pointed at runtime by Platform Mapping |
| Same schema across orgs? | **yes** | **no.** An HL-targeted relationship and a BFD-targeted relationship are **two different physical relationships sharing a column name** |
| May business logic read it? | yes | **no** — only the facility adapter reads it, to populate the optional `facilityRef` |

Consequences that are not negotiable:

- **No branch on physical facility entity names.** React, the Rule Engine, Collection Services and MIS
  processing never test for `qdb_account`, `qdb_facility` or any HL equivalent.
- A deployment with **no** facility lookup extension is fully functional: canonical keys are sufficient
  to match cases, write snapshots, evaluate eligibility, run strategy and report.
- An unresolvable facility does not block processing — it routes to `qdb_identityexception` and the
  observation is still recorded with its source identifiers intact.

---

## 5. Feature flags (`qdb_featureflags`, JSON)

Flat object of boolean/enum flags read once at startup and exposed through `IFeatureFlags`:

`bfdRouting` · `liveMisDashboard` · `liveMisCase` · `backgroundMisSync` · `misRevalidationOnCriticalAction` ·
`communicationCenter` · `whatsapp` · `officialLetter` (Phase 2) · `fieldVisit` · `smartAssignment` ·
`formEngineForms` · `processEngineApprovals` · `ruleEngineStrategy` · `darkMode`.

Rules: a flag hides or enables a capability; it never changes business logic semantics. Unknown flags are
ignored with a warning. Flags are per deployment row, so HL and BFD, on-prem and cloud can differ without
a code change.

---

## 6. MIS provider switch (CP §22–23)

| Setting | Where | Values |
|---|---|---|
| `MIS_PROVIDER` | Integration Service env | `mock` · `api` |
| `qdb_misprovider` | configuration row | Mock · Api — informational for the UI badge; the service value is authoritative and `/health` reports it so a mismatch is visible |
| `MIS_BASE_URL`, `MIS_AUTH_*`, timeouts, page size, sync cron | Integration Service env | `TBD — Requires QDB Confirmation` |

Switching provider changes no React screen, no case/activity/PTP/strategy/assignment logic and no
Customer 360 code; both providers satisfy the same `IMisDelinquencyService` contract and contract tests.

---

## 7. Caching rules

| What | Cache | Invalidate |
|---|---|---|
| Platform configuration + mappings | in-memory for the session, keyed by org unique name + row `modifiedon` | on app load; manual "Reload configuration" (admin); on `modifiedon` change detected by a lightweight poll every N minutes (N from flags, default 15) |
| Activity types / outcomes / strategies / templates | session cache | same as above |
| Live MIS responses | none persisted; short in-memory TTL (seconds, configurable) to absorb double clicks; **never written to CRM** (CP §19) | Refresh button bypasses |
| Cached MIS position on the case | CRM columns written by background sync only | next sync batch |

No configuration is cached in `localStorage` in a way that survives a role change; the user's roles
come from the runtime context each load.

---

## 8. Document provider

`qdb_documentprovider` selects the adapter behind `IDocumentService`: SharePoint (on-prem) or SharePoint
Online (cloud), reusing QDB's existing document capability (MP §49). Site/library identifiers are
configuration values; credentials are not. If QDB's existing document integration exposes a different
mechanism, record it as `TBD — Requires QDB Confirmation`.

---

## 9. Integration Service environment (names only)

See `DeploymentGuide.md` §3. The service reads all env at startup through a validated schema
(`config.ts`, Zod); a missing or malformed value fails fast with the offending name. `DV_API_VERSION`
and `DV_BFD_API_VERSION` are new and mandatory; no code path may embed a version.

---

## 10. What is *not* configurable

Business invariants stay in code and plugins: the status transition matrix, immutability of snapshots
and the integration log, the stop-contact guard, "one active case per facility per episode",
communication validation order. Configuration selects *which* engine/entity/provider; it never
rewrites *what the rule is*.

Note the distinction from §11: the *order and existence* of the eligibility gate is an invariant (it
always runs before case creation, it cannot be bypassed); the *criteria and thresholds it applies* are
entirely configuration.

---

## 11. Collection Eligibility / Grace configuration (F2 decision, ADR-DCP-11)

**A MIS delinquency record is not a Collection Case.** After identity and facility resolution, background
sync evaluates a configurable eligibility gate before creating anything.

```
 MIS Delinquency record
        │
        ▼  Identity Resolution        → IdentityException
        │
        ▼  Facility Resolution        → FacilityException
        │
        ▼  ELIGIBILITY / GRACE  ── IRuleEngine.evaluate(qdb_eligibilityrulesetcode, context)
        │
        ├─ EligibleCreateCase        → create episode  (stamps qdb_eligibilityrulesetversion on the case)
        ├─ ExistingEpisodeUpdate     → update the open case, refresh cached position
        ├─ GraceMonitor              → no case; snapshot only (history without noise)
        ├─ ExcludedSpecialHandling   → no case; routed to special handling
        ├─ IdentityException         → qdb_identityexception
        └─ FacilityException         → qdb_identityexception
        │
        ▼  Strategy Evaluation (qdb_collectionstrategy rows + qdb_strategyrulesetcode)
```

The outcome, its reason, the ruleset code and version, and the evaluation timestamp are written to
`qdb_delinquencysnapshot` — so a record that produced **no** case is still explainable months later.

### Configuration surface

| Setting | Where | Purpose |
|---|---|---|
| `qdb_eligibilityrulesetcode` | platform configuration | which ruleset decides. Empty ⇒ every resolved record is `EligibleCreateCase`; logged loudly at startup so the permissive default is never silent |
| `qdb_snapshotpolicy` | platform configuration | `AllReceived` (full history, largest volume) · `EligibleOnly` (only records that produced or updated a case) · `ChangedOnly` (only when the position moved) |
| `qdb_contactholdrulesetcode` | platform configuration | Contact Hold / Special Handling, evaluated **server-side** before any manual or automated send |
| Criteria inside the ruleset | Rule Engine | DPD · arrears amount · **arrears relative to instalment** · product · facility/customer status · special handling · existing case · cure/grace period · any other approved Rule Engine criterion |

### Worked HL example — **sample configuration, not an application constant**

A candidate HL eligibility ruleset, derived from `HousingLoanDataAnalysis.md` (F2: 769 accounts —
17.6 % of the book — owe less than one instalment and hold QAR 83.6 k, 0.04 % of arrears; the whole 1-30
bucket collected 305 % of its arrears in one month):

| Order | Condition | Outcome |
|---|---|---|
| 1 | an open case already exists for the facility | `ExistingEpisodeUpdate` |
| 2 | customer/facility appears on the approved exclusion list | `ExcludedSpecialHandling` |
| 3 | `totalArrears < installmentAmount` | `GraceMonitor` — reason "arrears below one instalment" |
| 4 | `arrearDays < graceDays` | `GraceMonitor` — reason "within grace period" |
| 5 | otherwise | `EligibleCreateCase` |

> These rows are a **seeded recommendation for QDB confirmation**, not a default enforced in code. Every
> value in them — including whether rule 3 or 4 exists at all, and what `graceDays` is — is
> **`TBD — Requires QDB Confirmation`**. Nothing prevents QDB from configuring a completely different
> gate; the application behaves identically either way.

### Per-organisation independence

HL and BFD point at **different rulesets** and may differ materially: different criteria, different
thresholds, or none at all. Housing Loan evidence establishes HL defaults, strategy recommendations,
data-model requirements, required configurability and test scenarios — it must not constrain BFD, whose
SME/Corporate population may legitimately use exposure, different grace conventions and different
segmentation boundaries on the same build. The same applies to portfolio segmentation
(`qdb_strategyrulesetcode`): the operational/recovery split suggested by the HL data is a documented
**recommendation**, and no boundary such as ">2000 DPD = Recovery" is fixed in the architecture.

## 12. Collection Strategy, Strategy Action and Assignment configuration (Phase 3)

Three configuration tables became live surfaces in Phase 3. All three follow the same discipline, and
none of them contains a decision: they contain the *data* a decision is made from.

### 12.1 `qdb_collectionstrategy`

| Column | Meaning |
|---|---|
| `qdb_code` | What the strategy ruleset returns. **This is the join between the Rule Engine and the configuration** — the ruleset never returns a record or a GUID |
| `qdb_priority` | Lower wins when the ruleset names more than one code. **A tie is a refusal, not a coin toss** |
| `qdb_isactive` | A deactivated strategy is never selected, even if the ruleset names it |
| `qdb_effectivefrom` / `qdb_effectiveto` | Inclusive-from, exclusive-to. Outside the window the strategy is not usable, and naming it is an error rather than a silent skip |
| `qdb_noautomatedcontact` | Marks a strategy whose actions must not send automatically |
| criteria columns | Customer type, product, DPD from/to, arrears from/to, exposure from/to, risk level, NPL flag, broken-PTP count, legal status, restructure status. **Read by the ruleset; not evaluated by DCP** (KI-51) |

### 12.2 `qdb_strategyaction`

Ordered by `qdb_sequence`; `qdb_dayoffset` is relative to the action's trigger event. `qdb_isactive = false`
retires an action without deleting history. `qdb_communicationchannel` is read back as a **label** from the
provisioned choice, never as a raw option value. `qdb_activitytypeid` resolves to the activity type's
**code**, so no GUID appears in configuration or in source.

### 12.3 `qdb_assignmentconfiguration`

Same activation, priority and effectivity rules. `qdb_assignmentmethod` is exactly the provisioned choice —
`RoundRobin`, `Load`, `Territory`, `SmartAssignment`, `Manual`. `qdb_smartassignmentref` is an **opaque
handle** that DCP passes through unread.

> **DCP performs no routing.** Where the configuration selects `SmartAssignment` and QDB's capability has
> not been supplied, the platform refuses and says what must be confirmed (KI-09, ADR-DCP-14). No fallback
> algorithm exists, deliberately.

### 12.4 What an administrator sees when configuration is wrong

Every one of these is a named error carrying the column to fix — none of them is a default:

| Situation | Result |
|---|---|
| Ruleset names a code with no configuration | `NotFound` — *"the strategy ruleset selected 'X', which no Collection Strategy configuration defines"* |
| Ruleset returns no codes | `NoneApplicable` — *"no applicable strategy for this case"* |
| Two usable strategies share the top priority | `Conflict` — naming the count and the priority |
| The named strategy is inactive or outside its effective window | `NotEffective` |
| No active, effective assignment configuration | `NoneApplicable` |
| Two assignment configurations share the top priority | `Conflict` |
| Configuration selects `SmartAssignment` with no adapter | `Unavailable`, citing KI-09 |

All of them are written to `qdb_crmlogs` before they are raised.

## 13. Feature flags used by the Collection runtime (`qdb_featureflags`, JSON)

```jsonc
{
  // How the snapshot idempotency key is composed. No default — a wrong composition either
  // duplicates observations or collides them, so the deployment must state it.
  "snapshotKeyComposition": ["sourceSystem", "facilityNumber", "snapshotDate"],

  // Operation names for the three Rule Engine decisions. Custom API on cloud, Process Action
  // on-prem, same names. No default: an unconfigured decision is refused, never guessed.
  "ruleEngineOperations": {
    "eligibility":  "qdb_dcp_EvaluateEligibility",
    "strategy":     "qdb_dcp_SelectStrategy",
    "contactHold":  "qdb_dcp_EvaluateContactHold"
  },

  // "Provisional" (DCP composes the interim number) or "PlatformConfigured" (QDB's existing
  // auto-number mechanism fills it and DCP omits the column). See ADR-DCP-15.
  "caseNumbering": "Provisional"
}
```

**Only two members of the Collection runtime configuration have a fallback**, and each is the
conservative reading rather than a guess:

- **episode policy** — no configured reopen window means a re-delinquency starts a **new episode**, which
  is the rule the architecture already states;
- **case numbering** — absent, DCP composes the interim number, because QDB's mechanism holds no
  configuration row to defer to (KI-49).

Everything else must be configured or the organisation cannot run Collection at all: a missing snapshot
policy, eligibility ruleset or key composition **stops the organisation**, with an error naming the
setting and the table it lives in. That is the Phase 1 principle applied unchanged — *no hidden defaults
for critical business configuration*.

### Caching

`CollectionConfigurationService` reads the organisation once and caches the assembled runtime
configuration for the configured TTL. `clearCache()` makes a published configuration change take effect
without a restart. Both behaviours are tested.
