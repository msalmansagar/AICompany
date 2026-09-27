# DCP — Security Model (Phase 0)

**Status:** proposal for review · 2026-09-17 · non-destructive. Implements Master Prompt §53–55, §80
and BRD FR-014, FR-112–118, NFR-005–010. Entity names from `EntityDictionary.md`.

---

## 1. Three layers (Master Prompt §53)

| Layer | Authority | Mechanism | Answers |
|---|---|---|---|
| **1 — CRM data security** | **Authoritative** | Security roles · business units · teams · ownership · sharing · entity privileges (Read/Create/Write/Delete/Append/Append To/Assign/Share) · field security | Who can access which record and column |
| **2 — Process security** | Authoritative for decisions | Process Engine (approve / reject / return / delegate / escalate) via `IProcessEngine`; **Contact Hold / Special Handling** evaluated server-side by `IRuleEngine.evaluateContactHold` inside the Communication Service (§2.3); plugins enforce invariants (status matrix, immutability, contact-hold guard) | Who may take which decision, and what can never happen |
| **3 — React UX security** | **Presentation only** | Role-aware navigation, hidden actions/buttons, masked rendering | What is shown |

Layer 3 never retrieves data the user is not entitled to and then hides it: every read is a CRM call
under the user's session, so unauthorised data never reaches the browser.

---

## 2. Role mapping — existing → target (Master Prompt §55)

Existing roles (`crm/scripts/lib/role-defs.mjs`) are preserved in shape and renamed. Privilege shape rules
carried over: **Delete is never granted** to any role (plugins additionally block case, snapshot and
completed-activity deletion, sysadmin included); organisation-owned tables accept **Global** depth only;
`READ_ALL` (global read of snapshot and identity exception) applies to every role.

| Existing role | Target role | Purpose |
|---|---|---|
| Msst DCP Collection Officer | **QDB DCP Collection Officer** | Works own cases and activities |
| Msst DCP Relationship Manager | **QDB DCP Relationship Manager** | Works BFD relationships; raises workout requests |
| Msst DCP Senior Manager | **QDB DCP Senior Manager** | Team supervision, approvals, reassignment |
| Msst DCP Head of Collections | **QDB DCP Head of Collections** | Portfolio oversight, second-level approval, strategy |
| Msst DCP Legal User | **QDB DCP Legal User** | Legal lifecycle (native CRM + workspace read) |
| Msst DCP Insurance Officer | **QDB DCP Insurance Officer** | Deceased & insurance lifecycle |
| Msst DCP Restructuring Officer | **QDB DCP Restructuring Officer** | Restructuring recommendations |
| Msst DCP Risk Credit User | **QDB DCP Risk Credit User** | Credit decisions on restructure/waiver |
| Msst DCP Finance User | **QDB DCP Finance User** | Payments / write-off read |
| Msst DCP Admin User | **QDB DCP Admin User** | Configuration entities |
| Msst DCP Audit Compliance | **QDB DCP Audit Compliance** | Read everything; audit and templates approval |
| Msst DCP Management | **QDB DCP Management** | Dashboards, portfolio MIS |

### 2.1 Entity privilege matrix (proposed; C/R/W depth — U = User, BU = Business Unit, P = Parent:Child, G = Global; blank = none)

| Entity | Officer | RM | Senior Mgr | Head | Legal | Insurance | Restruct. | Risk Credit | Finance | Admin | Audit | Mgmt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `qdb_collectioncase` | C:BU R:G W:BU Assign:BU | C:BU R:G W:BU | C:BU R:G W:P Assign:P | C:BU R:G W:G Assign:G | R:G W:BU | R:G W:BU | R:G W:BU | R:G | R:G | R:G | R:G | R:G |
| `qdb_collectionactivity` | C:BU R:G W:U | C:BU R:G W:U | C:BU R:G W:P | C:BU R:G W:G | C:BU R:G W:U | C:BU R:G W:U | C:BU R:G W:U | R:G | R:G | R:G | R:G | R:G |
| `qdb_delinquencysnapshot` (org) | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G |
| `qdb_identityexception` | R:G | R:G | C:G R:G W:G | C:G R:G W:G | | | | | | C:G R:G W:G | R:G | R:G |
| `qdb_collectionactivitytype` / `qdb_activityoutcome` (org) | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G | C:G R:G W:G | R:G | R:G |
| `qdb_collectionstrategy` / `qdb_strategyaction` (org) | R:G | R:G | R:G | C:G R:G W:G | | | | | | C:G R:G W:G | R:G | R:G |
| `qdb_assignmentconfiguration` (org) | R:G | R:G | R:G | C:G R:G W:G | | | | | | C:G R:G W:G | R:G | R:G |
| `qdb_communicationtemplate` (org) | R:G | R:G | R:G | R:G | | | | | | C:G R:G W:G | R:G W:G (approve) | R:G |
| `qdb_platformconfiguration` / `qdb_platformmapping` (org) | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G | R:G | C:G R:G W:G | R:G | R:G |
| `qdb_crmlogs` (existing, user-owned activity) | | | R:G | R:G | | | | | | R:G | R:G | R:G |
| `qdb_consent` (conditional, org) | R:G | R:G | R:G | R:G | | | | | | C:G R:G W:G | R:G | R:G |
| `contact` / `account` (existing) | **existing QDB privileges unchanged** — `TBD — Requires QDB Confirmation` that Collection roles have Read on the customer master and Write on the `qdb_` Collection flag columns only (via field security profile, §4) | | | | | | | | | | | |
| `fax` / `email` (existing) | C:BU R:G W:U (send needs the *Send Communication* privilege — implemented as a custom privilege on the Communication Service action) | same | same | same | R:G | R:G | R:G | | | | R:G | R:G |
| `queue` / queue items | Read + Append To on the three named queues | | + Assign | + Assign | | | | | | | | |

Custom privileges (miscellaneous privileges on the solution): `Send Communication`, `Send Free-Text
Message` (FR-069), `View Sensitive PII` (FR-014/114), `Approve Template` (FR-071/117), `Reassign Case`
(FR-039), `Override Stop Contact` (none in Phase 1). Where a custom miscellaneous privilege is not
possible on the target platform, a field-security-guarded flag on the role's team is the fallback —
`TBD — Requires QDB Confirmation` on on-prem 9.1 custom privilege support via solution import.

### 2.2 Business unit and team scope

| Scope | Design |
|---|---|
| Business units | one BU per Collections team (Early, High Risk, Deceased & Insurance, Legal, Restructuring); cases owned by the working team's BU; Head and Management at the parent BU with Parent:Child depth |
| Teams | owner teams mirror queues; `qdb_assignedteamid` and `ownerid` are kept consistent by assignment |
| Sharing | escalation shares the case (Read/Write) with the supervisor for the escalation window; the share is removed on return |
| HL vs BFD | each organisation has its own BU tree; the same role definitions ship in the solution and are applied identically (FR-112) — a role-drift check compares the two orgs' role privileges and reports differences |

### 2.3 Contact Hold / Special Handling — an authorisation-adjacent server-side control (F6)

The Contact Hold gate is not a privilege, but it behaves like one: it decides whether a *permitted* user may
perform a *permitted* action against a *particular* customer. It therefore belongs in Layer 2 and obeys the
Layer-1 discipline — **the decision is taken on the server, never in the browser.**

| Property | Design |
|---|---|
| Where it runs | `IRuleEngine.evaluateContactHold` inside the single Communication Service — in the browser bundle for manual sends (under the user's CRM session) **and** in the Integration Service for system sends, from the same shared module |
| What configures it | the ruleset named by `qdb_platformconfiguration.qdb_contactholdrulesetcode`; no new engine, no new entity, no threshold in source |
| Bypass surface | none that skips the gate: the composer, a background job, a direct HTTP call to the Integration Service, and a raw `Xrm.WebApi` create of a `fax`/`email` row all converge on the same evaluation before a row is written |
| Backstop | the `StatusTransitionValidator` plugin independently refuses case transitions into contact-bearing states for a held customer — sysadmin included — so even a path that avoided the service cannot advance the case |
| Presentation | React may disable a button and show the reason; that is Layer 3 and is **never** the control |
| Evidence | every non-Allow outcome records the rule identifier and correlation id (`qdb_crmlogs` on the system path, user-visible refusal on the manual path) |

Whether QCB DEAD alone triggers the hold is business policy — `TBD — Requires QDB Confirmation`
(`CommunicationArchitecture.md` §3.1). The security property above holds whatever policy QDB approves.

---

## 3. Field security and PII (FR-014, FR-114, NFR-006, NFR-008)

| Today | Target |
|---|---|
| Profile over `msst_dcpcustomer.msst_mobile / msst_email / msst_address` | Profile over the **existing** contact / account PII columns (`mobilephone`, `emailaddress1`, address fields) and any `qdb_` Collection flag columns that must not be edited by officers (`qdb_stopcontact`, `qdb_deceasedflag` are Write-restricted to Senior Manager+ and the Integration Service principal) |
| Mask in the API for callers without `View Sensitive PII` | CRM field security withholds the value; React masks **only** as presentation for what CRM already returned; MIS mobile numbers from the live path are masked by the Integration Service for callers without the privilege |
| Server-rendered PII possible (Next.js) | No server rendering exists — the workspace is client-side inside CRM; the Integration Service returns JSON only |

PDPPL (Qatar Law 13/2016): lawful basis and consent per channel are recorded (`qdb_consent` or the
existing capability — `TBD — Requires QDB Confirmation`); communication history and stored PII stay
in the tenant/data-centre boundary (NFR-009); retention of audit and communication history ≥ 7 years
(NFR-010) via native audit retention settings and the immutable snapshot/activity rules.

---

## 4. Direct web-resource URL (Master Prompt §54)

The workspace runs **inside the CRM session**: opening `main.aspx?pagetype=webresource&…` requires an
authenticated CRM user, and every data call is `Xrm.WebApi` under that user. There is no separate
session to hijack and no privilege the URL confers.

| Test | Expected |
|---|---|
| Authorised Collection user opens the direct URL | workspace loads; sees only entitled data |
| CRM user without any DCP role opens the URL | shell loads with no modules; every CRM call returns 403/empty; a "no Collection role" panel |
| Unauthenticated request to the URL | CRM sign-in; nothing served |
| Record-id manipulation (`?caseId=` of another BU's case) | CRM returns 403 (Read depth); UI shows "not found or not permitted" |
| URL manipulation to an admin module | module hidden by Layer 3 **and** configuration entities refuse Create/Write by Layer 1 |
| API manipulation (direct `Xrm.WebApi` / OData calls from the console) | identical outcome to the UI — Layer 1 decides |
| Raw `/WebResources/qdb_dcp_workspace.html` | loads without `Xrm`; "open from CRM" panel; no data |

---

## 5. Integration Service authorisation

| Path | Control |
|---|---|
| React → Integration Service | user bearer token obtained by the browser-side auth adapter (Entra/MSAL on cloud; AD FS or Windows-integrated on-prem — `TBD — Requires QDB Confirmation`); validated by `IAuthAdapter` (issuer from OIDC discovery, audience enforced — already implemented for AD FS and Entra); caller's CRM roles resolved from the token's identity and checked per operation |
| Integration Service → CRM | service principal via `IAuthAdapter` client credentials (Entra) or the on-prem equivalent; the principal holds a dedicated **QDB DCP Integration** role: Create/Write on case, snapshot, identity exception, integration log; Read on contact/account/facility; **never** Delete |
| Integration Service → MIS | MIS credentials held only in the service's secret store; never in CRM rows, never in the bundle |
| Cross-org 360 | the service holds one principal per org; the caller must have a Collection role in the *requesting* org; the other org's data is returned only for fields the mapping marks as cross-org readable |
| Rate limiting, correlation id, audit | every request carries a correlation id that is written to `qdb_crmlogs` and to any CRM record it changes |

---

## 5a. Send authorisation — why it is not an entity privilege (KI-35)

The canonical schema puts collection actions, promises to pay and the record of a communication on
one table, `qdb_collectionactivity`. That is the Master Prompt's decision (§23, §26) and it stands.
It does, however, remove something ADR-DCP-01 relied on: with separate tables, "may log a call" and
"may send a message" were two Create privileges. On one table they are the same privilege.

**Send authorisation therefore does not live in CRM entity privileges at all.** It is enforced by the
**Communication Service**, server-side, before anything leaves the platform:

| Control | Where |
|---|---|
| May this user send on this channel? | Communication Service checks the caller's privilege on the **native `fax` / `email` activity**, which is the record the send actually creates |
| May this customer be contacted at all? | Contact Hold ruleset, evaluated server-side (ADR-DCP-11) — never a client-side check, never an entity privilege |
| May this user send free text rather than a template? | role claim, as before |
| Did the user merely record that a call happened? | Create on `qdb_collectionactivity` — which is all that privilege grants |

A Create privilege on `qdb_collectionactivity` is therefore **permission to record collection work,
never permission to contact a customer**. Anyone reading the role matrix should take it that way, and
`qdb-role-defs.mjs` carries the same note next to the privilege table.

**Status:** architecturally resolved — the control point moved rather than disappeared. What still
needs QDB's confirmation is narrower: that privilege on the native `fax` / `email` activities is an
acceptable control point in their environment (KI-35).

---

## 5b. Reading the unified Communication History (KI-45)

The Collection Workspace shows SMS, WhatsApp, Email and Warning Letters as one stream. Those rows
live in `fax`, `email` and the approved QDB document store — tables DCP does not own — so the
aggregation is the point at which a careless implementation would leak.

**Aggregating does not confer access.** Three rules, all enforced server-side:

1. **The service reads as the caller.** It never uses the integration principal to "complete" a
   timeline. If the user cannot read that `fax` row in CRM, it is not in their history.
2. **Filtering is server-side.** The workspace does not receive rows it then hides; a row the user
   may not see never crosses the wire.
3. **Attribution is not authorisation.** That a communication is correlated to a Collection Case
   (§7.3) makes it *findable*, not *readable*. Both checks apply.

The consequence to expect, and to explain to users rather than engineer around: **two officers may
see different histories for the same customer.** That is CRM security working, not a defect.

Privileges involved:

| Action | Privilege |
|---|---|
| See an SMS / WhatsApp entry | Read on `fax`, plus read on the correlated case |
| See an Email entry | Read on `email`, plus read on the correlated case |
| See a Warning Letter entry | read rights on the approved QDB document source |
| Send on a channel | §5a — privilege on the native `fax` / `email` activity, plus Contact Hold |

Message previews follow the same rule as any other PII: shown only where the source permits and the
user is entitled (§3). Where a preview cannot be shown, the entry still appears — the officer needs
to know that contact happened.

---

## 6. Secrets policy

Never in `qdb_platformconfiguration`, `qdb_platformmapping`, feature flags, web resources, source
control or logs. Cloud: Azure Key Vault / container secrets; on-prem: the host's secret store or
Windows DPAPI-protected configuration — `TBD — Requires QDB Confirmation` for the approved on-prem
mechanism. The existing `.env.example` files list names only.

---

## 7. Audit (Master Prompt §52)

| Need | Mechanism |
|---|---|
| Business audit — who changed which field, when | **Native Dynamics auditing** enabled on every `qdb_` entity and on the contact/account Collection flag columns; available on both platforms; immutable; retention per NFR-010 |
| Process history — approvals, returns, escalations | Process Engine history |
| Collection history — what was done | `qdb_collectionactivity` + fax/email (immutable once completed) |
| Technical / integration — batches, retries, failures, correlation | existing `qdb_crmlogs` (append-only by convention + plugin-guarded) |
| Evidence pack (FR-111) | export of native audit + activities + communications + snapshots for a case — Report Engine |

`msst_dcpauditlog` and its 14 `AuditLogWriter` steps are not carried forward as a business audit.

---

## 8. Security test matrix (Master Prompt §80)

Roles under test: Collection Officer · Senior Manager · Head of Collections · Legal User · Insurance
Officer · Restructuring Officer · Admin User · Audit Compliance · **Unauthorised CRM user** · Integration
principal.

| Area | Cases |
|---|---|
| Entity privileges | for each role × `qdb_` entity: Read / Create / Write / Delete (always denied) / Assign / Append / Append To — expected per §2.1 |
| Customer access | Officer reads contact/account; cannot write PII; cannot set `qdb_stopcontact`; Senior Manager can |
| Facility access | read via mapping; no writes from DCP |
| Case access | own BU vs other BU; parent-BU read for Head; assign only with `Reassign Case` |
| Activity access | own vs others' activities; completed activity immutable for everyone incl. sysadmin |
| Communication | send with/without `Send Communication`; free text with/without `Send Free-Text Message`; consent withdrawn |
| **Contact Hold / Special Handling** | a held customer is refused identically through **four** paths: (1) manual send from the Communication Center; (2) automated send from a strategy action, PTP reminder or SLA job; (3) a **direct call** to the Integration Service or a raw `Xrm.WebApi` create of a `fax`/`email` row that bypasses the UI entirely; (4) **record-id manipulation** — substituting a held customer's case id or customer id into an otherwise valid request. All four return the same refusal code and the same rule identifier, and none depends on React having hidden or disabled anything. Also: hold applied mid-flight (after the composer opened) still refuses on Send; the `StatusTransitionValidator` plugin refuses the corresponding case transition for sysadmin too |
| Approval | approve/reject/return only by the configured Process Engine role; Officer cannot self-approve |
| Direct web-resource URL | §4 table |
| API manipulation | console `Xrm.WebApi` calls and OData outside the UI produce the same outcome as the UI |
| Record-id manipulation | foreign case id, foreign activity id, foreign customer id |
| Field security | masked columns absent from responses for roles without `View Sensitive PII`; present for roles with it |
| Team / BU access | move a case between teams; verify visibility follows ownership; share/unshare on escalation |
| Integration Service | expired/invalid token → 401; valid token without Collection role → 403; MIS credentials never appear in responses or logs; principal cannot delete |
| Both platforms | the matrix is executed per target and recorded separately (Cloud Runtime Tested · On-Prem Compatible by Design — Runtime Test Pending) |

---

## 9. Open items — `TBD — Requires QDB Confirmation`

Existing contact/account privileges held by Collection staff · custom miscellaneous privileges via
solution import on on-prem 9.1 · approved on-prem secret store · browser-to-service auth on-prem ·
existing consent capability · native-audit retention configuration in each org · **whether QCB DEAD alone
establishes a Contact Hold** (§2.3 — policy, not architecture) · which record supplies the *legal state*
fact to the hold ruleset.
