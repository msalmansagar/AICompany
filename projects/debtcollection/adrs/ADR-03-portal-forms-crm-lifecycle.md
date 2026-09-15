# ADR-DCP-03 — Portal owns submission; Legal/Insurance lifecycle in native CRM

**Status:** Accepted (2026-09-14) · **Deciders:** architect, ceo · **Depends on:** ADR-DCP-02.
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
