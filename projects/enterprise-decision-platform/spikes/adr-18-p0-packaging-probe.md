# Spike — ADR-18 P0: does the plug-in package model bind its own versions, and load unsigned?

**Date:** 2026-08-19
**Status:** COMPLETE — **both questions answered YES, observed in org5869857f**
**Harness:** `spikes/packaging-probe/` — **committed**, builds a throwaway package
**Org residue:** **none.** Every object created was deleted and the deletion verified

---

## Why this ran

ADR-18 argued that EDP's compounding dependency-pin problem is really a packaging problem, and
that two claims from Microsoft's documentation — if true — would remove the reason W0-1 exists.
The ADR was explicit that **nothing should change on the strength of documentation alone**, and
gated itself on this probe. The sponsor authorised it on 2026-08-19 and held ADR-18 at
Proposed until it ran.

| # | Question | Why it matters |
|---|---|---|
| **Q1** | Does a package bind the dependency version it **ships**, or does the sandbox's own copy win? | If the package wins, the pin problem dissolves — versions become ours to choose |
| **Q2** | Does an **unsigned** assembly load? | W0-1 exists *only* because the assembly must be signed |

---

## Method

A throwaway plug-in package containing one no-op `IPlugin` that reports what the sandbox
actually loaded. It read nothing, wrote nothing, and touched no EDP object.

- Target `net462`, **`SignAssembly=false`** — deliberately unsigned.
- **`System.Text.Json 10.0.5`** referenced without `PrivateAssets`, so it ships inside the
  package. That is precisely the version `EDP.RuleRuntime.csproj` calls "incompatible with the
  net462 sandbox".
- Verified **before** upload: shipped `System.Text.Json.dll` is **10.0.0.5**; the probe
  assembly has an **empty public key token**.
- Registered as a `pluginpackage`, invoked through a temporary Custom API, then deleted.

---

## Results

### Registration — Q2 answered at import time

```
PluginAssembly: packaging-probe v1.0.0.0
  publickeytoken: null          <- UNSIGNED, and it registered
  isolationmode:  2             <- sandbox
  plugin types:   Msst.Edp.PackagingProbe.PackagingProbePlugin
```

### Execution — Q1 and Q2 both answered at runtime

```json
{
  "probeAssembly": "packaging-probe, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null",
  "probeIsSigned": "false",
  "systemTextJsonVersion": "10.0.0.5",
  "systemTextJsonFullName": "System.Text.Json, Version=10.0.0.5, Culture=neutral, PublicKeyToken=cc7b13ffcd2ddd51",
  "systemTextJsonLocation": "C:\\AssemblyCache\\{3c724c8a-…}\\lib\\net462\\System.Text.Json.dll",
  "clrVersion": "4.0.30319.42000"
}
```

**Q1 — YES.** The sandbox loaded **10.0.0.5**, the version the package shipped. The location
settles any doubt: it came from a **per-package assembly cache directory keyed by the package
id**, not from the sandbox's own copy.

**Q2 — YES.** An unsigned assembly registered *and executed* in sandbox isolation.

---

## What this establishes

1. **System.Text.Json 10.x runs in a net462 Dataverse sandbox plug-in.** ADR-18 already
   disproved the "incompatible" claim on target frameworks; this disproves it at runtime.
2. **A plug-in package binds the versions it ships.** The pin problem stops being a guess
   about someone else's deployment.
3. **Signing is genuinely not required** for package-hosted assemblies.
4. **Therefore W0-1's premise does not hold for the cloud line.** W0-1 exists to rotate a
   signing key for an assembly that, under this model, does not need to be signed at all.

**This does not mean "cancel W0-1" today** — see the limits below. It means the runbook must
not be executed as though the question were settled the other way.

---

## Gotchas, all found by doing rather than reading

1. **`pac plugin push` cannot create a package.** It only *updates* one, failing with
   `Entity 'pluginpackage' With Id = … Does Not Exist`. Creation goes through the Web API.
2. **The `pluginpackage.name` attribute must carry the solution publisher prefix**, not just
   `uniquename` and not just the nuspec `<id>`. The error is
   `0x80040265 "The nuget file name does not contain a solution prefix … named: 0"`, which
   points at a file name and is actually about the `name` column. Three attempts were spent on
   the wrong field.
3. The nuspec `<id>` needs the prefix too — here `qdb_EdpPackagingProbe`.
4. `pac plugin init` scaffolds a **signed** project by default; `SignAssembly` must be turned
   off explicitly to test the unsigned path.

---

## Limits — what this did NOT prove

| Not tested | Consequence |
|---|---|
| **EDP's real assembly** under the package model | Proven with a trivial plugin. EDP has 9 plugin types, 30 SDK steps and 22 Custom APIs; migration is a separate exercise |
| **Removing ILRepack** end-to-end | The package model supersedes it in principle; not demonstrated here |
| **NCalc 6.x** binding cleanly | ADR-18 P2. Now plausible, still unobserved |
| Behaviour under **solution export/import** | The probe was created directly, not carried through an ALM cycle |
| **On-premises** | Packages are unsupported there. The on-prem line keeps ILRepack and signing regardless |
| Custom workflow activities | Unsupported in packages. EDP registers `IPlugin` types only, so this does not currently bite |

---

## Recommendation

1. **ADR-18 moves from held to acceptable** — its P0 condition is met.
2. **Do not execute `wave-0-snk-rotation-scope.md` as written** until the cloud line's
   packaging decision is made. A note has been added to that runbook.
3. **Next proof is EDP's own assembly**, not another probe: build the real runtime as a
   package, register it beside the existing signed assembly under a different name, and verify
   the 22 Custom APIs resolve. The Report Engine's re-key showed that registering alongside and
   re-pointing is safe; the same shape applies here.
4. **Dual packaging remains the price** — cloud on packages, on-prem on ILRepack and signing.

---

## VERIFICATION

| Claim | How | Result |
|---|---|---|
| Shipped STJ is 10.0.0.5, probe unsigned | Read from the built DLLs before upload | **Verified locally** |
| Unsigned assembly registers, sandbox isolation | `pluginassemblies` row after import | **Observed: `publickeytoken: null`, `isolationmode: 2`** |
| Sandbox loads the shipped version | Plugin reported the loaded assembly at runtime | **Observed: 10.0.0.5 from the package assembly cache** |
| Org left clean | Deleted all three objects, then re-queried | **0 packages, 0 assemblies, 0 custom APIs remaining** |
| EDP's own assembly under this model | **NOT TESTED** | The material limit on this result |
| net462 EOL date 2027-01-12 | Documentation, not re-confirmed here | Carried from ADR-18, still worth checking before planning against it |
