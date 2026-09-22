# DCP — Current State Assessment vs the Master Prompt

**Phase 0 artifact** (Master Prompt §85–86). First issued 2026-09-17; **revised the same day to apply
the Correction Prompt** (`ClaudeCorrectionPrompt.docx`, 48 §), which supersedes the first issue where
they differ. Produced from the consolidated repository at `projects/debtcollection/` (139 files) and the
cloud sandbox `org5869857f`. Nothing in this document changes code, schema or data.

Governing documents: `QDB DEBT COLLECTION PLATFORM COMPLETE REQUIREMENTS.docx` (Master Prompt, 105 §)
and the Correction Prompt. The Master Prompt's §1 description of the existing implementation is accurate
(11 tables, 6 plugin types, 92 C# + 45 TS tests, Fastify router, auth adapters, prototype).

Status vocabulary (CP §1, §43): *Specification · Mock · Code Written · Unit Tested · Cloud Runtime
Tested · On-Prem Compatible by Design — Runtime Test Pending · Accepted.*

---

## 0. Runtime-test status — an access constraint, not an architecture statement

On-prem 9.1 and Dataverse cloud are **equal deployment targets** (CP §1). Every DCP component that has
been runtime-tested so far was tested on the cloud sandbox because that is the environment reachable from
the development machine; the on-prem estate is not reachable from it. That is a development/test-access
constraint and nothing more. Consequences for the tracker:

| | Cloud | On-Prem 9.1 |
|---|---|---|
| Schema (11 tables, roles, queues, field security) | Cloud Runtime Tested | On-Prem Compatible by Design — Runtime Test Pending |
| Plugins (6 types / 30 steps / 14 images) | Cloud Runtime Tested (smoke 14/15) | On-Prem Compatible by Design — Runtime Test Pending |
| Fastify API + Dataverse client | Cloud Runtime Tested (data layer) | Runtime Test Pending (needs P1/P2 fixes first) |
| `AdfsAdapter` / `AzureAdAdapter` | `AzureAdAdapter` Cloud Runtime Tested | `AdfsAdapter` Code Written + Unit Tested; real AD FS proof pending (COND-008) |
| Provisioning / registration / smoke scripts | Cloud Runtime Tested | **Cannot run** (P2) — tooling adapter required |

An on-prem 9.1 organisation for DCP is a Phase 1 prerequisite — `TBD — Requires QDB Confirmation`.

---

## 1. Architecture-level conflicts (not naming)

| # | Repository decision | Master / Correction Prompt | Outcome |
|---|---|---|---|
| A1 | **ADR-DCP-02:** standalone Next.js portal + Fastify router outside CRM | MP §10–11: ONE React app as a **full-page CRM web resource** | ADR-02 superseded (ADR-DCP-07). Nothing lost — `apps/web` was never built; the house already ships single-file web-resource bundles. |
| A2 | **ADR-DCP-03:** portal-owned forms; Form Engine explicitly not adopted | MP §45: Form Engine for activity forms | Superseded in part; server-side-enforcement rule survives. |
| A3 | **ADR-DCP-01 second half:** `msst_dcpcommunication` custom activity | MP §32, CP §40: SMS/WhatsApp = **fax**, Email = **email** | Retire; 6 of 30 plugin steps become moot; ADR-01 amended (ADR-DCP-08). `nodemailer` + `ISmsGateway` withdrawn. |
| A4 | `msst_dcpcustomer` — 16-column customer master | MP §15, CP §6: Contact (HL) / Account (BFD); Customer 360 is aggregation | **Retire.** Field-by-field classification in `SchemaMigration_msst_to_qdb.md` §3. Collection flags (stop-contact, deceased, vulnerability, special handling, language) become `qdb_` extensions on contact/account (CP §7); the two dependent plugins retarget. |
| A5 | `msst_dcploanfacility` — 17-column facility master | MP §16, CP §8–9: existing facility entities; MIS owns the position | **Retire.** Case carries `qdb_facilitynumber` (MIS Account Number) + an org-specific facility lookup. Entity names `TBD — Requires QDB Confirmation`. |
| A6 | **ADR-DCP-06** + `msst_dcpptprecord` | MP §26: PTP = activity type | Consolidate into `qdb_collectionactivity`; Kept/Broken evaluation survives as a rule in background sync. |
| A7 | `msst_dcpauditlog` + `AuditLogWriter` on every field of 7 entities (14 async steps) | MP §52: native audit; custom log only for technical events | Replace with native audit (business) + the **existing `qdb_crmlogs`** for technical/integration evidence. Both the new `qdb_integrationlog` and the reuse of `qdb_integrationlogs` are **withdrawn — superseded by reuse of existing `qdb_crmlogs`** (QDB decision, gate correction 1). |
| A8 | Stop-contact enforced in the router (R-04) | Router no longer in the user path | The plugin guard (`StatusTransitionValidator.ContactBearingStates`) and the Communication Service become the controls. |
| A9 | Fastify serves normal CRM reads | MP §60, CP §36 | Data routes migrate to React → `Xrm.WebApi`; Fastify keeps live MIS, background sync, cross-org 360, system comms (ADR-DCP-09). |
| A10 | `dependencies.md` adopts nodemailer, `ISmsGateway`, puppeteer | MP §32, §48 | Withdrawn / deferred to Report Engine; `liquidjs`, `recharts`, `openid-client`, `pg-boss` (job state only) stay. |
| A11 | MIS design = nightly ingest → snapshot (ADR-DCP-05) | CP §11–33: **live MIS on user access + background sync**, no bulk writes on read | ADR-05 confirmed and extended; design in `MISIntegration.md`. |
| A12 | Implicit assumption that every delinquent MIS record becomes a Collection Case | F2 decision: a MIS record **is not** a case | **Collection Eligibility / Grace evaluation** inserted between facility resolution and case creation, via the Rule Engine (ADR-DCP-11). Six outcomes; decision recorded on the snapshot; no new entity, no new engine, no hard-coded threshold. |
| A13 | Phase 0 first issue asserted `>2000 DPD = recovery`, `QCB DEAD ⇒ stop contact`, and exposure "unused" | F1 / F6 / F9 decisions | All three **demoted to configuration or recommendation**: segmentation boundaries configured; contact hold is a server-side Rule Engine evaluation whose policy is TBD; **exposure retained** as an optional criterion (🔴 contradicts BRD FR-034 — amendment required). |

---

## 2. Entity reconciliation — MP §69 validated against the repository

| Existing | Cols | Used by (evidence) | §69 | Validated decision | Note |
|---|---|---|---|---|---|
| `msst_dcpcustomer` | 16 | `CustomerService`, `Customer.ts`, `StopContactQueueMover` trigger, validator guard (PreImage `msst_customerid`), field-security profile, 2 audit steps, smoke | RETIRE | **RETIRE** | flags → contact/account; QID key → contact |
| `msst_dcploanfacility` | 17 | 2 audit steps only | RETIRE | **RETIRE** | nothing reads it |
| `msst_dcpdelinquencysnapshot` | 8 | ImmutabilityGuard ×2, smoke | KEEP/REFACTOR | **KEEP/REFACTOR** → `qdb_delinquencysnapshot` | add CP §27 fields + `qdb_snapshotkey` |
| `msst_dcpcollectioncase` | 5 + 17 statuses | validator, default status, delete guard, mover target, queues, 2 audit steps | KEEP/REFACTOR | **KEEP/REFACTOR** → `qdb_collectioncase` | status matrix is the asset; `qdb_customerid` Customer lookup; `IsValidForQueue=true` |
| `msst_dcpcollectionaction` | 3 + activity base | subject composer, guard ×2, 2 audit steps | KEEP/REFACTOR | **KEEP/REFACTOR** → `qdb_collectionactivity` | type/outcome become lookups |
| `msst_dcpcommunication` | 6 + activity base | composer, guard ×2, 2 audit steps | RETIRE | **RETIRE** → fax / email | `msst_blockreason` needs a home |
| `msst_dcpptprecord` | 6 | validator + default-status PTP steps, 2 audit steps | REASSESS | **CONSOLIDATE** → activity type PTP | |
| `msst_dcpconsent` | 10 | nothing | REASSESS | **REASSESS** | existing QDB consent `TBD` |
| `msst_dcpauditlog` | 11 | AuditLogWriter, guard ×2 | REASSESS | **REPLACE** → native audit (business) + existing **`qdb_crmlogs`** (technical) | see §12 |
| `msst_dcpstrategyconfig` | 9 | 2 audit steps; nothing evaluates it | REFACTOR/SPLIT | **SPLIT** → strategy + strategy action | |
| `msst_dcpidentityexception` | 6 | `IdentityExceptionService`, route | KEEP/REFACTOR | **KEEP/REFACTOR** → `qdb_identityexception` | add MP §50 / CP §38 fields |

Also in scope: 13 global option sets, 12 roles, 3 queues, 1 field-security profile, 2 lookups on the
case (`msst_customerid`, `msst_facilityid`), alternate keys. Logical names cannot be renamed in place —
every `qdb_` component is create-new-then-migrate (MP §3). The `msst` prefix came from a house rule; the
other QDB engines already use `qdb_`.

---

## 3. Plugin reconciliation (MP §56–57)

All six plugin types pass the §57 scan: no `System.IO`, registry, SQL, `HttpClient`, `Environment`,
`Thread.Sleep`, assembly loading or hard-coded URLs; `net471`; `Microsoft.CrmSdk.CoreAssemblies
9.0.2.51`; strong-named; only `AddToQueueRequest` used. **On-Prem Compatible by Design — Runtime Test
Pending; Cloud Runtime Tested.**

| Plugin | Steps | Decision | Retarget |
|---|---|---|---|
| `StatusTransitionValidator` + matrix | 2 | KEEP/REFACTOR | case → `qdb_collectioncase`; stop-contact guard reads contact/account flag; PTP step → activity |
| `ImmutabilityGuard` | 9 | KEEP/REFACTOR | keep snapshot ×2, completed-activity ×2, case Delete; drop communication ×2 and auditlog ×2 |
| `DefaultStatusAssigner` | 2 | KEEP | case; PTP → activity |
| `ActivitySubjectComposer` | 2 | KEEP/REFACTOR | activity only; from activity-type lookup name |
| `StopContactQueueMover` | 1 | REFACTOR | trigger on contact/account `qdb_stopcontact`; fix `IsValidForQueue`; add smoke assertion |
| `AuditLogWriter` | 14 | REPLACE | native audit for business fields; any surviving technical events go to existing `qdb_crmlogs` |

Namespace → `Qdb.DebtCollection.Plugins` = new assembly identity (registers beside the old one).
`key.snk` is gitignored and exists only on disk.

---

## 4. Portability gate (MP §8, CP §2) — what would force source changes between targets today

| # | Finding | Where | Severity | Fix class |
|---|---|---|---|---|
| P1 | Web API version `9.2` hard-coded in application source (`app.ts` ×2, `org-router.ts` ×2; literal `v9.2` in `routes/health.ts`). On-prem 9.1 exposes v9.1. | `apps/api` | **Violation — fix in Phase 1** | configuration / runtime context; the URL builder already parameterises it |
| P2 | Provisioning, registration and smoke scripts hard-code the Entra token endpoint | `crm/scripts/lib/crm-client.mjs` | **Violation of MP §83** | tooling auth adapter (allowed to differ, must exist) |
| P3 | No solution package, no CI, no artefact for either target | repo | Gap | packaging |
| P4 | `IAuthAdapter` (AD FS / Entra) selected by env; no business code knows the flavour | `packages/auth-adapters`, `config.ts` | **PASS** | — |
| P5 | Plugins (see §3) | `crm/plugins` | **PASS** | — |
| P6 | No `if HL/BFD` logic; org selected by param + config | `org-router.ts` | PASS | becomes `qdb_platformconfiguration` |
| P7 | No hard-coded hosts, domains, IIS paths | all | PASS | — |
| P8 | Prototype: zero network calls, zero `Xrm`, zero iframe assumptions | `prototype/` | n/a | reference only (MP §94) |
| P9 | **Customer lookup**: single `qdb_customerid` of type Customer (contact + account) — **verified provisionable on both platforms** (`CreateCustomerRelationshipsRequest` in `Microsoft.Xrm.Sdk.dll` 9.0.2.51; `CreateCustomerRelationships` action present on the cloud org; `incident.customerid` reference). | design | **Resolved** | the first-issue two-lookup proposal is withdrawn (CP §4) |
| P10 | **Facility lookup**: target entity is fixed metadata and may differ between HL and BFD | design | Packaging difference | `qdb_facilitynumber` in the shared schema; `qdb_facilityid` added by the org-specific deployment step; names `TBD` |
| P11 | Browser → Integration Service authentication differs (AD FS vs Entra) | design | Adapter | isolated in the browser auth adapter; mechanism on-prem `TBD` |

---

## 5. Fastify / API reassessment (MP §60, CP §36)

| Responsibility | Keep? | Reason |
|---|---|---|
| Normal CRM reads/writes for the UI | No | React inside CRM uses the user's session via `Xrm.WebApi`; the two data routes retire |
| Live MIS access (breakdown, details, facility position) | **Yes** | server-side credentials, rate limiting, audit (CP §35) |
| Background MIS synchronisation | **Yes** | scheduler, watermark, idempotency; `pg-boss` for job state only |
| Cross-org Customer 360 fan-out | **Yes** | an HL web resource holds no BFD token (R-01) |
| System-initiated communication | **Yes** | same Communication Service and validation as manual sends |
| Stop-contact enforcement | moves to plugin + Communication Service | router no longer in every path |

Reusable: `buildODataUrl`, `CrmApiError`, `retry`, `Result`, `DomainError`, `DataverseClient`
(server-side), auth adapters, correlation-id plugin.

---

## 6. Existing QDB engines (MP §44, CP §41–42) — detail in `EngineReuseAssessment.md`

| Engine | Cloud | On-Prem 9.1 | Finding |
|---|---|---|---|
| Rule Engine (EDP) | 22 `qdb_edp_*` Custom APIs, live | Documented path: **Process Actions with identical plugin code** (`deploy/onprem/ONPREM.md`), not yet run on-prem | **Not a blocker** — Compatible by Design, Runtime Test Pending. The first-issue "hard blocker" finding is withdrawn. |
| Form Engine (DFE) | live | Same pattern documented (`PLUGIN-REGISTRATION.md` §3b); on-prem kit exists; open defects (designer blank, old plugin) | usable once the kit lands |
| Process Engine (CWFD) | runtime plugins live | unknown | `TBD — Requires QDB Confirmation` |
| Report Engine | live | prerequisites documented | unproven on-prem |
| Smart Assignment | **no artefact in repo or `D:\QDB`** | — | `TBD — Requires QDB Confirmation` |
| Fax → SMS/WhatsApp trigger | — | — | `TBD — Requires QDB Confirmation` |

Whether Custom API exists on QDB's on-prem 9.1 build is itself unconfirmed (EDP says no; DFE says "may be
unavailable"); DCP's own operations follow the same Custom-API-or-Process-Action pattern so the answer
does not change the design.

---

## 7. Security reconciliation (MP §53–55) — detail in `SecurityModel.md`

12 roles + 1 field-security profile provisioned on cloud. Mapping to `QDB DCP …` roles over the `qdb_`
entities; field security moves to contact/account PII columns. No Layer-3 UX security exists yet.

---

## 8. Test baseline (MP §87) — captured 2026-09-16/17

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| C# xUnit | **92** | 0 | 0 |
| TS `@dcp/api` / `@dcp/auth-adapters` / `@dcp/dataverse-client` | **19 / 14 / 12** | 0 | 0 |
| Cloud smoke `smoke-plugins.mjs` | **14** | **1** (queue move — `IsValidForQueue=false`, MP §59) | — |
| On-prem smoke | never run (P2) | | |

Tests are coupled to `msst_` names; under MP §81 they are fixed, not deleted.

---

## 9. Required and absent

React workspace · `qdb_platformconfiguration` · `qdb_platformmapping` · `qdb_collectionactivitytype` ·
`qdb_activityoutcome` · strategy/action split · `qdb_assignmentconfiguration` · `qdb_communicationtemplate`
· MIS live proxy + background sync + Mock provider · Communication Service · engine facades · browser
`ICrmAdapter` · CI/CD · solution packaging · tracker · phase reports. Phase 0 documentation now exists
under `docs/`.

---

## 10. `TBD — Requires QDB Confirmation` (consolidated)

1. On-prem 9.1 organisation for DCP. 2. **HL** facility entity logical name + business-id field (HL's
schema is not on the sandbox); for **BFD** the sandbox evidences candidates — `qdb_account` "Loan Account"
(`account_no`) and `qdb_facility` — which one the MIS *Account Number* resolves to needs confirmation.
3. Fax → SMS/WhatsApp trigger mechanism (`qdb_privsendsms` shows SMS is privilege-gated; mechanism still
unknown). 4. Smart Assignment existence/contract. 5. Existing consent capability. 6. Custom API
availability on QDB on-prem 9.1. 7. Existing `qdb_` **contact** (HL) fields overlapping the proposed flags —
on **account** (BFD) the sandbox shows none, so the flags are additions there. 8. `qdb_emailtemplate` /
EmailEditor as template engine. 9. Browser auth mechanism to the Integration Service on-prem. 10. All MIS
items in `MISIntegration.md` §12 (endpoints, auth, frequency, change feed, paging, BFD contract, Account
Status 7/8, exemption sign). 11. Whether the BFD **legacy DA collections module** (`qdb_da_case`, DA Task,
site visit, configuration) is in production use and holds data. 12. Whether `qdb_npl` is the NPL / legal
hand-off record and which legal entity receives DCP's Legal Recommendation. 13. Whether **`qdb_crmlogs`** may be extended with the DCP technical-logging columns it lacks (correlation id, batch/run id, severity, error code, retry count) — see `QdbCrmLogsReuseAssessment.md`. 14. Whether the document / legal-text templates cover official letters.

**Added or re-opened by the F1–F11 review (2026-09-17).** These are *business policy*, not engineering
questions: the architecture must make each one configurable, and **none of them may be encoded as a
threshold or rule in application source** while it is unanswered.

15. **Whether automated contact is prohibited above 2000 DPD** (BRD Q-09, still open). The Housing Loan
data supports the recommendation but the boundary and the permitted treatment are QDB's to set. No DPD
number is compiled into Collection logic; the rule lives in the contact-hold / strategy ruleset.
16. **The portfolio / strategy segmentation boundaries themselves.** `>2000 DPD = Recovery` is a
data-supported *recommendation*, not a definition — the operational/recovery split is not hard-coded, and
the Strategy Engine must accept DPD, bucket, product, arrears, exposure, customer type, facility type,
deceased/special-handling status, previous outcomes, PTP history and other approved criteria.
17. **Collection Eligibility / Grace thresholds** (ADR-DCP-11): the arrears-vs-instalment test, any DPD
floor, and the cure/grace period. The HL evidence (769 accounts below one instalment; ~1,600 month-end
churn records) motivates the rule; the values are ruleset configuration and may differ for HL and BFD.
18. **Whether QCB DEAD alone establishes a Contact Hold.** A confirmed deceased indicator must be *capable*
of immediately triggering a server-side Contact Hold / Special Handling rule; whether that indicator alone
is sufficient — versus requiring QDB deceased status, exemption state or a compliance step — is QDB's call.
19. **DPD as-of semantics** — the observed constant +16 days versus the balance date does not define the
MIS contract; `dpdAsOfDate` is carried provisionally and snapshot idempotency must key on authoritative MIS
source/as-of information once confirmed.
20. **Account Status 7 / 8 meanings** — kept opaque; the "7 = restructured/frozen, 8 = regular/active"
hypothesis is explicitly *not* encoded.
21. **Exemption Amount definition** — why a 50 % exemption carries an amount ≈ 100 % of balance, and the
sign convention.
22. **`lastArrearAmount` semantics** — it equals the instalment in the supplied dataset; whether that
relationship is universally true is unconfirmed, so no rule derives from it.
23. **HL identifier validation rules**, including the six 7-digit legacy ID numbers. These must be
preserved as source identifiers and **not rejected on length alone**; the validation rule is configurable
and confirmed with QDB. Mobile number is never an identity key.
24. **BFD business identity** — CR number, UEN, TRN or another approved stable identifier, established
from BFD's actual identifiers rather than generalised from HL.
25. **Final KPI definitions and targets** (financial/MIS and CRM operational KPI families kept
architecturally distinct), configurable and confirmed with the business before Phase 10.

---

## 11. ADR actions (MP §84) — executed in `../adrs/`

ADR-01 amended · ADR-02 superseded by 07/09 · ADR-03 superseded in part by 07 · ADR-04 confirmed +
extended by 10 · ADR-05 confirmed · ADR-06 superseded · new ADR-07 (full-page web resource), 08
(communication via fax/email), 09 (integration-service responsibilities), 10 (dual-platform single codebase).

---

## 12. Existing QDB schema discovered on the sandbox — see `ExistingQdbSchemaAssessment.md`

A read-only metadata sweep at the end of Phase 0 established that `org5869857f` carries a bulk-imported copy
of the **BFD CRM schema** (909 `qdb_` entities, solution `QDBAllEntites`, 2025-09-21): the customer is
`account`; `qdb_facility` and `qdb_account` "Loan Account" (with `arrear_amount`, `no_of_arrear_days`,
`collectibility`) are the facility/loan masters; a **legacy DA collections module** (`qdb_da_case`,
`qdb_da_configuration`, DA Task, site visit, staff, 7 collection reasons) exists; so do `qdb_npl`,
`qdb_customer_mis`, a legal module, `qdb_emailtemplate`, `qdb_privsendsms`, `qdb_integrationlogs` and
**`qdb_crmlogs`** (a custom *activity* entity, 1,295 rows — QDB has confirmed it as the DCP
technical/integration log; see `QdbCrmLogsReuseAssessment.md`).
All thirteen proposed `qdb_` target names are free. **`qdb_integrationlog` and `qdb_integrationlogs` are both withdrawn — superseded by reuse of existing `qdb_crmlogs`** (QDB decision). `qdb_collectioncase` is proposed as the DA module's successor (raised for review,
MP §103). The HL schema is **not** on this org; HL items stay TBD.
