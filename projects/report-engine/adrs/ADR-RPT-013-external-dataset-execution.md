# ADR-RPT-013 — External dataset execution: registered endpoints, a shared time budget, and security declared per dataset

| | |
|---|---|
| **Status** | **Proposed** — this ADR is Phase B pre-condition 3. It cannot move to Accepted until §Open questions are closed against a real on-premise org and the auditor has signed off. |
| **Date** | 2026-08-25 |
| **Decided by** | Architect (CEO-approved scope, ADD-002 Phase B) |
| **Implements** | ADD-002 MDS-FR-011 … 020 |
| **Depends on** | ADR-RPT-012 (result contract), ADR-RPT-011 (self-contained assembly) |

## Context

ADD-002 Phase B is **approved in scope with its build held**. The CEO reopened the V2/V3
external-source gate that `c8-inert-options.md` recorded, so external REST datasets are now in scope
for RPT-ENG-001 rather than deferred.

The engine executes inside a sandboxed Dataverse plugin (ADR-RPT-011). Calling outside Dataverse from
there raises four problems that have nothing to do with reporting: reachability, credential custody,
time, and security. This ADR settles the three that are ours. The fourth — whether the on-premise
sandbox permits the call at all — is not answerable from here and is recorded as open.

## Decision

### 1. Endpoints are registered configuration, never a URL in a report

A report references an endpoint **by id**. The endpoint record holds base URL, auth mode, timeout and
owner (MDS-FR-012).

A free-text URL on a report definition would make every report author able to direct CRM data at an
arbitrary host, with the report record as the only audit trail. Registration puts that decision with
an administrator and makes the set of reachable hosts enumerable — which is what MDS-R-03 (PDPPL)
will be assessed against.

### 2. Credentials never touch a report record

Secrets live in plugin secure configuration (on-premise) or Key Vault via the environment's
configured route (cloud) — never in `qdb_reportdatasource`, never in the endpoint record's queryable
columns (MDS-FR-013).

Report definitions are exportable, and a solution export carrying a live credential is the failure
mode being designed out. This programme already carries one such finding elsewhere (a hardcoded
secret), and it must not be repeated in a table authors can read.

### 3. 🔴 External rows carry no CRM security, so security is declared per dataset

This is the decision that matters most, and it is the one an implementer is most likely to get wrong
by omission.

FetchXML results are filtered by the platform against the calling user. **An external HTTP response
is not.** Every row comes back regardless of who is running the report, so a standalone external
dataset can surface data the viewer could never see in CRM.

⇒ Each external dataset **declares who may see it**, and that declaration is enforced **before the
rows enter the result** (MDS-FR-020). A dataset with no declaration does not default to visible — it
fails to save.

⚠️ The report-level `canexecute` guard is not sufficient and must not be mistaken for coverage: it
answers *may this user run this report*, not *may this user see these rows*. The access documentation
was corrected once already for implying broader enforcement than exists; the same mistake at the row
level would be a data-exposure defect rather than a documentation one.

### 4. One time budget for the whole report, spent fail-fast

Each call carries a timeout; the report carries a **total external budget** (MDS-FR-015). When the
budget is exhausted, remaining external datasets fail as named blocks (ADR-RPT-012 §5) — the report
still returns.

**No retry.** Per `dependencies.md` Area 13: retry inside a two-minute ceiling spends a budget the
whole report shares, converting one slow endpoint into a terminated report instead of one named
failure block. Fail fast, name it, keep the other datasets.

🔴 The budget's value must come from the C-6 re-characterisation, not from a guess. That is
pre-condition 1 and it gates this ADR's move to Accepted.

### 5. Joining external data happens in memory, with the same semantics as FetchXML

FetchXML cannot reach outside Dataverse, so a `joined` external dataset joins in memory
(MDS-FR-017, Area 12) — and must expose the **same** inner/outer cardinality choice the link-entity
path already honours (ADR-RPT-012 §3).

### 6. Every call is audited

Endpoint, duration, row count, outcome, per dataset (MDS-FR-018), written to `qdb_reportauditlog`.
The audit rows are what make a slow or failing third party diagnosable without a trace, and what a
residency review will read.

### 7. Responses are not cached across users by default

Caching is opt-in per endpoint and only where the endpoint is declared user-independent
(MDS-FR-019). Given §3, a cache shared across users is a cross-user data-exposure risk unless the
endpoint genuinely returns the same rows for everyone.

## Open questions — these block Accepted

| ID | Question | Why it cannot be answered here |
|---|---|---|
| **OQ-A** | 🔴 Does the on-premise sandbox's outbound allowlist permit the call at all? | Needs a real on-premise org. **None is available to this project** — `adfs`/`windows` auth have never been run, and the two Custom Actions are not yet registered there. If the answer is no, **Phase B is cloud-only** (MDS-R-05) and this ADR must say so |
| **OQ-B** | What is the total external budget, in ms? | Derived from the C-6 re-characterisation (pre-condition 1) |
| **OQ-C** | Does PDPPL permit CRM data leaving the tenant, and for which endpoints? | Auditor (MDS-R-03). A hard production gate on this programme |
| **OQ-D** | Is the §3 per-dataset security model sufficient, or is row-level filtering required? | Auditor (MDS-R-01) |

## Consequences

- **Phase B may end up cloud-only.** OQ-A decides it. Building as if both platforms are certain would
  produce an on-premise feature that activates and silently returns nothing — the same failure shape
  as an unmapped activity argument, which this project has already been bitten by.
- **Sandbox isolation stops being theoretical.** Report execution acquires a dependency on a third
  party's availability, inside a ceiling that terminates the whole report.
- **No new assembly dependency**, per ADR-RPT-011 and Area 13: built-in `HttpClient`, existing
  `SimpleJson`.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Call external APIs from the browser instead of the plugin | Moves the credential into the client and the CORS problem onto the endpoint owner; exports and scheduled runs have no browser |
| Stage external data into Dataverse on a schedule, report over the staged copy | Genuinely safer and defensible — but it is a different product (an integration/ETL capability), not what ADD-002 approved. **Worth reopening if OQ-A returns no**, since it would restore on-premise parity |
| Retry failed calls | See §4 — spends a shared budget and terminates reports |
| One timeout per call with no report-level budget | N slow datasets each inside their own timeout still add up past the two-minute ceiling |
