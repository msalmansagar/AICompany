═══════════════════════════════════════════════════════════════════════
CODE REVIEW — PHASE 4
═══════════════════════════════════════════════════════════════════════
Project:    DFE-BTN-001 — Tab/Section Buttons, Navigation & Submission Params
Reviewer:   Maqsad AI (conducted by orchestrator after the review subagent
            failed on an infrastructure stall)
Date:       2026-06-30
Scope:      git diff feat/dfe-style-001...feat/dfe-btn-001 (5 commits)
Verdict:    APPROVE WITH FIXES — 4 must-fix before Phase 5 QA
═══════════════════════════════════════════════════════════════════════

NOTE ON INDEPENDENCE: this review was authored by the same agent that wrote
the code (the dedicated code-reviewer subagent stalled three times). It is
therefore a self-review and should be treated as lower-assurance than an
independent pass. The findings below are real and were sought adversarially.


SECURITY / CORRECTNESS VERDICTS (the conditions held)
───────────────────────────────────────────────────────────────────────
C-004 (context spoofing) — PASS. RuntimeContext values resolve only from the
  server-built SubmissionRuntimeContext (ExtraParamsAssemblyService.resolveContext);
  client formData/extraParams cannot reach a context key. The unit test
  `runtimeContext_cannot_be_spoofed_by_client_formData` proves it.
C-005 (sandbox) — PASS. No eval/Function; the op budget threads through the
  existing AST evaluator; backward-compatible (243 backend + 173 frontend tests
  green, incl. ValidationEngine/RuleEngine). Caveat m1 below.
C-007 (size cap) — PASS. assertWithinSizeLimit runs after all specs (incl.
  computed expansion) resolve and before the value leaves the service.
ADR-BTN-005 (trust model) — PASS. The submit route reads the button spec from
  the published form (findFinalSubmitButton), never from the client body.
Backward compatibility — PASS. Buttons are additive-optional; submit without
  submitButtonId yields zero params; button-less forms are unchanged.


BLOCKER
───────────────────────────────────────────────────────────────────────
(none)


MAJOR (must fix before QA)
───────────────────────────────────────────────────────────────────────
M1 — House rule violation: functions exceed the 3-parameter limit.
   common.md: "Max 3 parameters. More than 3 → use a parameter object."
   • ExtraParamsAssemblyService.resolveOne(spec, formData, context, expressionContext)
     — 4 params (ExtraParamsAssemblyService.ts).
   • buildSubmissionRuntimeContext(form, user, formCode, correlationId)
     — 4 params (forms.routes.ts).
   Fix: collapse each to a parameter object.

M2 — parseAction trusts the action JSON shape (validation gap at a boundary).
   ButtonAssembler.parseAction parses the JSON memo, forces `.type`, defaults
   finalSubmit.extraParams, and casts `as unknown as ScopedButtonAction`. A
   parseable-but-malformed config (navigate without `target`, callApi without
   `endpointKey`) passes through unvalidated. common.md: "Input validation at
   every boundary." Fix: validate per action type (a small guard or a Zod
   schema per action) and drop the button if invalid, consistent with the
   existing drop-and-log behaviour.

M3 — fetchScopedButtons swallows ALL errors as "no buttons".
   CrmMetadataService.fetchScopedButtons catches every error and returns empty
   indexes. That is correct for a 404 (entity not provisioned yet) but WRONG
   for a transient Dataverse error: a form that HAS buttons would silently
   render without them. common.md: "Never silently ignore an error." Fix:
   treat 404/entity-not-found as the expected empty case; rethrow (or surface)
   other errors so a real failure is not masked as a button-less form.

M4 — Test gaps on the wiring (not just the pure logic).
   Well-covered: ExtraParamsAssemblyService, ButtonAssembler.mapRawButton,
   scopedButtonNavigation. NOT covered:
   • The submit-route extra-params path (submitButtonId → resolved envelope,
     400/413 mapping) — no route-level test.
   • The dispatch hook useScopedButtonAction (finalSubmit→submitForm(id),
     saveDraft, section scroll) — only the pure index resolver is tested.
   Fix: add a submit-route integration test and a hook/dispatch test before QA.


MINOR
───────────────────────────────────────────────────────────────────────
m1 — The op budget is dominated by the length cap. Since the DSL has no loops,
   ops ≈ characters; with MAX_EXPRESSION_OPS = MAX_EXPRESSION_LENGTH = 1000 the
   op guard almost never fires before the length cap. Either lower the op cap to
   make it an independent guard, or document that length is the effective bound.
m2 — Gated-action buttons render and no-op on click (only a logger.warn).
   externalUrl/callApi/anotherForm buttons would render and do nothing visible
   to a user. Until those actions are enabled, disable them or show an
   "unavailable" affordance. (No such buttons can exist yet — no designer write
   path — so this is latent, but fix before the designer slice ships.)
m3 — check-shared-type-sync.mjs robustness. The regex extraction (non-greedy
   `\n}` for interfaces, `|` split for unions) is reliable for the CURRENT flat
   types and is proven to catch appended-field drift, but is brittle for future
   nested types, and only covers the hardcoded SYNCED_TYPES list (a new shared
   button type must be added manually). Harden or document the envelope.
m4 — Type assertions `as unknown as ScopedButtonAction` bypass type safety at
   the parse boundary (pairs with M2; fixing M2 with a guard removes this).
m5 — provision-button-schema.mjs lookups use Delete:RemoveLink for the form
   relationship → orphan button records when a form is deleted. Consider Cascade
   for the form lookup.
m6 — buildSubmissionRuntimeContext hardcodes locale:'en'; the RuntimeContext
   `locale` param will not reflect the user's actual locale. Wire from the
   request locale (validated) when available.


NIT
───────────────────────────────────────────────────────────────────────
n1 — forms.routes.ts resolves resolvedExtraParams but only logs it (persistence
   is G-2-gated). Ensure the G-2 slice actually wires it to the audit write;
   today it is effectively unused after logging.


MUST-FIX BEFORE PHASE 5 QA
───────────────────────────────────────────────────────────────────────
M1 (param objects — house rule), M2 (action validation), M3 (error handling),
M4 (wiring tests). M2 and M3 are correctness/robustness; M1 is a non-negotiable
standard; M4 closes the test gap QA would otherwise inherit. Minors can be
folded in opportunistically or tracked.

VERDICT: APPROVE WITH FIXES.
═══════════════════════════════════════════════════════════════════════


RESOLUTION — fixes applied 2026-06-30
───────────────────────────────────────────────────────────────────────
M1 — DONE. resolveOne now takes one ResolutionContext object;
     buildSubmissionRuntimeContext takes one RuntimeContextInput object.
M2 — DONE. ButtonAssembler.isValidActionConfig validates per action type
     (navigate target + required sub-field, callApi endpointKey+method,
     finalSubmit extraParams array); invalid configs are dropped. 4 tests added.
M3 — DONE, but resolved BETTER than "rethrow". Rethrowing broke whole-form
     loads when the buttons sub-query failed (and broke 5 existing tests). Final
     behaviour: always degrade to no buttons (form stays available), but log a
     404 at INFO (expected, unprovisioned) and any other error at ERROR
     (alertable — no longer a silent/indistinguishable warn). This satisfies the
     "surface, don't hide" intent without sacrificing form availability.
M4 — DONE. Added forms.routes.submit.test.ts (5 cases: 201 happy path,
     400 invalid expression, 413 oversized, 201 no-buttonId, 201 unknown-buttonId)
     and useScopedButtonAction.test.tsx (7 cases: finalSubmit/saveDraft/nextStep/
     tab/section-scroll/callApi-gated/externalUrl-gated).

Post-fix verification: backend 252 tests pass, frontend 180 pass, all packages
typecheck clean, C-006 parity gate green. Minors m1-m6/n1 tracked for follow-up.
═══════════════════════════════════════════════════════════════════════
