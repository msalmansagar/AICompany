═══════════════════════════════════════════════════════════════════════
CEO ARCHITECTURE GATE DECISION (Phase 3 → Phase 4)
═══════════════════════════════════════════════════════════════════════
Project:         DFE-BTN-001 — Tab/Section Buttons, Button Navigation
                 & Final-Submission Parameters
Client:          Qatar Development Bank (QDB)
Reviewed by:     CEO, Maqsad AI
Date:            2026-06-30
Inputs:          phase-3-arch-buttons.md (architecture, DRAFT)
                 brd-buttons-approval.md (8 conditions, 3 hard gates)
═══════════════════════════════════════════════════════════════════════


DECISION: APPROVED FOR PHASE 4 (BUILD) — WITH HARD GATES
───────────────────────────────────────────────────────────────────────
The architecture satisfies all eight BRD-approval conditions in design.
Build (Phase 4) is authorised to begin immediately on the non-gated
scope. Three sub-features — CallApi, Navigate:ExternalURL, and the final
ExtraParams persistence storage choice — remain behind hard gates that
require a QDB sign-off or a measurement before their build starts. The
rest of the engagement is cleared.


ASSESSMENT OF THE ARCHITECTURE
───────────────────────────────────────────────────────────────────────
1. The design is grounded in the real codebase, not assumed. It correctly
   builds on the existing FormButton/FormActionBar (untouched),
   TabDefinition/SectionDefinition, the real hand-written ExpressionEngine
   (no eval), the actual submit route, and the DFE-STYLE-001 allowlist
   pattern. Component changes are mapped to concrete file paths. This is
   buildable, not aspirational.

2. The security model is sound and consolidated. A single key-not-URL
   indirection (qdb_api_endpoint, client sends endpointKey) closes
   open-redirect and SSRF together (C-001). Authoritative server-side
   stamping of context keys makes spoofing structurally impossible
   (C-004). The expression path reuses the existing engine with a
   step-count guard rather than introducing eval or a new dependency
   (C-005). I am satisfied these are designed in, not bolted on.

3. The one genuinely open question — Navigate:AnotherForm across four
   surfaces (C-003) — is resolved with an explicit, per-surface behaviour
   including a documented degradation on the constrained on-prem CRM
   container. That is the correct way to close a cross-surface unknown.

4. Backward compatibility is structurally guaranteed: additive optional
   types, buttons default to empty, submit without a button id resolves
   to zero extra params. Zero migration. Confirmed.

5. The architect's own Skeptic section (8 challenges) is a credit, not a
   demerit — it surfaces the real build risks before a line of code is
   written. Three of them are elevated to Phase 4 entry conditions below.


CONDITION SATISFACTION (carried from brd-buttons-approval.md)
───────────────────────────────────────────────────────────────────────
  C-001 allowlist / SSRF / open-redirect ...... SATISFIED IN DESIGN
  C-002 CallApi auth model .................... SATISFIED IN DESIGN (needs sign-off, G-1)
  C-003 Navigate:AnotherForm cross-surface .... SATISFIED IN DESIGN
  C-004 RuntimeContext backend-authoritative .. SATISFIED IN DESIGN
  C-005 computed-expression sandbox ........... SATISFIED IN DESIGN
  C-006 shared-type CI parity check ........... SATISFIED IN DESIGN (named deliverable)
  C-007 ExtraParams persistence + 64KB cap .... SATISFIED IN DESIGN (needs OQ-008, G-2)
  C-008 STYLE-001 coordination ................ SATISFIED IN DESIGN


PHASE 4 ENTRY GATES
───────────────────────────────────────────────────────────────────────
GATE G-1 (HARD) — QDB IT DIRECTOR SIGN-OFF + ENDPOINT SEED
  Owner: QDB IT Director.
  Blocks build of: CallApi action AND Navigate:ExternalURL.
  Required: written confirmation of (a) the CallApi auth model
  (forwarded end-user Bearer JWT, same-tenant only, 5s timeout) and
  (b) the admin-only allowlist governance under a dedicated CRM security
  role; plus seeding of the initial qdb_api_endpoint records in staging.
  Rationale: these two sub-features are the only ones that reach outside
  the form's trust boundary; they may not be built until the people who
  own the destinations have signed off and populated the registry.

GATE G-2 (HARD) — ON-PREM MEMO CEILING MEASUREMENT (OQ-008)
  Owner: Maqsad AI CRM Developer.
  Blocks finalisation of: ExtraParams persistence storage.
  Required: measure the actual on-prem memo/nvarchar(max) practical
  ceiling and confirm the 64KB cap is safe on the qdb_form_audit_log
  JSON column, or trigger the documented child-entity fallback. The cap
  is env-tunable, so this is a measurement, not a redesign — but it must
  be done before the persistence path is locked.

GATE G-3 (SOFT) — MOBILE SCROLL-TO-SECTION (OQ-003)
  Owner: Maqsad AI Mobile Developer.
  Blocks build of: mobile Navigate:Section only.
  Required: confirm scroll-to-section is available in the RN renderer;
  if not, Navigate:Section degrades to a no-op-with-warning on mobile,
  documented. Non-blocking for the rest of the engagement.


THREE SKEPTIC CHALLENGES ELEVATED TO PHASE 4 PRE-BUILD RESOLUTION
───────────────────────────────────────────────────────────────────────
These must be answered in the Phase 4 build plan BEFORE coding the
affected component:
  S-1 (Challenge 1) Allowlist cache-invalidation window — AllowlistRepository
      caches qdb_api_endpoint for 5 minutes. Define what happens when IT
      revokes an endpoint: maximum exposure window, and whether a manual
      cache-flush hook is needed (mirror the DFE-STYLE-001 revocation SLA).
  S-2 (Challenge 6) ExtraParams size-check / rollback sequencing — the
      64KB cap must be enforced AFTER computed-expression evaluation (a
      cheap input can expand), and the deploy/rollback order for the new
      audit column must be schema-first. Specify both in the build plan.
  S-3 (Challenge 8) AuditLogEntry.eventType union exhaustiveness — adding
      a new event type must not break existing exhaustive switch
      statements. Enumerate every switch over eventType and confirm a
      safe default branch before extending the union.


WHAT IS CLEARED TO BUILD NOW
───────────────────────────────────────────────────────────────────────
  - Shared-type additions in BOTH form.types.ts and form.ts + the C-006
    ts-morph parity CI check (build this FIRST; it guards everything after)
  - qdb_form_scoped_button / qdb_form_button schema + designer Buttons
    sub-panel on Tab and Section properties (single merged accordion add,
    coordinated with STYLE-001 per C-008)
  - In-form navigation: tab / section / nextStep / previousStep
    (incl. requiresPreviousTabsComplete, default off)
  - FinalSubmit + the full ExtraParams envelope assembly/stamp/evaluate
    pipeline (Static / HiddenField / RuntimeContext / Computed), backend
    ExtraParamsAssemblyService + ExpressionEngineServer
  - SaveDraft re-scoped to tab/section buttons
  - On-prem FormJsonGenerator.cs join for buttons; cache embed

WHAT MUST NOT BUILD UNTIL ITS GATE CLEARS
───────────────────────────────────────────────────────────────────────
  - CallApi (CallApiProxyService, /call-api route) ........ wait for G-1
  - Navigate:ExternalURL .................................. wait for G-1
  - Final lock of ExtraParams storage choice ............. wait for G-2
  - Mobile Navigate:Section .............................. wait for G-3


PROCESS NOTES
───────────────────────────────────────────────────────────────────────
1. GITHUB-RESEARCH STEP — formally waived for this engagement. The
   architecture reuses in-house components (the existing ExpressionEngine
   and the STYLE-001 allowlist pattern) and introduces no third-party
   library. The architect's no-adoption conclusion is ratified; the
   dependency-policy obligation is met by documenting the reuse decision.

2. DOWNSTREAM PHASES UNCHANGED — Phase 4 build is followed by Code Review,
   then QA (Phase 5), then Audit (Phase 6), then CEO Final (Phase 7). The
   security mechanisms (G-1, S-1) and the spoof/injection defences
   (C-004/C-005) become explicit QA and audit test cases.


SUCCESS CRITERIA FOR PHASE 7 FINAL APPROVAL (recorded now)
───────────────────────────────────────────────────────────────────────
  1. A spoofed client RuntimeContext is overridden by the backend — zero
     successful spoofs (C-004).
  2. A non-registered endpointKey / non-allowlisted URL is rejected —
     zero open-redirect, zero SSRF in the Phase 6 audit (C-001).
  3. Computed expressions cannot exceed the step guard / 50ms ceiling and
     cannot execute arbitrary code (C-005).
  4. The ts-morph parity CI check is live and fails on an induced
     form.types.ts / form.ts divergence (C-006).
  5. A pre-engagement form (form-level buttons, flat submission) renders
     and submits unchanged — zero migration.
  6. Cross-surface parity verified on portal, mobile, and on-prem for
     every shipped action type.


═══════════════════════════════════════════════════════════════════════
SIGNED OFF
Role:      CEO, Maqsad AI
Decision:  APPROVED FOR PHASE 4 (BUILD) WITH HARD GATES
Gates:     G-1 (IT sign-off + endpoint seed), G-2 (OQ-008 measurement),
           G-3 (mobile scroll); S-1/S-2/S-3 resolved in build plan
Date:      2026-06-30
Engagement: DFE-BTN-001
═══════════════════════════════════════════════════════════════════════
