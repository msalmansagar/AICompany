# Phase 6 — Audit & Governance Review

## Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| Engagement | Customer Survey Engine (CSE-ENG-001) for QDB (Qatar Development Bank) |
| Built by | MSS Technologies |
| Date | 2026-11-14 |
| Auditor | Auditor & Governance (MSS) — lead synthesis |
| Branch / PR | `feat/survey-engine`, draft PR #173 |
| Build state | B0–B9 complete; live and verified end to end on cloud test org `org5869857f`; on-prem kit `onprem-deploy/2026-11-11/` built, not yet imported |

### Scope

This audit covers **Release 1 only: on-premise, Dynamics CRM 9.1**, on two orgs — **HL CRM** (customers are *contacts*) and **BFD CRM / QDB1** (customers are *accounts*). The cloud org `org5869857f` (EMEA / crm4 region) is the build-and-test org and is explicitly **not** a release-1 production target (go-live-checklist B6, G).

SurveyEngine ships as an **unmanaged** solution; the real rollback is a database backup (RUNBOOK stage 10). The **Secure-link invitation channel is disabled** for release 1 and stays off until NFR-CSE-009 (B4) is signed off; the sole release-1 answering channel is the portal pull list.

### Method

Five independent dimension audits were run — **security/OWASP, compliance/PDPPL, audit-trail/governance, code (7 passes), and operations/deployment** — each producing candidate findings. Every candidate was then put through **adversarial verification** (an attempt to refute it from the code, the documents, or a read-only live query). Surviving findings were merged across dimensions and synthesised here. Confidence is stated per finding; only findings at >80% confidence are reported.

The lead auditor independently reproduced the load-bearing evidence for every release-blocking finding (see the closing VERIFICATION block): direct source reads of the plugin and data layer, the provisioning role manifest, and a **read-only live query** of the cloud test org's audit configuration.

### Not in scope / not verifiable here

- **No access to the two on-prem production or test orgs.** Anything that can only be proven by running the runbook on HL test / QDB1 test (A2 removability, A3 trigger p95, org-level audit state, 9.1 Custom-API support) is reported as an open release gate, not as verified.
- Where QDB's own SMS/email gateway physically routes personal data is **outside MSS's delivered scope** and is unconfirmed.
- The contact-customer (HL) anonymise path has **never run on any org** (QA RISK-01 / DEF-QA-002); its runtime behaviour is reasoned from code, not observed.
- This audit reviews the delivered artifacts and code; it does not re-run the full QA suite (A4 coverage = 80.05% C# branch is accepted from `phase-5-qa.md`).

---

## 1. Executive summary

The Survey Engine is a **well-engineered build with a sound security core** — a correct token design (256-bit entropy, SHA-256-only storage, single-use, expiry, channel-gated-off), real IDOR protection, escaped FetchXML, clean secrets hygiene, thorough suppression-log coverage, defensible version pinning, and a high-quality on-prem runbook. The code passes 6 of 7 code-audit passes cleanly; test baselines are green (C# 411/411, on-prem 117/117, provisioning 64/64) and branch coverage meets NFR-CSE-007 (80.05%).

It is **not ready to go to production on either on-prem org today.** Five release-blocking items stand: three are PDPPL/data-protection gaps (classification + retention + written sign-off undetermined; "anonymisation" leaves the response re-identifiable on its own row; retention/erasure covers only responses, with no per-customer erasure path), one is a least-privilege defect (the daily scheduler account must hold System Administrator on both banking orgs), and one is a governance/chain-of-custody gap (platform table-level auditing is OFF on all nine survey tables, so rule/config changes have no change history). None of the five is a reason the engine cannot ship — each is a specific, closable condition.

**Go-live clearance: CLEARED WITH CONDITIONS.** Release 1 may proceed through the PR / CEO gate, but **must not go to production on HL or QDB1** until the numbered conditions in section 12 are closed — 5 of them release-blocking.

**Finding counts:** Critical 0 · High 7 · Medium 7 · Low 6 · Info 3 · Release-blocking 5.

---

## 2. Security Risk Register

Each entry: description, likelihood, impact, specific mitigation, residual risk. The register carries the four security-dimension findings (SEC-01..04); `OPS-03` is the operations-lens duplicate of SEC-01 and is merged into it; `AUD-02` is merged into SEC-03. Four further security-relevant findings are detailed in their natural sections and cross-referenced at the end of this register.

### SEC-01 — Scheduler service account requires System Administrator on both on-prem orgs
*(merges OPS-03) · HIGH · Confidence 92% · **RELEASE-BLOCKING** · not tracked in checklist*

- **Description.** `RunDueSurveysPlugin.Execute` builds its org service as SYSTEM (`CreateOrganizationService(null)`, `RunDueSurveysPlugin.cs:32`) and then gates the *caller* on `IsSystemAdministrator(context.InitiatingUserId)` (`:33`). The daily work — creating invitations, releasing postponed invitations, retention deletes/anonymise — all runs as SYSTEM, so the calling account needs only the right to *invoke* `qdb_srv_RunDueSurveys`. The unattended Windows Scheduled Task AD account must therefore stand as a full CRM System Administrator year-round on both HL and QDB1 (RUNBOOK:24; `scheduler/README.md:23`). ADR-005 records no least-privilege justification; the requirement is only restated as an instruction.
- **Likelihood:** Low (requires account/server compromise). **Impact:** High (full administrative control of a regulated banking org).
- **Mitigation (specific).** Create a dedicated `Survey Scheduler` security role carrying execute on `qdb_srv_RunDueSurveys` plus exactly the table privileges the daily passes touch (org-wide Create on invitation, Create/Append on suppression log, Write on postponed invitation, Delete/Write on response for retention). Replace the `IsSystemAdministrator` check with a check for that role/template — `Data/AdministratorCheck.cs` already resolves a role by template id, so it is a drop-in substitute. Keep SysAdmin only on `ActivateSource`/`DeactivateSource`, which legitimately register SDK steps (ADR-006). If the SysAdmin gate must stand for release 1, record it as a formally accepted risk (PAT-005) with compensating controls (dedicated account, Windows integrated auth — no stored CRM secret, RunLevel Limited, credential rotation, server hardening).
- **Residual risk after mitigation:** Low. A scoped role confines a compromised scheduler account to survey operations rather than the whole org.

### SEC-02 — Survey Admin can enable the secure-link channel with no technical gate
*MEDIUM · Confidence 85% · non-blocking · tracked: B4*

- **Description.** `qdb_survey_settings` carries `qdb_securelink_enabled` (`manifest.mjs:187`). The Survey Admin role is granted `FULL` (Create/Read/Write/Delete/Append/AppendTo) on every `CONFIG_TABLES` entry including `qdb_survey_settings` (`manifest.mjs:241,243,256`). Any Survey Admin can therefore flip the secure-link flag in the CRM UI with no separation-of-duties control, making the B4/NFR-CSE-009 security review a purely procedural gate.
- **Likelihood:** Low. **Impact:** Medium.
- **Why not release-blocking.** The flag ships `false` in both shipped configs (`onprem-deploy/2026-11-11/config/HL.json:45`, `BFD.json:43`); the same flag gates both dispatch and validation (`InvitationAccess.cs:33` throws Forbidden when disabled), so there is no half-on state; and flipping the boolean alone does not create a working external path — secure-link also needs a base URL, sender queue/SMS config and the rate-limited portal page, all separately tracked and unbuilt (B5, E4, E5).
- **Mitigation.** Give Survey Admin **Read-only** on `qdb_survey_settings` (matching the `qdb_survey_source` pattern) and move the enable write to the System Administrator or a dedicated `Survey Channel Admin` role. This makes B4 a technically enforceable gate.
- **Residual risk:** Low.

### SEC-03 — Append-only guard plugin on the suppression log was never built
*(merges AUD-02) · MEDIUM · Confidence 93% · non-blocking · not tracked in checklist*

- **Description.** The architecture promises a pre-operation guard plugin blocking Update/Delete on `qdb_survey_suppression_log` for defence in depth (`phase-3-arch.md:215,450`). No such plugin class exists in `crm-plugins/Qdb.SurveyEngine/Plugins/`, and provisioning registers no Update/Delete step on that table. Append-only therefore rests on **role configuration only** — correctly provisioned (Survey Admin Read-only `manifest.mjs:260`; Survey Integration Create/Read/Append `:286`; Survey Analyst none) — which binds the three custom roles but **not** the System Administrator (including, under SEC-01, the scheduler account). The departure from CEO-approved architecture was never recorded.
- **Likelihood:** Low. **Impact:** Medium (append-only guarantee weaker than NFR-CSE-001 states; a sysadmin can edit/delete log rows, and with AUD-01 the edit is untraceable).
- **Mitigation.** Either implement and register the synchronous pre-operation Update/Delete guard plugin that throws on any attempt, or **formally record the omission as an accepted departure** (CEO acknowledgement, like A8) and correct `phase-3-arch.md` §4.7/§11 to match the build. Pair with AUD-01 for real tamper-evidence.
- **Residual risk:** Low once paired with table auditing.

### SEC-04 — GetSurvey / SubmitResponse distinguish "not found" from "forbidden"
*INFO · Confidence 85% · non-blocking · not tracked in checklist*

- **Description.** `InvitationAccess.FindForCustomer` throws `survey_not_found` for an unknown invitation id (`:56`) and `survey_forbidden` for a valid id owned by another customer (`:58`). In theory this lets a caller holding the Survey Integration credential confirm an invitation's existence by GUID.
- **Likelihood:** Very low. **Impact:** Very low. Both refusals return HTTP 400 (only the error-code string differs), and the only principal that reaches this path — the Survey Integration service account — already holds direct Read on the whole `qdb_survey_invitation` table (`manifest.mjs:285`), so a compromised credential can enumerate invitations far more cheaply. Net security value is negligible.
- **Mitigation (optional).** Return `survey_not_found` for both cases; still log the mismatch to the trace. One-line change.
- **Residual risk:** Negligible either way.

### Security-relevant findings detailed elsewhere (cross-reference)

- **AUD-01** (HIGH, release-blocking) — table-level auditing OFF; tampering with log/response rows is untraceable. See §7.
- **AUD-03** (MEDIUM) — the internet-facing Survey Integration account has unused Write on Response/Answer; submitted feedback is overwritable and, with AUD-01, untraced. See §8.
- **CMP-02 / CMP-06** (HIGH / MEDIUM) — anonymised responses remain re-identifiable; secure-link plaintext tokens + contact data persist in CRM activity rows. See §5.
- **OPS-01** (HIGH) — a missed scheduled run silently drops a period's surveys (availability). See §10.

---

## 3. OWASP Top 10 Assessment

| # | Category | Applicable? | Mitigated how | Gaps |
|---|---|---|---|---|
| A01 | Broken Access Control | Yes | IDOR check (`InvitationAccess.FindForCustomer` compares CustomerId); token path is auth-by-token by design; three custom roles scoped by table; portal is a trusted server-to-server caller | **SEC-01** scheduler = SysAdmin; **AUD-03** over-privileged Write; **SEC-02** no SoD on the enable flag; **SEC-04** enumeration (info) |
| A02 | Cryptographic Failures | Yes | `LinkToken.Generate` uses `RandomNumberGenerator` (256-bit); only SHA-256(token) stored; plaintext never written to DB/logs/traces | **CMP-06** plaintext token persisted in SMS/email activity bodies once secure-link is enabled (channel off at release 1) |
| A03 | Injection | Yes | All dynamic FetchXML uses `FetchXml.Escape`; typed `QueryExpression` with no string interpolation; `AnswersJson` parsed and cross-checked against the pinned question set; GUIDs via `Guid.TryParse`; no SQL concatenation; no `eval` | None found |
| A04 | Insecure Design | Yes | Token single-use via `qdb_token_used_on` + optimistic concurrency; expiry enforced; channel disabled until review; fail-safe gating | **SEC-03** append-only relies on role config only; **SEC-02** enable flag has no separation of duties |
| A05 | Security Misconfiguration | Yes | Solution header on creates; no components in Default solution; secure-link ships off | **AUD-01** table auditing OFF on all 9 tables; **SEC-01** standing SysAdmin on scheduler; **AUD-03** broad Write grant |
| A06 | Vulnerable / Outdated Components | Yes | `dependencies.md` reviewed; plugins target .NET 4.7.1; no third-party egress; narrow adopted libraries | None material; keep dependency hygiene under watch |
| A07 | Identification & Authentication Failures | Yes | Portal is trusted S2S; token path is auth-by-token; service-principal creds from env only | Rate-limiting deferred to the portal (**B5**) and must be in place before secure-link is switched on |
| A08 | Software & Data Integrity Failures | Yes | Version pinning (`qdb_pinned_version`) makes the rendered survey reconstructable | **AUD-03** responses overwritable + **AUD-01** untraced; **SEC-03** suppression log tamperable by sysadmin |
| A09 | Security Logging & Monitoring Failures | Yes | Suppression log coverage thorough; no PII in traces | **AUD-01** no change history on config/rule/runtime tables; **OPS-02** no monitoring/alerting delivered; **AUD-04** expiry transition never materialised |
| A10 | Server-Side Request Forgery | Limited | CRM plugins make no outbound network calls (Constitution Art. X); SMS/email are CRM-record hand-offs to QDB's own services, no external gateway | None in MSS-delivered scope |

---

## 4. Compliance Assessment — Qatar PDPPL (Law No. 13 of 2016)

Applied to QDB as a state-owned bank processing identified customers' personal data (customer links, free-text answers, source-record pointers). Residency and the token/role design are sound; **lawful basis, classification, retention/erasure scope and anonymisation completeness are not met.**

| Requirement | How the design meets it / doesn't | Gap & remediation |
|---|---|---|
| **Lawful basis for processing** | Not recorded anywhere; survey processing of identified customers has no documented basis. Suppression is volume-only (fatigue/priority/duplicate), never consent. | **CMP-04 (MEDIUM).** Compliance must record the lawful basis as part of the PDPPL sign-off (B2). Not release-1-blocking on its own because it is subsumed by the B2 gate (CMP-01). |
| **Data classification per entity** | BRD §9.3 labels most tables Internal/Confidential but omits `qdb_survey_settings` and `qdb_survey_sms_config`, and is an MSS internal scheme, not the PDPPL data-category classification. | **CMP-05 (LOW, B1).** Produce a PDPPL data-category classification covering all nine `qdb_survey_*` tables as part of OQ-A1/B1. |
| **Retention & storage limitation** | Retention is implemented over responses/answers only (`ResponseRetentionStore`), and is a correct no-op until Compliance sets days + mode. Invitations and suppression logs carry `qdb_customer_id` and are never deleted/anonymised. | **CMP-01 (HIGH, B1/B2, BLOCKING):** no retention value/mode set, no classification, no written sign-off. **CMP-03 (HIGH, BLOCKING):** extend retention to invitations/suppression logs (a Compliance policy call for the append-only log) and surface the scope to B2. |
| **Anonymisation** | `Anonymise` clears name, customer lookup and `answers_json`/`answer_text` only (`ResponseRetentionStore.cs:40-50`). Every response also carries `qdb_source_table`/`qdb_source_record_id` (`ResponseWriter.cs:50-51`) and keeps `qdb_survey_invitation_id`, so an "anonymised" row is still directly re-identifiable. B3 disclosed only one residual path. | **CMP-02 (HIGH, B3, BLOCKING):** clear the source pointer (and the invitation customer link) on anonymise, **or** restate B3 to Compliance listing every retained re-identifier; re-run B5 scenario C to assert no identifier survives. |
| **Data-subject rights (erasure / DSAR)** | By ADR-007 the survey tables are deliberately not parented to the customer, so deleting a customer does not cascade. No per-customer erasure path exists. | **CMP-03 (HIGH, BLOCKING):** provide a documented per-customer erasure procedure (or a `RemoveCustomer` step). |
| **Right to object / do-not-contact** | No opt-out/consent/do-not-contact mechanism; the (disabled) push channels ignore `donotbulkemail`/`donotphone`. | **CMP-04 (MEDIUM):** add a do-not-contact/opt-out suppression check that logs to the suppression log, within the B4/NFR-CSE-009 scope, before any push channel is enabled. Not release-1-blocking because the sole release-1 channel is the portal pull list (no message is pushed). |
| **Security of processing** | Token design, role gating of answer content (Analyst only), append-only suppression log (role level). | Hardening gaps carried as SEC-01/03, AUD-01/03. |
| **Residency / cross-border** | On-prem targets only; no real PII off Qatar soil (see §6). | **CMP-07 (LOW, G2):** add a written control and close G2. |

---

## 5. Data Residency Review
*(CMP-07 — LOW, Confidence 90%, non-blocking, tracked: G2)*

**Where data resides:** Release 1 writes all production personal data to the two **on-prem CRM 9.1 orgs in QDB's own estate** (HL, BFD/QDB1). B6 is Done: release 1 is on-prem only; the cloud org holds no production responses.

**Cloud test org posture:** `org5869857f` is EMEA/crm4 (non-Qatar). It holds **only synthetic data** — PERF-TEST-A3 accounts, `example.invalid` addresses, a fake `+97400000000` mobile (`e2e/a3-perf-data.mjs:10-12,47`, `e2e/b7-dispatch-e2e.mjs:19-20,69`). No real QDB PII sits off Qatar soil today, so there is no current residency breach despite company-knowledge CMP-001's West-Europe caution.

**Cross-border transfer risk:** Nil in MSS-delivered scope. SMS/email are CRM-record hand-offs to QDB's own services, not an external gateway (`dependencies.md:24`; `phase-3-arch.md:456`). Where QDB's own SMS gateway routes is outside MSS scope and should be confirmed with Compliance.

**Residual exposure:** There is no written standing control forbidding real customer records on the production-shaped EMEA test org, and the end-to-end test data is still present (G2 open, "not in release 1"). A developer could copy real records there for a repro and no gate would catch it. **Remediation:** record a one-line control (EMEA org = synthetic data only) and close G2 before sign-off.

---

## 6. Audit Trail Validation

**Sound:** Suppression-log coverage is thorough — every per-trigger drop (NoCustomer, ChannelNone, OutsideWindow, Duplicate, FormNotPublished, Fatigue, PriorityLost, PostponedExpired/Inactive, NotDelivered) writes a row; the enum (`Domain/SurveyCodes.cs`) and the manifest option set agree 1:1; no silent-drop path was found. Version pinning (`qdb_pinned_version`) makes the exact rendered survey reconstructable. The two real engagement departures are recorded as CEO amendments (A8); PDPPL/retention, secure-link review and cloud residency are correctly tracked as release gates.

**Can every state transition be reconstructed? — Partially, no.**

### AUD-01 — Platform table-level auditing is OFF on all nine survey tables
*HIGH · Confidence 97% · **RELEASE-BLOCKING** · not tracked in checklist*

A table emits audit history only when table-level auditing is enabled *and* org auditing is on. A read-only live query of `org5869857f` on 2026-11-14 returned **org `isauditenabled=true`** while **every survey table reports `IsAuditEnabled=false`** (`CanBeChanged=true`) — reproduced by the lead auditor (see VERIFICATION). Nothing in `provisioning/` or the on-prem kit enables it, so the on-prem orgs will ship with survey-table auditing off. Config/rule tables (setup, trigger, source, settings, sms_config) therefore keep only `created*/modified*` columns, which overwrite on each edit: **who widened a trigger's targeting, when, and from what cannot be reconstructed.** Invitation/response edits and suppression-log deletions are likewise uncaptured. For a PDPPL-regulated bank this means a decision cannot be explained from the audit log alone and rule changes have no chain of custody (Constitution Art. VI; Auditor governance standard). **Remediation:** enable table-level auditing in `manifest.mjs` on at least the config/rule tables and the integrity-sensitive runtime tables (invitation, response, suppression_log); confirm org-level auditing per on-prem org; add a go-live-checklist row owned by MSS + QDB IT, evidenced by `IsAuditEnabled=true` read back per org.

### Is the log tamper-proof and append-only?
Append-only on the suppression log is enforced by **role config only** — no custom role has Write/Delete — but not against the System Administrator, and the promised guard plugin is absent (**SEC-03**). With AUD-01, any such edit is untraceable.

### AUD-04 — Invitation "Expired" transition is never written
*LOW · Confidence 90% · non-blocking*

`InvitationStatus.Expired` (`SurveyCodes.cs:33`) is read (`InvitationAccess.cs:44`) but never assigned. A lapsed Pending invitation keeps `qdb_status = Pending` forever; the APIs correctly refuse it by date, but the expiry "state transition" is never materialised, so status views and the Survey Health view count lapsed invitations as open. **Remediation:** have the daily run transition expired Pending invitations to Expired (recording the time), or document expiry as derived and apply the `expires_on` filter in all status views.

### AUD-05 — `phase-4-tech.md` is absent
*INFO · Confidence 95% · non-blocking*

The mandatory build-phase document required by CLAUDE.md's output structure does not exist; build detail is scattered across `b9-plan.md`, `onprem-readiness-review.md`, `technical-assessment.md` and `phase-5-qa.md`. The work is traceable in aggregate. **Remediation:** produce a brief `phase-4-tech.md` indexing the B0–B9 build before the Phase 7 CEO gate.

---

## 7. Service Account Review

| Account / role | Access scope | Least-privilege assessment |
|---|---|---|
| **Survey Admin** (role) | FULL on config tables (setup, trigger, settings, sms_config); Read on source, invitation, suppression log; Read on queue | Over-broad on `qdb_survey_settings` — carries the secure-link enable flag with no SoD (**SEC-02**). Otherwise appropriate; no Read/Write on response/answer content (good). |
| **Survey Analyst** (role) | Read on response, answer, invitation, setup, trigger, source, account, contact | Correct — read-only answer-content access per FR-CSE-057; no Create/Write/Delete. |
| **Survey Integration** (role — the internet-facing portal service account) | Create/Read/**Write**/Append/AppendTo on invitation, response, answer; Create/Read/Append on suppression log; Read on config/form/render-cache; Read/AppendTo on account/contact | **AUD-03 (MEDIUM):** Write on `qdb_survey_response`/`qdb_survey_answer` is **unused** — the submit path only Creates (`ResponseWriter.cs:30,36`); the sole Update/Delete on those tables is the retention pass under the SysAdmin-only RunDueSurveys API. On an internet-facing account, with auditing off, an overwrite of feedback-of-record would be untraceable. **Remediation:** drop Write on response/answer (keep Create/Read/Append). Write on invitation **is** used (`IntegrationInvitationStore.cs:63`) — leave it. |
| **Scheduler AD service account** (Windows Scheduled Task; calls `qdb_srv_RunDueSurveys`) | Must hold **System Administrator** on each org (`RunDueSurveysPlugin.cs:33`), standing year-round | **SEC-01 / OPS-03 (HIGH, BLOCKING):** vastly over-privileged — the API runs its work as SYSTEM and needs only invoke rights. Replace with a scoped `Survey Scheduler` role, or formally risk-accept with compensating controls. |

---

## 8. Code Audit (7 passes)

Primary scope: `crm-plugins/Qdb.SurveyEngine`; on-prem tooling (`onprem/`), `provisioning/`, `scheduler/`; Form Engine survey changes (runtime `surveyApi.ts`/`surveySubmission.ts`, designer survey mode). Test baselines read green: **C# 411/411, on-prem 117/117, provisioning 64/64**.

- **Pass 1 — Wiring:** Clean. Seven Custom APIs map 1:1 to plugin classes; the two step-registered plugins have correct async post-op/pre-image config; `ListPendingSurveys`/`ValidateLinkToken` are the documented external-portal surface, not orphans.
- **Pass 2 — Error handling:** Clean. No empty catches; catches are specific and filtered (duplicate-key/row-version); channel failures degrade to a suppression-log row. One minor swallow: **COD-03**.
- **Pass 3 — Completeness:** No TODO/FIXME/HACK/stubs. Gated-but-incomplete behaviour (retention off until configured; secure-link blocked until enabled) is deliberate and fails safe. One real gap: **COD-01**.
- **Pass 4 — Dead code:** None found; `SURVEY_ALLOWED_FIELD_TYPES` is consumed by both toolbox and publish validation.
- **Pass 5 — Bloat:** C# files ≤184 lines; provisioning/onprem ≤298. One cap breach: **COD-02**.
- **Pass 6 — Hardcoding:** No env URLs or secrets. The one GUID is the platform-stable System Administrator role-template id (correct). Option-code duplication: **COD-04**.
- **Pass 7 — Security:** See the Security Risk Register (§2) and OWASP (§3) — no secrets in source, no SQL concat, FetchXML escaped, input validated at the boundary, no `eval`, no PII in traces.

### Code findings

- **COD-01 — Survey clone silently drops weighted-scoring + render-style config.** HIGH · Confidence 95% · non-blocking. `FormCloneService.cloneForm` copies a fixed subset of field/option properties and omits `scoreWeight`/`scoreMin`/`scoreMax`, per-option `scorePoints`, and `radioRenderStyle` (`FormCloneService.ts:93-112,126-139`). `QuestionScoring.For` then returns a null `AnswerScore` for every scoreable type, so a cloned weighted survey (the flagship Addendum A feature) **stops scoring with no warning**; the existing clone test stubs `retrieveMultipleRecords` to `{entities:[]}` so it never exercises the copy. **Remediation:** pass the scoring/render fields in `createField`/`cloneOptions` (or clone the full DTO); add a test asserting a weighted survey's scoring survives.
- **COD-02 — `NewFormWizardScreen.tsx` is 934 lines, over the 800-line hard cap.** LOW · Confidence 97% · non-blocking. Independently confirmed (`wc -l` = 934; +400/-95 on the survey branch, up from 631 on main). Several other DFE files already exceed 800 (pre-existing on main). **Remediation:** extract the survey-mode wizard step into its own component.
- **COD-03 — Customer mobile read swallows a platform fault as "no mobile number".** LOW · Confidence 92% · non-blocking. `DispatchStore.ReadMobile` catches `FaultException` and returns null with no trace (the class holds no `ITracingService`), so a misconfigured column/privilege is indistinguishable from an empty number. Dead until secure-link is enabled (blocked earlier by `FindBlocker`). **Remediation:** trace `fault.Detail.Message` + the field name before returning null.
- **COD-04 — Option-set codes duplicated between C# enums and the JS manifest with no parity guard.** INFO · Confidence 88% · non-blocking. The two sides agree today only by both following `100000000 + index`; a plugin casts raw option values straight to the enums (`DispatchStore.cs:114-115`), so a future reorder would silently remap stored values with all (isolated) unit tests green (GOT-011 class of risk). **Remediation:** add a cross-side parity test (name → code).

---

## 9. Operational & Deployment Risks

**Sound:** the 2026-11-11 runbook is high quality — staged stop/warn rules, read-only preflight (P1–P13) gating the deciding 9.1 Custom-API check, honest rollback (unmanaged solution can't cleanly uninstall → the real rollback is the stage-0.1 DB backup, RUNBOOK:213), per-file SHA-256 checksums, documented 9.2→9.1 transforms. The 2-minute plugin limit is handled (90 s `WorkAllowance` with caller re-invocation); volume headroom is ample (cloud daily run did 450 customers in 24.4 s vs BRD §9.2 ~30/day). Scheduler hygiene is good (Windows integrated auth, `exit 1` on failure, `RestartCount 2`, correct local-date handling).

- **OPS-01 — A missed daily run on the 1st silently drops that period's scheduled surveys.** HIGH · Confidence 90% · non-blocking. `ScheduleCalendar.IsDue` returns false unless `runDate.Day == 1` (`ScheduleCalendar.cs:49`); the scheduler passes today's local date with no look-back/catch-up. If the task misses the calendar 1st entirely, `StartWhenAvailable` re-fires it on the 2nd, zero triggers are due, and a whole month/quarter/year of scheduled surveys is skipped with no alarm — the only failure signal is an exit code from a run that actually ran, so there is no dead-man's-switch. Event triggers (the primary channel) are unaffected. **Should become a go-live condition if scheduled triggers are activated at go-live.** **Remediation:** add a dead-man's-switch (alert if no successful run log by a daily cut-off) and either detect-and-reschedule a missed 1st or process any un-run due period since the last completed run.
- **OPS-02 — No monitoring/alerting delivered or gated.** MEDIUM · Confidence 90% · non-blocking. Observability is explicitly deferred (`phase-3-arch.md:587`); the kit delegates it to QDB (`scheduler/README.md:39`). Failed async trigger/dispatch jobs surface only via the manual Survey Health view; a failing nightly run (postponed release, scheduled triggers, and — once B1/B2 close — retention, which carries PDPPL exposure) goes unnoticed. Checklist C7 is a one-time first-run item, **not** ongoing monitoring, so this is effectively untracked. **Remediation:** add a tracked item to alert on the task's Last Run Result and on new failed/suspended SurveyTrigger/InvitationDispatch jobs, with a named recipient per org; define the p95/suppression-rate/API-error thresholds the architecture flagged.
- **OPS-03 — Scheduler account standing System Administrator.** MEDIUM/HIGH · merged into **SEC-01** (§2, §7). Release-blocking there.
- **OPS-04 — No upgrade/patch path for the unmanaged solution.** MEDIUM · Confidence 88% · non-blocking (affects release 2+). `SurveyEngine_1_0_0_0_onprem_unmanaged.zip` is unmanaged (`<Managed>0</Managed>`); docs cover only first install. Re-importing a newer unmanaged version merges and can never retract a removed/renamed component. Note an undocumented divergence: `phase-3-arch.md` 13.1 still labels the solution "Managed; removable", yet the kit ships unmanaged and removal is a DB restore. **Remediation:** document a release N+1 upgrade/teardown runbook tested on a disposable org; decide whether to move to a managed solution.
- **OPS-05 — Live-org write test scripts have no org-identity guard.** LOW · Confidence 88% · non-blocking. `trigger-speed-test.ps1` authenticates with Windows credentials and disables all InvitationDispatch steps org-wide for the measurement window (`:171-178`); only the RUNBOOK 9.3 "test orgs only" note and the P1/T1 preconditions stop a run against production (and they do stop a casual run before any toggle). A real invitation created during a deliberate production run would be left un-dispatched. The cloud e2e scripts share the pattern but are client-credentials/cloud-only. **Remediation:** add an explicit test-org confirmation/allow-list before any toggle or write.

**DR note:** the on-prem orgs inherit QDB's existing CRM backup/DR regime; the engine adds no store needing separate DR beyond response retention (gated by B1/B2). The one engine-specific DR exposure is that the scheduled task is server-local config not captured in any solution or backup — it must be re-registered (`Register-RunDueSurveysTask.ps1`) on a server rebuild; add this to QDB's server-rebuild notes (folds into OPS-02).

---

## 10. Governance Gaps (ranked)

Release-blocking first.

1. **[BLOCKING] PDPPL classification, retention value & written sign-off undetermined (CMP-01, B1/B2).** *Risk if unaddressed:* a regulated bank processes customer personal data with no agreed lawful basis, classification or retention. *Remediation:* QDB Compliance delivers written classification + retention (set in each org's Survey Settings) + signed PDPPL sign-off; attach to B1/B2.
2. **[BLOCKING] "Anonymisation" leaves responses re-identifiable (CMP-02, B3).** *Risk:* a PDPPL anonymisation claim that is untrue is worse than none. *Remediation:* clear `qdb_source_record_id`/`qdb_source_table` + the invitation customer link on anonymise, or restate B3 with the full re-identifier list; re-verify (B5 scenario C).
3. **[BLOCKING] Retention/erasure covers only responses; no per-customer erasure path (CMP-03).** *Risk:* storage-limitation and erasure/DSAR expectations unmet; survey footprint persists forever. *Remediation:* decide + implement retention for invitations/suppression logs; provide a documented per-customer erasure procedure; fold into B2 scope. *(Untracked — add to the checklist.)*
4. **[BLOCKING] Scheduler account requires System Administrator on both orgs (SEC-01/OPS-03).** *Risk:* compromise of an unattended account = full admin of both banking orgs. *Remediation:* scoped `Survey Scheduler` role, or formal risk-acceptance with compensating controls. *(Untracked — add to the checklist.)*
5. **[BLOCKING] Table-level auditing OFF on all 9 survey tables (AUD-01).** *Risk:* no chain of custody for rule/config changes; tampering untraceable; a regulatory "who changed this and when" is unanswerable. *Remediation:* enable auditing in `manifest.mjs`; verify per org; add a checklist row. *(Untracked.)*
6. **Append-only guard plugin absent / undeclared departure (SEC-03/AUD-02).** *Risk:* NFR-CSE-001 "tamper-proof" is weaker than approved; a sysadmin can edit the log untraced. *Remediation:* build the guard, or record the departure (CEO) and correct the architecture doc.
7. **Over-privileged internet-facing integration account (AUD-03).** *Risk:* feedback-of-record silently overwritable + untraced. *Remediation:* drop unused Write on response/answer.
8. **No lawful basis / do-not-contact mechanism (CMP-04).** *Risk:* PDPPL object/consent exposure once push channels are live. *Remediation:* record lawful basis (B2); build do-not-contact suppression within B4 before secure-link is enabled.
9. **No monitoring/alerting; missed-run blind spot (OPS-02, OPS-01).** *Risk:* failed nightly runs / async jobs / a skipped period go unnoticed; retention failures carry PDPPL exposure. *Remediation:* tracked monitoring item + dead-man's-switch.
10. **Secure-link enable flag has no separation of duties (SEC-02, B4).** *Risk:* B4 is process-only; an admin can switch the channel on. *Remediation:* Read-only on settings + a separate channel-admin write.
11. **Secure-link token + contact data persisted in activity rows, contradicting ADR-004 (CMP-06, B4).** *Risk:* a live single-use token at rest in long-lived activity tables. *Remediation:* cover in the B4 threat model; correct ADR-004 wording.
12. **Data classification incomplete / not PDPPL-aligned (CMP-05, B1).** *Remediation:* classify all nine tables under B1.
13. **No upgrade path for the unmanaged solution (OPS-04).** *Remediation:* release N+1 runbook; architecture doc fix.
14. **Expiry transition not recorded; status views overstate open invitations (AUD-04).** *Remediation:* materialise Expired or filter views.
15. **Survey clone drops scoring config (COD-01).** *Remediation:* carry scoring/render fields on clone + a test.
16. **No written residency control for the EMEA test org (CMP-07, G2).** *Remediation:* one-line control + close G2.
17. **`phase-4-tech.md` missing (AUD-05).** *Remediation:* produce before the Phase 7 gate.

---

## 11. Go-Live Clearance

### CLEARED WITH CONDITIONS

Release 1 may proceed through PR review (A7) and the CEO final gate (A6). It **must not go to production on HL CRM or BFD CRM / QDB1** until the conditions below are met. Conditions 1–5 are **release-blocking**; 6–9 are the standing workflow gates; 10–13 must close before the secure-link channel is ever enabled; 14–16 are strongly recommended before production.

**Release-blocking (must be closed before production on each org):**
1. **CMP-01 (B1/B2):** written PDPPL data-category classification of all nine survey tables, retention period + mode set in each org's Survey Settings, and a signed PDPPL sign-off on file.
2. **CMP-02 (B3):** anonymisation corrected to remove every re-identifier (source pointer + invitation customer link), **or** B3 restated to Compliance with the full re-identifier list; re-verified via B5 scenario C.
3. **CMP-03:** retention/erasure decided and implemented for invitations and suppression logs, plus a documented per-customer erasure/DSAR procedure; folded into the B2 sign-off scope.
4. **SEC-01 / OPS-03:** the `RunDueSurveys` System-Administrator gate replaced with a dedicated least-privilege `Survey Scheduler` role, **or** formally risk-accepted (PAT-005) with compensating controls recorded.
5. **AUD-01:** table-level auditing enabled in provisioning on the config/rule and integrity-sensitive tables, org-level auditing confirmed, and `IsAuditEnabled=true` read back and evidenced per on-prem org.

**Standing workflow / release gates (already in the checklist):**
6. **A1 / A5 / A6 / A7:** QA phase closed, this audit accepted, CEO final decision, PR reviewed and merged to main (main merges need approval).
7. **A2 (NFR-CSE-004):** Gate 1b removability passes on HL test **and** QDB1 test.
8. **A3 (NFR-CSE-006):** trigger p95 < 10 s proven on HL test **and** QDB1 test (cloud showed 14 s then 10 s; the on-prem run is outstanding).
9. **Section C per org:** runbook stages C1–C9 completed on test then production for both HL and QDB1 (including the P3 9.1 Custom-API check and the grid-column census).

**Before the secure-link channel is enabled (not release-1-blocking — channel ships off):**
10. **B4 / NFR-CSE-009 + B5:** token-path threat model (to include CMP-06 activity-row persistence and CMP-04 do-not-contact) and portal rate-limiting in place; ADR-004 wording corrected.
11. **SEC-02:** separation-of-duties control on the `qdb_securelink_enabled` flag.

**Recommended before production (non-blocking):**
12. **AUD-03:** remove unused Write on response/answer from the Survey Integration role.
13. **SEC-03 / AUD-02:** build the append-only guard plugin or record the departure and correct the architecture doc.
14. **OPS-01 (if scheduled triggers are activated at go-live) & OPS-02:** dead-man's-switch + ongoing monitoring/alerting.
15. **COD-01:** fix survey clone to carry weighted-scoring/render config.
16. **CMP-07 (G2)** and **AUD-05 (phase-4-tech.md)** closed as documentation items.

---

## 12. Appendix — Refuted findings

No candidate finding was fully refuted during adversarial verification; all survived. For the record, the verification pass **merged** two duplicates and **adjusted** four:

| Id | Title | Disposition & reason |
|---|---|---|
| OPS-03 | Scheduler account standing System Administrator | **Merged into SEC-01** — same root issue raised by two dimensions. |
| AUD-02 | Append-only guard plugin never built | **Merged into SEC-03** — same code gap; retained the governance (undeclared-departure) framing at MEDIUM. |
| SEC-02 | Secure-link enable flag has no gate | **Adjusted** release-blocking true→false: flag ships off, dual code gate, and no working external path exists at release 1. |
| SEC-04 | not-found vs forbidden distinction | **Adjusted** LOW→INFO: both return HTTP 400; the only reachable principal already holds direct table Read, so value is negligible. |
| CMP-04 | No lawful basis / opt-out | **Adjusted** blocking→false: lawful basis is subsumed by B2 (CMP-01); do-not-contact bites only once a push channel is live. |
| CMP-05 | Classification coarse/incomplete | **Adjusted** MEDIUM→LOW: the two omitted tables hold configuration only; substantive item already a B1 gate. |

---

## VERIFICATION

```
criterion:  The five dimension audits' load-bearing claims — especially the five
            release-blocking findings — hold against the actual code, provisioning
            manifest, shipped config, and the live cloud test org.
command:    1. Read crm-plugins/Qdb.SurveyEngine/Plugins/RunDueSurveysPlugin.cs
              (SEC-01), Data/ResponseWriter.cs + Data/ResponseRetentionStore.cs
              (CMP-02, CMP-03), Integration/InvitationAccess.cs (SEC-02/04, AUD-04),
              Domain/ScheduleCalendar.cs (OPS-01).
            2. grep role grants in provisioning/manifest.mjs (SEC-02/03, AUD-02/03).
            3. wc -l designer/.../NewFormWizardScreen.tsx (COD-02);
               grep qdb_securelink_enabled in onprem-deploy/2026-11-11/config/*.json.
            4. Read-only live query (node --env-file=<dfe .env>, throwaway script in
               scratchpad, GET only via provisioning/lib/dataverse-client.mjs):
               organizations isauditenabled + EntityDefinitions IsAuditEnabled for
               all 9 survey tables (AUD-01).
output:     1. RunDueSurveysPlugin.cs:32 CreateOrganizationService(null) [SYSTEM];
               :33 IsSystemAdministrator(InitiatingUserId) gate — CONFIRMED.
               ResponseWriter.cs:50-51 sets qdb_source_table/qdb_source_record_id on
               every response; ResponseRetentionStore.cs:40-50 Anonymise clears only
               name/customer/answers_json(+answer_text), never the source pointer or
               the invitation link; :37 the only survey-data Delete is on
               qdb_survey_response — CMP-02/CMP-03 CONFIRMED.
               InvitationAccess.cs:33 Forbidden when SecureLinkEnabled false; :56/:58
               NotFound vs Forbidden — SEC-02/SEC-04 CONFIRMED.
               ScheduleCalendar.cs:49 `if (runDate.Day != 1) return false;`, no
               catch-up — OPS-01 CONFIRMED.
            2. manifest.mjs:241 CONFIG_TABLES incl qdb_survey_settings; :243 FULL
               incl Write/Delete; :256 Survey Admin→FULL; :260 Admin Read-only on
               suppression_log; :285 Survey Integration Write on response/answer;
               :286 Create/Read/Append on suppression_log — SEC-02/03, AUD-03 CONFIRMED.
            3. NewFormWizardScreen.tsx = 934 lines — COD-02 CONFIRMED.
               HL.json:45 & BFD.json:43 qdb_securelink_enabled=false — SEC-02
               mitigation CONFIRMED.
            4. "ORG org5869857f isauditenabled= true"; all of
               qdb_survey_setup/trigger/source/settings/invitation/response/answer/
               suppression_log/sms_config "IsAuditEnabled= false canChange= true" —
               AUD-01 REPRODUCED.
result:     PASS — every release-blocking finding and every load-bearing non-blocking
            finding checked was confirmed against primary evidence.
unverified: On-prem HL/QDB1 org state (org-level audit, 9.1 Custom-API support, A2
            removability, A3 trigger p95) — orgs unreachable from here; confirmed only
            that provisioning/the kit never enable table auditing, so on-prem inherits
            it off. The HL contact-customer anonymise path has never run on any org.
            Where QDB's own SMS/email gateway routes personal data is outside MSS scope.
            C# test counts (411/411) accepted from phase-5-qa.md, not re-run.
```

---

*MEMORY-CANDIDATE:* For regulated-client CRM engagements, verify **table-level `IsAuditEnabled`** per entity with a direct `EntityDefinitions` read, not org-level `isauditenabled` — org auditing can be on while every custom table's auditing is off (CanBeChanged=true), leaving rule/config changes with no chain of custody. Provisioning manifests that create tables do not enable auditing by default; it must be set explicitly and read back per target org. (Source: CSE-ENG-001 Phase 6, AUD-01, 2026-11-14.)
