# A7: Rule Engine 1.1.0 cloud release procedure

**Scope:** the release-engineering half of Rule Engine 1.1.0. This moves every cloud registration from the retired signed assembly to the plug-in package (ADR-18, accepted 2026-09-27), and registers the Custom API metadata the code already uses. It makes **no** contract change; B1–B4 are gated separately by EDP-RE-ENH-001.

**Status of this document:** written, and dry-run verified against org5869857f (read-only, 2026-09-27). **Nothing in §4 has been executed.** Every step marked ✋ needs explicit human authorisation, given for that step at that time.

---

## 1. Versioning

| Artifact | Value | Source of truth |
|---|---|---|
| Release | **1.1.0** | `runtime/Directory.Build.props` → `RuleEngineVersion` |
| `EDP.RuleRuntime.Crm.dll` AssemblyVersion / FileVersion | 1.1.0.0 | derived from `RuleEngineVersion` |
| `EDP.RuleRuntime.dll` AssemblyVersion / FileVersion | 1.1.0.0 | derived from `RuleEngineVersion` |
| InformationalVersion (both) | `1.1.0+<source commit>` | derived; the SDK appends the commit |
| nuspec `version` | **1.0.0** | `DataversePluginPackageVersion` |
| Dataverse `pluginpackage.version` (qdb_EdpRuleRuntime) | **1.0.0**, immutable | set when the record was created, 2026-08-19 |
| nuspec `releaseNotes` | `Rule Engine 1.1.0` | derived |

**Why the package version is 1.0.0 and not 1.1.0.**
- The package record's name and version are **fixed at creation**. Microsoft Learn, *Build and package plug-in code*: *"You can't change the name and version of the plug-in package (on the server) once created. Attempting to do so by using an API call results in an error."*
- The record was created with version 1.0.0, so the nuspec now carries 1.0.0 as well. An update then cannot read as an attempt to change it.
- Microsoft Learn, *Create and register a plug-in package using PAC CLI*: *"The version of the plug-in package or plug-in assembly is not a factor in any upgrade behaviors. You can update the version of the plug-in assembly as you need."*
- **The release is identified by the assembly version inside the package.** That is also what the sandbox caches on.

**Why the org shows 1.0.0 against a 1.0.24 nuspec today.** The record was registered with version 1.0.0 on 2026-08-19, while PR #102's nuspec took `Version=$(FileVersion)` = 1.0.24. Dataverse accepted the mismatch at creation. The deployed content (downloaded read-only, SHA-256 `c0fddf94…65d4`) holds nuspec 1.0.24 and `EDP.RuleRuntime.Crm` 1.0.24.0. **It is not the current source:** it predates F2a/F2b. That is why 1.1.0 must never be shipped under a 1.0.24 label, and why `runtime/tools/verify-package.ps1` rejects that package.

**Why skip to 1.1.0.** The sandbox caches assemblies by version, so re-uploading different code as 1.0.24 could keep serving the old build.

**Bumping.** Change `RuleEngineVersion` only. Never change `DataversePluginPackageVersion`: it is the record's identity, not a release number.

## 2. Build and verify (no org access)

```bash
cd projects/enterprise-decision-platform
dotnet build runtime/src/EDP.RuleRuntime.Crm -c Release -p:PackForDataverse=true
# → runtime/src/EDP.RuleRuntime.Crm/bin/Release/qdb_EdpRuleRuntime.1.0.0.nupkg
powershell -File runtime/tools/verify-package.ps1 -PackagePath <nupkg> -SdkDirectory <folder containing Microsoft.Xrm.Sdk.dll>
```

`verify-package.ps1` checks:
- the nuspec id and the record version;
- both assemblies are at `RuleEngineVersion` and **unsigned**;
- **no** `Microsoft.Xrm` or `Microsoft.Crm` assembly is shipped;
- STJ and NCalc are shipped;
- the IPlugin types match the registration contract **exactly**.

CI runs the same check (`plugin-package` job). The build tool `Microsoft.PowerApps.MSBuild.Plugin` is pinned at **1.52.1**. Two clean builds, each restoring into an empty NuGet cache, produce a byte-identical `lib/`.

## 3. The registration contract

`deploy/registration/rule-engine-registration.json` is the one statement of the Rule Engine's registrations:
- the active and legacy assemblies;
- the 9 plug-in types;
- the 22 operations, with every request parameter (type, optionality) and response property;
- the 8 entity steps.

What derives from it:

| Consumer | How |
|---|---|
| On-prem manifest `onprem/actions-manifest.json` | **generated**: `node deploy/tools/generate-onprem-manifest.mjs` (CI fails if stale) |
| Cloud Custom API metadata | `deploy/a7-metadata.mjs` adds what the org lacks; refuses on any incompatible definition |
| Re-point / rollback | `deploy/a7-repoint.mjs` classifies the live org against it |
| Plug-in source | CI fails if a plug-in reads or writes an argument the contract does not declare (the check that would have caught `ExecutionId` / `ChildResultsJson` / `ChildCollectionName`) |
| Legacy scripts | take assembly names from it via `deploy/lib/runtime-target.cjs` |
| Packaging | `verify-package.ps1` compares the package's IPlugin types with it |

A contract change is a contract change: under CLAUDE.md, adding or changing an operation's arguments (B3/B4) needs its BRD approved first.

## 4. Release sequence (✋ = human authorisation required for that step)

| # | Step | Tool | Writes |
|---|---|---|---|
| 1 | Build + verify the 1.1.0 package | §2 | none |
| 2 | Dry run; review the plan and the snapshot | `node deploy/a7-repoint.mjs` | none (local snapshot only) |
| 3 | ✋ Back up the currently deployed package content | GET `pluginpackages(<id>)/package/$value` → keep the `.nupkg` with the run | none |
| 4 | ✋ **CEO ship decision** (`.claude/workflows/release.md`) | — | — |
| 5 | ✋ Update the package content with the 1.1.0 nupkg | PRT **Update** on `qdb_EdpRuleRuntime`, or `pac plugin push --pluginId <package id> --type Nuget` | the package |
| 6 | Dry run again; expect **0 problems**, 3 metadata creates, 29 moves | `a7-repoint.mjs` | none |
| 7 | ✋ Apply: metadata **first**, then moves, then wait and verify | `a7-repoint.mjs --apply` | metadata + bindings |
| 8 | Read-only smoke | `a7-repoint.mjs --smoke` | none |
| 9 | ✋ Soak, then (separately authorised) remove the signed 1.0.23 assembly | — | — |

**Step 5 note:**
- Package types must not be removed or renamed. *"If your update removes any plug-in assemblies, or types which are used in plug-in step registrations, the update will be rejected."*
- 1.1.0 keeps all 9 types, and `verify-package.ps1` checks this.
- **Unverified until authorised:** whether the tool you use sends the nuspec version during an update. Carrying the record's version (1.0.0) makes the answer irrelevant.

**Step 7 order is mandatory.** `EvaluateDecisionPlugin` writes `ExecutionId` unconditionally, and neither `ExecutionId` nor `ChildResultsJson` is registered on the org today. The tool registers metadata before moving any binding, and refuses to move anything while an incompatible definition exists.

**Expected live plan** (dry run, 2026-09-27, org5869857f):
- **30 registrations**: 22 Custom APIs (21 on signed 1.0.23, `ValidateRule` already on the package) and 8 entity steps (6 AppendOnlyGuard, 2 DeleteAudit). No step images.
- **3 metadata creates**, all on EvaluateDecision: `ChildCollectionName` (request, String, optional), and `ChildResultsJson` and `ExecutionId` (response, String).
- **29 moves; 0 problems.**

These numbers are evidence, not a hard-coded expectation: the tool re-derives them every run.

## 5. How the re-point tool decides

- **Identity, never display names.** Assemblies are matched by exact name from the contract. Plug-in types by exact CLR full name, *scoped to one of those assembly ids*. Custom APIs by exact unique name. Entity steps by (plug-in type, message, table, stage, mode).
- **Refuses (no write at all) when:**
  - an assembly is missing or duplicated;
  - the active assembly is not in a plug-in package;
  - a contract plug-in type is missing from the active assembly;
  - a plug-in type sits in an assembly the contract does not name;
  - an operation is missing, or bound to the wrong type;
  - a Custom API's implementation step disagrees with its API;
  - an entity step is missing, **registered twice** (it would run twice), disabled, or has images the contract does not declare;
  - any step on an EDP plug-in type is not in the contract;
  - any existing parameter's type, optionality or direction differs.
- **Partial migration is a supported state.** Already-moved items are `unchanged`, so a re-run finishes the job (idempotent).
- **Applies one item at a time and stops at the first failure.** Every attempt is written to `changelog.jsonl` with the before and after plug-in type.
- **Waits** (default 20 s) before re-reading and verifying. Verifying immediately after a re-point gave a false failure during ADR-18 P1.
- **Never deletes.** There is no delete call in the tools; CI fails if one appears.

## 6. Rollback

| Question | Answer |
|---|---|
| How do registrations return to 1.0.23? | `a7-repoint.mjs --rollback <snapshot.json> --apply` re-binds each item to the plug-in type recorded in the pre-change snapshot. `--to-legacy --apply` binds everything to the signed assembly without needing a snapshot |
| Is the previous package recoverable? | Yes. The signed 1.0.23 assembly **stays registered** until its removal is separately authorised; rollback needs no package at all. The pre-update package content is downloaded at step 3 and can be re-uploaded the same way it was updated |
| What happens to the new API metadata? | It stays. It is additive: 1.0.23 never writes those outputs or reads that input, so leaving them registered is harmless. Removing a parameter is a deliberate manual act, never part of rollback |
| What if only part of the re-point succeeded? | Each item is independent. The change log names exactly which moved. Either re-run `--apply` to finish, or `--rollback <snapshot>` to move back only the items that changed |
| How is rollback verified? | The tool waits, re-reads every registration and compares it with the snapshot (`VERIFIED` or a per-item mismatch list), then `--smoke` |
| What is irreversible? | Execution-log rows written by use during the window. They are append-only by design and are not touched. Nothing else |

## 7. Legacy registration scripts

`bre-register.js`, `bre-register-analysis.js`, `bre-register-intel.js`, `bre-register-meta.js`, `bre-register-svc.js` and `bre-governance.js` upload an ILRepacked DLL into the **signed** assembly and bind Custom APIs to its types. Run routinely after A7, they would move the cloud runtime back to 1.0.23.

- They now **refuse to run** unless `EDP_ALLOW_LEGACY_SIGNED_REGISTRATION=1` is set, which is for deliberate rollback only.
- They take the assembly name from the contract.
- `bre-register-pin-guard.js` now targets the **active** assembly, scopes its plug-in-type lookup to that assembly (it previously matched by name across all assemblies), and identifies steps by message, table and handler instead of display name.
- CI (`deploy/test/legacy-registration-guard.test.mjs`) fails if any script hard-codes the legacy name, binds without reading the contract, or targets the legacy assembly without the guard.

## 8. On-prem

`onprem/actions-manifest.json` is generated from the contract: all 22 operations (it had 12), EvaluateDecision's full argument set, and the 8 entity steps.

**Status: On-Prem Compatible by Design — Runtime Validation Pending.** No on-prem instance has run any of this. The on-prem build remains the ILRepacked, signed assembly (`runtime/pack.sh`, needs `edp.snk`).

## 9. Live gates (none executed)

1. ✋ CEO ship decision.
2. ✋ Back up and update the package.
3. ✋ Metadata registration and re-point (`--apply`).
4. ✋ Remove signed 1.0.23 (after a soak).
5. ✋ Any rollback.

Not part of A7 and separately gated:
- pin-guard step registration;
- B1–B4 (EDP-RE-ENH-001);
- the rule-key backfill and uniqueness key.
