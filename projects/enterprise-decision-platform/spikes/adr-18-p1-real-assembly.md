# Spike — ADR-18 P1: EDP's own assembly, packaged and unsigned, serving a live Custom API

**Date:** 2026-08-19
**Status:** COMPLETE — **passed.** W0-1 is superseded for the cloud line
**Follows:** `adr-18-p0-packaging-probe.md`, which proved the mechanism with a throwaway plugin
**Build change:** PR #102 — `-p:PackForDataverse=true`

---

## Why this ran

P0 proved that a plug-in package binds the versions it ships and that an unsigned assembly
loads. It also stated its own limit plainly: *proven with a trivial plugin, not with EDP's own
assembly and its 9 plugin types, 30 SDK steps and 22 Custom APIs.*

P1 removes that limit.

---

## What was done

The shape is the Report Engine's re-key, which achieved zero outage: **register alongside,
verify, re-point, then delete** — never delete first.

1. Built EDP's real runtime as a Dataverse plug-in package (2.6 MB).
2. Registered it **beside** the existing signed assembly. Different assembly name, so the
   existing plugin types and their bindings could not collide.
3. Verified the live product was undisturbed.
4. Re-pointed **one** Custom API as a canary, chosen so that success or failure would be
   unambiguous.

---

## Results

### Both assemblies coexist

```
EDP.RuleRuntime.Crm.Signed   v1.0.23.0   token=06949b1887fabe5d   types=8
EDP.RuleRuntime.Crm          v1.0.24.0   token=null (UNSIGNED)     types=9
```

The packaged assembly carries **nine** types to the signed one's eight — the extra is
`ProductionPinJustificationPlugin`, the pin guard that W0-1 has been blocking for a month.

### Registration disturbed nothing

| Check | Result |
|---|---|
| Custom APIs still on the signed assembly, immediately after registering the package | **22 of 22** |
| `qdb_edp_GetRuleTemplates` (Function, GET) | 200 |
| `qdb_edp_ValidateRule` (Action, POST) | 200 |

### The canary proves NEW CODE is executing, not merely that the endpoint responds

The probe rule contains a quantifier over an undeclared collection. The 1.0.23 assembly has no
concept of quantifiers, so it deserialises the property away and reports nothing. 1.0.24 must
emit `EDP041`.

| | Diagnostics |
|---|---|
| Before re-point (signed 1.0.23) | *(none)* |
| After re-point (packaged 1.0.24, unsigned) | **`EDP041` — "Quantifier references undeclared collection 'ghosts'."** |

A control rule with an unknown operator returned `EDP003` from the same endpoint, confirming
the path was healthy in both directions rather than merely erroring differently.

**`qdb_edp_ValidateRule` is served by an unsigned, packaged assembly and is executing code
written the same day.**

---

## 🔴 Operational finding — a re-point is not effective immediately

The canary script verified milliseconds after the PATCH and reported **EDP041 absent**, a false
negative. The identical call moments later returned `EDP041` correctly.

**Anyone verifying a migration too quickly would conclude it had failed and roll back working
changes.** Any re-point procedure needs a propagation wait before its verification step. The
bulk script carries a 20-second wait for this reason.

---

## What this settles

1. **A strong-name key is not required to ship EDP to cloud.** W0-1 exists to rotate one. It is
   superseded for the cloud line, and its runbook now says so.
2. The pin guard, `ExecutionId`, F1 collections and quantifiers, and per-child fan-out are all
   in 1.0.24 and reachable — the queue behind W0-1 is not blocked by signing any more.
3. Register-alongside-then-re-point works on the real surface, not just in principle.

---

## State left in the org

**Deliberately mixed, and stable:**

| | |
|---|---|
| On the packaged assembly | **1** — `qdb_edp_ValidateRule` |
| On the signed assembly | **21** |

Each Custom API binds its own plugin type independently, so a mixed state is functionally fine;
both sides were verified answering 200. The remaining 21 are a single scripted step
(`repoint-all.mjs`, which writes a rollback map before changing anything).

**Rollback for the canary is one PATCH** — point `qdb_edp_ValidateRule` back at plugin type
`d262b514-8879-f111-ab0e-70a8a55bc6a5`.

---

## Limits

| Not done | Note |
|---|---|
| The remaining **21 Custom APIs** | Scripted and ready; the bulk run was not executed |
| The **30 SDK steps** | Not re-pointed. They belong to the signed assembly and are a separate migration step |
| Deleting the signed assembly | Not attempted, and should not be until everything is moved and soaked |
| **On-premises** | Cannot use packages at all. That line keeps ILRepack and signing, and the W0-1 runbook still applies there |

---

## VERIFICATION

| Claim | How | Result |
|---|---|---|
| Package registers unsigned with 9 types | `pluginassemblies` / `plugintypes` after import | **Observed** |
| Registration disturbs nothing | 22/22 still bound; Function and Action both 200 | **Observed** |
| Packaged assembly executes 1.0.24 code | `EDP041` after re-point, absent before | **Observed** |
| Re-point has a propagation delay | False negative immediately after PATCH, correct moments later | **Observed** |
| The other 21 Custom APIs | **NOT DONE** | Blocked pending execution |
| SDK steps under the package model | **NOT TESTED** | Separate step |
| On-prem | **NOT APPLICABLE** | Packages unsupported there |
