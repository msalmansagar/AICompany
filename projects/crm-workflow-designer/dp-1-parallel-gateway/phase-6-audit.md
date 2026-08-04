# DP-1 — Security, Compliance and Governance Audit (Phase 6)

Engagement: DP-1 — Parallel (AND) Gateway
Date:       2026-07-26
Verdict:    **CONDITIONAL PASS.** One code finding, fixed in this gate. Governance
            conditions widen DP-2's existing three; no new governance track.

---

## 1. Security

| Pass | Result |
|---|---|
| Injection surface | **CLEAN.** The two new columns carry option-set integers drawn from closed TypeScript unions and written through `buildControlFlowBody`. No user-supplied string reaches an OData URL or body anywhere in DP-1. The `$select` additions are compile-time constants. |
| Write-boundary guards | **CLEAN.** `createStep`/`updateStep` already `assertGuid` their ids; DP-1 adds no new write path. |
| Secrets | **CLEAN.** No credential in any new file. The only `AZURE_CLIENT_SECRET` occurrence is the `"…"` placeholder in the provisioning script's usage comment. `.env.local` confirmed **untracked**. |
| Logging | **CLEAN.** No `console.*` in any new `src/` file. The provisioning script logs to console, consistent with every other one-shot script (DP-2 precedent). |
| Unsafe constructs | **CLEAN.** No `eval`, no `Function()`, no `any`. |
| Dependencies | **CLEAN.** No package added. graphlib is reached through the already-declared `@dagrejs/dagre`, so no new licence, supply-chain or review surface. |
| Error handling | **CLEAN.** No swallowed exceptions; the provisioning script fails fast on any non-OK response and exits non-zero. |
| Auth / authz | **UNCHANGED.** No new endpoint, role or permission. |

### SEC-1 [fixed in this gate] — Type assertions violated the constitution

`parallelRegions.ts` used six `as string` / `as number` assertions to squeeze
`Array.shift()` and `Map.get()` past their `| undefined` types, plus two on
`region.joinStepId`. The constitution is explicit: *"Avoid type assertions (`as SomeType`)
— use type guards instead."*

Not a live defect — each was true at the point of use — but assertions are exactly the
construct that stays true until a refactor quietly makes it false, and this is the module
whose correctness the CEO singled out (C-2). Fixed properly rather than waived:

- Queue drains use `for (let node = queue.shift(); node !== undefined; node = queue.shift())`
  — the loop condition *is* the type guard, so no assertion is possible.
- `distances.get(node) ?? 0` instead of `as number`.
- `checkStarvation` / `checkExternalEntry` now take the join as a `string` parameter,
  passed after `checkRegion` has already narrowed it. The narrowing happens once, where
  the null case is actually handled.

Verified: **zero** assertions remain in the module; tsc clean; 174 tests unchanged.

---

## 2. Data protection / PDPPL

**CLEARS BY EQUIVALENCE with DP-2.**

The two new columns store option-set integers describing control-flow topology. No
personal data, no free text, no identifier of any kind — not even the within-tenant GUIDs
that DP-2's escalation lookups hold, which were themselves cleared. Nothing crosses a
tenant boundary; DP-1 introduces no new data flow, no export, no third party.

Simulation output (`concurrentBranches`) carries step *names*, which are process metadata
authored by makers and already displayed throughout the existing UI. No new exposure.

---

## 3. Auditability

Control-flow changes flow through the existing `updateStep` path, so they are captured by
the same `AuditService` SAVE_DRAFT / PUBLISH records as every other step edit — no new
audit gap, and no new audit code.

**GA-1 [carried, unchanged]** Native Dataverse field-level auditing on
`qdb_work_item_steps` is still not enabled. That is DP-2's GL-02 and it now covers
`qdb_splittype` and `qdb_jointype` as well: a change to a step's concurrency semantics is
at least as consequential as a change to its SLA, and currently neither is captured at the
platform level.

---

## 4. Governance

Provisioning was run with explicit user authorisation, as required. It created **unmanaged**
metadata on `org5869857f`, exactly as DP-2 did — which is the standing condition, not a new
problem.

| Condition | Status |
|---|---|
| **GL-01** Managed-solution packaging | **Widens.** Now also covers 2 global option sets (`qdb_gatewaysplittype`, `qdb_gatewayjointype`) and 2 columns (`qdb_splittype`, `qdb_jointype`). Still open, still with QDB. |
| **GL-02** Native field audit on `qdb_work_item_steps` | **Widens** to the two new columns. Still open. |
| **GL-03** Provisioning SP scoped to System Customizer, revoked after use | **Unchanged** — same service principal, same exposure, no increase. |
| **GL-04** PDPPL | **Clears by equivalence** (§2). |

**No new governance track.** Every condition above is an existing DP-2 item whose scope
grows by two columns.

### GG-1 [INFO] The publish block is a code-level control, not a governed one

`PARALLEL_NOT_EXECUTABLE` prevents a parallel process from being published *by this
designer*. It does not prevent someone with direct Dataverse access from setting
`qdb_splittype` on a step through Advanced Find or the API and marking the process
published by hand. The control is appropriate to the risk — the columns are inert without
a runtime — but it should not be described to stakeholders as a platform guarantee. Worth
one line in the go-live checklist.

### GG-2 [INFO] Unallocated option value 100000002

Deliberately left free in both sets for a future inclusive/quorum gateway, and deliberately
**not created**, so no maker can select a semantic nothing implements. Recorded so a later
engagement does not reuse the number for something else.

---

## 5. Verdict

**CONDITIONAL PASS.** SEC-1 fixed in this gate; no remaining code-level finding. Security
passes clean across injection, secrets, logging, dependencies and error handling. PDPPL
clears by equivalence. Governance conditions are DP-2's existing three, widened by two
columns — not a new track, and all human/org rather than code.
