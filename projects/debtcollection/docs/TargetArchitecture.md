# DCP — Target Architecture (Phase 0)

**Status:** Phase 0 proposal for review · 2026-09-17 · Non-destructive. Governed by the Master Prompt
(`QDB DEBT COLLECTION PLATFORM COMPLETE REQUIREMENTS.docx`, 105 §) and the Correction Prompt
(`ClaudeCorrectionPrompt.docx`, 48 §). Where the two differ, the Correction Prompt wins.

Companion documents: `ERD.md`, `EntityDictionary.md`, `FieldDictionary.md`, `MISIntegration.md`,
`CloudMigrationReadiness.md`, `SchemaMigration_msst_to_qdb.md`, `EngineReuseAssessment.md`.

---

## 1. Principles that shape everything below

| # | Principle | Source |
|---|---|---|
| 1 | **One product, one source, one `qdb_` schema, one React workspace, one business-logic model — two equal deployment targets** (D365 CE 9.1 on-prem, Dataverse cloud). Cloud-only runtime testing today is an *access constraint*, not an architecture decision. | MP §5–8, CP §1 |
| 2 | Platform differences live only in **configuration, adapters, deployment packaging** — never in Collection business/UI code. No scattered `if (cloud)`. | MP §6–7, CP §2 |
| 3 | **Existing Contact (HL) / Account (BFD) are the customer master.** No `qdb_customer`. One `qdb_customerid` Customer lookup (targets contact + account) on the case. | MP §15, CP §4–6 |
| 4 | **Existing HL/BFD facility entities are the facility master.** MIS owns the delinquency position. No facility master built to hold MIS numbers. | MP §16–17, CP §8–9 |
| 5 | **MIS is authoritative for the current financial position** — two complementary paths: *live* (user-triggered, read-only, no bulk CRM writes) and *background* (unattended sync that drives automation and writes snapshots). | CP §11–33 |
| 5a | **A MIS delinquency record is not a Collection Case.** After identity and facility resolution a configurable **Collection Eligibility / Grace evaluation** decides whether an episode is created, updated, monitored without a case, or excluded. It reuses the Rule Engine — it is not another engine. | ADR-DCP-11, F2 |
| 5b | **Thresholds and boundaries are configuration, never application source.** Segmentation boundaries, grace/eligibility criteria, contact-hold policy and KPI targets live in Rule Engine rulesets and configuration rows. No DPD number, arrears ratio or bucket name is compiled into Collection logic. | F1, F2, F6, F10 |
| 5c | **Evidence from one organisation is not policy for the other.** Housing Loan data may set HL defaults, strategy recommendations, data-model requirements, required configurability and test scenarios. It must not constrain BFD, which may configure materially different criteria on the same build. | Cross-platform principle |
| 6 | Communication transactions are the existing **Fax** (SMS/WhatsApp) and **Email** entities, through **one Communication Service** for manual and automated sends. | MP §32–39, CP §40 |
| 7 | Reuse **Form / Process / Rule / Report engines and Smart Assignment** through stable interfaces; never rebuild them inside DCP. | MP §44–48, CP §41–42 |
| 8 | **CRM native security is authorisation.** React UX security only shapes what is presented. | MP §53 |
| 9 | No direct CRM SQL anywhere. | MP §58 |

---

## 2. Context — one solution, two organisations, two platforms

```
                         QDB DEBT COLLECTION PLATFORM  —  ONE SOURCE REPOSITORY
                                              │
                                            BUILD
                                              │
                    ┌─────────────────────────┴──────────────────────────┐
                    ▼                                                    ▼
          On-Prem Package (D365 CE 9.1)                        Cloud Package (Dataverse)
          solution.zip + Process Actions                        solution.zip + Custom APIs
          PRT registration · AD/AD FS auth                      Web-API registration · Entra ID auth
                    │                                                    │
        ┌───────────┴───────────┐                            ┌───────────┴───────────┐
        ▼                       ▼                            ▼                       ▼
   HL CRM (Contact)      BFD CRM (Account)              HL CRM (Contact)      BFD CRM (Account)
        └───────────┬───────────┘                            └───────────┬───────────┘
                    ▼                                                    ▼
          SAME qdb_ SCHEMA · SAME PLUGINS · SAME REACT WORKSPACE · SAME BUSINESS LOGIC
                    Platform Configuration + Platform Mapping select the physical bindings
```

The organisation dimension (HL vs BFD) and the platform dimension (on-prem vs cloud) are **orthogonal**
and both resolved the same way: `qdb_platformconfiguration` + `qdb_platformmapping` at runtime,
deployment package at install time.

---

## 3. Runtime architecture

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │  Dynamics CRM (HL or BFD · on-prem or cloud)                                          │
 │                                                                                      │
 │   Sitemap ─▶ FULL-PAGE WEB RESOURCE  qdb_dcp_workspace.html  (React + TS, one bundle) │
 │                          │                                                           │
 │              Runtime Context Resolver ── GlobalContext → org URL, user, roles, API ver │
 │                          │                                                           │
 │              Platform Configuration Loader ── reads qdb_platformconfiguration/mapping │
 │                          │                                                           │
 │        ┌─────────────────┼─────────────────────────────┐                             │
 │        ▼                 ▼                             ▼                             │
 │  Collection Services   Collection SDK              Engine Facades                    │
 │  (case, activity, PTP, (canonical Customer,        IFormEngine · IProcessEngine      │
 │   strategy, comms,      Facility, Case, Activity,   IRuleEngine · IAssignmentEngine   │
 │   timeline, dashboard)  Communication, MIS models)  IReportingService                │
 │        │                 │                             │                             │
 │        ▼                 ▼                             ▼                             │
 │              ICrmAdapter (Xrm.WebApi · same on both platforms)                        │
 │              IAuthContext (CRM session — no separate login)                          │
 │              IMisDelinquencyService (→ Integration Service, below)                   │
 │                          │                                                           │
 │   ── CRM data ──────────▼──────────────────────────────────────────────────────────  │
 │   qdb_collectioncase · qdb_collectionactivity · qdb_delinquencysnapshot · config     │
 │   contact / account (customer) · <facility entity> · fax / email (communications)    │
 │   Plugins (Qdb.DebtCollection.Plugins): status matrix · immutability · defaults ·    │
 │            subject composer · stop-contact mover                                     │
 │   Operations: Custom API (cloud) ⇄ Process Action (on-prem) — same plugin classes     │
 └──────────────────────────────────────────────────────────────────────────────────────┘
                                   │  HTTPS (user token — IAuthAdapter: AD FS | Entra ID)
                                   ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │  COLLECTION INTEGRATION SERVICE  (Fastify, containerised — same image both targets)   │
 │   • Live MIS proxy      GetArrearBreakdown / GetArrearDetails / GetFacilityPosition   │
 │   • Background MIS Sync  watermark · idempotent · batch · reconcile → CRM writes       │
 │   • Cross-org Customer 360 fan-out (HL ⇄ BFD)   • System-initiated communication      │
 │   • Integration monitoring → existing qdb_crmlogs (technical/integration evidence)    │
 │   IMisDelinquencyService ── MockMisDelinquencyService | ApiMisDelinquencyService       │
 │   IAuthAdapter ── AdfsAdapter | AzureAdAdapter        IDataverseClient (v9.1 | v9.2)   │
 └──────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                              QDB MIS API  (contract: MISIntegration.md — proposal + TBDs)
```

### 3.1 What runs where

| Concern | Where | Why |
|---|---|---|
| All user CRUD on Collection data | React → `Xrm.WebApi` inside CRM | CRM security is authoritative; no gateway for ordinary operations (MP §60, CP §36) |
| Business invariants (status matrix, immutability, stop-contact guard, defaults) | C# plugins | Unbypassable on both platforms; already built and tested |
| Complex policy (strategy eligibility, PTP rules, communication rules) | Rule Engine via `IRuleEngine` | MP §47 |
| Approvals / maker-checker / escalation / SLA | Process Engine via `IProcessEngine` | MP §46 |
| Activity-specific forms (PTP, field visit, restructuring, legal, deceased, dispute) | Form Engine via `IFormEngine` | MP §45 |
| Live MIS reads | Integration Service (server-side secrets, rate limiting, audit) | CP §35 |
| Background MIS sync, scheduling, watermark | Integration Service (pg-boss job state only) | CP §20–21; plugins cannot schedule |
| **Collection Eligibility / Grace evaluation** | Integration Service calls `IRuleEngine` with the configured ruleset (`qdb_eligibilityrulesetcode`) | ADR-DCP-11; reuses the Rule Engine, adds no engine and no entity |
| **Contact Hold / Special Handling evaluation** | Communication Service calls `IRuleEngine` (`qdb_contactholdrulesetcode`) — server-side, identical for manual and automated sends | F6; UI hiding is never the control |
| Cross-org 360 | Integration Service | An HL web resource holds no BFD token (R-01) |
| System-initiated comms | Integration Service → Communication Service → Fax/Email in CRM | CP §36; same validation path as manual (MP §36–38) |
| Reporting | Report Engine via `IReportingService`; native views for operational lists | MP §48 |

### 3.2 Platform adapter surface (the only places that know the platform)

| Adapter | On-Prem 9.1 | Cloud | Selected by |
|---|---|---|---|
| Web API version | `v9.1` | `v9.2` | Runtime context (`Xrm.Utility.getGlobalContext().getVersion()`) in the browser; `DV_API_VERSION` per org in the service |
| Operation surface | Process Action | Custom API | Deployment package; the caller uses `Xrm.WebApi.online.execute` with the same name on both |
| User auth to Integration Service | AD FS 2019 OIDC (or Windows-integrated — `TBD — Requires QDB Confirmation`) | Entra ID / MSAL | `AUTH_PROVIDER` (service), platform configuration (browser) |
| Service-to-CRM auth (Integration Service) | AD FS client credentials / certificate | Entra client credentials | `IAuthAdapter` (`AdfsAdapter` / `AzureAdAdapter`) |
| Provisioning / registration tooling | Solution import + PRT + AD/IFD auth | Web-API scripts + Entra auth | Deployment scripts (allowed to differ, MP §83) |
| Document provider | SharePoint (on-prem) | SharePoint Online | `qdb_platformconfiguration.qdb_documentprovider` |

Everything else — schema, plugins, React components, Collection services, SDK, engine facades,
communication service, mock and real MIS providers — is **shared source with no platform branch**.

---

## 4. MIS — two paths, one canonical model (CP §47)

```
                                   QDB MIS
                                      │
                     ┌────────────────┴────────────────┐
                     ▼                                 ▼
              LIVE MIS PATH                     BACKGROUND PATH
        (user-triggered · read-only)       (scheduled · unattended · writes)
                     │                                 │
                     ▼                                 ▼
          Secure MIS Service (proxy)             MIS Sync Service
          GetArrearBreakdown                     GetArrearChanges(since) | full pull
          GetArrearDetails(bucket, page…)        watermark · batch id · idempotency
          GetFacilityPosition(facilityId)                │
                     │                                   ▼
                     │                          Canonical MIS Model  (normalised)
                     │                                   │
                     │                          Identity & Facility Resolution
                     │                          MIS customer id → contact/account
                     │                          MIS account no. → facilityNumber (canonical)
                     │                                          → facilityRef (optional, per deployment)
                     │                                   │
                     │                          ┌────────┴─────────┐
                     │                          │  COLLECTION      │  IRuleEngine
                     │                          │  ELIGIBILITY /   │  ruleset =
                     │                          │  GRACE EVALUATION│  qdb_eligibilityrulesetcode
                     │                          └────────┬─────────┘
                     │        ┌──────────────┬───────────┼───────────┬──────────────┐
                     │        ▼              ▼           ▼           ▼              ▼
                     │   Eligible →    Existing      Grace /     Excluded /    Identity /
                     │   create case   episode →     Monitor     Special       Facility
                     │                 update case   (no case)   Handling      Exception
                     │        │              │           │           │              │
                     │        └──────┬───────┘           │           │              ▼
                     │               ▼                   ▼           ▼      qdb_identityexception
                     │        qdb_collectioncase   qdb_delinquencysnapshot
                     │        cure · re-delinq.    (append-only; records the
                     │               │              eligibility decision, so a
                     │               │              record with no case still has
                     │               │              history — per qdb_snapshotpolicy)
                     │               ▼
                     │        Strategy / Assignment / Automation / Process Engine
                     │               │
                     └──────────┬────┘
                                ▼
                      React Collection Workspace
          live position + freshness badge  ·  case/activity/PTP/comms from CRM
          fallback to last snapshot when MIS is down — clearly labelled NOT live
```

Rules that bind both paths: a live read **never** writes CRM records in bulk (CP §19); a snapshot is
created only by the background path or a controlled business rule, with an idempotency key (CP §28);
the case caches the latest position for search, queues and resilience, but a successful live response
wins for display (CP §26); freshness metadata is shown wherever a financial figure is (CP §30).

**Eligibility outcomes** (global choice `qdb_eligibility_outcome`): `EligibleCreateCase` ·
`ExistingEpisodeUpdate` · `GraceMonitor` · `ExcludedSpecialHandling` · `IdentityException` ·
`FacilityException`. Criteria available to the ruleset include DPD, arrears amount, arrears relative to
instalment, product, facility/customer status, special handling, existing case, cure/grace period and any
other approved Rule Engine criterion. **No threshold is hard-coded**: the Housing Loan evidence (769
accounts owing less than one instalment; ~1,600 month-end churn records) motivates such a rule but supplies
a *sample configuration*, not a constant, and the final thresholds are `TBD — Requires QDB Confirmation`.
Which records are persisted as snapshots is governed by `qdb_platformconfiguration.qdb_snapshotpolicy`
(`AllReceived` · `EligibleOnly` · `ChangedOnly`).

---

## 5. Customer and facility — canonical abstractions over existing masters

```
**Identity resolution (F4).** Primary business identity **QID / ID Number**, cross-checked against
**Customer Number**, resolved to the **Contact GUID**. A record whose identity is missing, ambiguous,
conflicting, invalid, or inconsistent between QID and Customer Number is routed to `qdb_identityexception`
— it is never silently resolved to the nearest customer. **Mobile number is never an identity key.** The
six observed 7-digit legacy identifiers are preserved as source identifiers and are not rejected on length;
identifier validation rules are configuration and `TBD — Requires QDB Confirmation`. **BFD identity is a
separate contract** built from its own stable identifier (CR / UEN / TRN or another approved one) — `TBD`.

   Collection Customer (canonical)              Collection Facility (canonical)
   ├ customerId       (CRM GUID)                ├ facilityNumber    (MIS Account Number — business key) ★
   ├ customerType     Individual | SME | Corp   ├ sourceSystem      (HL | BFD | MIS provider code)      ★
   ├ businessId       QID (HL) | CR no. (BFD)   ├ productCode / productDescription
   ├ displayName                                ├ customerId
   ├ mobile · email · address (masked by role)  ├ facilityStatus · originalAmount · start/maturity (resolved)
   └ collection flags: stopContact · deceased   ├ position: DPD · bucket · balance · arrears · instalment (MIS)
        vulnerability · specialHandling         └ facilityRef?     (OPTIONAL resolved CRM reference —
        preferredLanguage                                           present only where a deployment
                  ▲                                                 extension relationship exists)
          Platform Mapping                                   ▲
   HL: contact.* / qdb_* extensions                   Platform Mapping (resolution only)
   BFD: account.* / qdb_* extensions           HL Facility Entity = TBD — Requires QDB Confirmation
                                               BFD Collection Facility/Account Target = likely
                                               `qdb_account`, TBD — Requires QDB Confirmation
   ★ = the two canonical keys every layer may rely on. Nothing above depends on a physical lookup target.
```

- `qdb_collectioncase.qdb_customerid` is a **Customer** lookup (targets contact + account). Verified
  provisionable on both platforms: `CreateCustomerRelationshipsRequest` is present in the on-prem
  SDK (`Microsoft.Xrm.Sdk.dll` 9.0.2.51) and the `CreateCustomerRelationships` Web-API action is
  present on the cloud org; `incident.customerid` is the OOB reference implementation. **Approved
  design; the earlier two-lookup proposal is withdrawn.**

#### Facility: canonical contract vs organisation-specific relationship extension (gate correction 4)

**The canonical shared Collection domain/schema must not depend on the physical lookup target.** The
canonical Facility abstraction is defined by **`facilityNumber`** (the MIS Account Number business key),
**`sourceSystem`**, and the resolved Facility domain information (product, status, amounts, dates,
position). Those travel in the shared schema, the shared domain model and the shared contracts, and are
identical on every deployment.

`qdb_collectioncase.qdb_facilitynumber` therefore carries the link that Collection logic uses.

A physical `qdb_facilityid` lookup **may** additionally be deployed so users get native navigation and
CRM-side referential integrity. When it is, it is an **optional deployment extension / adaptor
relationship** — explicitly *not* a portable assumption:

- A Dynamics lookup's target entity is **fixed metadata**; it cannot be re-pointed at runtime through
  Platform Mapping. A relationship targeting the HL facility entity and one targeting the BFD facility
  entity are **two different physical relationships that happen to share a column name** — they are
  **not literally the same physical schema**, and this document no longer claims they are.
- The extension is declared per deployment (org-specific solution layer), never in the shared core.
- Its presence or absence must not change any behaviour: **React, the Rule Engine, Collection Services
  and MIS processing must never branch on physical HL/BFD facility entity names.** They read
  `facilityNumber` + `sourceSystem` and, where they need a CRM reference, take the optional resolved
  `facilityRef` supplied by the adapter.
- Where no lookup extension is deployed, or the facility cannot be resolved, the canonical keys are still
  sufficient to process, snapshot and report the record.

The principle is unchanged: **one source codebase + one canonical Collection domain/schema +
organisation-specific mappings/adapters only where unavoidable.**

Open: **HL Facility Entity = `TBD — Requires QDB Confirmation`** (the HL schema is not on the sandbox).
**BFD Collection Facility/Account Target = likely `qdb_account`, `TBD — Requires QDB Confirmation`** —
the sandbox's BFD schema has `qdb_account` "Loan Account" (account number, customer, facility
relationship, arrears, DPD, instalment, collectibility, NPL relationship, maturity/rescheduling) and
`qdb_facility` at the facility/limit level (`ExistingQdbSchemaAssessment.md`). That is **evidence, not
confirmation**, and must not become an implemented assumption until the MIS Account Number mapping is
confirmed.

---

### 4.1 Portfolio segmentation is configured, not fixed (F1)

The Strategy Engine must support segmentation over DPD, arrear bucket, product, arrears amount,
**exposure**, customer type, facility type, deceased/special-handling status, previous collection
outcomes, PTP history and any other approved Rule Engine criterion. The architecture does **not** define
two books, and `>2000 DPD = Recovery` is **not** encoded anywhere.

The Housing Loan analysis supports a differentiated treatment split and is carried as a **data-supported
strategy recommendation for QDB confirmation** (`HousingLoanDataAnalysis.md` F1), not as a rule. Whether
automated contact is prohibited above 2000 DPD is `TBD — Requires QDB Confirmation` and, when answered,
becomes a strategy/eligibility configuration — BRD FR-033's "no automated contact" rule is the mechanism.

## 6. Communication (MP §32–40)

```
   Officer (Communication Center)     Strategy / PTP reminder / SLA / Process Engine
                 │                                        │
                 └──────────────┬─────────────────────────┘
                                ▼
                   Communication Service (one implementation)
                   validate: customer · recipient · stop-contact · deceased · channel ·
                             consent · template · free-text privilege · approval · security
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
         SMS → fax   WhatsApp → fax   Email → email   Warning Letter → QDB document
                                │
              Unified Communication History (a READ model, aggregated per request)
                 fax + email + letter + qdb_collectionactivity + process events
```

**Confirmed 2026-09-17 (KI-45).** The Debt Collection Platform creates the native record and stops;
QDB's existing mechanisms deliver. It creates **no communication entity of its own** — no
`qdb_communication`, no per-channel table — and never copies a message to make the timeline easier to
query. The unified history is assembled on read from the sources above and correlated to the
Collection Case, so one officer-facing stream sits over three physical mechanisms. Full model:
`CommunicationArchitecture.md` §7; contract: `APIContracts.md` §4.1; access rules:
`SecurityModel.md` §5b.

What the existing QDB workflow reads on a `fax` row to tell SMS from WhatsApp, and which document
capability produces a Warning Letter, remain `TBD — Requires QDB Confirmation` (CP §40). Not invented.

---

## 7. Engines (MP §44, CP §41–42) — see `EngineReuseAssessment.md`

| Facade | Engine | Portability finding |
|---|---|---|
| `IRuleEngine` | EDP | Same plugin code on both; cloud = Custom API, on-prem = Process Action (documented runbook, not yet run on-prem). **Not a blocker.** |
| `IFormEngine` | DFE | Same pattern (registration guide §3b); on-prem kit exists with open defects |
| `IProcessEngine` | CWFD runtime | Plugins on the cloud org; on-prem status `TBD — Requires QDB Confirmation` |
| `IReportingService` | Report Engine | Cloud live; on-prem prerequisites documented |
| `IAssignmentEngine` | Smart Assignment | **No artefact found in this repository or `D:\QDB`** — `TBD — Requires QDB Confirmation` |

---

## 8. Security model (MP §53–55) — see `SecurityModel.md`

Layer 1 CRM data security (roles, BU, teams, ownership, field security on contact/account PII
columns) · Layer 2 process security (Process Engine) · Layer 3 React UX (role-aware navigation, never a
substitute for Layer 1). Direct web-resource URL is protected because the web resource executes under
the CRM session; every data call is a CRM call.

---

## 9. What changes versus the repository today (summary — detail in `CurrentStateAssessment.md`)

| Area | Today | Target |
|---|---|---|
| Prefix / namespace | `msst_dcp*`, `Msst.DebtCollection.Plugins` | `qdb_*`, `Qdb.DebtCollection.Plugins` |
| Customer | `msst_dcpcustomer` master | contact / account + `qdb_` flags; Customer lookup |
| Facility | `msst_dcploanfacility` master | canonical `facilityNumber` + `sourceSystem` in the shared schema (`qdb_facilitynumber`); existing facility masters resolved through Platform Mapping; any physical `qdb_facilityid` lookup is an **optional per-deployment extension**, not shared schema |
| Communication | `msst_dcpcommunication` activity | fax / email + Communication Service |
| PTP | `msst_dcpptprecord` entity | `qdb_collectionactivity` type = PTP |
| Audit | `msst_dcpauditlog` + 14 async steps | native audit (business) + **existing `qdb_crmlogs`** (technical/integration) |
| Strategy | `msst_dcpstrategyconfig` flat | `qdb_collectionstrategy` + `qdb_strategyaction` |
| UI | none (Next.js planned) | full-page React web resource |
| API | user reads via Fastify | Fastify = MIS live/background, cross-org, system comms only |
| Web API version | hard-coded `9.2` | configuration / runtime context |
| Tooling auth | Entra-only | adapter: Entra (cloud) / AD FS or PRT (on-prem) |

Nothing above is executed in Phase 0.
