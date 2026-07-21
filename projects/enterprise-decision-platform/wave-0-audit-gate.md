# Wave-0 Audit Gate — EDP-BRE-001

**Engagement:** Enterprise Decision Platform — Business Rules Engine
**Prod candidate:** `main` @ `0fc326c2`
**Audit date:** 2026-07-21
**Auditor:** Maqsad AI — Auditor (Phase 6 / C-005 gate)
**Scope:** Re-verify F-01…F-05, append-only bypass analysis, secrets scan, pin governance assessment, Wave-0 condition status, and all 7 code audit passes.

---

## Verdict: APPROVE-WITH-CONDITIONS

Production deployment is NOT cleared until the four blockers listed below are resolved. All other findings are conditions or informational.

**Blockers (go-live is gated on ALL four):**
- **B-1 (W0-1):** Strong-name private key (`edp.snk`) is in git history and must be rotated with a vaulted keypair before any assembly is deployed to production.
- **B-2 (W0-4):** Entity-level auditing on `qdb_edp_ruleversion` + `environmentvariablevalue` has not been enabled via the admin portal. Pin changes and prod-designation changes are unaudited.
- **B-3 (W0-2):** SoD enforcement is correct in code but has not been live-tested with scoped users in the production environment.
- **B-4 (W0-5):** PDPPL / data-residency assessment is unaddressed. The live org (`org5869857f`) is on `crm4.dynamics.com` (Europe). Cross-border transfer controls for Pakistani personal data must be assessed and documented.

---

## 1. Re-Verification of Original Audit Blockers (F-01 to F-05)

### F-01 — Draft-rule execution lifecycle gate

**Status: CLOSED**
Confidence: 99%

Evidence: `RuleDecisionService.cs:48` — `requirePublished` check throws `InvalidOperationException` when the version's `qdb_edp_lifecyclestate` is not `100000003` (Published). `EvaluateDecisionPlugin.cs:57` calls `ResolvePcrm(ruleVersionId)` with the default `requirePublished: true`. `RuleServicePlugin.cs:520-521` correctly gates execution paths with `requirePublished: true` and allows Validate/Test with `requirePublished: false`. Three test cases in `LifecycleGateTests.cs` cover Published resolves, Draft blocked, and Draft allowed with the explicit override. No code path executes a non-Published version outside of explicit test/validate contexts.

### F-02 — SoD fail-safe (catch enforces, not fail-open)

**Status: CLOSED**
Confidence: 99%

Evidence: `GovernanceService.cs:172-176` — the catch block in `IsProduction()` explicitly returns `true`, meaning "if we cannot read the flag, assume production and ENFORCE." The comment at line 173 states "Fail SAFE (F-02)." `ProductionPinJustificationPlugin.cs:82-83` has the identical pattern. Both plugins treat an unreadable production flag as a prod environment, enforcing the strongest control in all failure modes.

### F-03 — Custom API execute-privileges

**Status: CLOSED IN CODE; PENDING LIVE VERIFICATION**
Confidence: 92%

Evidence: `bre-api-privileges.js` sets `executeprivilegename` on every Custom API in the `qdb_edp_*` namespace via a PATCH loop. Three privilege tiers are correctly mapped: `prvReadqdb_edp_rule` (any EDP role, for EvaluateDecision and read Functions), `prvWriteqdb_edp_rule` (authors only, for ValidateRule and TestRule), `prvReadqdb_edp_ruleapproval` (governance actors, for GovernanceAction). The script is idempotent and covers all APIs returned by the `$filter=startswith(uniquename,'qdb_edp_')` query. Risk: not live-verified post-deployment per W0-2.

### F-04 — Append-only guards on audit tables

**Status: CLOSED IN CODE; PENDING LIVE REGISTRATION VERIFICATION**
Confidence: 95%

Evidence: `AppendOnlyGuardPlugin.cs:19-25` unconditionally throws `InvalidPluginExecutionException` on any Update or Delete message. `bre-register-analysis.js:18,77-91` registers the guard on Update and Delete for all three protected tables (`qdb_edp_ruleaudit`, `qdb_edp_ruleexecutionlog`, `qdb_edp_ruleapproval`) at stage 10 (pre-validation), mode 0 (synchronous). The smoke test in the same script (lines 120-126) verifies the guard is blocking. `DeleteAuditPlugin.cs` writes an audit record before Delete on `qdb_edp_rule` and `qdb_edp_ruleversion` (the data tables), correctly not the audit tables themselves. Residual: a System Administrator can disable the plugin step — this is documented in the plugin XML doc comment and accepted per ADR-12.

### F-05 — Strong-name key in git history

**Status: OPEN — ROTATION NOT YET DONE**
Confidence: 99%

Evidence: `git log --all --full-history -- "*.snk"` shows commit `2bef952` with message "fix(edp): F-05 (partial) — stop committing the strong-name private key." The commit author acknowledges "the key remains in git history, so it must be treated as compromised and ROTATED before production." `*.snk` is now in `.gitignore`. The key is not on the build machine. The old public key token `06949b1887fabe5d` remains hardcoded in `bre-register.js:37`. `wave-0-snk-rotation-scope.md` scopes the rotation (W0-1) but it has NOT been executed. Any actor with access to git history can extract the private key and sign a malicious assembly under the current Dataverse plugin identity.

**This is Blocker B-1.** No production assembly deployment is safe until rotation is complete.

---

## 2. C-005 Append-only Bypass Analysis

The question is whether any code path — including Custom API surfaces — can mutate or delete audit or execution-log records.

**DataverseAuditSink** (`Sinks.cs:44-58`) only CREATEs `qdb_edp_ruleaudit` records. No Update or Delete call exists in the sink.

**DataverseTraceSink** (`Sinks.cs:77-103`) only CREATEs `qdb_edp_ruleexecutionlog` records. No Update or Delete call exists. Exceptions are swallowed (by design, ADR-13 tier-2 best-effort).

**GovernanceActionPlugin** calls `GovernanceService.PerformAction()`, which calls `TouchVersionOptimistic()` (updates `qdb_edp_ruleversion` state — not an audit table), `CreateApproval()` (creates `qdb_edp_ruleapproval` — guarded), and `WriteAudit()` (creates `qdb_edp_ruleaudit` — guarded). No mutation of existing audit records.

**EvaluateDecisionPlugin** evaluates rules and writes a trace via `DataverseTraceSink` (Create only). No audit table mutation.

**RuleServicePlugin** operations (Validate, Test, RunScenarios, ExecuteDecisionTable, ExecuteRuleSet, GetRuleHistory, GetRuleTemplates, GetRuleDocumentation, GetRuleAnalytics, ResolveEffectiveVersion) — none update or delete audit tables. Read-only analytics query `qdb_edp_ruleexecutionlog` with RetrieveMultiple (no mutation).

**DeleteAuditPlugin** creates a `qdb_edp_ruleaudit` record and then allows the deletion of `qdb_edp_rule`/`qdb_edp_ruleversion` to proceed. Critically, this plugin does NOT bypass the AppendOnlyGuard on the audit tables — it creates audit records, it does not delete them.

**Conclusion:** No Custom API path can mutate or delete audit or execution-log records. The only bypass route is a System Administrator disabling the AppendOnlyGuard plugin step — an irreducible platform residual that is documented, accepted, and detectable via Dataverse audit of plugin step changes.

---

## 3. Secrets Scan

No hardcoded credentials, secrets, or tokens found in source code or tests. Confidence: 95%.

The deploy scripts read credentials from a `.env` file via `EDP_ENV_PATH` environment variable with a fallback path to another project's `.env` (`D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env`). This is a dev-machine convenience; the credential file itself is not in git.

**Finding (SEC-11 — see register):** The old public key token `06949b1887fabe5d` is hardcoded in `bre-register.js:37` inside the POST path for assembly creation. This is the token of the compromised key. It must be replaced with the new token after W0-1 rotation. This is not a secret but a structural integrity identifier; its presence poses an OPSEC risk post-rotation if scripts are re-run without updating the token.

**Finding (SEC-12):** `bre-register.js:34` and `bre-register-meta.js:11` contain hardcoded assembly version `1.0.9.0` while the `csproj` assembles at `1.0.23.0`. Only `bre-register-analysis.js:11` has the correct `1.0.23.0`. Running the stale scripts against production would PATCH the assembly version field to `1.0.9.0`, which may prevent Dataverse from reloading the sandbox cache correctly.

---

## 4. Pin Governance Honest Assessment

### ADR-14 Status

ADR-14 is correctly classified as **Proposed** in `adrs/index.md`. It is not Accepted. It was authored during Wave-0 hardening and requires formal ratification by the Architect and CEO before go-live. This is a governance gap, not a technical defect.

### What ADR-14 Does and Does Not Do

ADR-14 provides:
- Field Security Profile `EDP - Manage Production Pin` (layer 3 realized as FSP, not custom privilege)
- Column audit flags already set on the three pin fields
- Honest disclosure that entity-level audit is not yet enabled (W0-4)

ADR-14 explicitly defers:
- ADR-12 layer 1 (synchronous pre-operation justification enforcement at the platform boundary)

### Is ADR-14 an Honest Disclosure?

**Yes.** The ADR contains the statement: "ADR-12 is NOT fully satisfied. Its strongest claim (no production pin without recorded justification, enforced for every write path) is deferred." The VP-6 test case in `wave-0-pin-governance-verification.md` is designed to *document* the gap, not hide it. The Phase-6 pen-test has been proactively invited to confirm the gap.

### VP-6 Residual: Blocker or Condition?

**Assessment: Condition, not blocker, if W0-4 is resolved and the FSP is deployed.**

Reasoning: Field-level security (ADR-14) restricts WHO can write pin fields to named individuals. The execution path (ADR-09 Resolver) still enforces justification at evaluation time — a pinned rule without justification will be blocked when called. The FSP deployment combined with entity audit (W0-4) means any unauthorized pin write will be audited and attributable. The `ProductionPinJustificationPlugin` is fully built with 6 test cases and will close this residual completely once W0-1 rotation is done (it is the natural carrier for the 1.0.24 assembly build).

**However:** Until W0-4 (entity audit enabled), pin changes on `qdb_edp_ruleversion` are NOT captured in the Dataverse audit log, even though column flags are set. This means the "tamper-evident" auditing layer for pin changes is not yet functional. W0-4 must be resolved before the FSP deployment provides its full intended assurance.

### Entity-Level Auditing (W0-4)

**Status: OPEN — BLOCKER (B-2)**

`ADR-14.md:27` states: "entity-level auditing on `qdb_edp_ruleversion` was OFF, so no pin change was actually recorded. Same for the `environmentvariablevalue.value` column." The admin portal toggle is required; Web API cannot set `IsAuditEnabled` on entity metadata (confirmed in ADR-14: "The Web API application user cannot toggle entity `IsAuditEnabled` or attribute `IsSecured` — both return `405 0x80060888`"). This must be done manually before go-live.

---

## 5. Wave-0 Condition Status Table

| Condition | Description | Status | Evidence |
|-----------|-------------|--------|----------|
| **W0-1** | SNK key rotation — generate vaulted keypair, rebuild 1.0.24, re-register | **OPEN — BLOCKER B-1** | Key in git history per commit 2bef952; rotation runbook in wave-0-snk-rotation-scope.md; not executed |
| **W0-2** | SoD live tests — scoped users verify submission, approval, dual-approval, rejection | **OPEN — BLOCKER B-3** | GovernanceServiceTests pass in unit tests; VP test matrix in wave-0-pin-governance-verification.md all ☐ (not run on live org) |
| **W0-3** | Pin FSP deployed + VP-1 through VP-5 and VP-7 pass | **PARTIAL** | FSP provisioned (3dbd141a…); bre-pin-fieldperms.js scripted; VP matrix unchecked; pin plugin not yet deployed (blocked by W0-1) |
| **W0-4** | Entity audit enabled on qdb_edp_ruleversion + environmentvariablevalue | **OPEN — BLOCKER B-2** | ADR-14:27 confirms entity audit is currently OFF; admin portal toggle required; cannot be set via Web API |
| **W0-5** | PDPPL / data-residency assessment | **OPEN — BLOCKER B-4** | org5869857f on crm4 (Europe); no data-residency doc in scope; cross-border transfer analysis required |

---

## 6. Security Risk Register

### SEC-01 — Compromised Strong-Name Key in Git History

**Likelihood:** High | **Impact:** Critical
**Description:** The private key `edp.snk` was tracked in git until commit `2bef952`. Any actor with repository read access can extract it and sign a malicious assembly under the live Dataverse plugin identity (`EDP.RuleRuntime.Crm.Signed`, token `06949b1887fabe5d`). A Dataverse System Administrator or Customizer could then upload the malicious DLL, overwriting all eight plugin types (including governance and audit guards).
**Mitigation:** W0-1 — generate new keypair, vault it, rebuild to 1.0.24, rehearse in staging, execute maintenance-window re-registration per `wave-0-snk-rotation-scope.md`.
**Residual after mitigation:** The old key remains in history but no longer controls the live assembly identity. History purge (BFG/git-filter-repo) is optional hardening documented in W0-1 Phase E.
Confidence: 99%

### SEC-02 — Entity-Level Audit Not Enabled (W0-4)

**Likelihood:** Certain | **Impact:** High
**Description:** Column audit flags on `qdb_edp_ispinned`, `qdb_edp_pinjustificationcode`, and `qdb_edp_pinjustificationnote` are set, but entity-level audit on `qdb_edp_ruleversion` is OFF. Pin changes are not captured in the Dataverse audit log. Similarly, changes to the prod-designation environment variable are unaudited. This breaks the tamper-evidence guarantee for pin governance.
**Mitigation:** Enable entity-level audit via the maker portal for both tables before go-live.
**Residual:** None — column flags take effect immediately once entity audit is on.
Confidence: 99%

### SEC-03 — Pin Justification Unenforced at Write Boundary (VP-6 / ADR-14 residual)

**Likelihood:** Certain | **Impact:** Medium
**Description:** A user who holds the `EDP - Manage Production Pin` field-security profile can set `qdb_edp_ispinned = true` via SDK without providing a justification code or note. The justification enforcement exists only at the ADR-09 execution path (evaluation time). The `ProductionPinJustificationPlugin` is built and tested but not deployed.
**Mitigation:** Deploying the pin plugin with the W0-1 assembly cutover closes this completely (VP-6 test flips from "expected to succeed" to "expected to be blocked").
**Residual after mitigation:** None — the plugin fires pre-operation for Create and Update on all write paths.
Confidence: 99%

### SEC-04 — SoD Enforcement Not Live-Tested (W0-2)

**Likelihood:** Low (code is correct) | **Impact:** High (if misconfigured in live environment)
**Description:** `GovernanceService.EnforceSoD()` correctly checks submitter ≠ approver and business approver ≠ technical approver in production. The fail-safe is verified. However, the live test matrix (VP test cases in the governance verification doc) is entirely unchecked. If the production environment variable `qdb_edp_IsProductionEnvironment` is not set to "yes", SoD is silently skipped.
**Mitigation:** W0-2 live tests with scoped users; confirm `qdb_edp_IsProductionEnvironment = yes` is set in the production org.
**Residual:** Ongoing — this should be a quarterly SOC test for regulated environments.
Confidence: 90%

### SEC-05 — NCalc CVE GHSA-3w5p-95mh-gq75 (Accepted Risk)

**Likelihood:** Low | **Impact:** Medium (DoS, not data breach)
**Description:** NCalc 5.4.2 has a factorial-overflow DoS vulnerability (CVSS 4.8). Fix requires NCalc 6.x which requires STJ 10.x, incompatible with net462. Exploitation requires an attacker to be a rule author who passes the maker-checker governance process.
**Mitigation:** Accepted per ADR-SEC-NCALC. Revisit when NCalc ships a netstandard2.0-compatible patched line.
**Residual:** Bounded by the 2-minute Dataverse sandbox timeout.
Confidence: 95%

### SEC-06 — Deploy Script Version Mismatch (Hardcoding)

**Likelihood:** High | **Impact:** Medium
**Description:** `bre-register.js:34` uses assembly version `1.0.9.0`; `bre-register-meta.js:11` uses `1.0.9.0`. The csproj assembles at `1.0.23.0` and `bre-register-analysis.js:11` correctly references `1.0.23.0`. Running the stale scripts patches the pluginassembly version field to `1.0.9.0`, which may prevent Dataverse from reloading its sandbox cache for the updated assembly.
**Mitigation:** Sync all deploy scripts to a single `ASSEMBLY_VERSION` constant sourced from one file; update to `1.0.24` at W0-1 time.
**Residual:** None after sync.
Confidence: 95%

### SEC-07 — Hardcoded Compromised Public Key Token

**Likelihood:** N/A (not yet exploitable) | **Impact:** Medium (post-rotation OPSEC)
**Description:** `bre-register.js:37` hardcodes `publickeytoken: '06949b1887fabe5d'` in the assembly CREATE path. After W0-1 rotation, the new assembly has a different token. If `bre-register.js` is run against a fresh environment after rotation, it will register the new assembly but record the OLD token in the script — creating a documentation/drift risk.
**Mitigation:** After rotation, update `bre-register.js` with the new public key token.
**Residual:** Scripted PATCH of assembly content does not re-specify the token — only initial CREATE does. Post-rotation script update is required.
Confidence: 90%

### SEC-08 — DataverseTraceSink Best-Effort Drop (By Design)

**Likelihood:** Medium (under load) | **Impact:** Low-Medium
**Description:** `DataverseTraceSink.WriteTrace()` swallows all exceptions, meaning execution log records may be silently dropped under throttle or failure. This is ADR-13 tier-2 by design ("decision integrity outranks trace completeness"). If regulatory requirements mandate 100% execution audit, this is a gap.
**Mitigation:** Accepted as architectural trade-off per ADR-13. For regulated environments requiring 100% audit: upgrade the trace tier to durable (same DataverseAuditSink pattern). This requires a separate ADR and is not scoped for Wave-0.
**Residual:** Best-effort trace loss under load. Governance audit (tier-1) is always durable.
Confidence: 85%

### SEC-09 — Dev-Path Fallback to Shared .env File

**Likelihood:** High (dev environment) | **Impact:** Low (prod with EDP_ENV_PATH set)
**Description:** All deploy scripts fallback to `D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env` when `EDP_ENV_PATH` is unset. This is a dev-machine path shared with another project. In CI/CD, `EDP_ENV_PATH` must be set to prevent cross-project credential confusion.
**Mitigation:** Document and enforce `EDP_ENV_PATH` in all CI/CD pipeline definitions. Add a startup guard in deploy scripts that exits if `EDP_ENV_PATH` is not set and the fallback path does not exist.
**Residual:** Dev-time only; no prod risk if CI/CD is correctly configured.
Confidence: 90%

### SEC-10 — PDPPL Cross-Border Data Transfer (W0-5)

**Likelihood:** Dependent on data classification | **Impact:** High (regulatory)
**Description:** The live Dataverse environment `org5869857f.crm4.dynamics.com` is in the EMEA region (Europe). If the EDP processes personal data subject to Pakistan's Personal Data Protection Law (PDPPL), cross-border transfer restrictions may apply. No data residency assessment document is present in the production-readiness deliverables.
**Mitigation:** Conduct a data classification and residency review; obtain consent or implement contractual controls as required by PDPPL before processing personal data.
**Residual:** Depends on data processing scope; must be assessed and documented.
Confidence: 88%

---

## 7. OWASP Top 10 Assessment

| # | Category | Applicable? | Mitigation | Gap |
|---|----------|-------------|------------|-----|
| A01 | Broken Access Control | Yes | Dataverse security roles (6 roles provisioned via bre-roles.js); executeprivilegename on all Custom APIs (F-03); field security profile for pin fields (ADR-14) | VP-6 residual: pin write not enforced at boundary (plugin not yet deployed) |
| A02 | Cryptographic Failures | Yes | Assembly signed with strong-name key; tokens used in CI (not hardcoded at runtime) | SNK private key in git history (SEC-01) — CRITICAL until rotation |
| A03 | Injection | Yes | PCRM parsed via JsonSerializer (not eval); FetchXML uses ConditionExpression (parameterized); NCalc evaluates authored expressions not user input | NCalc DoS CVE (CVSS 4.8, accepted risk per ADR-SEC-NCALC) |
| A04 | Insecure Design | Yes | Maker-checker governance (two-stage approval); optimistic concurrency prevents duplicate approvals (M3); fail-safe on production flag (F-02) | ADR-12 layer 1 deferred (VP-6); ADR-14 is Proposed not Accepted |
| A05 | Security Misconfiguration | Yes | append-only guards registered at pre-validation (stage 10); executeprivilegename set; production flag controls SoD | Entity-level audit OFF (W0-4 — BLOCKER); SoD not live-tested (W0-2) |
| A06 | Vulnerable Components | Yes | NCalc 5.4.2 (GHSA-3w5p-95mh-gq75, CVSS 4.8) | Accepted per ADR-SEC-NCALC; no available fix compatible with net462 |
| A07 | Auth Failures | Partial | Dataverse session auth (CRM); SP credentials via env file (deploy scripts); InitiatingUserId tracked per action | No MFA policy visible in scope; SP credential rotation schedule not documented |
| A08 | Software & Data Integrity | Yes | Strong-name signing for assembly identity; append-only audit tables | SNK compromised in history (SEC-01); version mismatch in deploy scripts (SEC-06) |
| A09 | Logging & Monitoring | Yes | Durable governance audit (tier-1 DataverseAuditSink); execution trace (tier-2 best-effort); actor lookup on all audit records (F-06) | Entity audit OFF on ruleversion (W0-4); trace records may be dropped under load (ADR-13 design) |
| A10 | SSRF | Not Applicable | Plugins run in Dataverse sandbox (no outbound HTTP); designer uses same-origin fetch in production | None |

---

## 8. Compliance Assessment

### Audit Trail Requirements (General Enterprise / Regulated)

| Requirement | How the Design Meets It | Gap |
|-------------|------------------------|-----|
| Every governance state transition is recorded | DataverseAuditSink writes a `qdb_edp_ruleaudit` record per action; throws on failure (durable) | None |
| Concurrent approvals cannot produce duplicate transitions | TouchVersionOptimistic (M3) serializes actions; concurrent action → ConcurrencyError with no approval/audit written | None |
| Actor identity is attributable | Both string and EntityReference lookup (`qdb_edp_actorid`) recorded (F-06) | None |
| Audit records cannot be mutated | AppendOnlyGuardPlugin at pre-validation (stage 10) on Update/Delete | Sys Admin can disable step (documented irreducible residual) |
| Deletions of governed records are tracked | DeleteAuditPlugin pre-op on Delete of qdb_edp_rule and qdb_edp_ruleversion | None |
| Pin changes are audited | Column flags set on pin fields | **W0-4 OPEN: entity-level audit OFF; column flags inactive until entity audit enabled** |
| 100% execution audit | Tier-1 audit for governance; tier-2 best-effort for evaluation traces | **Trace records may be dropped under load (ADR-13 design trade-off)** |

### PDPPL (Pakistan Personal Data Protection Law)

| Requirement | Status |
|-------------|--------|
| Data localisation / cross-border transfer | **UNASSESSED — W0-5 BLOCKER** |
| Consent for personal data processing | Not assessed |
| Data minimisation | Not assessed |

---

## 9. Data Residency Review

**Physical location:** Dataverse org `org5869857f.crm4.dynamics.com`. The `crm4` region corresponds to Europe (Microsoft's EMEA datacenter region — Frankfurt/Amsterdam). All PCRM payloads, execution logs, audit records, and governed rule data reside in this region.

**Cross-border risk:** If the EDP is processing personal data of Pakistani data subjects, transfer to European servers constitutes cross-border data transfer under PDPPL. PDPPL requires either an adequacy determination, appropriate contractual safeguards, or explicit consent.

**Immediate action required:** Data classification must be completed for all entity types (`qdb_edp_ruleversion`, `qdb_edp_ruleexecutionlog`, `qdb_edp_ruleaudit`). If any entity holds personal data, cross-border transfer controls must be in place before production go-live with personal data.

---

## 10. Audit Trail Validation

**Can every governance state transition be reconstructed from the audit log alone?** Yes — every transition writes a `qdb_edp_ruleaudit` record with the from-state, to-state, actor, timestamp, and comments. The optimistic-concurrency model ensures no transition is applied without an audit entry (audit is written after the state touch, so a race that fails the touch produces no entry, which is correct).

**Is the log tamper-proof and append-only?** Yes at the plugin layer — the `AppendOnlyGuardPlugin` fires at pre-validation (stage 10, before any business logic). The only bypass is a System Administrator disabling the step, which is itself auditable via Dataverse solution change logging. This residual is accepted and documented.

**Is the log complete?** Partially. Governance events: complete. Execution events: best-effort (may be dropped under load). Pin changes: NOT captured in the Dataverse audit log until W0-4 is resolved.

**Is the actor on every entry attributable?** Yes — both a string actor field and a `systemuser` lookup (`qdb_edp_actorid`) are written on every governance and audit record (F-06).

**Limitation for regulatory examination:** An examiner relying on the Dataverse audit log (not the custom `qdb_edp_ruleaudit` table) to verify pin changes will find no entries until W0-4 is enabled. The `qdb_edp_ruleaudit` custom table records governance lifecycle transitions but not direct field edits.

---

## 11. Service Account Review

| Account | Scope | Assessment |
|---------|-------|------------|
| Deploy SP (AZURE_CLIENT_ID in .env) | Full solution component management in Dataverse during deployment | Appropriate for deploy-time; must be revoked or scoped down for runtime |
| Runtime plugin context (`context.UserId`) | Invoking user's identity; organization-service calls run as that user | Correct — least privilege for data access |
| System context (`CreateOrganizationService(null)`) | Used in pin guard to read the production environment variable | Justified — reading a config flag requires system context for reliability; does not perform data writes |
| SP added to `EDP - Manage Production Pin` FSP | Allows the runtime SP to read and write pin fields | Required for version resolution on pinned rules; appropriate |

No over-privileged runtime accounts identified. Deploy SP has broad permissions but is a deploy-time identity — it must NOT be the same SP used for any runtime integration.

**Gap:** There is no documented SP rotation schedule or separation between deploy-time SP and any runtime integration SP. If the same SP is used for both, its compromise would grant broad solution-management access.

---

## 12. Seven-Pass Code Audit

### Pass 1 — Wiring

No orphaned handlers found. Evidence:
- `RuleServicePlugin.cs:54-64`: switch covers 10 message names with a default throw for unknown messages.
- `EvaluateDecisionPlugin.cs:55-61`: PCRM source (PcrmJson direct vs stored version) is fully wired.
- `GovernanceActionPlugin.cs:25-34`: Delegates to GovernanceService; result mapped to output parameters.
- `AppendOnlyGuardPlugin` and `DeleteAuditPlugin` are registered in `bre-register-analysis.js` and fire on the correct message/entity combinations.
- `ProductionPinJustificationPlugin` is registered (when deployed) via `bre-register-pin-guard.js` on Create + Update with pre-image on Update. The filteringattributes (`PIN_ATTRS`) is set so it only fires on writes that touch pin fields.

No unconnected queue producers, orphaned event handlers, or form fields with no binding found.

### Pass 2 — Error Handling

Findings:

- `DataverseTraceSink.WriteTrace()` (`Sinks.cs:99`): swallows all exceptions by design (ADR-13). Severity: INFO — intentional and documented.
- `bre-register.js` token function uses `JSON.parse(r.body).access_token` with no null-check. If authentication fails (wrong client_id/secret), the function throws `TypeError: Cannot read property 'access_token' of undefined` which is confusing. Severity: WARNING (deploy-time only, not a runtime risk). Confidence: 85%.
- `client.ts:164`: `try { targetEntity = ... } catch { /* ignore */ }` — intentional; JSON parsing failure defaults to empty string. Acceptable.
- `ScenarioPublishGate.Check()` (`Governance/ScenarioPublishGate.cs:24-46`): no catch block. A runtime exception from `ScenarioRunner.Run()` propagates as an unhandled exception, blocking the Publish action. This is the correct fail-closed behaviour but is not explicit. Severity: INFO — consider wrapping with a specific catch to distinguish gate failure from infrastructure failure in the error message.
- `GovernanceActionPlugin.cs:46-48`: wraps all non-InvalidPluginExecutionException errors in a meaningful message. Correct.
- All async operations in the designer TypeScript use `await` with the top-level try-catch in `req()` propagating errors. No unhandled promise rejections found.

### Pass 3 — Completeness

All features are fully implemented. No TODO/FIXME/HACK comments in plugin source code. The note in `RuleAnalysisPlugin.AnalyzeRule()` at line 204 ("first cut") is a design constraint disclosure, not an incomplete stub. `wave-0-pin-governance-verification.md` shows all VP-1 through VP-7 test cases unchecked (☐) — this is a process gap (live tests not run), not a code gap.

### Pass 4 — Dead Code

- `bre-register-analysis.js:5`: comment reads "qdb_edp_ruleapproval + qdb_edp_ruleapproval" (duplicated). Typo in comment only; the runtime array at line 18 contains three unique entities. Severity: PRUNE (comment).
- `bre-register-meta.js:13-14`: hardcoded seed GUIDs `1a4a23bd-4f77-f111-ab0e-000d3abcff60` and `23f45b83-be77-f111-ab0e-000d3abcff60` used only in smoke tests. These are functional, not dead code, but should be moved to configuration.
- No unused functions, classes, or variables found in the plugin source.

### Pass 5 — Bloat

- `RuleServicePlugin.cs`: 634 lines handling 10 operations. This exceeds the 400-line soft limit defined in project coding standards. The class is a Dataverse "thin adapter" (per ADR-06) and its size is driven by the 10 Custom API surfaces it backs. Extracting per-operation handlers into separate partial classes or a handler pattern would reduce this. Severity: WARNING. Risk: maintenance, not security. Confidence: 90%.
- `designer/src/dataverse/client.ts`: 411 lines — marginally over the 400-line limit. Acceptable.
- All other files are within limits.

### Pass 6 — Hardcoding

| File | Line | Finding | Severity |
|------|------|---------|---------|
| `deploy/bre-register.js` | 37 | `publickeytoken: '06949b1887fabe5d'` — compromised key token | WARNING |
| `deploy/bre-register.js` | 34 | `version: '1.0.9.0'` diverges from csproj `1.0.23.0` | WARNING |
| `deploy/bre-register-meta.js` | 11 | `ASSEMBLY_VERSION = '1.0.9.0'` diverges from `1.0.23.0` | WARNING |
| `deploy/bre-register-meta.js` | 13 | `SEED_VERSION = '1a4a23bd-4f77-f111-ab0e-000d3abcff60'` | PRUNE |
| `deploy/bre-register-meta.js` | 14 | `PUBLISHED_RULE = '23f45b83-be77-f111-ab0e-000d3abcff60'` | PRUNE |
| `deploy/bre-register-analysis.js` | 16-17 | Two hardcoded seed GUIDs for smoke tests | PRUNE |
| `runtime/src/.../GovernanceService.cs` | 21-22 | Lifecycle state option values (e.g., `Draft = 100000000`) are CRM option values; these are valid to hardcode as named constants since changing them breaks the solution. | INFO |
| All deploy scripts | 7-8 | Fallback env path `D:/AI Projects/AICompany/...` — dev machine path | WARNING |

### Pass 7 — Security

- No secrets or credentials in source code. Confidence: 99%.
- No SQL string concatenation. All Dataverse queries use `QueryExpression` with `ConditionExpression` (parameterized). Confidence: 99%.
- No `eval()` or `Function()` with dynamic strings. Confidence: 99%.
- No `console.log` with sensitive data in plugin code. Deploy scripts log status messages only. Confidence: 95%.
- Input validation at API boundaries: `EvaluateDecisionPlugin.cs:46-49` validates `PcrmJson` length (512 KB limit) and requires either `InputsJson` or `TargetRef`. `GovernanceActionPlugin.cs:29` uses direct cast with no null-check on `RuleVersionId` — if the parameter is missing, this throws `NullReferenceException` which is caught and re-thrown as `InvalidPluginExecutionException`. Severity: WARNING (not a security issue but produces a poor error message). Confidence: 85%.
- `RuleAnalysisPlugin`: reads PCRM JSON but does not execute it. Static analysis only. No injection surface.
- Designer `client.ts:116-117`: `deleteRule()` deletes rule + versions via Web API calls. No CSRF protection needed (Dataverse handles via OData-Version header requirement and Bearer token). Acceptable.

---

## 13. Governance Gaps (Ranked by Severity)

| Rank | Gap | Risk if Unaddressed | Remediation |
|------|-----|--------------------|-|
| 1 | **W0-1: SNK key not rotated** | Adversary can sign malicious assembly under live plugin identity; all 8 plugin types are replaceable by an actor with Customizer/SysAdmin role | Generate vaulted keypair; rebuild 1.0.24; rehearse in staging; maintenance-window re-registration |
| 2 | **W0-4: Entity audit OFF on ruleversion + envvariablevalue** | Pin changes and production-flag changes are unaudited; ADR-14 tamper-evidence claim is non-functional | Enable entity audit via maker portal; no code change required |
| 3 | **W0-2: SoD not live-tested** | SoD enforcement may be bypassed if the production flag is not set correctly in the live org | Run VP test matrix with scoped users; confirm `qdb_edp_IsProductionEnvironment = yes` |
| 4 | **W0-5: PDPPL unassessed** | Production deployment with personal data may violate Pakistani data protection law | Data classification; residency assessment; cross-border transfer controls if required |
| 5 | **VP-6 / ADR-14 layer 1 deferred** | A pin-manager can set a production pin without justification; enforcement only at execution path | Closed by deploying ProductionPinJustificationPlugin at W0-1 time |
| 6 | **ADR-14 is Proposed, not Accepted** | Decision is not ratified; may be revisited without chain of custody | Ratify ADR-14 (Proposed → Accepted) with Architect + CEO sign-off before go-live |
| 7 | **Deploy script version mismatch** | Stale scripts PATCH assembly version to 1.0.9.0; Dataverse may not reload sandbox cache correctly | Sync all scripts to single `ASSEMBLY_VERSION` constant; update to 1.0.24 at W0-1 time |
| 8 | **Hardcoded compromised public key token in bre-register.js** | Post-rotation, running the unmodified script records the wrong token | Update publickeytoken in bre-register.js after W0-1 rotation |
| 9 | **No SP rotation schedule / deploy-vs-runtime SP separation documented** | SP compromise grants solution-management access | Document separate SP identities for deploy and runtime; document rotation schedule |
| 10 | **DataverseTraceSink drops silently** | Execution traces may be lost under load; regulatory audit coverage gaps if tier-1 trace is required | Accepted per ADR-13 for current scope; revisit if regulatory requirements demand 100% execution audit |

---

## 14. Go-Live Clearance

**Verdict: NOT CLEARED**

Production deployment is blocked until all four blockers are resolved:

- **B-1 (W0-1)** — Strong-name key rotation: not done. Every assembly change, including the pin-plugin deploy, is blocked. `wave-0-snk-rotation-scope.md` provides the complete runbook.
- **B-2 (W0-4)** — Entity-level audit on `qdb_edp_ruleversion` + `environmentvariablevalue`: not enabled. This is a 5-minute admin portal action but must be completed and verified before go-live.
- **B-3 (W0-2)** — SoD live tests with scoped users: not run. The VP test matrix must show VP-1, VP-2, VP-3, VP-4, VP-5, VP-7 all pass, with VP-6 explicitly recorded as the known ADR-14 residual.
- **B-4 (W0-5)** — PDPPL / data-residency: unassessed. No production go-live with personal data before this is cleared.

**Once all four blockers are resolved, the verdict changes to: APPROVE-WITH-CONDITIONS**

Remaining conditions (post-blocker-clearance):
- ADR-14 ratified (Proposed → Accepted) by Architect + CEO.
- VP-6 residual accepted and recorded in this audit gate by QA and Auditor sign-off on `wave-0-pin-governance-verification.md`.
- Deploy script version constants synced and updated to 1.0.24.
- SP rotation schedule documented.

---

*Audit gate produced by Maqsad AI — Auditor agent (Phase 6). All findings are evidence-based with file:line citations. Confidence levels are per finding.*
