# ADR-DCP-03 — Portal owns submission; Legal/Insurance lifecycle in native CRM

**Status:** Superseded in part by ADR-DCP-07 (2026-09-17) · originally Accepted 2026-09-14 · **Deciders:** architect, ceo · **Depended on:** ADR-DCP-02 (superseded).
**Full context, alternatives, and consequences:** `../facts-and-analysis.md` §11 (carried by reference).

## Decision (summary)
Do **not** iframe CRM model-driven forms into the portal (fails on third-party cookies, `frame-ancestors` CSP,
double sign-in, no close-me contract, seam, mobile). Segment by **persona**: Collection Officer / RM / Supervisor
work in the portal; **Legal User and Insurance Officer work in native CRM** (their forms are already specified) —
so **no Legal or Insurance portal UI is built in Phase 1**. The hand-off is an event/lifecycle split: the officer
submits the referral checklist in the portal (event); Legal/Insurance track the lifecycle in CRM. Phase-1 portal
forms are plain **react-hook-form + zod** — no descriptor/metadata layer at n=4 (YAGNI; revisit on the third
field-change request). The DFE form engine is **not** adopted (not consumable without extraction; couples to an
unmerged branch). The contract is enforced server-side regardless of where a form is drawn.

## Superseded in part (2026-09-17, Phase 0)
- **Superseded:** the "no iframe of CRM forms" reasoning is moot — the workspace now runs *inside* CRM as a
  full-page web resource (ADR-DCP-07). The "plain react-hook-form + zod, no Form Engine" decision is
  reversed: **Master Prompt §45 mandates the Form Engine** for activity-specific forms (PTP, field visit,
  restructuring, legal, deceased/insurance, dispute), consumed through `IFormEngine`. The persona split
  (Legal / Insurance work in native CRM in Phase 1) is retained as a scoping choice, not an architecture rule.
- **Survives unchanged:** *the contract is enforced server-side* — plugins, Process Engine and Rule Engine
  own validation; a React form validating alone is bypassable. This rule now applies to Form Engine forms too.
