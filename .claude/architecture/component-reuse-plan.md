# Component Reuse — Phased Plan

Tracking doc for the component-reuse initiative (INFRA-3). Phase 0 is
complete; Phases 1 and 2 are unscheduled and gated on an explicit decision.

---

## Why this is phased and not a single change

Maqsad AI has **no root `package.json` — it is not a monorepo.** Each project
installs, builds, and deploys independently, several into a live bank Dataverse
org. The duplication that exists is not copy-paste: it is the same job done
with different libraries, config contracts, and — for the Dataverse client —
different *runtimes* (a Node confidential client vs a browser session client
that cannot hold a secret).

So there is no safe "extract the shared code" step. There is a cheap,
high-value cataloguing step, and a separate, risky, per-project migration step.
This plan keeps them apart.

---

## Phase 0 — Registry + reconciliation spec — **COMPLETE (2026-07-24)**

Zero code moved. Deliverables:

- `.claude/COMPONENT-REGISTRY.md` — every reusable asset catalogued with an
  honest maturity grade. Records that most assets are single-owner reuse
  *candidates*, not current duplication, and that the one genuine cross-project
  duplication (the Dataverse client) splits into two runtime-incompatible
  components.
- `.claude/architecture/dataverse-client-reconciliation.md` — the divergence
  mapped, the canonical contract defined, the env-var tax quantified, and the
  migration order set.
- Constitution Article XVII — reuse before rebuild, warn-only.
- Directives in `github-researcher` and `architect` to consult the registry
  first.

**This captures the full reuse *decision* at zero risk.** It may be the entire
initiative — see the recommendation below.

---

## Phase 1 — Consolidate within portal-shell — **not scheduled**

Portal-shell is already a workspace (`@portal/dataverse-client` and five other
packages) and is itself unmerged. Fold its own `apps/api` Dataverse duplication
into its existing package, inside its own boundary. No cross-project blast
radius, no build-script changes elsewhere, verified against portal-shell alone.

This proves the canonical Node client design on a live-but-contained target
before anything shipped is touched. Its own small engagement (BA-light →
build → code-review → live verify against portal-shell), not part of ordinary
work.

---

## Phase 2 — Cross-project shared client — **not scheduled, gated**

Only if a concrete driver appears (see below). Extract `@qdb/dataverse-node`
and `@qdb/dataverse-browser` and migrate **one project per engagement**, in the
order set by the reconciliation spec, each with a live-org reverify and an
approve-with-conditions gate.

Requires a mechanism decision up front — monorepo vs private registry vs
vendoring — each with real cost and the Windows/Vite CRM-bundle risks already
recorded (`GOT-018`, `GOT-020`).

---

## The decision that gates Phases 1–2

Extraction is justified **only** by a concrete driver, not by tidiness:

1. a shared bug that must otherwise be fixed in four places, or
2. a new project that would fork a fifth Dataverse client, or
3. a security change — the SEC-01 secret rotation — that is easier to land in
   one shared client than in four copies.

Absent one of these, **Phase 0 is the deliverable and the initiative rests
there**. The registry ensures the next project adopts the canonical DFE design
instead of forking again, which is most of the value with none of the
cross-project coupling cost.

Revisit when a driver appears. Until then, INFRA-3 is complete at Phase 0.
