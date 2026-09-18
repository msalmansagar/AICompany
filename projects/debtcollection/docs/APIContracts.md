# DCP — API Contracts (Phase 0)

**Status:** proposal · 2026-09-17 · Master Prompt §60–62, Correction Prompt §22, §34–36. Every HTTP
route, operation name and MIS shape below is a **proposal** unless marked otherwise; nothing is
implemented in Phase 0. Unconfirmed QDB facts are `TBD — Requires QDB Confirmation`.

Language: TypeScript signatures; `Result<T>` and `DomainError` are the existing `@dcp/types` shapes.

---

## 1. Layering

```
  React Collection Workspace ──▶ Collection Services ──▶ Collection SDK (canonical models)
                                                              │
                        ┌─────────────────┬───────────────────┼──────────────────┬───────────────────┐
                        ▼                 ▼                   ▼                  ▼                   ▼
                  ICrmAdapter       IAuthContext     IMisDelinquencyService  CommunicationService   Engine facades
                  (Xrm.WebApi)      (CRM session)    (→ Integration Service)  (shared package)       (EngineReuseAssessment.md)
```

Only adapters know the platform. Business code sees canonical types.

Two decision points are **Rule Engine rulesets, not code**: *Collection Eligibility / Grace* between
resolution and case creation (§3A.2), and *Contact Hold* before any dispatch (§3A.3). Neither introduces a
new entity nor a new engine — both are rulesets addressed by pointers held in `qdb_platformconfiguration`.

---

## 2. Browser-side contracts

### 2.0 As built in Phase 5 — where §2.1–§2.3 differ from what exists

§2.1–§2.3 below are the Phase 0 proposal. The browser half was built in Phase 5 and differs in four
ways that matter to a caller. Each difference is a decision recorded in **ADR-DCP-17**, not a
shortfall.

| Proposed | Built | Why |
|---|---|---|
| A browser-specific `ICrmAdapter` shape with `get`, `associate`, `disassociate`, `getCurrentUser`, `getUserRoles`, `getMetadata` | `XrmCrmAdapter implements ICrmAdapter` — the **same** interface Phases 2–4 proved service-side: `retrieve`, `retrieveByKey`, `retrieveMultiple`, `retrievePage`, `create`, `update`, `execute` | One interface, two transports. A second shape would have meant a second set of contracts to keep in step, and the domain packages already type against this one |
| `Result<T>` returns | values, with errors thrown | Matches the service-side adapter. A 404 on `retrieve` is the one modelled absence, and returns `null` |
| `execute` invokes a Custom API or Process Action | **`execute` refuses, by name** | `Xrm.WebApi.execute` needs a request object carrying per-parameter metadata this seam does not carry. Half-working would be worse than refusing, and engine calls belong on the Integration Service where the decision is server-side (ADR-DCP-13) |
| `Page<T> = { rows, nextLink?, totalCount? }` | the Phase 4 `Page<T> = { items, hasMore, appliedPageSize, continuation?, totalCount? }` with an **opaque** `ContinuationToken` | A raw `nextLink` in the caller's hands is a URL they can edit. The Phase 4 contract fingerprints the query, so a continuation reused after the criteria changed is refused rather than silently answering the wrong question |
| `IAuthContext` with `acquireServiceToken` | **not built** | Nothing in Phase 5 calls the Integration Service from the browser. Every read goes through the CRM session that already exists, so no second authentication path is needed — and the on-premises answer (AD FS bearer vs Windows-integrated) is still `TBD — Requires QDB Confirmation` |

#### 2.0.1 What the browser adapter reads, and how

```ts
// apps/web/src/platform/XrmCrmAdapter.ts
retrievePage(entity: string, query: CrmPageQuery): Promise<Page<CrmRecord>>
```

* `entity` is an **entity set** name; the adapter translates it to the logical name `Xrm.WebApi`
  wants. Irregular names are listed, not derived — `qdb_crmlogses → qdb_crmlogs` is the one the
  naive plural rule gets wrong.
* A page size is **always** sent as `maxPageSize`. A Dataverse read without a bound returns the whole
  table (Phase 4 spike), so a page size is never optional.
* A continuation is the platform's own `nextLink`, wrapped opaquely and followed verbatim.
* `$select` is omitted entirely when no column is wanted — a count asks for none, and a blank
  `$select` is rejected outright (KI-58).

#### 2.0.2 `CrmContext` — resolved once, from the host

```ts
interface CrmContext {
  clientUrl: string;        // getGlobalContext().getClientUrl()
  apiVersion: string;       // '9.1' | '9.2', from getVersion() — read, never assumed
  apiBase: string;          // composed from the two above
  userId: string;
  userName: string;
  languageId: number;
  securityRoleIds: readonly string[];
  organizationUniqueName?: string;
}
```

`findXrm` checks `parent`, then `window`, then `top`. A full-page web resource runs in an iframe whose
**parent** carries `Xrm`; the opposite order is what produced a blank Form Engine designer — a page
that works at the raw `/WebResources/` path and fails at `main.aspx`, the only URL a user opens.

Whether the deployment is on-premises or cloud is **not** inferred from the API version. The
authoritative answer is `qdb_platformconfiguration.qdb_platformtype`, which every adapter reads.

#### 2.0.3 Read contracts the views use

Each is a function of `(adapter) → (request) → Promise<Page<Row>>`, so every list in the workspace
shares one paging contract and one engine. Column names come from `apps/web/src/data/schema.ts` and
appear nowhere else.

| Contract | Narrowed by | Source applies |
|---|---|---|
| `createCaseQuery` | organisation scope, bucket, status, customer business id, free text, open-only, sort | `$filter`, `$orderby` |
| `createActivityQuery` / `createPtpQuery` | case id, promises-only | `$filter`, `$orderby qdb_ptpdate desc` |
| `createSnapshotQuery` | case id, customer business id, facility number | `$filter`, `$orderby qdb_snapshotdate desc` |
| `createStrategyQuery` | active-only, free text | `$filter`, `$orderby qdb_priority` |
| `createStrategyActionQuery` | strategy id, active-only | `$filter`, `$orderby qdb_sequence` |
| `createIdentityExceptionQuery` | open-only | `$filter`, `$orderby qdb_receiveddate desc` |
| `createAuditQuery` | source text, correlation id | `$filter`, `$orderby createdon desc` |
| `createPlatformMappingQuery` | configuration id | `$filter`, `$orderby qdb_name` |
| `retrievePlatformConfigurations` | — (bounded by nature, `$top=50`) | `$orderby qdb_name` |
| `countMatching` | any filter fragment | `$count=true`, `maxPageSize=1` |
| `loadCustomerAggregate` | customer business id | `$filter`; one bounded page, `isComplete` false when more exist |

**Nothing above decides anything.** No threshold, bucket derivation, eligibility check or strategy
resolution appears in `apps/web`, and two tests grep the source to keep it that way.

---

### 2.1 `ICrmAdapter` — one implementation over `Xrm.WebApi` (MP §62)

```ts
interface ICrmAdapter {
  get<T>(entitySet: string, query: ODataQuery): Promise<Result<Page<T>>>;          // convenience over retrieveMultiple
  retrieve<T>(entity: string, id: string, select?: string[], expand?: Expand[]): Promise<Result<T>>;
  retrieveMultiple<T>(entity: string, query: ODataQuery | FetchXml): Promise<Result<Page<T>>>; // server-side paging always
  create(entity: string, record: object): Promise<Result<{ id: string }>>;        // id from OData-EntityId, never body
  update(entity: string, id: string, patch: object): Promise<Result<void>>;
  delete(entity: string, id: string): Promise<Result<void>>;
  associate(entity: string, id: string, relationship: string, target: EntityRef): Promise<Result<void>>;
  disassociate(entity: string, id: string, relationship: string, targetId: string): Promise<Result<void>>;
  execute<TIn, TOut>(operation: OperationRequest<TIn>): Promise<Result<TOut>>;    // Custom API | Process Action (§6)
  getCurrentUser(): Promise<UserContext>;                                          // id, name, BU, teams
  getUserRoles(): Promise<RoleRef[]>;
  getMetadata(entity: string): Promise<EntityMetadataLite>;                        // option-set labels, lookup targets
}
```

- Web API version comes from `Xrm.Utility.getGlobalContext().getVersion()` — `v9.1` on-prem, `v9.2`
  cloud — inside the adapter; no caller passes a version.
- Org URL from `getGlobalContext().getClientUrl()`. No hard-coded host, org path, or absolute URL.
- Paging: `Page<T> = { rows: T[]; nextLink?: string; totalCount?: number }`; `retrieveMultiple` never
  returns the whole portfolio (MP §67).
- Errors: platform errors map to `CrmApiError` (existing) then to `DomainError` codes; every call carries
  a correlation id header (`MSCRM.RequestId` / `x-correlation-id`).
- **No second adapter for the platform.** `Xrm.WebApi` behaves identically for entity CRUD on both.

### 2.2 `IAuthContext` — the CRM session

```ts
interface IAuthContext {
  getUser(): UserContext;                       // from GlobalContext.userSettings
  getOrganizationCode(): 'HL' | 'BFD';          // from qdb_platformconfiguration, not from URL parsing
  getPlatformType(): 'OnPrem' | 'Cloud';
  acquireServiceToken(audience: 'integration-service'): Promise<string>;  // §2.3 — the only platform-specific call
}
```

`acquireServiceToken` is implemented by a browser-side adapter selected from platform configuration:
cloud → MSAL (Entra ID) silent token for the Integration Service audience; on-prem → AD FS 2019 OIDC
**or** Windows-integrated (Negotiate) — which one QDB's estate supports is `TBD — Requires QDB Confirmation`.
No business component calls it directly; the Integration-Service client does.

### 2.3 Integration-Service side — `IAuthAdapter` (existing, unchanged)

`packages/auth-adapters`: `AdfsAdapter` / `AzureAdAdapter` over openid-client, selected by
`AUTH_PROVIDER`. Validates incoming user tokens (issuer from discovery, audience checked) and mints
service tokens per org (`OrgTarget`). AD FS runtime proof is still open (COND-008).

---

## 3. `IMisDelinquencyService` (CP §22) — canonical types from `MISIntegration.md` §4

```ts
interface IMisDelinquencyService {
  getArrearBreakdown(q?: { asOf?: string }): Promise<Result<ArrearBreakdown>>;
  getArrearDetails(q: ArrearDetailQuery): Promise<Result<Page<ArrearDetail>>>;   // bucket, ids, loan type, dpd range, deceased, status; page/pageSize/sort
  getFacilityArrearPosition(facilityId: string): Promise<Result<ArrearDetail | null>>;
  getCustomerArrearPositions(customerId: string): Promise<Result<ArrearDetail[]>>;
  getArrearChanges(sinceTimestamp: string): Promise<Result<{ rows: ArrearDetail[]; watermark: string }>>; // TBD — change feed
  getArrearTrend(q?: { bucket?: BucketCode; months?: number }): Promise<Result<ArrearTrend[]>>;          // optional
  getDeceasedList(): Promise<Result<DeceasedRecord[]>>;                                                   // optional
  health(): Promise<MisHealth>;                                                    // last success, latency, provider name
}
```

Every response carries `{ misAsOfDate, sourceTimestamp?, correlationId, provider: 'Mock' | 'Api',
freshness: 'Live' | 'Fallback' }`. Implementations: `MockMisDelinquencyService` (seeded from the
supplied workbooks; scenario switches per `MISIntegration.md` §10) and `ApiMisDelinquencyService`
(QDB MIS — endpoints, auth, paging, change feed all `TBD`). Contract tests run against both. Selected
by `MIS_PROVIDER` / `qdb_platformconfiguration.qdb_misprovider`. Browser callers reach it only through
the Integration Service (§5); the service itself holds MIS credentials.

Canonical types (abridged — full list in `MISIntegration.md` §4.1). **Raw MIS facts and derived values stay
distinguishable in the contract** (F8): a derived value names the source column it was computed from, and no
derived value is treated as an authoritative input.

```ts
type BucketCode = '1-30'|'31-60'|'61-90'|'91-180'|'181-270'|'271-360'|'361-500'|'501-1000'|'1001-2000'|'>2000';

/** Raw facts exactly as MIS supplies them — never reinterpreted by Collection code. */
interface ArrearDetailRaw { customerId; customerName; customerType; facilityId; loanTypeCode;
  loanTypeDescription; nationalId; isDeceasedPerQcb; loanBalance; accountStatusCode: string;
  deceasedFlag; deceasedNotAppliedFlag; exemption20Flag; noExemptionFlag; firstArrearDate;
  arrearDays; totalArrears; installmentAmount; lastArrearAmount; exemptionPercentage?;
  exemptionAmount?; arrearBucket: BucketCode; mobileNumber;
  misAsOfDate; dpdAsOfDate?; sourceTimestamp? }

/** Computed by MIS or by the adapter. Each carries the source column it maps to. */
interface ArrearDetailDerived {
  instalmentCoverageRatio?: { value: number; sourceField: 'Arrear %' };
}

interface ArrearDetail extends ArrearDetailRaw { derived: ArrearDetailDerived }
interface ArrearBreakdown { asOf; buckets: BucketAggregate[]; totals: BucketAggregate }
```

| Field | Contract rule |
|---|---|
| `accountStatusCode` | **Opaque code** (`'7'`, `'8'`, …). Collection code never branches on its value and no meaning is encoded anywhere. Authoritative mapping `TBD — Requires QDB/MIS Confirmation` (F7). |
| `instalmentCoverageRatio` | Canonical business name for the source column **`Arrear %`**, whose mapping is preserved in `sourceField`. Demonstrated as `min(1, totalArrears ÷ installmentAmount)` on the supplied HL dataset. **Never** reinterpreted as arrears ÷ exposure or arrears ÷ balance (F8). |
| `lastArrearAmount` | Carried as a raw fact with its source mapping. It equals `installmentAmount` in the supplied dataset, but that relationship is **not assumed universal** — semantics `TBD — Requires QDB/MIS Confirmation` (F8). |
| `dpdAsOfDate` | Provisional: the date `arrearDays` is measured at, which may differ from `misAsOfDate`. The observed +16-day relationship is an observation, **not** the contract; final semantics `TBD — Requires QDB/MIS Confirmation` (F3). Snapshot idempotency uses authoritative MIS source/as-of information once confirmed. |
| `mobileNumber` | Contact data only. **Never an identity input** (F4, F11). |

---

## 3A. Identity resolution, Collection Eligibility and Contact Hold (F1, F2, F4, F6)

A MIS delinquency record **does not equal a Collection Case**. Between resolution and case creation sits a
configurable evaluation stage that reuses the **Rule Engine** — no new entity, no new engine
(`EngineReuseAssessment.md`, ADR-DCP-11).

```
 MIS Delinquency ─▶ Identity Resolution ─▶ Facility Resolution ─▶ Collection Eligibility / Grace ─▶ Strategy Evaluation
                          │                       │                            │
                          ▼                       ▼                            ▼
                 qdb_identityexception   qdb_identityexception    Create Case │ Update Case │ Monitor (no case) │ Exclude
```

### 3A.1 Identity and facility resolution (F4)

```ts
interface ResolutionResult {
  outcome: 'Resolved' | 'IdentityException' | 'FacilityException';
  customerRef?: EntityRef;      // contact (HL) | account (BFD)

  // --- canonical facility contract: portable, always present when known ---
  facilityNumber?: string;      // MIS Account Number — the business key Collection logic uses
  sourceSystem?: 'HL' | 'BFD';  // which book the record came from

  // --- optional deployment extension: NOT part of the portable contract ---
  facilityRef?: EntityRef;      // resolved CRM reference, present only where an org-specific
                                // facility lookup extension is deployed and resolution succeeded

  reason?: IdentityExceptionReason;
  sourceIdentifiers: { nationalId?: string; customerNumber?: string; facilityNumber?: string }; // preserved verbatim
}
type IdentityExceptionReason = 'Missing' | 'Ambiguous' | 'Conflicting' | 'Invalid'
  | 'InconsistentWithCustomerNumber' | 'FacilityNotFound' | 'FacilityAmbiguous';

interface IIdentityResolver {
  resolveIdentity(raw: ArrearDetailRaw, ctx: PlatformContext): Promise<Result<ResolutionResult>>;
}
```

Rules that are contract, not implementation detail:

- **Primary business identity** is the national ID (QID for HL); **Customer Number is a cross-check**, and
  the CRM relationship is the Contact/Account GUID. Disagreement between the two source identifiers yields
  `InconsistentWithCustomerNumber` — imperfect source data never silently resolves to the wrong customer.
- **Mobile number is never an identity input.** It is contact data; shared numbers are a data-quality
  observation for QDB review, not a match and not auto-corrected (F11).
- **Source identifiers are preserved verbatim.** Short/legacy identifiers (the six 7-digit HL values) are
  **not rejected on length**; identifier validation rules are *configuration* and their acceptability is
  `TBD — Requires QDB Confirmation` (F4).
- **BFD identity is a separate contract** established from its own approved stable identifier (CR / UEN /
  TRN or other) — `TBD — Requires QDB Confirmation`.
- Any non-`Resolved` outcome writes `qdb_identityexception` and creates **no** case and **no** customer or
  facility master.
- **The facility contract is `facilityNumber` + `sourceSystem`, never a physical lookup** (gate correction
  4). `facilityRef` is an *optional deployment extension* populated by the facility adapter where an
  org-specific lookup relationship exists; a Dynamics lookup's target entity is fixed metadata, so an
  HL-targeted and a BFD-targeted `qdb_facilityid` are **two different physical relationships**, not one
  shared schema. Consumers of this contract — Collection Services, the Rule Engine, MIS processing and
  React — **must never branch on physical HL/BFD facility entity names**, and must remain fully functional
  when `facilityRef` is absent.
- **HL Facility Entity = `TBD — Requires QDB Confirmation`. BFD Collection Facility/Account Target =
  likely `qdb_account`, `TBD — Requires QDB Confirmation`** — sandbox evidence only, not an implemented
  assumption until the MIS Account Number mapping is confirmed.

### 3A.2 Collection Eligibility / Grace — an `IRuleEngine` operation (F1, F2)

```ts
type EligibilityOutcome =
  | 'EligibleCreateCase' | 'ExistingEpisodeUpdate' | 'GraceMonitor'
  | 'ExcludedSpecialHandling' | 'IdentityException' | 'FacilityException';

interface EligibilityDecision {
  outcome: EligibilityOutcome;
  reason: string;            // rule-supplied, human readable; stored on the snapshot
  rulesetCode: string;       // qdb_platformconfiguration.qdb_eligibilityrulesetcode
  rulesetVersion: string;
  evaluatedOn: string;       // ISO
}

interface IRuleEngine {
  // … existing evaluate / execute operations (EngineReuseAssessment.md)
  evaluateCollectionEligibility(
    position: MisDelinquencyPosition,   // canonical ArrearDetail for one facility/account
    resolution: ResolutionResult,
    ctx: PlatformContext,               // org code, platform type, ruleset pointers
  ): Promise<Result<EligibilityDecision>>;

  evaluateContactHold(
    customer: CustomerContext,          // deceased / special-handling / consent state, case context
    channel: 'SMS' | 'WhatsApp' | 'Email' | 'Call' | 'Letter',
  ): Promise<Result<ContactHoldDecision>>;
}
```

- The outcome vocabulary is the `qdb_eligibility_outcome` choice. The decision is persisted on the snapshot
  (`qdb_eligibilityoutcome`, `qdb_eligibilityreason`, `qdb_eligibilityrulesetcode`,
  `qdb_eligibilityrulesetversion`, `qdb_eligibilityevaluatedon`), so a record that produced **no** case still
  has auditable history. Which records are persisted is governed by
  `qdb_platformconfiguration.qdb_snapshotpolicy` (`AllReceived` | `EligibleOnly` | `ChangedOnly`).
- **No threshold appears in this contract or in any Collection source file.** Criteria available to the
  ruleset include DPD, arrears amount, arrears relative to instalment, product, facility/customer status,
  special handling, an existing open case, cure/grace period, and any other approved Rule Engine criterion.
  The HL data supports a sub-instalment grace rule, but the values are configuration and remain
  `TBD — Requires QDB Confirmation` (F2).
- **Segmentation boundaries are configuration too.** The operational/recovery split suggested by the HL
  analysis is a data-supported *strategy recommendation for QDB confirmation*, not a coded boundary;
  `>2000 DPD` carries no special meaning in code, and whether automated contact is prohibited above it is
  `TBD — Requires QDB Confirmation` (F1).
- HL and BFD point at **different rulesets** through `qdb_platformconfiguration`, so one build supports
  materially different criteria and thresholds per organisation.

### 3A.3 Contact Hold (F6)

```ts
interface ContactHoldDecision {
  hold: boolean;
  reason?: string;           // e.g. deceased-confirmed, special handling, stop-contact
  rulesetCode: string;       // qdb_platformconfiguration.qdb_contactholdrulesetcode
  rulesetVersion: string;
}
```

**Binding rule.** `CommunicationService.validateCommunication` and `CommunicationService.sendCommunication`
**MUST** call `evaluateContactHold` server-side before any dispatch, and the *same* evaluation runs for
user-initiated sends from React and for system-initiated sends from strategy, PTP reminders, SLA and the
Process Engine. A `hold` result fails the request with `DomainError.code = 'stop_contact'`; the refusal and
its reason are recorded. **Hiding a button in the UI is never the control** — a caller reaching the operation
or the HTTP route directly receives the identical refusal.

Whether a confirmed deceased indicator (e.g. QCB `DEAD`) is *by itself* sufficient to raise the hold is a
business/compliance decision — `TBD — Requires QDB Confirmation` (F6). Architecturally the indicator must be
**capable of raising the hold immediately**; the condition lives in the ruleset, never in code.

---

### 3A.4 Phase 2 implementation — what exists in code (2026-09-18)

| Contract | Where | Note |
|---|---|---|
| `MisDelinquencyRecord`, `CustomerIdentity` (strict), `FacilityIdentity`, `checkFacilityIdentity` | `@dcp/domain` `misObservation.ts` | the canonical observation; a mobile number cannot be identity structurally |
| `ICustomerResolver`, `decideCustomerResolution` | `customerResolution.ts` + `CustomerResolutionService` | QID primary, customer number cross-check where mapped, mismatch → exception |
| `IEligibilityEvaluator` | `eligibility.ts`; `RuleEngineEligibilityEvaluator` (operation name from configuration, contract provisional — KI-48), `StaticEligibilityEvaluator` (tests/demo) | no threshold in code |
| `decideEpisodeAction`, `EpisodePolicy` | `episode.ts` | Create / Update / Reopen / Cure / Ignore; reopen window is configuration, default is a new episode |
| `CollectionCase`, `CaseStatus`, `CASE_TRANSITIONS` | `collectionCase.ts`, `caseLifecycle.ts` | parity-tested against `StatusTransitionMatrix.cs` |
| `CollectionActivity`, `PromiseToPay`, `PTP_TRANSITIONS` | `collectionActivity.ts`, `activityLifecycle.ts` | PTP is an activity; `relatedRecord` correlates to a native communication without copying it |
| `DelinquencySnapshot`, `composeSnapshotKey` | `snapshot.ts` | key composition from configuration; refuses to default |
| `DelinquencySyncService.processBatch/processRecord` | `apps/api/src/services/collection` | the pipeline of `MISIntegration.md` §5–§7, one outcome per record, failures isolated |
| Repositories over `ICrmAdapter` | `CollectionCaseRepository`, `DelinquencySnapshotRepository`, `CollectionActivityRepository`, `IdentityExceptionRepository` | the only code that names a `qdb_` column is `qdbBindings.ts` |

The HTTP surface in §5 and the operations in §6 are still proposals; Phase 2 delivered the service
layer beneath them, exercised through tests and the live smoke rather than through routes.

## 4. `CommunicationService` (MP §37) — one shared package, browser and service

```ts
interface CommunicationService {
  validateCommunication(req: CommunicationRequest): Promise<ValidationOutcome>;   // chain in CommunicationArchitecture.md §3
  previewTemplate(templateCode: string, ctx: PlaceholderContext, language: 'ar'|'en'): Promise<Result<RenderedMessage>>;
  getAvailableTemplates(ctx: { channel; language; customerType; productType?; activityTypeCode?; strategyCode? }): Promise<TemplateSummary[]>;
  sendCommunication(req: CommunicationRequest): Promise<Result<CommunicationRef>>; // creates fax | email regarding the case
  sendSms(req: Omit<CommunicationRequest,'channel'>): Promise<Result<CommunicationRef>>;      // → fax
  sendWhatsApp(req: Omit<CommunicationRequest,'channel'>): Promise<Result<CommunicationRef>>; // → fax
  sendEmail(req: Omit<CommunicationRequest,'channel'>): Promise<Result<CommunicationRef>>;    // → email
  getCommunicationHistory(subject: { caseId?; customerId? }, page: PageRequest): Promise<Result<Page<CommunicationItem>>>;
}
interface CommunicationRequest { channel: 'SMS'|'WhatsApp'|'Email'; caseId: string; customerId: string;
  recipient: RecipientRef; templateCode?: string; freeText?: { subject?; body }; language: 'ar'|'en';
  attachments?: AttachmentRef[]; initiatedBy: { kind: 'User'|'System'; ref: string }; correlationId: string }
```

Sends never touch a gateway; QDB's existing fax/email dispatch is the mechanism (`TBD` how it triggers).

**Contact Hold is mandatory and server-side.** Both `validateCommunication` and `sendCommunication` call
`IRuleEngine.evaluateContactHold` (§3A.3) before anything is dispatched. The path is identical for
`initiatedBy.kind = 'User'` (React composer) and `'System'` (strategy, PTP reminder, SLA, Process Engine) —
a background job cannot bypass the chain, and UI hiding is not a control (F6).

---

### 4.1 Communication History — the aggregation contract (KI-45 confirmed)

`getCommunicationHistory` is the only way the workspace reads communications. It returns one
normalised stream assembled from `fax`, `email` and the approved QDB letter source; the caller never
queries those tables itself, and nothing is copied into a DCP-owned table to produce it.

```ts
type CommunicationChannel = 'SMS' | 'WhatsApp' | 'Email' | 'WarningLetter';

/** One entry in the unified history. Every field the source does not carry is absent, never guessed. */
interface CommunicationItem {
  id: string;
  /** Where the entry physically lives, so the UI can deep-link to the real record. */
  source: { entity: 'fax' | 'email' | 'document'; id: string };
  channel: CommunicationChannel;
  occurredOn: string;                       // ISO 8601
  customerId?: string;
  facilityNumber?: string;
  caseId?: string;
  collectionActivityId?: string;            // present only when an action record exists for the send
  recipient?: RecipientRef;
  sender?: { kind: 'User' | 'System'; ref: string; displayName?: string };
  subject?: string;
  preview?: string;                         // omitted where policy or privilege forbids it
  deliveryStatus?: { code: string; label: string; reportedOn?: string };
  failure?: { code?: string; message: string };
  initiatedBy: 'Manual' | 'Automated';
  documentRef?: AttachmentRef;              // Warning Letter and any attached document
}

interface CommunicationHistoryFilter {
  channels?: CommunicationChannel[];
  from?: string; to?: string;               // ISO 8601 date range
  customerId?: string;
  facilityNumber?: string;
  caseId?: string;
  deliveryStatus?: string[];
  search?: string;                          // subject / recipient
}

getCommunicationHistory(
  subject: { caseId?: string; customerId?: string; facilityNumber?: string },
  filter: CommunicationHistoryFilter,
  page: PageRequest,
): Promise<Result<Page<CommunicationItem>>>;
```

Three properties of this contract are load-bearing:

- **Filtering is applied at the source, not after.** The filter goes into each underlying query; the
  caller must never receive rows it then hides (SecurityModel §5b).
- **The service reads as the caller.** A row the user cannot read in CRM is absent from the page, and
  `Page.total` reflects what they may see — not what exists.
- **Only DCP-originated communications are returned.** Attribution comes from the correlation in
  CommunicationArchitecture §7.3, not from scanning every `fax` row on the customer.

`deliveryStatus` is populated only where the existing QDB mechanism reports it; where it does not, the
field is absent and the UI says "unknown" rather than implying delivery.

---

## 5. Integration Service HTTP surface (Fastify) — PROPOSAL (MP §60, CP §36)

All routes require a user bearer token except `/health`; every response carries `correlationId`.

| Route | Purpose | Status |
|---|---|---|
| `GET /health` | liveness + CRM reachability + MIS provider health | **exists — keep** |
| `GET /mis/breakdown` | live `ArrearBreakdown` | proposed |
| `GET /mis/details?bucket=&page=&pageSize=&sort=&…` | live paged `ArrearDetail` | proposed |
| `GET /mis/facility/{facilityId}` | live position for one facility | proposed |
| `GET /mis/customer/{customerId}/positions` | live positions for one customer | proposed |
| `POST /mis/sync` (admin role) | trigger / replay background sync (`{ mode: 'incremental'|'full', batchId? }`) | proposed |
| `GET /mis/sync/status` | last success, watermark, counts, failures (feeds freshness UI) | proposed |
| `GET /customer360/{businessId}` | cross-org fan-out (HL + BFD) merged canonical Customer 360 | proposed (R-01) |
| `POST /communications/system` (service role) | system-initiated send via `CommunicationService` | proposed |
| `GET /customers/:qid` | **retire → React → `Xrm.WebApi`** (reads `msst_dcpcustomer` today) | existing, retire |
| `GET /identity-exceptions` | **retire → React → `Xrm.WebApi`** on `qdb_identityexception` | existing, retire |

Config additions: `DV_API_VERSION` (per org: `9.1` | `9.2`) replacing the four hard-coded `'9.2'` sites
and the literal in `routes/health.ts`; `MIS_PROVIDER`; `PLATFORM_TYPE`; MIS base URL / credentials
(`TBD`, never in CRM records). Deployment: one container image for both targets.

---

## 6. DCP operations — Custom API (cloud) / Process Action (on-prem), identical names — PROPOSAL

Same pattern as EDP and DFE (`EngineReuseAssessment.md` §0). Called through `ICrmAdapter.execute`
(browser) or `IOrganizationService.Execute` (plugins/service). One plugin class per operation,
dispatching on `MessageName`; registered as a Custom API on cloud and as an unbound Process Action +
SDK step on-prem by the deployment package.

| Operation (unique name) | Bound to | Input | Output | Why an operation and not plain CRUD |
|---|---|---|---|---|
| `qdb_dcp_TransitionCase` | case | `caseId`, `targetStatus`, `reason` | `Result` | single choke point for the status matrix + stop-contact guard + reason capture |
| `qdb_dcp_EvaluateStrategy` | case | `caseId`, `asOf?` | `StrategyDecision` | composes Rule Engine + strategy config; used by sync and UI |
| `qdb_dcp_ResolveAssignment` | case | `caseId` | `AssignmentDecision` | `IAssignmentEngine` server-side |
| `qdb_dcp_RecordPtp` | activity | `caseId`, `ptpDate`, `amount`, `type`, `notes` | `activityId` | creates PTP activity + validations + reminder scheduling |
| `qdb_dcp_EvaluatePtp` | activity | `activityId` | `PtpEvaluation` | Kept / Partially Kept / Broken against latest position (ADR-06 logic, relocated) |
| `qdb_dcp_SendCommunication` | unbound | `CommunicationRequest` | `CommunicationRef` | server-side validation chain for callers that are not the React app |
| `qdb_dcp_EvaluateEligibility` | unbound | canonical position + `ResolutionResult` | `EligibilityDecision` | Collection Eligibility / Grace through `IRuleEngine` (§3A.2); callable from sync, UI and tests without duplicating the ruleset |
| `qdb_dcp_ApplyMisPosition` | unbound (service only) | canonical `ArrearDetail[]`, `batchId` | `ApplyOutcome` | per row: resolve identity → resolve facility → **evaluate eligibility** → act on the outcome (create · update · monitor-without-case · exclude · exception) → snapshot per `qdb_snapshotpolicy`; idempotent, one transaction per row |
| `qdb_dcp_GetCaseTimeline` | case | `caseId`, `page` | `TimelineItem[]` | server-side merge of activity + fax + email + process events (optional; client merge is the fallback) |

Names are proposals; the `qdb_dcp_` segment keeps DCP operations distinct from other QDB engines.

---


## 6A. Rule Engine operations — implemented client side in Phase 3 (ADR-DCP-13)

Three of the operations proposed in §6 are the Rule Engine's, and `RuleEngineClient` now calls all
three. **The client exists; the operations do not yet** — creating them and their rulesets is QDB's
(KI-48). The contract below is what the client sends and what it will accept.

Each operation is unbound. On cloud it is a Custom API; on-premises a Process Action of the same name.
Both are invoked through `ICrmAdapter.execute`, so nothing in the Collection services knows the platform.
**The names are configuration** (`qdb_platformconfiguration.qdb_featureflags.ruleEngineOperations`), not
constants — the values below are the proposed defaults for a deployment to set, not fallbacks in code.

### `qdb_dcp_EvaluateEligibility`

| Direction | Parameter | Type | Notes |
|---|---|---|---|
| In | `RulesetCode` | string | from `qdb_eligibilityrulesetcode` |
| In | `Observation` | string (JSON) | the canonical MIS delinquency record |
| In | `Customer` | string (JSON), nullable | null when identity resolution did not succeed — the ruleset sees an unresolved customer rather than a fabricated one |
| In | `ActiveCase` | string (JSON), nullable | `{ id, status, episodeNumber }` when the facility already has an open episode |
| Out | `Outcome` | string | **must** be one of `EligibleCreateCase` · `ExistingEpisodeUpdate` · `GraceMonitor` · `ExcludedSpecialHandling` · `IdentityException` · `FacilityException` |
| Out | `Reason` | string, optional | recorded on the snapshot |
| Out | `RulesetVersion` | string | **required** — a decision that cannot be attributed to a ruleset version is rejected |

### `qdb_dcp_SelectStrategy`

| Direction | Parameter | Type | Notes |
|---|---|---|---|
| In | `RulesetCode` | string | from `qdb_strategyrulesetcode` |
| In | `Case` | string (JSON) | facility identity, status, episode, cached MIS position, organisation code |
| In | `Customer` | string (JSON), nullable | |
| Out | `StrategyCodes` | string[] — a single `StrategyCode` string is also accepted | **codes, never records.** Most specific first; an empty list means "no strategy applies", which is a refusal the caller must handle, not a default treatment |
| Out | `Reason` | string, optional | |
| Out | `RulesetVersion` | string | **required** |

### `qdb_dcp_EvaluateContactHold`

| Direction | Parameter | Type | Notes |
|---|---|---|---|
| In | `RulesetCode` | string | from `qdb_contactholdrulesetcode` |
| In | `Customer` | string (JSON) | entity, id, business id |
| In | `Channel` | string, nullable | the channel being attempted |
| In | `CaseId` / `FacilityNumber` / `SourceSystem` | string, nullable | context only |
| Out | `Hold` | boolean | |
| Out | `Reason` | string, optional | |
| Out | `RulesetVersion` | string | **required** |

> The input carries **no deceased flag and no customer-master column**, by design — so a Contact Hold can
> never be inferred from QCB DEAD by accident, and DCP never asserts which field is authoritative (KI-44).

### Failure contract — the same for all three

| Condition | Behaviour |
|---|---|
| No operation configured for the decision | Refused before any call, naming `qdb_featureflags.ruleEngineOperations` |
| No ruleset code configured | Refused, naming the `qdb_platformconfiguration` column to set |
| Operation absent from the organisation, or it throws | Refused, carrying the platform's own error |
| Response outside the contract — bad `Outcome`, missing `RulesetVersion` | Refused. **An unattributable decision about a customer's debt is not a decision** |

Every refusal is written to `qdb_crmlogs` with `errorCode = rule_engine_unusable`, the decision name and
the ruleset code, then raised as `RuleEngineError`. Nothing is swallowed and nothing is defaulted — in
particular an unreadable Contact Hold answer is a **refusal to contact**, never `hold: false`.

Verified live on 2026-09-18 against `org5869857f`: an unconfigured operation name was refused before any
call was made, and a configured-but-non-existent Custom API was refused rather than defaulted. Both
refusals reached the technical log.

## 7. Error contract

```ts
type DomainErrorCode = 'stop_contact' | 'invalid_transition' | 'customer_not_found' | 'facility_not_found'
  | 'identity_exception' | 'consent_missing' | 'template_not_approved' | 'free_text_forbidden'
  | 'policy_blocked' | 'unauthorised' | 'dataverse_unavailable' | 'mis_unavailable' | 'mis_timeout'
  | 'duplicate_batch' | 'validation_failed' | …;
interface DomainError { code: DomainErrorCode; message: string; correlationId: string; details?: unknown; cause?: unknown }
type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };
```

Plugins throw `InvalidPluginExecutionException` with the same code in the message prefix so the browser
maps it back to a `DomainError`. HTTP: 400 validation, 401/403 auth, 404 not found, 409 conflict /
duplicate batch, 503 `dataverse_unavailable` / `mis_unavailable` (existing behaviour kept). A refusal is
never an HTTP 200 with an error body.

---

## 8. Reuse from today's `packages/` and `apps/api`

| Component | Verdict | Where it lives in the target |
|---|---|---|
| `buildODataUrl` (`@dcp/dataverse-client`) | **reuse** | shared by `ICrmAdapter` (browser) and `DataverseClient` (service) |
| `CrmApiError`, `retry` | **reuse** | both sides |
| `Result<T>`, `DomainError`, `OrgTarget`, constants (`@dcp/types`) | **reuse** | everywhere; add codes above |
| `DataverseClient` (Node, token factory) | **reuse, server-side only** | Integration Service |
| `AdfsAdapter` / `AzureAdAdapter` / `IAuthAdapter` | **reuse** | Integration Service |
| Fastify plugins `auth`, `correlation-id`, `org-router` | **reuse** | Integration Service (`org-router` becomes the cross-org resolver) |
| `CustomerService.findCustomerByQid`, `IdentityExceptionService`, their routes | **retire** | superseded by `Xrm.WebApi` reads on contact/account and `qdb_identityexception` |
| `Customer.ts` zod schema (`msst_*` fields) | **replace** | canonical `CollectionCustomer` |
| `apiVersion: '9.2'` literals (`app.ts`, `org-router.ts`, `routes/health.ts`) | **fix** | `DV_API_VERSION` per org |

---

## 9. Open contract items

| Item | Status |
|---|---|
| MIS endpoints, auth, paging, change feed, timeouts, rate limits, BFD contract | `TBD — Requires QDB Confirmation` (full list `MISIntegration.md` §12) |
| Browser → Integration Service auth on-prem (AD FS bearer vs Windows-integrated) | `TBD — Requires QDB Confirmation` |
| Custom API availability on QDB on-prem 9.1 (affects packaging only) | `TBD — Requires QDB Confirmation` |
| Fax/email dispatch trigger and status fields | `TBD — Requires QDB Confirmation` |
| Smart Assignment contract behind `qdb_dcp_ResolveAssignment` | `TBD — Requires QDB Confirmation` |
| Eligibility / grace **criteria and thresholds** (ruleset content, not contract) | `TBD — Requires QDB Confirmation` (F2) |
| Whether automated contact is prohibited above a DPD boundary, and where segmentation boundaries fall | `TBD — Requires QDB Confirmation` (F1) |
| Whether a confirmed deceased indicator alone raises Contact Hold | `TBD — Requires QDB Confirmation` (F6) |
| `accountStatusCode` authoritative mapping; `lastArrearAmount` semantics; `dpdAsOfDate` semantics | `TBD — Requires QDB/MIS Confirmation` (F7, F8, F3) |
| BFD stable business identifier (CR / UEN / TRN or other) and identifier validation rules | `TBD — Requires QDB Confirmation` (F4) |
