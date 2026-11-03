# DCP — Schema Migration `msst_` → `qdb_` (Phase 0)

**Status:** plan for review · 2026-09-17 · **NOTHING IN THIS DOCUMENT HAS BEEN EXECUTED.** Master Prompt
§3 and §70; Correction Prompt §6–7. Targets are defined in `EntityDictionary.md` / `FieldDictionary.md`.
Inventory source: `crm/scripts/lib/entity-defs.mjs`, `option-set-defs.mjs`, `status-codes.mjs`,
`role-defs.mjs`, `plugin-steps.mjs`, `queues.mjs`, `field-security.mjs`, and the live sandbox org5869857f.

---

## 1. Principles

1. **Create-new → migrate → validate → retire.** No `msst_` component is deleted until the `qdb_`
   replacement is provisioned, code and tests point at it, the smoke suite passes against it on the
   cloud org, and the user has approved retirement (MP §3, §89).
2. **Logical names are immutable in Dataverse and on-prem.** There is no rename; every entity, column,
   choice, relationship, key, role and queue is a *new* component with a mapping.
3. **Option-set integer values are publisher-bound** (option value prefix). `qdb_` choices cannot carry
   the `msst_` integers; migration maps by label/code, and the C# `StatusTransitionMatrix` /
   `ActivitySubjectComposer` constants must be re-read from provisioned metadata before registration.
4. **`Qdb.DebtCollection.Plugins` is a new assembly identity.** Renaming the assembly/namespace changes
   the strong name → it registers *beside* `Msst.DebtCollection.Plugins`, never over it. Both can coexist
   during validation; the old assembly is unregistered only at retirement.
5. **`key.snk` is gitignored and exists only on disk** (now `crm/plugins/Qdb.DebtCollection.Plugins/key.snk`,
   `PublicKeyToken=f70ee8facd683d55`). Decision for Phase 1: reuse it for `Qdb.DebtCollection.Plugins`
   (same token, new assembly name) **or** issue a QDB-owned key — `TBD — Requires QDB Confirmation`.
   Either way the key must be backed up out-of-band before any assembly work.
6. **No real data exists.** The org holds only `SMOKE …` / `DIAG …` rows (13 customers, 15 cases, 10
   snapshots, 60 audit rows, 15–16 Sep 2026). There is nothing to migrate; the "data migration" column
   below therefore records the *procedure* the production migration would follow, not a Phase 1 task.
7. **Retirement is itself blocked by `ImmutabilityGuard`** (Delete refused on case, snapshot, auditlog,
   activities — sysadmin included). Retiring test data requires disabling those steps on a shared org —
   held for the user (Known Issue KI-04).

---

## 2. Component inventory and decisions

Legend — **Decision:** KEEP · REFACTOR · CREATE · RETIRE · CONSOLIDATE · REPLACE.
**Method:** `new+map` = create `qdb_` component, map by name/label, repoint code/tests.
**Rollback** for every `qdb_` creation is the same: the `msst_` components are untouched until retirement,
so rollback = stop using the new component and delete the unmanaged `qdb_` addition (no data at risk).
**Retire when:** smoke suite green against `qdb_` on cloud · React/API/tests carry no `msst_` reference ·
user approval recorded in the tracker.

### 2.1 Entities

| Existing | Target | Decision | Method | Dependencies | Validation |
|---|---|---|---|---|---|
| `msst_dcpcustomer` | `contact` (HL) / `account` (BFD) + `qdb_` flag columns | **RETIRE** | field-by-field per §3; flags become `qdb_` columns on contact/account; QID alt key moves to contact | StopContactQueueMover, StatusTransitionValidator guard, `CustomerService`, `Customer.ts`, field-security profile, 2 audit steps, smoke | guard + mover fire from contact/account; QID lookup returns the contact |
| `msst_dcploanfacility` | existing HL/BFD facility entity via Platform Mapping; `qdb_facilitynumber` on case | **RETIRE** | none reads it; drop after case carries facility number | 2 audit steps only | facility number resolves via mapping |
| `msst_dcpdelinquencysnapshot` | `qdb_delinquencysnapshot` | **REFACTOR** | `new+map`; add `qdb_snapshotkey` alternate key + MIS fields | ImmutabilityGuard ×2, smoke | replayed batch creates no duplicate; Update/Delete refused |
| `msst_dcpcollectioncase` | `qdb_collectioncase` | **REFACTOR** | `new+map`; `IsValidForQueue=true` at creation; `qdb_customerid` Customer lookup; 17 statuscodes re-created | Validator, DefaultStatusAssigner, ImmutabilityGuard, AuditLogWriter ×2, mover, queues, roles | matrix transitions identical; AddToQueue succeeds; Delete refused |
| `msst_dcpcollectionaction` | `qdb_collectionactivity` | **REFACTOR** | `new+map`; type/outcome become lookups; PTP columns added | ActivitySubjectComposer, ImmutabilityGuard ×2, audit ×2 | subject composed from type lookup; completed activity immutable |
| `msst_dcpcommunication` | `fax` / `email` | **RETIRE** | none; Communication Service targets system entities | Composer, ImmutabilityGuard ×2, audit ×2 (6 steps drop) | n/a |
| `msst_dcpptprecord` | `qdb_collectionactivity` type = PTP | **CONSOLIDATE** | PTP columns on the activity; 6 PTP statuses → `qdb_ptp_status` choice | Validator PTP step, DefaultStatusAssigner PTP step, audit ×2 | PTP transitions enforced on the activity |
| `msst_dcpconsent` | `qdb_consent` **or** existing QDB capability | **REASSESS** | carry design unchanged until `TBD — Requires QDB Confirmation` | nothing reads it | — |
| `msst_dcpauditlog` | native audit + existing `qdb_crmlogs` | **REPLACE** | enable native auditing on `qdb_` entities; narrow technical log | AuditLogWriter ×14, ImmutabilityGuard ×2 | native audit history visible; integration events logged with correlation id |
| `msst_dcpstrategyconfig` | `qdb_collectionstrategy` + `qdb_strategyaction` | **REFACTOR/SPLIT** | `new+map`; one flat row → strategy criteria + ordered actions | audit ×2; nothing evaluates it | seeded rules reproduce the demo matrix |
| `msst_dcpidentityexception` | `qdb_identityexception` | **REFACTOR** | `new+map`; add resolution/batch/correlation columns | `IdentityExceptionService`, route | route returns rows from the new entity |

### 2.2 Columns (every `msst_` column)

| Entity | Column | Target | Decision |
|---|---|---|---|
| customer | `msst_fullname` | contact.fullname / account.name | RETIRE (reuse) |
| customer | `msst_qid` | contact — existing QDB QID field if present | TBD — Requires QDB Confirmation |
| customer | `msst_crnumber` | account — existing CR number field | TBD — Requires QDB Confirmation |
| customer | `msst_nationality` | contact — existing field | TBD — Requires QDB Confirmation |
| customer | `msst_employer` | contact — existing field | TBD — Requires QDB Confirmation |
| customer | `msst_mobile` | contact.mobilephone / account.telephone1 | RETIRE (reuse) |
| customer | `msst_email` | contact.emailaddress1 / account.emailaddress1 | RETIRE (reuse) |
| customer | `msst_address` | contact/account address1_* | RETIRE (reuse) |
| customer | `msst_salarytransfer` | — | TBD — Requires QDB Confirmation |
| customer | `msst_vulnerabilityflag` | contact/account `qdb_vulnerabilityflag` | CREATE (extension) |
| customer | `msst_stopcontact` | contact/account `qdb_stopcontact` | CREATE (extension) |
| customer | `msst_deceasedflag` | contact/account `qdb_deceasedflag` | CREATE (extension) |
| customer | `msst_dateofdeath` | contact/account `qdb_dateofdeath` | CREATE (extension) |
| customer | `msst_deathsource` | contact/account `qdb_deceasedsource` | CREATE (extension) |
| customer | `msst_preferredlanguage` | contact/account `qdb_collectionlanguage` unless an existing field serves | TBD — Requires QDB Confirmation |
| strategy | `msst_name` | `qdb_collectionstrategy.qdb_name` | REFACTOR |
| strategy | `msst_dpdbucket` | `qdb_dpdfrom` / `qdb_dpdto` | REFACTOR (range replaces bucket) |
| strategy | `msst_segment` | `qdb_customertype` | REFACTOR |
| strategy | `msst_actiontype` | `qdb_strategyaction.qdb_activitytypeid` / `qdb_communicationchannel` | SPLIT |
| strategy | `msst_queueref` | `qdb_assignmentconfiguration.qdb_targetteamid` (queue by name) | SPLIT |
| strategy | `msst_slahours` | `qdb_strategyaction.qdb_escalationhours` / assignment SLA | SPLIT |
| strategy | `msst_active` | `qdb_isactive` | REFACTOR |
| identityexception | `msst_name`, `msst_qid`, `msst_reason`, `msst_exceptionstatus`, `msst_reviewedby` | `qdb_name`, `qdb_customerbusinessid`, `qdb_exceptionreason`, `qdb_exceptionstatus`, `qdb_reviewedbyid` (+ new: facility no., source, batch, correlation, received, review date, resolution, resolved customer, payload) | REFACTOR |
| facility | `msst_name`, `msst_producttype`, `msst_outstandingbalance`, `msst_arrears`, `msst_instalment`, `msst_dpd`, `msst_dpdbucket`, `msst_accountstatus`, `msst_maturitydate`, `msst_collateral`, `msst_guarantor`, `msst_restructureflag`, `msst_org` (13 + 4 choice refs) | facility master (existing entity) for master attributes; MIS canonical model for position; `qdb_collectioncase` cached position for DPD/bucket/balance/arrears/instalment | RETIRE (position → case cache + snapshot; master → existing entity, names `TBD — Requires QDB Confirmation`) |
| snapshot | `msst_name`, `msst_batchreference`, `msst_asof`, `msst_dpd`, `msst_arrears`, `msst_outstandingbalance`, `msst_dpdbucket` | `qdb_name`, `qdb_integrationbatchid`, `qdb_misasofdate`, `qdb_dpd`, `qdb_totalarrears`, `qdb_loanbalance`, `qdb_arrearbucket` (+ new per `FieldDictionary.md`) | REFACTOR |
| case | `msst_name`, `msst_producttype`, `msst_casereason`, `msst_org` | `qdb_name`/`qdb_casenumber`, `qdb_producttype`, `qdb_casereason` (kept), `qdb_organizationcode` | REFACTOR |
| case | `statuscode` 200–216 (New … Reopened; 214/215 inactive) | same 17 labels on `qdb_collectioncase`, new integer values | REFACTOR (re-create via `InsertStatusValue`) |
| ptp | `msst_name`, `msst_ptpdate`, `msst_promisedamount`, `msst_partialflag`, `msst_reminderdate`, `msst_reschedulecount` | activity: subject, `qdb_ptpdate`, `qdb_promisedamount`, `qdb_promisetype`, `qdb_reminderdate`, `qdb_reschedulecount` | CONSOLIDATE |
| ptp | `statuscode` 220–225 (Open, Kept, Partially Kept, Broken, Rescheduled, Cancelled) | `qdb_ptp_status` choice on the activity (Active, Kept, Partially Kept, Broken, Rescheduled, Cancelled) | CONSOLIDATE |
| consent | `msst_name`, `msst_channel`, `msst_consentstatus`, `msst_lawfulbasis`, `msst_source`, `msst_recordedby`, `msst_recordedon` (+3 choice refs) | `qdb_consent.*` same shape | REASSESS |
| auditlog | `msst_name`, `msst_auditaction`, `msst_entityname`, `msst_recordid`, `msst_oldvalue`, `msst_newvalue`, `msst_actor`, `msst_actorrole`, `msst_timestamp` | native audit | REPLACE |
| auditlog | `msst_sourcepath`, `msst_correlationid` | `qdb_crmlogs.qdb_source`, correlation id (extension TBD` | REPLACE (technical log keeps these) |
| collectionaction | `msst_actiontype` (choice) | `qdb_activitytypeid` (lookup) | REPLACE |
| collectionaction | `msst_outcomecode` (string) | `qdb_outcomeid` (lookup) | REPLACE |
| collectionaction | `msst_notes` | `description` (activity base) | REFACTOR |
| communication | `msst_channel`, `msst_commdirection`, `msst_templateref`, `msst_deliverystatus`, `msst_blockreason` (+3 choice refs) | fax/email native `direction`/`statuscode`; `qdb_blockreason`, `qdb_templatecode`, `qdb_channel` on fax/email only if QDB's mechanism lacks them | RETIRE (TBD — Requires QDB Confirmation for the extension columns) |

### 2.3 Global choices (13)

| Existing | Target | Decision |
|---|---|---|
| `msst_dcpdpdbucket` (10) | `qdb_dpd_bucket` — labels normalised to MIS codes (`1-30` … `>2000`) | REFACTOR |
| `msst_dcpchannel` (SMS, Email, Official Letter, Call) | `qdb_communication_channel` (+ WhatsApp) | REFACTOR |
| `msst_dcppreferredlanguage` (Arabic, English) | `qdb_language` | REFACTOR |
| `msst_dcpproducttype` (Housing Loan, Corporate, SME, Restructured, Legal, Deceased) | `qdb_product_type` seeded from MIS loan type codes; Restructured/Legal/Deceased are statuses, not products | REPLACE |
| `msst_dcpaccountstatus` (Current, Watch List, Substandard, NPL, Write-off) | `qdb_nplindicator` bool + MIS `accountStatusCode` (7/8 — `TBD`) | REPLACE |
| `msst_dcpconsentstatus`, `msst_dcplawfulbasis` | `qdb_consent_status`, `qdb_lawful_basis` | REASSESS |
| `msst_dcpactiontype` (Call, Meeting, Supervisor Review, Field Visit, Manual Note) | `qdb_collectionactivitytype` **rows** | REPLACE (choice → entity) |
| `msst_dcpdeliverystatus` (Sent, Delivered, Failed, Opened, Blocked) | fax/email statuscode; `qdb_deliverystatus` only if needed | RETIRE |
| `msst_dcpcommdirection` | fax/email `directioncode` | RETIRE |
| `msst_dcporg` (HL, BFD) | `qdb_organization_code` | REFACTOR |
| `msst_dcpexceptionreason`, `msst_dcpexceptionstatus` | `qdb_exception_reason` (extended), `qdb_exception_status` (extended) | REFACTOR |
| `msst_dcpstrategyactiontype` (SMS, Email, Official Letter, Queue Assignment, No Contact) | `qdb_strategyaction` channel + activity type; "No Contact" → strategy flag | SPLIT |
| `msst_dcpsegment` (Retail, SME) | `qdb_customer_type` (Individual, SME, Corporate) | REFACTOR |

### 2.4 Relationships and alternate keys

| Existing | Target | Decision |
|---|---|---|
| `msst_dcpcollectioncase.msst_customerid` → `msst_dcpcustomer` | `qdb_customerid` **Customer** lookup → contact \| account (`CreateCustomerRelationships`, verified on both SDK and cloud org) | REPLACE |
| `msst_dcpcollectioncase.msst_facilityid` → `msst_dcploanfacility` | `qdb_facilitynumber` (shared) + `qdb_facilityid` lookup added by org-specific package | REPLACE |
| alternate keys (`alt-keys.mjs`: customer QID, facility number, snapshot batch) | QID key on contact (`TBD` existing field); `qdb_facilitynumber` key on case; `qdb_snapshotkey` on snapshot | REFACTOR |

### 2.5 Plugins — assembly, types, steps, images

| Existing (`Msst.DebtCollection.Plugins`) | Steps / images | Target | Decision |
|---|---|---|---|
| `AuditLogWriterPlugin` | 14 async post-op (Create+Update on 7 entities) / 7 PreImages | native audit; optional integration-event writer | REPLACE |
| `StatusTransitionValidatorPlugin` | 2 sync pre-op (case, ptp) / 2 PreImages | 1 step on `qdb_collectioncase` (+1 on activity for PTP status) | REFACTOR |
| `ImmutabilityGuardPlugin` | 9 pre-validation (snapshot ×2, auditlog ×2, action ×2, communication ×2, case Delete) / 4 images | 5 steps (snapshot ×2, activity ×2, case Delete) | REFACTOR |
| `DefaultStatusAssignerPlugin` | 2 pre-op Create (case, ptp) | 1–2 steps (case, activity) | KEEP |
| `ActivitySubjectComposerPlugin` | 2 pre-op Create (action, communication) | 1 step (activity; from type lookup) | REFACTOR |
| `StopContactQueueMoverPlugin` | 1 async post-op on `msst_dcpcustomer.msst_stopcontact` / 1 PreImage | 1 step per deployment on contact (HL) or account (BFD) `qdb_stopcontact`; `IsValidForQueue` fixed | REFACTOR |

Registration script `register-plugins.mjs` + `lib/plugin-steps.mjs` / `plugin-registration.mjs`: REFACTOR
(new assembly name, new step table, on-prem path via PRT/solution — deployment tooling may differ, MP §83).

### 2.6 Security, queues, field security

| Existing | Target | Decision |
|---|---|---|
| 12 roles `Msst DCP …` (Collection Officer, Relationship Manager, Senior Manager, Head of Collections, Legal User, Insurance Officer, Restructuring Officer, Risk Credit User, Finance User, Admin User, Audit Compliance, Management) | 12 roles `QDB DCP …` with privileges on `qdb_` entities + contact/account/fax/email append/read; BU/team scope per `SecurityModel.md` | REFACTOR (mapping table in `SecurityModel.md`) |
| 3 queues (Early Collection, High Risk, Deceased & Insurance) | same names; resolved by name | KEEP |
| field-security profile on `msst_mobile/email/address` | column security on contact/account PII fields (existing QDB profile if any — `TBD — Requires QDB Confirmation`) | REFACTOR |

### 2.7 Scripts, code, tests, UI

| Existing | Target | Decision |
|---|---|---|
| `provision-schema.mjs` + `entity-defs`, `option-set-defs`, `status-codes`, `relationship-defs`, `alt-keys`, `role-defs`, `roles`, `queues`, `field-security`, `solution`, `labels`, `attr-builders`, `entities`, `option-sets`, `relationships` | same scripts driven by `qdb_` definitions; solution `qdb_debtcollection`; **plus** export to a solution.zip for on-prem import | REFACTOR |
| `crm-client.mjs` (Entra-only token) | `IToolingAuth` adapter: Entra (cloud) / AD FS or PRT-manual (on-prem) | REFACTOR |
| `smoke-plugins.mjs`, `verify-schema.mjs`, `cleanup-ptp-picklist.mjs` | retarget; add queue-move assertion; PTP checks move to activity | REFACTOR |
| `packages/types/Customer.ts` (`msst_stopcontact`), `CustomerService.findCustomerByQid`, `GET /customers/:qid` | canonical `CollectionCustomer` via Platform Mapping; route retired (React → Xrm.WebApi) or repurposed for cross-org fan-out | REPLACE |
| `IdentityExceptionService`, `GET /identity-exceptions` | `qdb_identityexception`; route retired or kept for sync monitoring | REFACTOR |
| `apps/api` `apiVersion: '9.2'` ×4, `health.ts` literal | `DV_API_VERSION` per org | REFACTOR (KI-02) |
| `prototype/` (mock-data only) | reference material for `apps/web`; no schema binding | KEEP (as reference) |
| `DataverseClient.test.ts` (`msst_dcpcustomers`), API tests, 92 C# tests bound to `msst_` names | classify per MP §81: requirement valid → fix implementation; never deleted | REFACTOR |

---

## 3. `msst_dcpcustomer` — field-by-field (Correction Prompt §6)

| Field | Classification | Reason |
|---|---|---|
| `msst_fullname` | Reuse Existing QDB Field | `contact.fullname` / `account.name` are the source of record |
| `msst_qid` | TBD — Requires QDB Confirmation | QDB's contact almost certainly holds QID already; reuse it as the alternate key, else add `qdb_qid` |
| `msst_crnumber` | TBD — Requires QDB Confirmation | BFD account has `qdb_crstartdate`/`qdb_crexpirydate` (3C workbook) so a CR number field very likely exists |
| `msst_nationality` | TBD — Requires QDB Confirmation | standard KYC attribute; reuse if present |
| `msst_employer` | TBD — Requires QDB Confirmation | HL contact likely carries employer; reuse if present |
| `msst_mobile` | Reuse Existing QDB Field | `contact.mobilephone` / `account.telephone1`; PII masking via column security |
| `msst_email` | Reuse Existing QDB Field | `emailaddress1` on both |
| `msst_address` | Reuse Existing QDB Field | `address1_composite` on both |
| `msst_salarytransfer` | TBD — Requires QDB Confirmation | belongs to the customer/facility relationship with QDB; may exist on contact or facility |
| `msst_vulnerabilityflag` | Add qdb_ Field to Contact/Account | persists across cases; CP §7 → `qdb_vulnerabilityflag` |
| `msst_stopcontact` | Add qdb_ Field to Contact/Account | customer-level suppression; drives the guard and mover → `qdb_stopcontact` (+ reason, date) |
| `msst_deceasedflag` | Add qdb_ Field to Contact/Account | customer attribute; MIS also supplies `deceasedFlag` — CRM field is the actioned status → `qdb_deceasedflag` |
| `msst_dateofdeath` | Add qdb_ Field to Contact/Account | `qdb_dateofdeath` |
| `msst_deathsource` | Add qdb_ Field to Contact/Account | `qdb_deceasedsource` (QCB / family / insurer …) |
| `msst_preferredlanguage` | TBD — Requires QDB Confirmation | reuse an existing language/communication-preference field if QDB has one; else `qdb_collectionlanguage` |
| *(implicit)* Special Handling, Communication Preference (CP §7) | Add qdb_ Field to Contact/Account / TBD | `qdb_specialhandling`; channel preference may be covered by existing consent capability (`TBD`) |

Nothing moves to Collection Case or Collection Activity: every field describes the customer, not an
episode. Nothing is classed Remove outright — the reuse candidates simply stop being duplicated.

---

## 4. Destructive actions Phase 1 would require — **NOT EXECUTED, listed for approval**

1. Unregister `Msst.DebtCollection.Plugins` steps/assembly (after `Qdb.*` is validated).
2. Disable `ImmutabilityGuard` steps to delete SMOKE/DIAG rows in case/snapshot/auditlog/activities on the
   **shared** org (EDP/CWFD/DFE also live there), then re-enable.
3. Delete `msst_dcp*` entities, 13 choices, 12 roles, 1 field-security profile, solution
   `msst_debtcollection` (roles must be unassigned from users first).
4. Add `qdb_` columns to **contact** and **account** (customer-architecture change — CP §103 review gate).
5. **Optionally** add a `qdb_facilityid` lookup targeting the confirmed facility entity, **per deployment**
   — a deployment extension, not shared schema. The canonical contract (`qdb_facilitynumber` +
   `sourceSystem`) must work with the lookup absent, and no Collection logic may branch on the target.
6. Metadata change `IsValidForQueue = true` (on the new entity at creation, so no ALTER on the old one).
7. Rotate or re-issue `key.snk` if a QDB-owned key is chosen.

Each is a live-org schema change and needs explicit go-ahead per CLAUDE.md and CP §48.

---

## 5. Rollback approach

- **Phase 1 additions are unmanaged and additive**: rollback = delete the `qdb_` components and the
  contact/account extension columns; `msst_` components are never modified until §4 is approved.
- **Plugins**: keep both assemblies registered until cut-over; rollback = disable `Qdb.*` steps, enable
  `Msst.*` steps (step enable/disable is the mechanism already used for image-cache refresh).
- **Code**: `feat/dcp-phase1-foundation` @ `95dcb04d` on origin is the last `msst_`-only state; the
  `qdb_` refactor lands on a new branch; rollback = do not merge.
- **Data**: none real; test rows are recreated by `smoke-plugins.mjs` on demand.
- **Retirement (§4)**: irreversible for data; requires an exported unmanaged solution of
  `msst_debtcollection` taken immediately before deletion, kept with the tracker.
