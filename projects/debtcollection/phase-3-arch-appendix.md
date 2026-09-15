# DCP-001 — Phase 3 Architecture Appendix

**Companion to** `phase-3-arch.md`. Entity field lists, statuscode matrices, security-role matrix, the router
endpoint catalogue, and the FR → component map. Phase 1 (Housing Loan) only. Publisher prefix `qdb_`; every row
also carries `created_by`, `created_on`, `modified_by`, `modified_on`, GUID id (NFR-015; entities carry a
product segment in the entity name, columns do not — reference note `publisher_prefix_convention`).

---

## A. Entity Field Lists (P1)

Read polymorphic lookups as `_<attr>_value` + the `lookuplogicalname` / FormattedValue annotation; `$expand`
names the target type (GOT-009; ADR-DCP-01). Option-set codes are 100000000-based — never assume 0-based (GOT-011).

### A.1 `msst_dcpcustomer`  (FR-007, 014, 095, 133)
| Field | Type | Notes |
|---|---|---|
| `msst_qid` | text, **alternate key** | Qatar ID — the cross-org identity key. Missing ⇒ `msst_dcpidentityexception` |
| `msst_crnumber` | text | Commercial registration (secondary correlation) |
| `msst_fullname` / `msst_nationality` / `msst_employer` | text | Profile |
| `msst_mobile` / `msst_email` / `msst_address` | text | **Masked** for roles without `View Sensitive PII` |
| `msst_salarytransfer` | bool | Salary-transfer status |
| `msst_vulnerabilityflag` | bool | Conduct flag |
| `msst_stopcontact` | bool | R-04 trigger; suppresses all automated outbound in the router |
| `msst_deceasedflag` / `msst_dateofdeath` / `msst_deathsource` | bool/date/text | FR-095 |
| `msst_preferredlanguage` | optionset (AR/EN) | Template language; default AR |

### A.2 `msst_dcploanfacility`  (FR-002, 020, 101)
| Field | Type | Notes |
|---|---|---|
| `msst_customerid` | lookup → customer | Owner |
| `msst_producttype` | optionset | Housing Loan, Corporate, SME, Restructured, Legal, Deceased |
| `msst_outstandingbalance` / `msst_arrears` / `msst_instalment` | money | Current (upserted from MIS); live figure read from MIS API on screen |
| `msst_dpd` | int | From MIS; never computed here |
| `msst_dpdbucket` | optionset (10-value) | 1-30 … >2000, verbatim MIS |
| `msst_accountstatus` | optionset | **NPL / Write-off axis — separate from bucket** (FR-018) |
| `msst_maturitydate` / `msst_collateral` / `msst_guarantor` / `msst_restructureflag` | mixed | Facility detail |

### A.3 `msst_dcpdelinquencysnapshot`  (append-only — FR-016, 017, 018)
| Field | Type | Notes |
|---|---|---|
| `msst_facilityid` | lookup → facility | Subject |
| `msst_batchreference` | text | MIS batch id — provenance |
| `msst_asof` | datetime | Moment-of-decision stamp |
| `msst_dpd` / `msst_arrears` / `msst_outstandingbalance` | int/money | Values at `asOf` |
| `msst_dpdbucket` | optionset (10-value) | Classification from MIS |
| — | — | **No Update / Delete** (ImmutabilityGuard, incl. sysadmin) |

### A.4 `msst_dcpcollectioncase`  (FR-019, 020, 022, 025, 028)
| Field | Type | Notes |
|---|---|---|
| `msst_customerid` / `msst_facilityid` | lookup | Anchors |
| `msst_producttype` | optionset | Officer-selected (D-3) |
| `msst_casereason` | text | Mandatory |
| `statuscode` | optionset (17-value) | FR-022; transitions plugin-validated |
| `msst_org` | optionset (HL/BFD) | Routing attribute of the record |
| — | — | Delete removed from every role + blocked by plugin |

### A.5 `msst_dcpcollectionaction` (custom activity — FR-045, 046, 047, 052, 054)
| Field | Type | Notes |
|---|---|---|
| `regardingobjectid` | **polymorphic** lookup | Contact/Account, facility, or case — never required to be a case |
| `msst_actiontype` | optionset (config) | Call, Meeting, Supervisor Review, Field Visit, Manual Note |
| `msst_outcomecode` | optionset (config) | From action-outcome config, not hard-coded (FR-052) |
| `msst_notes` | text | Mandatory |
| `scheduledend` | datetime | **Mandatory next-action date**; past + Open = overdue (FR-048) |
| `statecode` | Open/Completed/Canceled | Completed ⇒ immutable |
| `subject` | text | Composed by plugin |

### A.6 `msst_dcpcommunication` (custom activity — FR-065, 066, 067, 072, 075)
| Field | Type | Notes |
|---|---|---|
| `regardingobjectid` | polymorphic lookup | Customer / facility / case |
| `msst_channel` | optionset | SMS, Email, Official Letter, Call |
| `msst_direction` | optionset | Inbound / Outbound |
| `msst_templateref` | lookup/text | Approved template used (FR-069) |
| `msst_deliverystatus` | optionset | Sent, Delivered, Failed, Opened (P2); Blocked |
| `msst_blockreason` | text | `stop_contact` / `consent_not_established` / `consent_withdrawn` — evidence |
| `statecode` | Open/Completed/Canceled | Completed ⇒ immutable |

### A.7 `msst_dcpptprecord`  (FR-055, 059, 061)
| Field | Type | Notes |
|---|---|---|
| `msst_customerid` / `msst_caseid` | lookup | Case recommended, not required |
| `msst_ptpdate` / `msst_promisedamount` / `msst_partialflag` | date/money/bool | Commitment |
| `msst_reminderdate` | date | Drives FR-056 reminder |
| `msst_status` | optionset | Open, Kept, Partially Kept, Broken, Rescheduled, Cancelled |
| `msst_reschedulecount` | int | Limit + approval (P2, FR-060) |

### A.8 `msst_dcpconsent`  (FR-133, 134, 135) · A.9 `msst_dcpstrategyconfig` (FR-031/032/033) · A.10 `msst_dcpauditlog` (FR-108/109) · A.11 `msst_dcpidentityexception` (FR-007)
| Entity | Key fields |
|---|---|
| `msst_dcpconsent` | `msst_customerid`, `msst_channel`, `msst_status` (given/withdrawn/not-recorded), `msst_lawfulbasis`, `msst_source`, `msst_recordedby`, `msst_recordedon` |
| `msst_dcpstrategyconfig` | `msst_dpdbucket` (10-value), `msst_segment` (Retail/SME), `msst_actiontype` (SMS/Email/Letter/Queue/**NoContact**), `msst_queueref`, `msst_slahours`, `msst_active` |
| `msst_dcpauditlog` | `msst_actiontype`, `msst_entityname`, `msst_recordid`, `msst_oldvalue`, `msst_newvalue`, `msst_actor`, `msst_actorrole`, `msst_timestamp`, `msst_sourcepath` — append-only, blocked to sysadmin |
| `msst_dcpidentityexception` | `msst_qid`, `msst_reason` (missing/duplicate/one-org-only), `msst_status`, `msst_reviewedby` |

---

## B. Statuscode Transition Matrices

### B.1 `msst_dcpcollectioncase` (FR-022/023 — enforced by `StatusTransitionValidator`)

The 17 statuscodes and their permitted next states. Any transition not listed is rejected with an explanatory
`invalid_transition` error. Terminal states: Closed, Written Off (both reopenable to Reopened, FR-029 P2).

| From | Permitted → |
|---|---|
| New | Assigned |
| Assigned | In Progress, Escalated to Supervisor |
| In Progress | Pending Customer Response, PTP Active, Restructure Review, Pending Legal Review, Deceased/Insurance Review, Escalated to Supervisor |
| Pending Customer Response | In Progress, PTP Active |
| PTP Active | PTP Broken, In Progress (kept), Settled |
| PTP Broken | In Progress, Escalated to Supervisor, Pending Legal Review |
| Restructure Review | Restructured, In Progress (rejected) |
| Restructured | In Progress (re-default), Settled |
| Escalated to Supervisor | In Progress, Pending Legal Review |
| Pending Legal Review | Referred to Legal, In Progress (returned) |
| Referred to Legal | Under Legal Action, In Progress (returned by Legal, FR-092) |
| Under Legal Action | Settled, Written Off |
| Deceased/Insurance Review | Settled, Written Off |
| Settled | Closed |
| Closed | Reopened |
| Written Off | Reopened |
| Reopened | In Progress |

**Guard rule:** any transition into a contact-bearing state is refused if `msst_stopcontact = true` except a move
to Deceased/Insurance Review (FR-043/097). Restructure/Legal/Insurance target states exist for lifecycle
continuity but their **entities are P2/P3** — in Phase 1 the case reaches the state and the downstream work
happens in native CRM (ADR-DCP-03).

### B.2 `msst_dcpptprecord` (FR-059; evaluation per ADR-DCP-06)
| From | Permitted → |
|---|---|
| Open | Kept, Partially Kept, Broken, Rescheduled, Cancelled |
| Rescheduled | Kept, Partially Kept, Broken, Rescheduled (count++), Cancelled |
| Partially Kept | Broken, Kept, Cancelled |
| Broken | Kept (manual correction — the false-Broken reversal), Cancelled |
| Kept / Cancelled | (terminal) |

### B.3 Custom activities
`Open → Completed` (then immutable, FR-047/075) or `Open → Canceled`. No transition out of Completed.

---

## C. Security Role Matrix (single source — FR-112/113)

Twelve roles, authored once, deployed identically to both orgs. C = Create, R = Read, U = Update, — = none.
No role holds **Delete** on case / snapshot / audit / completed-activity (backed by `ImmutabilityGuard`).
Privileges shown in the last three columns are native CRM privileges, not code checks.

| Role | Case | Action | Comm | PTP | Consent | Config | Audit | View PII | Send Free-Text | Approve |
|---|---|---|---|---|---|---|---|:--:|:--:|:--:|
| Collection Officer | CRU | CRU | CR (gated) | CRU | R | R | R | — | — | — |
| Relationship Manager | RU | CR | R | R | R | R | R | — | — | — |
| Senior Manager | RU | CRU | R | RU | R | R | R | yes | — | yes |
| Head of Collections | RU | R | R | R | R | R | R | yes | — | yes |
| Legal User (native CRM) | RU | CR | R | R | — | — | R | yes | — | — |
| Insurance Officer (native CRM) | RU | CR | R | R | — | — | R | yes | — | — |
| Restructuring Officer | RU | CR | R | R | — | R | R | — | — | — |
| Risk / Credit User | R | R | R | R | — | R | R | yes | — | yes |
| Finance User | R | R | R | R | — | — | R | — | — | — |
| Admin User | R | R | R | R | R | CRU | R | — | — | — |
| Audit / Compliance | R | R | R | R | R | R | R | yes | — | — |
| Management | R | R | R | R | — | R | R | — | — | — |

`Send Free-Text` is deliberately held by no standard role in Phase 1 (all sends use approved templates, FR-069);
it is provisioned as a grantable privilege for a future exception process. Per-channel send (SMS vs letter) is a
finer privilege on `msst_dcpcommunication` create, the RBAC boundary ADR-DCP-01 splits the two activities to express.

---

## D. Router Endpoint Catalogue

All under `/api`; all require a valid token (401 otherwise, NFR-005); all validate input with zod; all return
`Result<T, DomainError>`; all stamp a `correlationId`. `*` = passes the stop-contact + consent gate (§5.4).

| Method | Path | Capability | Returns | P1 FR |
|---|---|---|---|---|
| GET | `/health` | liveness | `{status,version,timestamp}` | Art. XIV |
| GET | `/integrations/health` | integration health panel | per-endpoint last-run/latency/failures | FR-126 |
| GET | `/customers/:qid` | customer profile (masked) | customer DTO | FR-001, 014 |
| GET | `/customers/:qid/facilities` | facilities + live "as of" balance | facility[] | FR-002 |
| GET | `/customers/:qid/timeline` | actions + comms chronologically | activity[] | FR-004, 012 |
| GET | `/identity-exceptions` | unresolved-identity queue | exception[] | FR-007 |
| POST | `/cases` | manual case create | case | FR-019, 020 |
| GET | `/cases` | case list + queues | case[] | FR-037, 040 |
| PATCH | `/cases/:id/status` | transition (plugin-validated) | case | FR-022, 023 |
| PATCH | `/cases/:id/queue` | reassign (reason) | case | FR-038, 043 |
| POST | `/actions` | log action | action | FR-045, 046, 052 |
| GET | `/actions/overdue` | overdue-actions view | action[] | FR-048 |
| POST | `/ptp` | create PTP | ptp | FR-055 |
| GET | `/ptp/:id` | PTP detail | ptp | FR-059 |
| POST | `/ptp/:id/mark-kept` | manual Kept correction | ptp | FR-061 (ADR-06) |
| POST | `/communications` * | send (gated) | comm | FR-065, 066, 067, 068, 069, 073 |
| GET | `/communications` | comms log | comm[] | FR-012 |
| GET | `/consent/:qid` | consent by channel | consent[] | FR-133 |
| PUT | `/consent/:qid/:channel` | record / withdraw | consent | FR-134, 135 |
| GET | `/strategy` | strategy rules (read) | rule[] | FR-031, 032, 033 |
| GET | `/queues` | queues + SLA | queue[] | FR-037, 040 |
| GET | `/mis/balance/:facility` | live "as of" balance | `{value,asOf}` or `mis_unavailable` | FR-002, 027 |
| POST | `/cases/:id/evidence-pack` | puppeteer PDF export | pdf | FR-111 |
| GET | `/dashboards/operational` | operational metrics | dto | FR-127 |
| GET | `/dashboards/ptp` | PTP metrics | dto | FR-129 |
| GET | `/team/workload` | supervisor view | officer[] | FR-041 |

The internal ingest path (`pg-boss` → MIS → upsert → snapshot) is a worker job, not an HTTP route; its status is
exposed via `/integrations/health` and the FR-027 workspace alert.

---

## E. FR → Component Map (all 73 P1 FRs)

Every P1 FR from the priority re-cut maps to at least one architecture component. §n = section of
`phase-3-arch.md`; App = this appendix; D = endpoint catalogue (§D).

| FR | Component | Ref |
|---|---|---|
| FR-001 | Customer profile — `/customers/:qid`, web page 02 | §5.1, §9, D |
| FR-002 | Facilities + live "as of" balance | §4.1, §6, App A.2, D |
| FR-004 | Native Timeline (activities) | §4.2, §9 |
| FR-007 | QID identity key + `msst_dcpidentityexception` | §5.3, App A.1/A.11 |
| FR-012 | Communication log | §8, D |
| FR-014 | PII masking at router | §5.1, §10, App C |
| FR-016 | MIS ingest → upsert + snapshot | §6 |
| FR-017 | Snapshot immutable fields | §4.4, §6, App A.3 |
| FR-018 | 10-bucket taxonomy + separate status axis | §6, App A.2 |
| FR-019 | Manual case create | §4.1, App A.4, D |
| FR-020 | Product type + case reason | §4.1, App A.4 |
| FR-022 | Case statuscodes (17) | §4.3, App B.1 |
| FR-023 | `StatusTransitionValidator` plugin | §4.4, App B.1 |
| FR-025 | No case deletion | §4.4, §4.5, App A.4 |
| FR-027 | Ingest-failure workspace alert | §6, §9 |
| FR-028 | Audit columns on case | §4.1, App A (NFR-015) |
| FR-031 | Strategy config read at runtime | §4.6, §5.1 |
| FR-032 | Strategy table shape | §4.6, App A.9 |
| FR-033 | "No automated contact" rule | §4.6, §8, App A.9 |
| FR-034 | No exposure segmentation (C-05) | §4.6 |
| FR-035 | Rules editable without deploy | §4.6 |
| FR-036 | Rule-change audit | §4.4 |
| FR-037 | Named queues (3 in Phase 1) | §9, D |
| FR-038 | Strategy → queue assignment | §5.1, §8, D |
| FR-040 | Queue SLA (configurable) | §9, App A.9, D |
| FR-041 | Supervisor workload view | §9, D |
| FR-043 | Stop-contact queue rule | §5.4, App B.1, D |
| FR-045 | Log `msst_dcpcollectionaction` | §4.2, App A.5, D |
| FR-046 | Action fields + mandatory `scheduledend` | App A.5 |
| FR-047 | Action immutable after Completed | §4.4 |
| FR-048 | Overdue-actions view | §4.2, D |
| FR-052 | Outcome codes from config | §4.6, App A.5 |
| FR-053 | Non-overridable actor/timestamp | §4.1 (NFR-015) |
| FR-055 | Create `msst_dcpptprecord` | §7, App A.7, D |
| FR-056 | PTP reminder (gated) | §8 |
| FR-057 | Broken evaluation vs latest snapshot | §7 |
| FR-058 | Broken-PTP escalation | §7 |
| FR-059 | PTP statuses | §7, App A.7/B.2 |
| FR-061 | PTP-change audit + manual Kept | §4.4, §7 |
| FR-064 | Stop-contact on reminder | §5.4, §7 |
| FR-065 | Channels: SMS/Email/Letter/Call | §8, App A.6 |
| FR-066 | One authoritative comm record | §8 |
| FR-067 | Router gate + blocked-send evidence | §5.4, §8 |
| FR-068 | Stop-contact before any adapter | §5.4 |
| FR-069 | Approved templates only | §8 |
| FR-070 | AR/EN templates | §8, §10 |
| FR-073 | Call logging (no telephony) | §8, App A.6 |
| FR-075 | Comm immutable after Completed | §4.4 |
| FR-076 | Template-change audit | §4.4 |
| FR-091 | Legal user in native CRM (no portal UI) | §9 (ADR-DCP-03) |
| FR-095 | Deceased flag + stopContact | App A.1, §9 |
| FR-096 | stopContact suppresses outbound | §5.4 |
| FR-097 | Deceased → Deceased & Insurance queue | §4.4, App B.1 |
| FR-102 | Insurance officer in native CRM | §9 (ADR-DCP-03) |
| FR-108 | `AuditLogWriter` plugin, append-only | §4.4 |
| FR-109 | Audit fields + request source path | §4.4, §5.5, App A.10 |
| FR-110 | Audit immutable incl. sysadmin | §4.4 |
| FR-111 | Evidence-pack export (puppeteer) | §5.1, §9, D |
| FR-112 | Single role matrix + drift report | §4.5, App C |
| FR-113 | Twelve standard roles | §4.5, App C |
| FR-114 | Masking server-side (router) | §5.1, §4.5 |
| FR-118 | Config-change audit | §4.4 |
| FR-119 | Router org routing (HL/BFD) | §5.3 |
| FR-120 | Stop-contact on every send | §5.4 |
| FR-121 | MIS Middleware API integration | §6 |
| FR-122 | SMS/Email gateway + delivery webhook | §8 |
| FR-126 | Integration health panel | §6, §10, D |
| FR-127 | Operational Dashboard | §9, D |
| FR-129 | PTP Dashboard | §9, D |

### E.1 P1 NFR → component

| NFR | Where satisfied |
|---|---|
| NFR-001 render < 2s p95 | client-fetch + small-data; §9 |
| NFR-002 ingest < 30 min | §6 (pg-boss, ~4,900 rows) |
| NFR-003 99.5% availability | §2 hosting; ops |
| NFR-005 MSAL/OIDC auth, 401 | §5.2 (ADR-DCP-04) |
| NFR-006 no PII in SSR | §5.1, §9 |
| NFR-007 RBAC at router + plugin | §4.5, §5.1 |
| NFR-008 PDPPL go-live gate | §2 |
| NFR-009 data residency | §2 |
| NFR-010 audit append-only, 7yr | §4.4, §10 |
| NFR-011 no over-engineering | §6, §10 |
| NFR-012 BFD by config only | §5.3, §13 step 10 |
| NFR-013 AR/EN + RTL | §8, §10 |
| NFR-014 ingest failure surfaced | §6 |
| NFR-015 audit columns + GUIDs | §4.1, App A |
| NFR-016 ≥80% coverage + endpoint tests | §12 |
| NFR-017 single solution, individual RootComponents | §4, §3 (GOT-001..004) |
| NFR-018 no hard-coded params | §4.6, §10 |
| NFR-019 health panel go-live req | §6, §10 |
| NFR-020 platform portability | §2, §4.6, §5.2 (ADR-DCP-04) |

---

*End of appendix.*
