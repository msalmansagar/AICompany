═══════════════════════════════════════════════════════════════════════
SECURITY & GOVERNANCE AUDIT — PHASE 6
═══════════════════════════════════════════════════════════════════════
Project:   DFE-BTN-001 — Tab/Section Buttons, Navigation & Submission Params
Client:    Qatar Development Bank (QDB)
Auditor:   Maqsad AI (authored by orchestrator after the audit subagent
           stalled at the write step — same infra issue as CEO/reviewer)
Date:      2026-06-30
Scope:     git diff feat/dfe-style-001...feat/dfe-btn-001 (8 commits) +
           BRD/arch/review/QA docs
Risk posture (shipped v1, cleared scope): LOW
═══════════════════════════════════════════════════════════════════════

NOTE ON INDEPENDENCE: authored by the same agent that wrote the code (the
dedicated auditor subagent stalled). Lower assurance than an independent
pass; findings were sought adversarially.


METHOD
───────────────────────────────────────────────────────────────────────
Reviewed the committed implementation against the BRD security NFRs
(NFR-006 sandbox; allowlist/SSRF/open-redirect), the CEO conditions
(C-001/004/005/006/007) and the gate boundaries (G-1/G-2/G-3). Probed the
computed-expression path for sandbox escape, the submission path for context
spoofing, and the logging/persistence path for data exposure.


VERIFIED SECURE (confirmations)
───────────────────────────────────────────────────────────────────────
V-1  NO eval / Function anywhere in the computed path (C-005 / NFR-006).
     shared/src/engines/ExpressionEngine.ts is a hand-written lexer/parser/
     AST-evaluator. evalCall dispatches a FIXED switch of named builtins
     (len/upper/lower/trim/concat/substr/round/.../formatDate); there is no
     dynamic invocation of arbitrary values. ExpressionEngineServer bounds it
     with maxOps=1000, a 50ms wall-clock check, and a 1000-char length cap.
     The evaluator reads only from the passed ExpressionContext (formData
     coerced to primitives) — no process/fs/network/Dataverse-SDK access.

V-2  Context spoofing is structurally prevented (C-004).
     ExtraParamsAssemblyService.resolveContext reads RuntimeContext values
     ONLY from the server-built SubmissionRuntimeContext (forms.routes.ts
     buildSubmissionRuntimeContext, sourced from req.user). The per-spec
     resolver never reads client values for a runtimeContext key. Unit test
     runtimeContext_cannot_be_spoofed_by_client_formData confirms it.

V-3  No live SSRF / open-redirect surface in v1 (C-001 / G-1).
     There is NO backend call-api route, NO external-URL resolution, and the
     frontend hook (useScopedButtonAction) treats externalUrl/callApi (and
     anotherForm) as log-and-no-op. No code path accepts a client-supplied URL
     or endpoint. The DESIGN (client sends a KEY; backend resolves against an
     IT-managed registry) would close SSRF+open-redirect together when G-1 ships.

V-4  Size cap enforced after expansion (C-007 / FR-043). assertWithinSizeLimit
     runs after all specs (incl. computed) resolve; >64KB → HTTP 422.

V-5  Computed errors fail-open to null without leaking internals (FR-042).
     evaluateComputed logs only error.message (a design-time expression error,
     not user PII) and substitutes null; the submission proceeds.

V-6  Shared-type parity is build-gated (C-006). check-shared-type-sync.mjs
     fails the build on drift (proven by an induced-drift test).

V-7  Provisioning script holds no secrets. provision-button-schema.mjs reads
     DV_* from env with a REQUIRED_ENV guard; nothing hardcoded.

V-8  Submission logging does NOT emit param VALUES. forms.routes.ts logs only
     Object.keys(resolvedExtraParams) — no hidden-field/computed PII in logs.


FINDINGS
───────────────────────────────────────────────────────────────────────
SEC-01 — Medium — No maximum computed-expression / param-count limit (DoS).
  Evidence: ExtraParamsAssemblyService.resolve iterates all specs with no
  count limit; the 64KB cap bounds OUTPUT size, not CPU. ADR-BTN-006 specified
  "max 25 computed params per submission" but it is NOT implemented. A button
  configured with thousands of computed params (each up to 50ms) could consume
  large CPU before the size cap trips.
  Mitigant: the spec comes from the PUBLISHED form (admin-authored), not the
  client — so this is an insider/careless-designer risk, not a public DoS.
  Remediation: enforce the documented max (25) computed params (and a total
  param cap) in resolve(); reject the spec or truncate-and-log. Quick fix.

GOVGAP-01 — Medium — Endpoint/allowlist IT-governance role not yet shipped.
  The qdb_api_endpoint registry + its dedicated IT-only CRM security role
  (mirroring qdb_css_allowlist_admin.xml) are designed but not provisioned —
  correctly gated by G-1. MUST be created and write-restricted to IT before
  CallApi/External-URL is enabled, else a designer could add an
  attacker-controlled destination. Track as a G-1 release blocker.

GOVGAP-02 — Medium — ExtraParams persistence (FR-044) deferred; PII/residency.
  Persistence to qdb_form_audit_log is G-2-gated; resolved values are currently
  not stored. When G-2 ships, the JSON envelope WILL contain hidden-field and
  computed values (potential PII). Requirements for that slice: append-only
  audit, access governed by role, and explicit data-residency confirmation
  (same as the submission record). Track as a G-2 design requirement.

SEC-02 — Low — Expression field reference can read inherited object properties.
  Evidence: evalNode 'field' returns ctx[node.name]; toExpressionContext builds
  a plain object, so {__proto__}/{constructor}/{toString} resolve to the
  inherited value rather than null. No code execution results (the builtin
  dispatch is by fixed name, not by value), so this is not RCE — at worst a
  coerced "[object Object]". Remediation: build the context with
  Object.create(null) or guard field reads with Object.hasOwn.

GOVGAP-03 — Low — BR-002 validation-summary UI not implemented.
  Navigation is correctly BLOCKED when preceding required fields are incomplete
  (DEF-003 fix), but the BRD's "display a validation summary instead" is not
  surfaced (needs a FormContext validation hook). Functional/UX, not security.

SEC-03 — Low — Non-404 button-fetch errors log the full error object.
  CrmMetadataService.fetchScopedButtons logs { error, formId } at ERROR; the
  error may carry Dataverse response detail. Server-side only (not client-
  facing). Consider logging error.message rather than the whole object.

INFO-01 — On-prem parity pending. When the on-prem FormJsonGenerator.cs join
  ships, the same sandbox/allowlist/cap guarantees MUST hold in that runtime
  (it generates JSON server-side and evaluates differently). Re-audit then.


CONDITION / NFR VERDICTS
───────────────────────────────────────────────────────────────────────
  C-001 allowlist / SSRF / open-redirect ... SATISFIED (gated; GOVGAP-01 @ G-1)
  C-004 context authoritative ............... SATISFIED (V-2)
  C-005 expression sandbox .................. SATISFIED (V-1; harden SEC-01/02)
  C-006 shared-type parity CI ............... SATISFIED (V-6)
  C-007 size cap ............................ SATISFIED (V-4)
  NFR-006 sandbox isolation ................. SATISFIED (V-1)


RISK SUMMARY & MUST-REMEDIATE
───────────────────────────────────────────────────────────────────────
Overall posture for the SHIPPED v1 (cleared scope): LOW. The high-risk
surfaces (SSRF, open-redirect, mid-form API calls) are gated and have NO live
code path; context spoofing and the expression sandbox are sound.

Before production / as gates open:
  1. SEC-01 — enforce the max computed-param count (quick; do before any
     wider rollout). [open now]
  2. GOVGAP-01 — ship + write-restrict the qdb_api_endpoint IT role. [at G-1]
  3. GOVGAP-02 — append-only persistence + PII/residency review. [at G-2]
  4. SEC-02 / SEC-03 — defence-in-depth hardening (null-proto context;
     trimmed error logging). [opportunistic]
  5. GOVGAP-03 — validation-summary UI. [functional follow-up]
  6. INFO-01 — re-audit the on-prem runtime when that slice lands.

No Critical or High findings against the shipped scope.

───────────────────────────────────────────────────────────────────────
REMEDIATION — applied 2026-06-30
───────────────────────────────────────────────────────────────────────
SEC-01 — FIXED. ExtraParamsAssemblyService.assertWithinCountLimits now rejects
  (HTTP 422) a submission whose button spec has > MAX_TOTAL_EXTRA_PARAMS (50)
  params or > MAX_COMPUTED_PARAMS (25) computed params, BEFORE any evaluation —
  closing the count/CPU DoS vector and conforming to ADR-BTN-006. Both limits
  are env-tunable. +2 tests; backend 254 tests green.
GOVGAP-01/02 remain gated to G-1/G-2; SEC-02/03 + GOVGAP-03 + INFO-01 tracked.

═══════════════════════════════════════════════════════════════════════
SIGNED OFF — Auditor, Maqsad AI — 2026-06-30 — Engagement DFE-BTN-001
Verdict: PASS WITH MEDIUM FINDINGS — SEC-01 (only open-now item) REMEDIATED;
         remaining items gated by G-1/G-2 or tracked as Low.
═══════════════════════════════════════════════════════════════════════
