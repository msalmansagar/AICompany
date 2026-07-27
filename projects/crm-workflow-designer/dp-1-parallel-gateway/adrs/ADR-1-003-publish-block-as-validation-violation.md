# ADR-1-003 — The Publish Block Is a Validation Violation, Not a New Gate

**Project:** DP-1 — Parallel (AND) Gateway (CWFD)
**Status:** Accepted
**Date:** 2026-07-26
**Decided by:** Architect — MSS Technologies
**Implements:** CEO Phase-1 ruling on OQ-1 / OQ-2, condition C-1

---

## Context

The CEO ruled that a process containing a parallel region must not be publishable — a hard
block, not an acknowledgement checkbox — because the CRM execution layer's behaviour on
multi-successor steps is unknown to CWFD (OQ-1). C-1 makes the block a required deliverable
and requires the audit to confirm it cannot be bypassed.

`usePublish` already validates before doing anything and refuses on any error-severity
violation:

```ts
const hasBlockingErrors = newViolations.some((v) => v.severity === 'error');
if (hasBlockingErrors) { setError('Validation failed…'); return; }
```

That check runs before `assertGuid`, before versioning, before any adapter call.

---

## Decision

**Implement the block as a new error-severity `ViolationCode`,
`PARALLEL_NOT_EXECUTABLE`, emitted by `ValidationService` whenever any step has
`splitType === 'Parallel'` or `jointype === 'AndJoin'`.**

- Emitted at **process level** — no `nodeId`. It is not a defect in any particular step,
  and attaching it to nodes would paint red error badges on a correctly-modelled process,
  telling the maker they did something wrong when they did not.
- Message states the platform limitation and what still works, in the maker's terms:
  the model is valid, concurrent execution is not yet supported by the platform, and Save
  Draft, validation, layout and export are all unaffected.
- Save Draft is untouched. `useWorkflowSave` does not consult violation severity, so
  drafts continue to persist parallel configuration — which is the entire point of
  shipping V1.

---

## Alternatives Considered

**A separate publish-time guard inside `usePublish` — rejected.** It would work, but it
creates a second, parallel notion of "not publishable" alongside the validation gate, in a
codebase where `INVALID_SLA` and `INVALID_ASSIGNMENT` already establish that blocking
publish is validation's job. Two gates means two places to bypass and two places to keep
in sync.

**A disabled Publish button — rejected as the *mechanism*.** Disabling the button is a UI
affordance, not a guarantee; the hook is callable regardless. The button may of course
reflect the violation, but the enforcement lives in the hook's existing check.

**Acknowledgement checkbox — rejected by the CEO.** Recorded here because it is the
obvious product instinct: it transfers a correctness risk to a maker who has no way to
evaluate it, since the unknown is the behaviour of a CRM layer they cannot see.

---

## Consequences

**Positive**
- Zero new enforcement code. The block inherits a path that already runs before any
  mutation, which is what makes C-1's "cannot be bypassed" defensible to the audit.
- Automatically covered by the existing validation UI — the violation appears in the
  panel and the toolbar count with no new surface.
- Removing the block later, when OQ-1 is answered and a runtime exists, is deleting one
  check — not unwinding a gate.

**Negative / Risks**
- An error-severity violation with no `nodeId` must render correctly in the validation
  panel and must not break any code that assumes `nodeId` is present. `DEAD_LOOP` and
  `NO_TERMINAL_OUTCOME` already emit process-level violations, so the path exists, but
  QA should confirm it.
- A maker who models a parallel process and then cannot publish it will be frustrated.
  This is the honest state of the platform and the message must own it, rather than
  implying the model is broken.
- The violation is emitted for *any* parallel configuration, including a half-finished
  one the maker is still editing. That is correct — it is a platform statement, not a
  model judgement — but it means the error count is never zero while a parallel region
  exists.
