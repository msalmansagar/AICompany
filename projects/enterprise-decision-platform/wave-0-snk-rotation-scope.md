# Wave-0 · W0-1 — Strong-Name Key Rotation & Retrieval (Scope)

**Engagement:** EDP-BRE-001 · **Closes:** F-05 (part 2) · **Blocks:** pin-plugin deploy (ADR-14/ADR-12 layer 1), all future assembly changes
**Owner:** DevOps · **Accountable:** Architect · **Sign-off:** QDB IT / Security · **Effort:** Medium (choreography, not code)

---

## 1. Objective
Replace the compromised strong-name key (`edp.snk`, present in git history — F-05) with a **new vaulted keypair**,
re-sign the merged `EDP.RuleRuntime.Crm.Signed` assembly, and re-establish its plugin identity in Dataverse — folding
the new **ProductionPinJustificationPlugin** (assembly `1.0.24`) into the same cutover.

## 2. Why now
- The old private key is recoverable from git history → any actor could sign a DLL under the **current** token.
- `edp.snk` is not on the build machine, so the next build needs a key regardless.
- Since we must rotate anyway, we **do not retrieve the old key** — we generate the new one and cut over. (Retrieving
  the old key would only enable an interim same-identity build, which we don't need.)

## 3. The crux — token change = re-registration
Rotating the key produces a **new public key → new public-key token**. The token is part of a plugin assembly's
Dataverse identity (name + version + culture + token). Therefore the re-signed assembly is a **different identity**,
and the Plugin Registration path historically **does not allow changing the strong name in-place** — it requires
**delete + re-register** of the assembly, its 8 plugin types, ~30 steps, images, and ~19 Custom API bindings.

> **This is the single highest risk and must be settled in a rehearsal before touching production.** Determine
> empirically whether the environment permits an in-place content/token update, or mandates delete-and-recreate
> (which briefly removes live Custom APIs → a maintenance window).

## 4. Prerequisites
- [ ] Approved secrets vault (Azure Key Vault) + access model — **QDB IT/Security** owns custody.
- [ ] A **staging Dataverse environment** to rehearse the cutover (or an accepted, measured prod-window risk).
- [ ] Pin-plugin files integrated onto **main** so the `1.0.24` build includes them (`ProductionPinJustificationPlugin.cs`, test, `deploy/bre-register-pin-guard.js`).
- [ ] Agreed **maintenance window** (schedule when the org is quiet — the shared org has shown recurring solution-lock contention from concurrent sessions).

## 5. Runbook

### Phase A — Prep (no production impact)
1. Generate a new strong-name keypair (`sn -k`, or the documented PowerShell RSA `ExportCspBlob` method). Record the **new token**.
2. Store the private key in the vault, access-restricted; remove any working copy after the build machine has it.
3. On the build machine **from `main`**: bump `AssemblyVersion` 1.0.23 → **1.0.24**; build; ILRepack-merge with the
   **known-good recipe** (`MSYS2_ARG_CONV_EXCL='*'`, `/union`, `/targetplatform:v4,<Framework64>`, curated merge list);
   sign with the **new key**. Verify: token = new token; same 11 external refs as the prior known-good build.
4. Update the version constant to `1.0.24` in **every** deploy script (bre-register.js / -meta.js / -analysis.js / -svc.js / -pin-guard.js — they must stay in sync).

### Phase B — Rehearsal (staging)
5. Execute the full cutover in staging; confirm whether in-place update works or delete+recreate is required; **measure downtime**.
6. Lock the chosen re-registration path into a single ordered script set.

### Phase C — Cutover (production maintenance window)
7. Re-register per the rehearsed path: upload the new signed assembly; ensure all plugin types, steps, Custom API
   bindings, and images resolve to the new assembly. If delete+recreate, run the registration scripts in order, then
   `bre-register-pin-guard.js` last.
8. Set `qdb_edp_IsProductionEnvironment` = yes if this is the prod designation moment (activates SoD + the pin guard).

### Phase D — Verify
9. Smoke **all ~19 Custom APIs** → 200 (EvaluateDecision, governance, validate/test, analysis, metadata, analytics…).
10. Confirm new `publickeytoken` on `pluginassembly`.
11. **Pin guard:** in the prod-designated env, pin a version without justification → **blocked** (verification VP-6 flips from residual to enforced); pin with justification → allowed.
12. Run the scenario/regression suite green.

### Phase E — Post
13. Retire the old key; file the rotation runbook + **next-rotation date**.
14. *(Optional hardening)* purge the old key from git history (BFG / git-filter-repo) — coordinate; it rewrites history.
15. Mark **F-05 CLOSED**; revise **ADR-14 → Accepted, layer 1 restored**.

## 6. Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Token change orphans steps → Custom API outage | Rehearse in staging; scripted re-registration; verify-all smoke; maintenance window |
| ILRepack fragility (documented gotchas) | Use the known-good recipe; verify token + external refs post-merge |
| Concurrent-session solution lock on the org | Schedule the window when the org is quiet; retry-with-backoff on publish |
| Git-history exposure persists | Rotation neutralizes it for the live identity; optional history purge documented |
| On-prem identity (if/when it exists) | Re-sign + re-register there with the new key too |

## 7. Rollback
Keep the current `1.0.23` signed assembly + its registration intact until Phase-D smoke passes. If cutover fails,
re-point to the retained `1.0.23` registration (or restore from the pre-cutover solution export) and re-open the window.

## 8. Acceptance / Definition of Done
- Assembly signed by the **vaulted new key**; new token live; old key retired and unable to sign the live identity.
- **All Custom APIs green** post-cutover; **pin guard enforcing** in production.
- Rotation runbook + next-rotation date filed; **F-05 closed**; ADR-14 updated.

## 9. Coupling
This cutover is the **natural carrier for the pin plugin (1.0.24)** — one re-sign, one re-register, one verification
pass. Fold in any other pending assembly changes so production takes a single maintenance window, not several.
