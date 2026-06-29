═══════════════════════════════════════════════════════════════════════
CEO BRD APPROVAL DECISION
═══════════════════════════════════════════════════════════════════════
Project:         DFE-BTN-001 — Tab/Section Buttons, Button Navigation
                 & Final-Submission Parameters
Client:          Qatar Development Bank (QDB)
Reviewed by:     CEO, Maqsad AI
Date:            2026-06-30
BRD Version:     1.0 (Draft — Pending CEO Approval)
Prior phases:    DFE-ADD-001/002 (APPROVED WITH CONDITIONS)
                 DFE-RC-001 (DELIVERED)
                 DFE-i18n-001 (CEO APPROVED WITH CONDITIONS)
                 DFE-STYLE-001 (BRD APPROVED WITH CONDITIONS,
                                Architecture pending)
═══════════════════════════════════════════════════════════════════════


DECISION: APPROVED WITH CONDITIONS
───────────────────────────────────────────────────────────────────────

Architecture (Phase 3) is authorised to begin subject to the eight
conditions below. Conditions C-001, C-002, and C-003 are HARD GATES that
govern the three highest-risk sub-features (External-URL / CallApi
endpoints, the CallApi auth model, and Navigate→Another Form). The rest
of the engagement — tab/section button placement, in-form navigation
(tab / section / next / previous step), FinalSubmit, SaveDraft, and the
full ExtraParams envelope — is cleared to enter architecture now.

The full feature set the client requested (all four action types, all
six navigation targets, all four parameter sources) is APPROVED for v1.
I am NOT trimming scope. Instead I am gating the three parts that carry
real external-attack surface or unresolved cross-surface behaviour, so
that the safe 80% of the engagement is not held hostage to them and the
risky 20% cannot be built until its security/behaviour question is
answered in writing. See the SCOPE CALL section.


JUSTIFICATION
───────────────────────────────────────────────────────────────────────

1. THE BUSINESS CASE IS CREDIBLE AND COMPLETES A KNOWN GAP

   DFE today renders a single form-level action bar (FormActionBar) with
   four fixed actions and submits a flat { formData } body. That is
   adequate for single-screen forms and inadequate for the multi-step
   "wizard" journeys QDB increasingly needs (eligibility → details →
   review → submit). This engagement removes the need for QDB to raise a
   developer change request and hand-write JavaScript every time a form
   needs a "Next Step", "Save & Continue", or "Check Eligibility" button.
   That is a direct, recurring cost removed from QDB's operating model.

2. THE SUBMISSION-CONTEXT CASE IS THE STRONGER HALF

   The ExtraParams envelope (BO-002) addresses a real, quantifiable
   back-office cost: today QDB staff manually look up and attach context
   (who submitted, which form version, which locale, which tenancy
   segment) after every submission. Stamping that authoritatively at the
   backend is high-value and low-visual-risk. This is the part of the
   engagement I am most confident in, and it is correctly designed to
   carry context in a dedicated `extraParams` key rather than polluting
   `formData`, so the existing submission-mapping pipeline is undisturbed.

3. SECURITY SURFACE IS REAL AND THE BRD NAMED IT HONESTLY

   The BRD did not hide the three sharp edges: open-redirect on
   External-URL navigation, SSRF on CallApi endpoints, and client-
   spoofable RuntimeContext. It correctly states that context keys must
   be backend-authoritative, endpoint keys must resolve from a server
   registry (never client URLs), and computed expressions must use the
   safe DSL engine, never raw eval. Because the BRD was honest about
   these, I can gate them precisely rather than reject the whole.

4. BACKWARD COMPATIBILITY IS STRUCTURALLY SOUND

   ScopedButton is additive; existing FormButton records and their
   FormActionBar rendering are untouched; the flat submission body is
   preserved (extra context rides alongside, not inside). Forms with no
   ScopedButton and no ExtraParams behave exactly as today, with zero
   migration. This is the correct compatibility posture.

5. SEQUENCING AGAINST DFE-STYLE-001 IS A MANAGEMENT RISK, NOT A BLOCKER

   DFE-STYLE-001 architecture is still pending and both engagements edit
   the SAME two surfaces: the designer's Tab/Section Properties panels
   and the dual shared-type files (form.types.ts + form.ts). Run
   independently, they will collide. This does not stop DFE-BTN-001 — it
   constrains it. See Condition C-008.


SCOPE CALL (v1 content of DFE-BTN-001)
───────────────────────────────────────────────────────────────────────

APPROVED FOR v1 AND CLEARED TO ENTER ARCHITECTURE NOW:
  • Theme A in full — tab-level and section-level ScopedButton, designer
    Buttons sub-panels on Tab and Section Properties, Dataverse
    persistence, render-cache invalidation, cross-surface rendering.
  • Theme B navigation — Navigate: Tab, Section, Next Step, Previous Step
    (all in-form; no external attack surface).
  • Theme B actions — FinalSubmit and SaveDraft (parity with existing
    form-level behaviour, re-scoped to tab/section buttons).
  • Theme C in full — the ExtraParams envelope with all four sources
    (Static, HiddenField, RuntimeContext, Computed). This is the
    highest-value half of the engagement.

APPROVED FOR v1 BUT HARD-GATED (architecture of these specific
sub-features may not begin until the named condition is resolved):
  • Navigate: External URL ............... gated by C-001 (allowlist)
  • CallApi (action type) ................ gated by C-001 + C-002
  • Navigate: Another DFE Form ........... gated by C-003

RATIONALE FOR GATING RATHER THAN DEFERRING:
  The client asked for the complete set and I am honouring that. But
  three items reach outside the form's own trust boundary — two open the
  app to attacker-controlled destinations (External URL, CallApi) and one
  has undefined behaviour on two of our four runtimes (Another Form on
  mobile and inside the CRM model-driven container). Building any of them
  before its question is answered is how an open-redirect or an SSRF
  ships. Gating lets the architect design Themes A, C, and in-form
  navigation immediately while these three wait for a one-paragraph
  answer each.


CONDITIONS (all eight must be met before Phase 3 is approved)
───────────────────────────────────────────────────────────────────────

CONDITION C-001 — SINGLE ADMIN-MANAGED ALLOWLIST (HARD GATE)
Owner: QDB IT Director (governance) + Architect (mechanism)
Gate: Architecture of Navigate:ExternalURL and of CallApi may not begin
until resolved. Resolves OQ-004.

There must be ONE allowlist source, admin-managed, NOT designer-editable.
A form designer must never be able to add a destination domain or a
backend endpoint to the trusted set — that is an IT governance decision
under a dedicated CRM security role, exactly as the CSS allowlist was
governed in DFE-STYLE-001. The architect must define: (a) the storage
(reuse the DFE-STYLE-001 allowlist-config pattern or a sibling entity),
(b) that both External-URL destinations AND CallApi endpoint keys resolve
against this single source server-side, and (c) that no client-supplied
URL is ever honoured — the client sends an endpoint KEY, the backend
resolves the URL. This closes both open-redirect and SSRF in one design.

CONDITION C-002 — CALLAPI AUTHENTICATION MODEL (HARD GATE)
Owner: Architect (with QDB IT Director sign-off)
Gate: CallApi architecture may not begin until resolved. Resolves OQ-005.

A mid-form CallApi crosses a trust boundary mid-session. The architect
must specify exactly what credential the call carries (the end user's
session token, a service principal, or a scoped delegated token), whether
the call can reach cross-tenant resources, and how failure/timeout is
surfaced to the user without leaking backend detail. This is technical
but security-load-bearing, so it carries IT Director sign-off.

CONDITION C-003 — NAVIGATE:ANOTHER FORM CROSS-SURFACE BEHAVIOUR (HARD GATE)
Owner: Architect + Mobile Developer
Gate: Architecture of the Another-Form sub-target may not begin until
resolved. Resolves OQ-002.

"Load a different form by formCode in the same session" is well-defined
on the Next.js portal and undefined on (a) React Native, where it implies
a navigation-stack push and unsaved-state handling, and (b) the CRM
model-driven container, where the host form context constrains what
"navigate to another form" can even mean. The architect and mobile
developer must define the behaviour on all four surfaces (including
what happens to unsaved data in the current form) before this sub-target
is designed.

CONDITION C-004 — RUNTIMECONTEXT IS BACKEND-AUTHORITATIVE (Phase 3 deliverable)
Owner: Architect
Gate: Phase 3 output must specify this; it does not block starting.

The architecture must enumerate the EXACT set of context keys the backend
stamps authoritatively and OVERRIDES unconditionally regardless of any
client-supplied value: at minimum userId, userDisplayName, formId,
formCode, formVersion, submittedAt, sessionId, and any tenancy segment.
The design must state plainly that for these keys the client value is
discarded, not merged. A client that sends userId='admin' must not be
able to influence the persisted record. Locale MAY be client-asserted but
must be validated against the form's supported set.

CONDITION C-005 — COMPUTED-EXPRESSION SANDBOX (Phase 3 deliverable)
Owner: Architect
Gate: Phase 3 output must include this design. Addresses RISK-002.
Defers OQ-001 to the architect (see rulings).

The architect must (a) confirm whether the existing safe DSL/custom
expression engine already supports the operators ExtraParams Computed
needs (string concat, basic arithmetic, field reference, conditional) or
whether a bounded extension is required, (b) prohibit raw eval/Function,
(c) impose a per-expression evaluation timeout (BRD proposed 50ms — accept
as the ceiling) and a maximum expression count per submission, and (d)
evaluate expressions SERVER-SIDE on submit, never trusting a client-
computed value for a Computed param. If the existing engine is
insufficient, the build-vs-extend decision must be documented per the
dependency-adoption policy.

CONDITION C-006 — SHARED-TYPE CONSISTENCY CI CHECK (hard deliverable)
Owner: Architect (design) + Backend/Build (implementation)
Gate: Must ship within this engagement. Addresses RISK-003.

The dual shared-type files (shared/src/types/form.types.ts and
shared/src/types/form.ts) diverging is a known recurring defect in this
codebase. This engagement must deliver an automated CI check that fails
the build if the ScopedButton / ExtraParams / action-type definitions
drift between the two files. This is not optional polish — it is the
mechanism that keeps four runtimes honest to one contract, and it is a
named deliverable assessed at Phase 7.

CONDITION C-007 — EXTRAPARAMS PERSISTENCE & SIZE CAP (Phase 3 deliverable)
Owner: Architect (with CRM Developer input on OQ-008)
Gate: Phase 3 output must specify this. Defers OQ-007 to the architect.

The architect decides JSON column on qdb_form_submission_log vs. a child
entity (OQ-007), but the decision must be informed by the on-prem memo-
column size ceiling (OQ-008 — the CRM Developer must measure this before
Phase 3 concludes). A hard size cap on the resolved ExtraParams payload
(BRD proposed 64KB) must be enforced at the backend boundary, and the
audit store must be append-only.

CONDITION C-008 — COORDINATE WITH DFE-STYLE-001 (process / sequencing)
Owner: Maqsad AI PM + Architect
Gate: Does not block starting BTN-001 architecture, but the two
engagements must share one plan for the contended surfaces.

DFE-BTN-001 and DFE-STYLE-001 both modify the designer Tab/Section
Properties panels and both extend the dual shared-type files. The
architect must produce a SINGLE shared-type extension plan covering both
engagements' additions, and the build sequence must avoid two developers
editing form.types.ts / form.ts and the Tab/Section property panels in
conflicting ways. BTN-001 architecture proceeds in parallel; BTN-001
designer BUILD on those panels must be sequenced against STYLE-001's.


RULINGS ON OPEN QUESTIONS
───────────────────────────────────────────────────────────────────────

OQ-001 (Computed DSL engine sufficiency) — DEFERRED TO ARCHITECT. Folded
   into C-005. Purely technical; the architect owns the build-vs-extend
   call and documents it.

OQ-002 (Navigate:AnotherForm resolution) — CEO RULING: HARD-GATED under
   C-003. Must be answered across all four surfaces before that sub-
   target is designed. Escalated to Architect + Mobile.

OQ-003 (mobile section-scroll applicability) — DEFERRED TO ARCHITECT /
   MOBILE. Non-blocking. Document the mobile behaviour; if the mobile app
   uses a flat scroll, Navigate:Section maps to a scroll-to-anchor and
   that is acceptable.

OQ-004 (allowlist governance & ownership) — CEO RULING: ONE allowlist,
   ADMIN-MANAGED (IT-only) under a dedicated CRM security role, NOT
   designer-editable. Codified as C-001. Escalated to QDB IT Director.

OQ-005 (CallApi auth token) — HARD-GATED under C-002. Technical design
   owned by the Architect but carries QDB IT Director sign-off because it
   is security-load-bearing.

OQ-006 (blocking navigation on incomplete prior tabs) — CEO RULING: make
   it a PER-BUTTON configurable flag (requiresPreviousTabsComplete),
   DEFAULT OFF (non-blocking) for v1. QDB designers opt in per form. This
   removes the open question without adding a global policy. Non-blocking
   on approval.

OQ-007 (ExtraParams persistence: JSON column vs child entity) — DEFERRED
   TO ARCHITECT. Folded into C-007; decision informed by OQ-008.

OQ-008 (on-prem CRM memo column size ceiling) — ASSIGNED TO CRM
   DEVELOPER, to be measured and reported before Phase 3 concludes. Feeds
   C-007's persistence and cap decision.


WHAT IS AUTHORISED TO BEGIN NOW
───────────────────────────────────────────────────────────────────────
The following architecture work may begin immediately:

- ScopedButton schema + Dataverse persistence design (placement scope +
  FK to tab/section, additive to existing button storage)
- Designer Tab/Section "Buttons" sub-panel component design (coordinated
  with C-008)
- In-form navigation design: Tab / Section / Next Step / Previous Step
  (including the per-button requiresPreviousTabsComplete flag from OQ-006)
- FinalSubmit + SaveDraft re-scoping to tab/section buttons
- The full ExtraParams envelope design (Static / HiddenField /
  RuntimeContext / Computed) including C-004 authoritative-stamp list and
  C-005 sandbox
- Shared-type extension contract for both files + the C-006 CI check
- Render-cache invalidation via qdb_publish_job (DFE-RC-001 pattern)

The following architecture work must wait for its hard gate:

- Navigate:ExternalURL .......... wait for C-001
- CallApi action ................ wait for C-001 and C-002
- Navigate:AnotherForm .......... wait for C-003


WHAT MUST NOT BEGIN UNTIL CONDITIONS ARE MET
───────────────────────────────────────────────────────────────────────
No Phase 4 build (designer, frontend, mobile, CRM, backend) may begin
until Phase 3 Architecture is approved, and Phase 3 approval requires all
eight conditions resolved or delivered. Specifically, no build of
External-URL navigation, CallApi, or Another-Form navigation may start
until C-001 / C-002 / C-003 respectively are answered in writing.


SUCCESS CRITERIA FOR PHASE 7 FINAL APPROVAL
───────────────────────────────────────────────────────────────────────
1. A spoofed client RuntimeContext (userId/tenant/formVersion) is proven
   in QA to be overridden by the backend — zero successful spoofs (C-004).
2. The single admin-managed allowlist is proven to block a non-listed
   External-URL destination and a non-listed CallApi endpoint key, with
   no client-supplied URL ever honoured (C-001) — zero open-redirect,
   zero SSRF in the Phase 6 audit.
3. Computed expressions cannot execute arbitrary code and respect the
   per-expression timeout (C-005) — explicit Phase 6 injection cases.
4. The shared-type CI check (C-006) is live and demonstrably fails the
   build on an induced divergence between form.types.ts and form.ts.
5. Backward compatibility verified: a pre-engagement form with only
   form-level buttons and a flat submission renders and submits
   unchanged, zero migration.
6. Cross-surface parity: tab/section buttons and the ExtraParams envelope
   behave identically on portal, mobile, and on-prem CRM runtime for
   every action type shipped.


═══════════════════════════════════════════════════════════════════════
SIGNED OFF
Role:      CEO, Maqsad AI
Decision:  APPROVED WITH CONDITIONS (8 conditions; 3 hard gates)
Scope:     Full feature set approved for v1; External-URL, CallApi, and
           Another-Form navigation hard-gated on C-001/C-002/C-003
Date:      2026-06-30
Engagement: DFE-BTN-001
═══════════════════════════════════════════════════════════════════════
