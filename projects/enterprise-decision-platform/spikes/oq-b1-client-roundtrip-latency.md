# Spike — OQ-B1: client-side round-trip latency

**Engagement:** EDP-BRE-001 · **Feature:** EDP-BIND-001 · **Question:** OQ-B1
**Date:** 2026-07-30 · **Environment:** `org5869857f.crm4.dynamics.com` · **Assembly:** 1.0.23.0
**Status:** COMPLETE — the factual half of OQ-B1 is answered

---

## Why this spike exists

OQ-B1 asked whether the ADR-06 consequence — every client-side rule evaluation is a server round
trip, because no second evaluator may exist in the browser — is commercially acceptable against
North52's in-browser formulas.

It was escalated to the CEO as a market question. That was the wrong framing. **The load-bearing
part is not an opinion, it is a number**, and the number decides the design. This spike measures it.

## Method

Called the live Custom API repeatedly and decomposed total wall-clock into its parts, because the
design consequence is completely different depending on which part dominates. Three hypotheses
were tested for the tail seen in the first run:

| # | Hypothesis | Test |
|---|---|---|
| H1 | Rapid sequential calls are throttled | Spaced calls (1.5s apart) vs back-to-back |
| H2 | The durable execution-log write is the cost | `EvaluateDecision` (writes a log) vs `TestRule` (does not) |
| H3 | It is the Custom API plugin pipeline itself | Both vs `WhoAmI` (no plugin) |

15–30 samples per set. A warm-up call was issued first so sandbox cold start did not pollute the
sample sets; cold start is reported separately because it is a real user-facing effect.

## Results (p50 unless stated)

| Measurement | p50 | p95 | Notes |
|---|---|---|---|
| `WhoAmI` — no plugin | **114 ms** | 202 ms | Network + platform floor |
| `TestRule` — evaluates, no durable write | **443 ms** | 562 ms | |
| `EvaluateDecision` — evaluates + writes log | **480 ms** | 571 ms | The real client-side path |
| `ValidateRule` — plugin, no log write | 466 ms | 692 ms | Confirms the pipeline cost is general |
| Resolve-by-name **+** evaluate (2 calls) | **656 ms** | 1,143 ms | What a naive form binding would do |
| **Cold first call after idle** | **6,147 ms** | — | Sandbox warm-up. Engine reported 19 ms |

### Decomposition of the 480 ms

| Component | Cost | Share | Can we reduce it? |
|---|---|---|---|
| Network + platform floor | 114 ms | 24% | No |
| Custom API plugin pipeline | 329 ms | 69% | No — Dataverse's cost to invoke a sandboxed plugin |
| Durable execution-log write | 37 ms | 8% | Yes, by using a non-durable path |
| **Our rule engine** | **~0 ms** (max 18 ms) | **0%** | Nothing to reduce |

### Hypotheses

- **H1 — rejected.** Spaced 480 ms vs back-to-back 451 ms: no material throttling.
- **H2 — rejected as a significant factor.** The durable write costs 37 ms, 8% of total.
- **H3 — confirmed.** 329 ms of the 480 ms is the Custom API plugin pipeline, and `ValidateRule`
  shows the same cost, so it is a property of invoking any sandboxed plugin, not of our rule.

## Findings

**1. Our engine is not the bottleneck. It contributes zero.** 100% of the latency is Dataverse
platform cost. No amount of runtime optimisation changes this number, which means **the design must
reduce the number of calls, not the cost per call.** This is the most important finding here.

**2. Per-field-change evaluation is not viable.** 480 ms per change is far past the ~100 ms
threshold at which a form feels responsive. A rule firing on every field change would make the form
feel broken, and this cannot be engineered away.

**3. Per-form-event evaluation is viable.** 480 ms on form load, or on save, is unremarkable next
to normal Dynamics form-load times. This is comfortably acceptable.

**4. Resolve-by-name doubles the cost.** 656 ms for two calls. A binding must carry the resolved
version id, not resolve by name at runtime.

**5. Cold start is 6.1 seconds** and needs its own answer — the first interaction after sandbox
idle is severe, and a user who hits it will not care that steady state is fine.

## Design consequence — the actual deliverable

> **One call per form event returning a complete presentation directive set** — never one call per
> field.

The rule is evaluated on form load and on save, and returns every decision for every field in a
single response:

```jsonc
{
  "hide":      ["discountApprovedBy", "escalationReason"],
  "mandatory": ["justification"],
  "readOnly":  ["creditLimit"],
  "values":    { "riskTier": "High" },
  "messages":  [{ "field": "amount", "text": "Above your approval limit" }]
}
```

That turns N calls into 1 and puts the entire cost inside a form load the user already expects to
wait for. It is a different design from "call the rule when a field changes", and it must be
specified that way from the start rather than discovered during build.

Consequent requirements for EDP-BIND-001:

| Requirement | Change |
|---|---|
| Client bindings | Trigger on **form load** and **save**, not per-field-change |
| Response shape | One evaluation returns directives for **all** fields |
| Rule addressing | Binding stores the resolved **version id**; no name resolution at runtime |
| Evaluation path | Presentation evaluation should use a **non-durable** path — 37 ms saved, but the real reason is avoiding one execution-log row per form load per user |
| Cold start | Needs a stated answer — accept, warm, or pre-fetch |
| Tail latency | The form must not block on the call; degrade gracefully (already FR-B24) |

## What this does and does not settle

**Settled:** the factual core of OQ-B1. The round trip costs ~480 ms, it is all platform, and it is
irreducible. Per-field-change is out; per-form-event is in.

**Not settled:** whether customers accept form-load evaluation where North52 offers instant
in-browser calculation. That residual is now much narrower and close to self-answering — 480 ms
inside a form load is invisible — but it is still a commercial judgement. Flowon shipping **no**
client-side execution at all is a further datapoint that the market tolerates this.

## Limits of this measurement — read before quoting it

- Measured from a developer workstation over the public internet using OAuth client-credentials.
  A browser inside the model-driven app uses same-origin session auth; the 114 ms floor could move
  in either direction. **QDB's own network is untested and could differ materially.**
- **The first run showed a p95 of 3,058 ms and a max of 14,656 ms.** The second run, minutes later,
  showed p95 571 ms. The org is shared with concurrent engagements, so that tail was contention,
  not a systemic property — but it demonstrates that **under real multi-user load the tail will be
  much worse than 571 ms.** The design must tolerate that, which is why the form must never block.
- 15–30 samples per set. p50 is solid; p95 is indicative, not authoritative.
- Single rule, small payload. A large decision table over many inputs was not measured, though the
  engine's ~0 ms contribution suggests payload size will matter far less than call count.

## Recommended follow-up

1. Re-measure from a browser inside the model-driven app once a client binding exists, to confirm
   the 114 ms floor under session auth.
2. Measure from a QDB network before any production commitment.
3. Decide the cold-start posture.
