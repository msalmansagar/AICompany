# ADR-18: Dependency Pinning is a Symptom — the Packaging Model is the Cause

**Status:** **P0 PASSED 2026-08-19 — ready for sponsor acceptance.** Both claims are now observed, not reasoned: a plug-in package binds the version it ships, and an unsigned assembly loads in sandbox isolation. Evidence: `spikes/adr-18-p0-packaging-probe.md`. Held at Proposed only until the sponsor accepts.
**Date:** 2026-08-18
**Decided by:** Solution Architect. Answers OQ-A2, left open by ADR-16 and carried out of `architecture-edp-fact-bind-joint.md`.
**Touches:** ADR-SEC-NCALC · ADR-16 · W0-1 (`wave-0-snk-rotation-scope.md`) · `dependencies.md` F1 addendum

---

## Context

`dependencies.md` recorded a compounding problem: EDP keeps pinning dependencies to older
lines, each pin defensible alone, the pattern a growing frozen security surface.

| Dependency | Pinned | Stated reason |
|---|---|---|
| `NCalcSync` | 5.4.2 | NCalc 6.x needs System.Text.Json 10.x, "incompatible with the net462 sandbox" |
| `System.Text.Json` | 9.0.4 | The pin itself |
| `JsonLogic` | *avoided* | Would have been the second — ADR-16 took the specification instead |

The architecture phase carried this forward as OQ-A2 with three candidate strategies: accept
and monitor, vendor a subset, or source-include. **All three were the wrong question.**

---

## The correction — "incompatible with net462" does not hold

`EDP.RuleRuntime.csproj` states that System.Text.Json 10.x is *"incompatible with the net462
sandbox"*. Checked against the NuGet registration API:

| Package | Ships a `.NETFramework4.6.2` target? |
|---|---|
| System.Text.Json **9.0.4** | ✅ Yes |
| System.Text.Json **10.0.0** | ✅ Yes |
| System.Text.Json **10.0.5** | ✅ Yes |

**STJ 10.x supports net462 explicitly.** What actually changes across the major line is the
transitive closure — `Microsoft.Bcl.AsyncInterfaces`, `System.IO.Pipelines`,
`System.Text.Encodings.Web`, `System.Buffers`, `System.Memory`,
`System.Runtime.CompilerServices.Unsafe`, `System.ValueTuple` — all moving to newer versions.

That is a real risk. It is **not** the stated one. And `Microsoft.Bcl.AsyncInterfaces` has
already caused an observed load failure on this project at 9.x, in the local net462 vstest
quirk documented in the runtime README.

**The distinction matters because it changes the strategy.** Genuinely incompatible means pin
forever. Untested-and-higher-risk means test it, and possibly remove the problem.

---

## The actual root cause — Microsoft documents both of EDP's choices as things not to do

From *Build and package plug-in code* (Microsoft Learn, updated 2026-07-10):

> **Don't depend on System.Text.Json** … the `System.Text.Json.dll` file in the sandbox runtime
> **might not be the same version that you refer to in your project**. If you need to use
> `System.Text.Json`, use the dependent assembly capability and explicitly include it in your
> NuGet package.

> **Microsoft doesn't support ILMerge.** The dependent assemblies capability offers the same
> functionality as ILMerge and more.

EDP does both discouraged things. It depends on System.Text.Json, and it ships as a single
**ILRepacked** assembly — ILRepack being an ILMerge equivalent.

**The consequence is that the pin controls nothing at runtime.** Pinning to 9.0.4 fixes what
the *build* references. What *loads* in the sandbox is whatever version the sandbox has. The
pin is a guess about someone else's deployment, dressed as a control — which is why the pin
count grows without the risk ever actually going down.

---

## Decision

**Stop treating this as a dependency-version problem. It is a packaging-model problem.**

**Adopt the plug-in package (dependent assemblies) model for the cloud line**, which is the
sanctioned mechanism, ships exact dependency versions into the sandbox, and supersedes
ILRepack. Retain ILRepack **only** for the on-premises line, which cannot use it.

Sequenced as:

| Step | Action | Gate |
|---|---|---|
| **P0** | **Test the claim before acting on it** — build a plug-in package carrying explicit STJ and BCL versions, register it in a non-production org, and confirm the runtime binds the shipped versions | **Blocks everything below.** Nothing here is proven yet |
| **P1** | Migrate the cloud line to plug-in packages; retire ILRepack for cloud | After P0 |
| **P2** | Re-test the NCalc 6.x pin against the packaged model. If it binds cleanly, **unpin and retire ADR-SEC-NCALC's accepted advisory** | After P1 |
| **P3** | Retarget net462 → **net48**, now sandbox-supported and forced by the deadline below | Independent, but do it with P1 |

---

## 🔴 The consequence that matters most — this may remove W0-1

> **Signed assemblies aren't required.** … with plug-in assemblies in a plug-in package, the
> assemblies load on the sandbox server by using a different mechanism, **so signing isn't
> necessary**.

**W0-1 — the SNK rotation — exists because the assembly must be signed.** It has been the
engagement's largest blocker for a month, it requires a vault and a staging rehearsal, and
five changes now queue behind it: the pin guard, `ExecutionId`, entity binding, actions, and
`ChildResultsJson`.

**If the cloud line moves to plug-in packages, the signing requirement goes away with it, and
W0-1 may not need to happen at all for cloud.**

This is stated as a possibility, not a fact. **It must be proven by P0 before anyone cancels a
vault decision on the strength of it.** But it reframes W0-1 from *a thing to schedule* into
*a thing to check whether we still need* — and that check is hours of work against a blocker
that has held for weeks.

Two supporting notes:

- The Report Engine already demonstrated that W0-1's delete-first premise was unnecessary:
  register the new assembly alongside, re-point, then delete, with zero outage. W0-1 was
  already less dangerous than its runbook models.
- If signing is dropped, **every dependency must also be unsigned or signed consistently** —
  "signed assemblies can't use resources contained in unsigned assemblies." That is a P0
  check, not an afterthought.

---

## The deadline that makes this non-optional

> Plug-in and custom workflow activity assembly projects must target .NET Framework 4.6.2.
> **Official Microsoft support for .NET Framework 4.6.2 ends on January 12, 2027.**
> Sandbox support is now available for plug-ins and custom workflow activities that target
> .NET Framework 4.8.

**That is roughly five months away.** The retarget is coming regardless of this ADR; doing it
alongside the packaging migration means one round of re-registration and re-testing instead of
two.

---

## Constraints and costs

| Constraint | Effect |
|---|---|
| **On-premises is not supported** for plug-in packages | The on-prem line keeps ILRepack and signing. **Dual packaging is the price**, and EDP's on-prem path is code-complete but never tested, so this is a second untested path |
| **Custom workflow activities are not supported** in packages | EDP registers `IPlugin` types only, so this does not currently bite — but it closes a door |
| Package name and version are immutable once created | Naming needs care up front |
| Import time scales with `IPlugin` count | EDP has 8–9 types; the documented pain starts in the hundreds |

---

## Consequences

**Positive**

- The pin problem stops compounding, because exact versions ship with the assembly instead of
  being guessed.
- ADR-SEC-NCALC's accepted DoS advisory becomes retirable rather than permanent.
- ILRepack — an unsupported mechanism — leaves the cloud path.
- **Signing, and therefore possibly W0-1, may leave the cloud path with it.**
- Aligns with the platform direction ahead of a hard end-of-support date.

**Negative, and accepted**

- A packaging migration touching every plugin type, on an engagement already blocked on
  deployment.
- Dual packaging: cloud on packages, on-prem on ILRepack.
- P0 might disprove the premise, in which case this ADR reduces to strategy A (accept and
  monitor) and the correction above still stands on its own.

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| **A — Accept and monitor** (status quo) | Manages a symptom. The pin does not control what loads, so the risk it claims to mitigate is not actually mitigated |
| **B — Vendor or source-include a subset** | Trades a version problem for a maintenance problem, and does nothing about ILRepack being unsupported or about signing |
| **C — Drop System.Text.Json from the plugin** | Invasive — PCRM serialisation runs through it — and unnecessary if packages ship the version we choose |
| **D — Retarget to net48 alone** | Necessary and insufficient. It answers the deadline, not the version-binding question |

---

## VERIFICATION

| Claim | How | Status |
|---|---|---|
| STJ 9.0.4, 10.0.0 and 10.0.5 all ship a `net462` target | NuGet registration API | **Verified** |
| Microsoft advises against depending on System.Text.Json in plug-ins | *Build and package plug-in code*, Microsoft Learn, updated 2026-07-10 | **Quoted directly** |
| ILMerge is unsupported; dependent assemblies supersede it | Same source | **Quoted directly** |
| Signing is not required for assemblies in a plug-in package | Same source | **Quoted directly** |
| .NET Framework 4.8 sandbox support; 4.6.2 support ends 2027-01-12 | Microsoft Learn, corroborated by search | **Quoted — but the exact end-of-support date should be re-confirmed against the supported-versions page before it is put in a plan** |
| **A plug-in package actually binds the STJ version it ships, in a real sandbox** | **NOT TESTED** | 🔴 **This is P0 and the entire ADR rests on it** |
| Whether dropping signing is viable given EDP's dependency set | **NOT TESTED** | Part of P0 |
| NCalc 6.x binding cleanly under the packaged model | **NOT TESTED** | P2 |

**Nothing in this ADR should change a deployment plan until P0 has run.** The correction to the
net462 claim stands on its own evidence; everything built on the packaging model is reasoned
from Microsoft's documentation and has not yet been observed in an org.
