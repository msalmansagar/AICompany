# ADR-DCP-10 — Dual-platform (D365 CE 9.1 on-prem + Dataverse cloud) single-codebase architecture

**Status:** Proposed (Phase 0, awaiting review) · 2026-09-17 · **Deciders:** architect, ceo (pending)
**Drives:** Master Prompt §2–9, §57–58, §82–83; Correction Prompt §1–9. **Extends:** ADR-DCP-04.

## Context
QDB runs HL and BFD on Dynamics 365 CE 9.1 on-premises and will run Dataverse cloud. The requirement is
*build once, deploy to either*: the same application, business logic, React UI, `qdb_` schema and
configuration model on both. Cloud-only runtime testing to date is a development-access constraint, not a
design choice. The repository today carries an `msst_` schema, a hard-coded Web API `9.2`, Entra-only
provisioning tooling and a customer master — all of which would force different behaviour or code per target
or per organisation.

## Decision
1. **Equal targets.** On-prem 9.1 and cloud are equal supported deployment targets. Status vocabulary: *Cloud
   Runtime Tested · On-Prem Compatible by Design — Runtime Test Pending* (and vice versa); nothing is
   "Runtime Tested" on a platform it has not run on.
2. **One of everything:** source repository, React workspace, Collection business/domain logic, canonical
   `qdb_` schema (identical logical names on both platforms and both orgs), configuration model.
3. **Only these may differ:** environment/organisation URLs, authentication configuration and adapter
   (`IAuthAdapter`), Web API version (`v9.1` | `v9.2`, from runtime context / configuration — never a
   literal in business code), operation surface (Custom API on cloud ⇄ Process Action on-prem, identical
   plugin classes, same `Xrm.WebApi.online.execute` call), document provider, deployment packaging and
   tooling, platform runtime capability flags. No `if (cloud)` / `if (onPrem)` in domain, service or UI code.
4. **Customer:** ONE `qdb_customerid` **Customer** lookup (targets contact + account) on
   `qdb_collectioncase` and `qdb_identityexception.qdb_resolvedcustomerid`. Verified provisionable on both
   platforms — `CreateCustomerRelationshipsRequest` is present in the on-prem SDK `Microsoft.Xrm.Sdk.dll`
   9.0.2.51 and the `CreateCustomerRelationships` action is present on the cloud org (`incident.customerid`
   is the OOB reference). The two-lookup alternative is withdrawn.
5. **Facility:** `qdb_facilitynumber` (MIS Account Number) in the shared schema; the `qdb_facilityid` lookup
   targets the configured facility entity and is added by the **organisation-specific deployment step** if HL
   and BFD facility entities differ — a packaging difference, not a code difference. Names `TBD — Requires
   QDB Confirmation`.
6. **Plugins:** sandbox-safe patterns only (no IO/registry/SQL/local network/full trust); one signed
   `net471` assembly `Qdb.DebtCollection.Plugins`; any unavoidable difference is isolated behind an
   interface, shared logic kept, documented and tested for both, recorded in `docs/CloudMigrationReadiness.md`.
7. **No direct CRM SQL** anywhere (React, plugin, service).
8. **Engines** consumed through `IFormEngine / IProcessEngine / IRuleEngine / IAssignmentEngine /
   IReportingService`; an engine's platform defect is remediated in the engine's adapter, never by rebuilding
   the engine inside DCP.
9. **CI/CD** produces an on-prem package and a cloud package from the same build; the tooling gains an
   on-prem auth path (AD/AD FS or PRT + solution import).
10. **Portability quality gate** on every component: *"Deployed to the other platform tomorrow, would
    Collection business/application source change?"* — must be *no*; otherwise redesign unless it is an
    unavoidable adapter/deployment concern.

## Consequences
**Positive:** migration becomes configuration + packaging; one test suite of business behaviour; the existing
plugins, auth adapters and Dataverse client already satisfy the gate.
**Negative:** Phase 1 must fix `apiVersion` hard-coding, add an on-prem tooling auth path, add solution
packaging and CI for two targets; an on-prem 9.1 org is required to lift "Runtime Test Pending".
**Neutral:** Custom API availability on QDB's on-prem build is `TBD`; the design does not depend on it.

## Alternatives considered
| Option | Rejected because |
|---|---|
| Build on-prem now, port to cloud later | Guarantees a rewrite; contradicts MP §5 |
| Separate on-prem and cloud entities / React apps / logic | Forbidden by MP §5, CP §3 |
| Two customer lookups (`qdb_contactid` + `qdb_accountid`) | Unnecessary — Customer lookup verified on both platforms (CP §4) |
