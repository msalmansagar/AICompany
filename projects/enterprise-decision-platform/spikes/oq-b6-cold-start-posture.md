# Spike — OQ-B6: cold-start posture

**Engagement:** EDP-BRE-001 · **Feature:** EDP-BIND-001 · **Question:** OQ-B6
**Date:** 2026-08-05 · **Environment:** `org5869857f.crm4.dynamics.com` · **Assembly:** 1.0.23.0
**Harness:** `spikes/measure-cold-start.js` (committed — see "Reproducing this")
**Status:** COMPLETE — and it answers the question differently from how it was framed

---

## Why this spike exists

The OQ-B1 latency spike measured the warm round trip at 480 ms and, in passing, recorded **one**
cold call at 6,147 ms. It closed by saying cold start "needs its own answer".

A single observation cannot decide a posture, because a posture depends on **frequency, not just
severity**. A 6-second stall met twice a year is a footnote; the same stall met every morning is a
product defect. OQ-B6 offered three options — accept, keep warm, or pre-fetch — and choosing
between them needs to know how long the sandbox tolerates being idle, and whether keeping it warm
actually works.

**The headline result is that the question's own framing was wrong.** Keep-warm was the presumed
mitigation. It was tested directly, and it failed.

## Method

Two experiments against the live Custom API.

**Idle staircase.** For each step: warm the sandbox with two calls, idle N minutes issuing nothing,
then probe. A probe is four calls in a fixed order, and the order is the point:

| # | Call | What it isolates |
|---|---|---|
| 1 | `WhoAmI` | Network floor **and the TLS reconnect the idle forced**. Runs no plugin, so it cannot wake the sandbox |
| 2 | `TestRule` | The cold hit itself, with connection cost already paid and separately priced |
| 3 | `EvaluateDecision` | A **different plugin type in the same assembly** — is warming assembly-wide or per-type? |
| 4 | `TestRule` again | Recovery — one call, or a degraded window? |

**Keep-warm test.** Ping every 15 minutes for an hour, then idle once more and probe — directly
testing the mitigation rather than assuming it.

Two measurement rules the harness enforces, both of which changed a conclusion:

- **Idle is measured, not assumed.** Elapsed time is tracked from the last call that actually
  invoked a plugin and reported alongside the nominal figure. This caught a step that was nominally
  10 minutes but ran 36.4 because the workstation slept — at face value it would have put the
  threshold in entirely the wrong place. It also revealed that the keep-warm cadence drifted from
  15 to 19.3 minutes, which turned out to matter.
- **A retry never sits inside a measured window.** Retries produce a fresh timed sample. For a cold
  probe a retry is accepted only if the failed attempt provably never reached Dataverse (DNS or
  connect failure); anything that may have arrived has already woken the sandbox, so the step is
  discarded rather than reported as a cold sample that is not one.

## Results

Warm baseline, reproduced five times across separate runs, and consistent with OQ-B1's independent
measurement — the main evidence that the rig is sound:

| Call | This spike (p50) | OQ-B1 (p50) |
|---|---|---|
| `WhoAmI` | 106–109 ms | 114 ms |
| `TestRule` | 379–431 ms | 443 ms |
| `EvaluateDecision` | 429–460 ms | 480 ms |

**Every observation, both experiments, sorted by measured idle:**

| Measured idle | Context | Floor | **1st plugin call** | Other type | Repeat | Verdict |
|---|---|---|---|---|---|---|
| 5.0 min | staircase | 467 ms | **424 ms** | 515 ms | 417 ms | warm |
| 15.0 min | keep-warm ping 1 | — | **973 ms** | — | — | warm |
| **15.0 min** | keep-warm final probe | 538 ms | **3,347 ms** | 651 ms | 438 ms | **COLD** |
| 16.1 min | staircase | 464 ms | **460 ms** | 458 ms | 379 ms | warm |
| 17.5 min | keep-warm ping 2 | — | **1,378 ms** | — | — | warm |
| **19.3 min** | keep-warm ping 3 | — | **10,380 ms** | — | — | **COLD** |
| 20.0 min | staircase | 469 ms | **577 ms** | 537 ms | 3,045 ms † | warm |
| **30.0 min** | staircase | 473 ms | **13,911 ms** | 515 ms | 411 ms | **COLD** |
| 36.4 min ‡ | staircase | 423 ms | **4,816 ms** | 2,740 ms | 1,858 ms | **COLD** |

† A 3-second spike on the *fourth* call of a warm probe. Cold hits the first call, never the fourth
— this is the shared-org contention tail OQ-B1 flagged, appearing on a fully warm call.

‡ Nominally 10 minutes; the workstation slept and it ran 36.4. Its gradual recovery
(4,816 → 2,740 → 1,858) is **not** trusted — the clean 30-minute sample recovered immediately, so
the gradual curve is almost certainly the machine's network stack after waking. Reported for
completeness, not relied on.

## Findings

**1. There is no reliable idle threshold. Recycling is not a deterministic function of idle time.**
This is the load-bearing finding and it was not expected:

- **19.3 minutes idle → 10,380 ms (cold)**
- **20.0 minutes idle → 577 ms (warm)**
- **15.0 minutes idle → 973 ms (warm)** and, an hour later, **15.0 minutes idle → 3,347 ms (cold)**

Two pairs of near-identical idle durations with opposite outcomes, including one pair at exactly the
same 15.0-minute gap differing by 3.4×. **There is no cliff to stay behind.**

**2. Keep-warm was tested and it failed.** Pinging every 15 minutes for an hour did not hold the
sandbox warm: the third ping took 10.4 seconds and the final probe 3.3 seconds. Two of four
maintained-cadence calls were degraded. Keep-warm was the presumed mitigation in OQ-B6's framing;
it does not deliver what the framing assumed.

**3. Severity is 3 to 14 seconds and highly variable.** Five degraded observations: 3,347 ms,
4,816 ms, 6,147 ms (OQ-B1), 10,380 ms, 13,911 ms. **The 6.1 s previously on record is mid-range,
not worst case.** Any commitment written against "about 6 seconds" is written against the wrong
number.

**4. Our engine contributes nothing to it.** On the 3,347 ms cold call the runtime reported **16 ms**
of engine time. Cold start is 100% Dataverse platform cost — the same conclusion OQ-B1 reached for
the warm path, now confirmed for the cold one. **No runtime optimisation can touch this.**

**5. Recovery is immediate, and warming is assembly-wide.** On clean samples the call after the
cold hit returned to normal (411 ms, 438 ms), and a *different plugin type* in the same assembly
answered warm right after (515 ms, 651 ms). One user pays the whole cost; the queue behind them is
unaffected, across all 22 Custom APIs.

**6. Connection cost is real and separate.** The floor after a long idle was ~470–540 ms against a
~107 ms warm floor: roughly 360–430 ms of TLS reconnect. Measuring it separately kept it from being
charged to the sandbox, and it means the first call after *any* idle carries that overhead even when
the sandbox is warm.

### A hypothesis that fits the data — explicitly not a finding

Stochastic cold hits at 15 minutes, warm at 20, cold at 19.3 after two successful pings are hard to
explain with an idle timer. They fit comfortably with requests being **routed across a pool of
sandbox worker nodes**, where a ping warms whichever node served it and the next request may land on
a different, cold one.

If that is the mechanism, **no ping cadence can fix it**, because the caller does not choose the
node. This is consistent with everything measured but **has not been verified** — confirming it
needs Microsoft's sandbox architecture or node-affinity evidence this spike cannot obtain. It is
recorded because it changes what mitigation is even possible, and because assuming an idle timer
would lead to tuning a cadence that cannot work.

## Recommended posture

**Accept that a client-bound form will sometimes wait 3–14 seconds, and design so that it does not
matter.** Not "accept the latency" — accept the *possibility* and remove its consequences.

| Option | Verdict |
|---|---|
| **Keep warm** | **Rejected as a control.** Measured and failed. Worth running as a cheap frequency reducer, but nothing may depend on it |
| **Pre-fetch on form open** | **Does not work.** The form open *is* the first call; pre-fetching moves the stall, it does not remove it |
| **Accept, unmitigated** | **Rejected.** A form that blocks for 14 seconds is broken regardless of how often it happens |
| **Non-blocking binding + graceful degradation** | **Recommended — and now mandatory, not a safety net** |

Concretely, for EDP-BIND-001:

1. **FR-B24 (the form must not block on the call) is promoted to a release gate.** It was already a
   requirement; this spike makes it the *only* thing standing between a recycled sandbox and a
   frozen form. Every other mitigation was tested and failed.
2. **The form must render and be usable before directives arrive**, applying them when they land.
   Any design where the user waits for the evaluation is invalid.
3. **A late or failed evaluation must degrade to a defined state** — the un-directed form, not a
   spinner and not an error dialog.
4. **Keep-warm at ~10 minutes is optional and cheap** (~144 calls/day/environment, and `TestRule`
   writes no execution-log row). It reduces frequency. **It must not appear in any requirement,
   commitment or SLA as a control**, because it was measured and it does not hold.
5. **Never use a blocking client binding for anything a user cannot proceed without.** Blocking
   server-side validation (FR-B17) is unaffected — that is a save-time server operation where a
   multi-second pause is tolerable and the platform already blocks.

## Limits of this measurement — read before quoting it

- **Nine idle observations across two runs**, one to two per idle level. The *variance* is
  well-evidenced — that is the main claim. The exact distribution is not.
- **Shared org.** `org5869857f` carries concurrent engagements, so another session's traffic during
  an idle window would keep a node warm and make a step look warmer than it is. This biases toward
  **under**-detecting cold: the real-world rate could be worse, not better.
- Measured from a developer workstation over the public internet with client-credentials auth, not
  in-browser session auth. QDB's own network is untested.
- Sandbox recycling policy is Microsoft's, undocumented, and not contractual. It can change without
  notice — a further argument against any design that depends on predicting it.
- One workstation sleep occurred mid-run; that step is flagged above and excluded from conclusions.
- The routing hypothesis is a hypothesis. Do not repeat it as a finding.

## Reproducing this

`node spikes/measure-cold-start.js` — the harness is committed this time. OQ-B1's harness lived only
in a scratch directory and was lost when that directory was cleaned, which made its published
numbers unreproducible. Flags: `--idle 5,10,15` custom staircase · `--resume` continue from the last
checkpoint · `--keepwarm-only --keepwarm-every N` test the mitigation directly · `--cleanup` sweep
fixtures a killed run left behind.

## What this settles

**Settled:** OQ-B6. The posture is **non-blocking, gracefully degrading client bindings**, with
keep-warm as an optional frequency reducer that nothing depends on. Cold start cannot be prevented,
only tolerated.

**Unsettled, and now more important:** whether the client-side binding design in the BRD can meet
requirement 2 above. A form that renders first and applies directives on arrival is a different
interaction model from one that evaluates on load and then renders — and it should be settled at
architecture, not discovered during build.

**Consequent change to OQ-B1's conclusion:** OQ-B1 established that per-form-event evaluation at
480 ms is comfortable. That holds for the warm path and is unchanged. But the *worst* case for a
form event is not 571 ms p95 — it is 3–14 seconds, several times a day per environment. The
one-call-per-form-event design still stands; what changes is that the call must be asynchronous with
respect to rendering.
