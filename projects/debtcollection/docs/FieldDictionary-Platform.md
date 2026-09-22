# Field Dictionary — Part 3: Platform / integration entities

Legend and conventions: `FieldDictionary.md`. Entity = table heading. `qdb_platformconfiguration`
never stores secrets, passwords or client secrets (MP §13).

## `qdb_platformconfiguration` — Platform Configuration (org-owned; one active row per deployment)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Platform Configuration | qdb_platformconfigurationid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | new | |
| Name | qdb_name | string | 200 | R | — | C | Y | — | Primary name, e.g. `HL-OnPrem-PROD` | Y | Y | CbD | CbD | — | new | |
| Platform Type | qdb_platformtype | choice `qdb_platform_type` | — | R | — | C | Y | — | OnPrem · Cloud | Y | Y | CbD | CbD | — | new | Cross-checked against runtime context at startup |
| Organization Code | qdb_organizationcode | choice `qdb_organization_code` | — | R | — | C | Y | — | HL · BFD | Y | Y | CbD | CbD | — | msst_dcporg (concept) | |
| Environment Code | qdb_environmentcode | string | 50 | O | — | C | Y | — | DEV · UAT · PROD | Y | Y | CbD | CbD | — | new | |
| Customer Type | qdb_customertype | choice `qdb_customer_type` | — | R | — | C | Y | — | Individual (HL) / SME·Corporate (BFD) | Y | Y | CbD | CbD | — | new | |
| Customer Entity | qdb_customerentity | string | 100 | R | — | C | Y | — | `contact` / `account` | Y | Y | CbD | CbD | — | new | |
| Customer Primary ID | qdb_customerprimaryid | string | 100 | R | — | C | Y | — | `contactid` / `accountid` | Y | Y | CbD | CbD | — | new | |
| Customer Business ID Field | qdb_customerbusinessidfield | string | 100 | R | — | C | Y | — | Field holding QID / CR number | Y | Y | CbD | CbD | customerId / nationalId | new | `TBD — Requires QDB Confirmation` (existing field names) |
| Customer Display Name Field | qdb_customerdisplaynamefield | string | 100 | R | — | C | Y | — | `fullname` / `name` | Y | Y | CbD | CbD | customerName | new | |
| Facility Entity | qdb_facilityentity | string | 100 | R | — | C | Y | — | Existing HL / BFD facility entity | Y | Y | CbD | CbD | — | new | `TBD — Requires QDB Confirmation` |
| Facility Primary ID | qdb_facilityprimaryid | string | 100 | R | — | C | Y | — | | Y | Y | CbD | CbD | — | new | `TBD` |
| Facility Business ID Field | qdb_facilitybusinessidfield | string | 100 | R | — | C | Y | — | Field matching MIS Account Number | Y | Y | CbD | CbD | facilityId | new | `TBD` |
| Collection Case Entity | qdb_collectioncaseentity | string | 100 | R | `qdb_collectioncase` | C | Y | — | | Y | Y | CbD | CbD | — | new | Same on both — present for completeness (MP §13) |
| Collection Activity Entity | qdb_collectionactivityentity | string | 100 | R | `qdb_collectionactivity` | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| SMS Entity | qdb_smsentity | string | 100 | R | `fax` | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| WhatsApp Entity | qdb_whatsappentity | string | 100 | R | `fax` | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Email Entity | qdb_emailentity | string | 100 | R | `email` | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Document Provider | qdb_documentprovider | choice (SharePoint · SharePointOnline · None) | — | R | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| MIS Integration Enabled | qdb_misintegrationenabled | bool | — | R | false | C | Y | — | Master switch for live + background paths | Y | Y | CbD | CbD | — | new | |
| MIS Provider | qdb_misprovider | choice (Mock · Api) | — | R | Mock | C | Y | — | Provider selection (CP §22) | Y | Y | CbD | CbD | — | new | |
| Feature Flags | qdb_featureflags | memo (JSON) | 100000 | O | `{}` | C | Y | — | e.g. `{"bfd":false,"whatsapp":true}` | Y | Y | CbD | CbD | — | FEATURE_BFD env (concept) | Schema documented in `ConfigurationGuide.md` |
| Active | qdb_isactive | bool | — | R | true | C | Y | — | Exactly one active row | Y | Y | CbD | CbD | — | new | Plugin-enforced |

## `qdb_platformmapping` — Platform Mapping (org-owned; child of Platform Configuration)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Platform Mapping | qdb_platformmappingid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | new | |
| Name | qdb_name | string | 200 | R | `{object}.{canonical}` | P | RO | — | Primary name | Y | Y | CbD | CbD | — | new | |
| Platform Configuration | qdb_platformconfigurationid | lookup `qdb_platformconfiguration` | — | R | — | C | N | — | | Y | Y | CbD | CbD | — | new | |
| Business Object | qdb_businessobject | choice `qdb_business_object` | — | R | — | C | Y | — | Customer · Facility · Case · Activity · Communication · Document | Y | Y | CbD | CbD | — | new | |
| Canonical Field | qdb_canonicalfield | string | 100 | R | — | C | Y | — | e.g. `CustomerId`, `DisplayName`, `Mobile` | Y | Y | CbD | CbD | canonical model | new | Unique per configuration + object |
| CRM Entity Logical Name | qdb_crmentitylogicalname | string | 100 | R | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| CRM Field Logical Name | qdb_crmfieldlogicalname | string | 100 | R | — | C | Y | — | | Y | Y | CbD | CbD | — | new | Validated against metadata at startup |
| Data Type | qdb_datatype | string | 50 | O | — | C | Y | — | Expected type for coercion | Y | Y | CbD | CbD | — | new | |
| Required | qdb_isrequired | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Access Mode | qdb_accessmode | choice `qdb_mapping_access` | — | R | Read | C | Y | — | Read · Write · ReadWrite | Y | Y | CbD | CbD | — | new | |
| Source | qdb_source | choice `qdb_mapping_source` | — | R | CRM | C | Y | — | CRM · MIS · Derived | Y | Y | CbD | CbD | — | new | |
| Active | qdb_isactive | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |

## `qdb_identityexception` — Identity Exception (user/team-owned)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Identity Exception | qdb_identityexceptionid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | msst_dcpidentityexceptionid | |
| Name | qdb_name | string | 200 | R | `{reason} {customer}/{facility}` | I | RO | — | Primary name | Y | Y | CbD | CbD | — | msst_name | |
| Customer Business ID | qdb_customerbusinessid | string | 50 | O | — | M | RO | PII | MIS customer / national id as received | Y | Y | CbD | CbD | customerId / nationalId | msst_qid | |
| Facility Number | qdb_facilitynumber | string | 50 | O | — | M | RO | — | | Y | Y | CbD | CbD | facilityId | new | |
| Source | qdb_source | string | 50 | R | MIS | I | RO | — | Originating system | Y | Y | CbD | CbD | — | new | |
| Exception Reason | qdb_exceptionreason | choice `qdb_exception_reason` | — | R | — | I | RO | — | CustomerNotFound · FacilityNotFound · DuplicateCustomer · DuplicateFacility · InvalidIdentifier · OneOrgOnly | Y | Y | CbD | CbD | — | msst_reason (`msst_dcpexceptionreason`) | |
| Status | qdb_exceptionstatus | choice `qdb_exception_status` | — | R | Open | U/P | Y | — | Open · UnderReview · Resolved · Rejected | Y | Y | CbD | CbD | — | msst_exceptionstatus | |
| Source Reference | qdb_sourcereference | string | 200 | O | — | I | RO | — | Row/record reference in the source | Y | Y | CbD | CbD | — | new | |
| Integration Batch ID | qdb_integrationbatchid | string | 100 | O | — | I | RO | — | | Y | Y | CbD | CbD | — | new | |
| Correlation ID | qdb_correlationid | string | 100 | O | — | I | RO | — | | Y | Y | CbD | CbD | — | new | |
| Received Date | qdb_receiveddate | datetime | — | R | now | I | RO | — | | Y | Y | CbD | CbD | — | new | |
| Reviewed By | qdb_reviewedbyid | lookup systemuser | — | O | — | U | Y | — | | Y | Y | CbD | CbD | — | msst_reviewedby (string → lookup) | |
| Review Date | qdb_reviewdate | datetime | — | O | — | U/P | Y | — | | Y | Y | CbD | CbD | — | new | |
| Resolution | qdb_resolution | memo | 4000 | O | — | U | Y | — | | Y | Y | CbD | CbD | — | new | |
| Resolved Customer | qdb_resolvedcustomerid | lookup (**Customer**: contact, account) | — | O | — | U | Y | — | Set on resolution | Y | Y | CbD | CbD | — | new | Same Customer type as the case |
| Resolved Facility Number | qdb_resolvedfacilitynumber | string | 50 | O | — | U | Y | — | | Y | Y | CbD | CbD | — | new | |
| Payload | qdb_payload | memo (JSON) | 100000 | O | — | I | RO | PII | Canonical row as received, for replay | Y | Y | CbD | CbD | ArrearDetail | new | Field-secure if PII policy requires |

## ~~`qdb_integrationlog` — Integration Log~~ — **WITHDRAWN — superseded by reuse of existing `qdb_crmlogs`**

> Retained below for architectural history only. These columns are **not** a new entity. Where DCP needs a
> capability `qdb_crmlogs` lacks, it appears as a *proposed extension* in `QdbCrmLogsReuseAssessment.md`,
> which is the authoritative mapping. Do not implement this table.

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Integration Log | qdb_integrationlogid | uniqueidentifier | — | S | new GUID | S | N | RO | Primary key | Y | Y | CbD | CbD | — | msst_dcpauditlogid (technical role) | |
| Name | qdb_name | string | 200 | R | `{operation} {startedon}` | I | N | RO | Primary name | Y | Y | CbD | CbD | — | msst_name | |
| Correlation ID | qdb_correlationid | string | 100 | R | — | I | N | RO | | Y | Y | CbD | CbD | — | msst_correlationid | |
| Source | qdb_source | string | 50 | R | — | I | N | RO | MIS · CrossOrg · Communication · Scheduler | Y | Y | CbD | CbD | — | msst_sourcepath | |
| Operation | qdb_operation | string | 100 | R | — | I | N | RO | e.g. `misSync`, `liveBreakdown` | Y | Y | CbD | CbD | — | new | |
| Integration Batch ID | qdb_integrationbatchid | string | 100 | O | — | I | N | RO | | Y | Y | CbD | CbD | — | new | |
| Status | qdb_status | choice (Started · Succeeded · PartialFailure · Failed) | — | R | Started | I | N | RO | | Y | Y | CbD | CbD | — | new | |
| Record Count | qdb_recordcount | int | — | O | — | I | N | RO | | Y | Y | CbD | CbD | — | new | |
| Success Count | qdb_successcount | int | — | O | — | I | N | RO | | Y | Y | CbD | CbD | — | new | |
| Failure Count | qdb_failurecount | int | — | O | — | I | N | RO | | Y | Y | CbD | CbD | — | new | |
| Error Detail | qdb_errordetail | memo | 100000 | O | — | I | N | RO | Per-row failures, exceptions | Y | Y | CbD | CbD | — | new | No PII beyond ids |
| External Status | qdb_externalstatus | string | 100 | O | — | I | N | RO | HTTP / provider status | Y | Y | CbD | CbD | — | new | |
| Started On | qdb_startedon | datetime | — | R | now | I | N | RO | | Y | Y | CbD | CbD | — | msst_timestamp | |
| Completed On | qdb_completedon | datetime | — | O | — | I | N | RO | | Y | Y | CbD | CbD | — | new | |
| Retry Count | qdb_retrycount | int | — | O | 0 | I | N | RO | | Y | Y | CbD | CbD | — | new | |
| Watermark | qdb_watermark | datetime | — | O | — | I | N | RO | Last successful MIS as-of / source timestamp | Y | Y | CbD | CbD | misAsOfDate / sourceTimestamp | new | Read by the next sync |

Update and Delete blocked by `ImmutabilityGuard` (retargeted from `msst_dcpauditlog`). Business-field
audit (old/new values, actor, role — `msst_oldvalue`, `msst_newvalue`, `msst_actor`, `msst_actorrole`,
`msst_auditaction`, `msst_entityname`, `msst_recordid`) moves to **native Dynamics audit** and is not
reproduced here.

## `qdb_consent` — Consent (conditional; carried from `msst_dcpconsent` pending `TBD — Requires QDB Confirmation`)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Consent | qdb_consentid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | msst_dcpconsentid | |
| Name | qdb_name | string | 200 | R | `{customer} {channel}` | P | RO | — | Primary name | Y | Y | CbD | CbD | — | msst_name | |
| Customer | qdb_customerid | lookup (**Customer**: contact, account) | — | R | — | U | N | — | | Y | Y | CbD | CbD | — | (msst customer lookup) | |
| Channel | qdb_channel | choice `qdb_communication_channel` | — | R | — | U | N | — | | Y | Y | CbD | CbD | — | msst_channel | |
| Consent Status | qdb_consentstatus | choice (Given · Withdrawn · NotRecorded) | — | R | NotRecorded | U | Y | — | | Y | Y | CbD | CbD | — | msst_consentstatus | |
| Lawful Basis | qdb_lawfulbasis | choice (Consent · LegitimateInterest · LegalObligation) | — | O | — | U | Y | — | PDPPL | Y | Y | CbD | CbD | — | msst_lawfulbasis | |
| Source | qdb_source | string | 100 | O | — | U | Y | — | Where consent was captured | Y | Y | CbD | CbD | — | msst_source | |
| Recorded By | qdb_recordedbyid | lookup systemuser | — | R | current user | S | N | — | | Y | Y | CbD | CbD | — | msst_recordedby | |
| Recorded On | qdb_recordedon | datetime | — | R | now | S | N | — | | Y | Y | CbD | CbD | — | msst_recordedon | |

## Addendum 2026-09-17 (superseded) — and the final decision

An earlier addendum re-pointed the columns above at `qdb_integrationlogs`. **That is also withdrawn.**
The authoritative QDB decision is to **reuse the existing `qdb_crmlogs`** (a custom *activity* entity,
1,295 rows, already used by QDB for integration logging) for Debt Collection technical/integration logs.
Field-by-field mapping, gaps and any proposed extensions: **`QdbCrmLogsReuseAssessment.md`**.
Neither `qdb_integrationlog` nor `qdb_integrationlogs` is a DCP target entity.

---

## Addendum 2026-09-17 — ruleset pointers and snapshot policy (F1/F2/F6 decisions, ADR-DCP-11)

### `qdb_platformconfiguration` — four added columns

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Eligibility Ruleset Code | qdb_eligibilityrulesetcode | string | 100 | O | — | C | Y | — | Rule Engine ruleset evaluated **after identity/facility resolution and before case creation** — Collection Eligibility / Grace (F2) | Y | Y | CbD | CbD | — | new | Key format `TBD — Requires QDB Confirmation`. Empty ⇒ every resolved record is `EligibleCreateCase` (explicit, logged at startup) |
| Strategy Ruleset Code | qdb_strategyrulesetcode | string | 100 | O | — | C | Y | — | Rule Engine ruleset for portfolio/strategy segmentation beyond what `qdb_collectionstrategy` rows express (F1) | Y | Y | CbD | CbD | — | new | `TBD` key format |
| Contact Hold Ruleset Code | qdb_contactholdrulesetcode | string | 100 | O | — | C | Y | — | Rule Engine ruleset deciding **Contact Hold / Special Handling** before any communication — manual or automated (F6) | Y | Y | CbD | CbD | — | new | Enforced server-side in the Communication Service and the plugin guard, never by UI hiding |
| Snapshot Policy | qdb_snapshotpolicy | choice `qdb_snapshot_policy` | — | R | AllReceived | C | Y | — | Which MIS records are persisted as `qdb_delinquencysnapshot` rows: AllReceived · EligibleOnly · ChangedOnly | Y | Y | CbD | CbD | — | new | Lets a deployment keep full history or only meaningful movement without a code change |

### Why these are pointers, not thresholds

The eligibility, strategy and contact-hold rulesets are **Rule Engine artefacts referenced by code**. The
configuration row names *which* ruleset to invoke; the ruleset owns every criterion, boundary and
threshold. Consequently:

- **No threshold lives in application source.** Not `arrears < 1 instalment`, not `DPD < N`, not
  `DPD > 2000`, not a bucket boundary, not an exposure band, not a segmentation cut-off.
- Collection code calls `IRuleEngine.evaluate(rulesetCode, context)` and switches on the returned
  outcome. It does not know what the rules say.
- **HL and BFD can differ materially** on the same build by pointing at different rulesets.
- Rules change without a deployment; the ruleset **code and version** are stamped onto each snapshot
  (`qdb_eligibilityrulesetcode` / `qdb_eligibilityrulesetversion`) so a past decision stays explainable.
- No new engine is introduced — this reuses the existing QDB Rule Engine through the `IRuleEngine`
  facade (MP §47, CP §41–42). Its on-prem reachability is covered in `EngineReuseAssessment.md`.

Whether a Contact Hold is triggered by QCB DEAD alone, and whether automated contact is suppressed above
any DPD threshold, remain **`TBD — Requires QDB Confirmation`** — business policy expressed in the
ruleset, never encoded.
