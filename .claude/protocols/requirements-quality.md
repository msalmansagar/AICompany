# Requirements Quality

Adopted from GitHub's Spec-Kit (spec-driven development). Maqsad AI already has
a BA→CEO gate; what it lacked was a way to judge whether a BRD is *good* before
the CEO approves it. A BRD can read complete and still be vague, untestable, or
silently uncertain — and the CEO agent will approve it because nothing checks.
This protocol closes that hole with three cheap, high-leverage practices.

---

## 1. Checklists are unit tests for requirements

Spec-Kit's core insight: **if a BRD is code written in English, a checklist is
its unit-test suite.** The checklist does not test the implementation — it tests
whether the *requirements themselves* are well-written: complete, unambiguous,
consistent, and ready to build against.

The distinction is the whole point:

| Not a requirements checklist | A requirements checklist |
|---|---|
| "Verify the submit button works" | "Are error states defined for every form submission?" |
| "Test the API returns 200" | "Is every failure response's status code and body specified?" |
| "Confirm login succeeds" | "Is 'session timeout' quantified with a specific duration?" |

Every BRD carries a **Requirements Quality Checklist** the BA fills before
handing to the CEO. Each item is a yes/no question about the requirements, in
five dimensions:

- **Completeness** — every requirement has acceptance criteria; every user role's
  scenarios are covered; edge cases are enumerated, not implied.
- **Clarity** — no vague quantifier ("fast", "prominent", "several", "robust")
  survives without a number; every functional requirement is testable *as written*.
- **Consistency** — one term per concept; no two requirements contradict.
- **Coverage** — NFRs present (performance target, security, data residency);
  compliance addressed (PDPPL where personal data is involved).
- **Uncertainty** — every `[NEEDS CLARIFICATION]` marker is resolved.

A checklist item that cannot be answered "yes" is a defect in the BRD, not a
matter of opinion. The CEO does not approve a BRD with open checklist items.

---

## 2. `[NEEDS CLARIFICATION]` markers

When the BA is uncertain about a requirement — a threshold nobody stated, a
behaviour the stakeholder left open, a compliance question — it writes the
uncertainty **into the BRD** as an explicit marker rather than guessing:

```
FR-014: The system MUST lock an account after [NEEDS CLARIFICATION: how many?]
        failed login attempts within [NEEDS CLARIFICATION: what window?].
```

Rules:

- A marker is a first-class, greppable token. It is never paraphrased away.
- The BA surfaces all markers to the user in the clarification round and
  replaces each with the answer.
- **An unresolved marker is a hard block on CEO approval.** `gate-brd.sh`
  fails while any remain. This is the mechanism that stops a guess from
  silently becoming a shipped requirement.

Guessing where a marker belongs is worse than the marker: a marker is visible
and gets resolved; a guess looks like a decision and gets built.

---

## 3. Prioritized, independently-testable user stories

Structure the BRD's user stories as **prioritized MVP slices**, not a flat
list. Each story is a standalone increment that can be developed, tested,
deployed, and demonstrated on its own.

```
### US-01 — Loan officer submits an application (Priority: P1)
Why P1: without this the product delivers nothing.
Independent test: an officer completes and submits one application end-to-end,
                  and it appears in CRM — provable without US-02..n.
Acceptance:
  AC-1: Given a valid application, When submitted, Then a case is created in CRM.
  AC-2: Given a missing required field, When submitted, Then submission is blocked
        with a field-level error.
```

Why this matters for Maqsad AI:

- **P1 defines the true MVP** — the CEO can approve a P1-only scope and ship
  value, deferring P2/P3 to later releases. This feeds directly into the
  `enhancement` and `release` workflows.
- **Independent testability** forces the BA to slice by user value, not by
  technical layer — which is what makes incremental delivery to a live client
  possible without half-built features.
- Priorities flow downstream: QA orders test creation P1-first; the CEO's
  approve-with-conditions can gate P3 without blocking P1.

---

## The gate

`.claude/scripts/gate-brd.sh <brd-file>` mechanically checks a BRD for:

- unresolved `[NEEDS CLARIFICATION]` markers (FAIL — the hard block)
- prioritized user stories (`P1`/`P2`/`P3`) present
- requirement IDs (`FR-`/`NFR-`) present
- acceptance criteria present
- vague quantifiers without numbers (WARN — a clarity smell, not an auto-fail)
- a Requirements Quality Checklist section present

Read-only. Warn-only at adoption except the `[NEEDS CLARIFICATION]` block,
which is the one thing worth failing on because it is unambiguous.

Run it before the CEO approval gate and state the result. See Constitution
Article XVIII.

---

## What this is not

This does not replace the CEO's business judgment or the auditor's compliance
review. It raises the floor on *requirements craft* so those reviews spend their
attention on substance, not on chasing ambiguity the BA should have resolved.
It is `.claude/protocols/verification-before-completion.md` applied one phase
earlier — verify the requirements before building, as we verify the build
before claiming done.
