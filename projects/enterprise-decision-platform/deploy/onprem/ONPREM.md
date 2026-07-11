# EDP on Dynamics 365 Customer Engagement (on-premises)

The Enterprise Decision Platform runtime is built to run on **Dynamics 365 CE on-premises 9.x**
as well as Dataverse cloud. The **same signed assembly** and the **same designer** are used; only
the *message surface* and the *deployment mechanics* differ.

> **Why this exists:** on-premises predates **Custom API** (which GA'd online in 2020). So on-prem
> the EDP operations are exposed as unbound **Custom (Process) Actions**, and the plugin classes are
> registered as steps on those actions' messages. The plugin C# is **identical** in both worlds —
> it dispatches on `context.MessageName` and reads/writes `InputParameters`/`OutputParameters`
> exactly the same way whether the message is a Custom API or a Custom Action.

---

## What is different from cloud

| Concern | Cloud (Dataverse) | On-premises (D365 CE 9.x) |
|---|---|---|
| Operation surface | Custom API (`customapi`) | **Custom Action** (unbound Process action) |
| Read ops (`Get*`, `ResolveEffectiveVersion`) | OData **Function** (GET) | Plain **Action** (POST/Execute) — same `ResultJson` |
| Plugin binding | Bound to the Custom API's plugin type | **SDK message-processing step** on the action's message |
| Registration tooling | Web API scripts (`deploy/*.js`, Azure AD auth) | **Plugin Registration Tool** + solution import (AD/IFD auth) |
| API authorization | `executeprivilegename` on the Custom API (F-03) | No Action equivalent — enforce in-plugin / via table privileges (see below) |
| Designer message calls | Functions via GET | Built with `VITE_EDP_ONPREM=true` → Action POST |

Everything else — entities, columns (including the effective-dating `qdb_edp_effectivefrom` /
`qdb_edp_effectiveto`), the execution-log telemetry, the governance model — is standard metadata
and behaves the same on-prem.

---

## Prerequisites

- Dynamics 365 **Customer Engagement (on-premises) 9.0+** (Custom Actions + modern plugin sandbox).
- **Plugin Registration Tool** (from the D365 SDK / NuGet `Microsoft.CrmSdk.XrmTooling.PluginRegistrationTool`).
- The strong-name key `runtime/pack/edp.snk` (supplied out-of-band; **rotate before production** — F-05).
- A system-customizer / system-admin account on the on-prem org.

---

## Deployment

The recommended path authors everything **once** in a dev org and ships it as a **single solution**.

### 1. Build the signed assembly (same as cloud)

```bash
cd runtime
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
bash pack.sh          # → runtime/pack/EDP.RuleRuntime.Crm.Signed.dll (net462, strong-named)
```

The assembly targets **net462** (the on-prem plugin runtime) and its core is **netstandard2.0**; the
formula engine (NCalc) is a pure AST interpreter with **no `Compile()`**, so it runs inside the
on-prem sandbox without partial-trust/CAS issues.

### 2. Import the EDP schema

Import the **BusinessRuleEngine** solution (entities `qdb_edp_*`, the effective-dating columns, option
sets, security roles). If you are standing the schema up fresh on-prem, create it from the same
definitions the cloud scripts use (`deploy/bre-deploy.js` is the schema source of truth) — but run
metadata creation with **on-prem auth**, not the Azure AD path in those scripts.

### 3. Create the Custom Actions

For **each** message in [`actions-manifest.json`](./actions-manifest.json), create an **unbound Process
Action** (Settings → Processes → New → Category: *Action*, Entity: *None (global)*):

- **Unique Name** = the message `name` (e.g. `qdb_edp_ValidateRule`).
- **Process Arguments (input)** = each `inputs[]` entry — Name, Type, Required per the manifest.
  All are `String` except `EvaluateDecision.TargetRef` which is `EntityReference`.
- **Process Arguments (output)** = each `outputs[]` entry — Name + Type. RuleService messages have a
  single `ResultJson` (String); `EvaluateDecision` and `RuleGovernanceAction` have their specific
  outputs (see manifest).
- **Activate** the action (it can be an empty action — the plugin supplies the logic).

Tip: author these in a dev org, add them to the solution, and they travel with the export.

### 4. Register the assembly + steps (Plugin Registration Tool)

1. Connect the PRT to the on-prem org.
2. **Register New Assembly** → `EDP.RuleRuntime.Crm.Signed.dll` → **Sandbox** isolation, database location.
3. For each message in the manifest, **Register New Step**:
   - **Message** = the action's unique name (e.g. `qdb_edp_ValidateRule`).
   - **Plugin** = the class in the manifest `plugin` field
     (`RuleServicePlugin` for the 10 service ops, `EvaluateDecisionPlugin` for `qdb_edp_EvaluateDecision`,
     `GovernanceActionPlugin` for `qdb_edp_RuleGovernanceAction`).
   - **Stage** = *PostOperation* (the action body runs, then the plugin fills outputs), **Synchronous**.

### 5. Deploy the designer (on-prem build)

```bash
cd designer
VITE_EDP_ONPREM=true npm run build
```

This flips the read-op calls from OData Function GET to Action POST (`src/dataverse/messaging.ts`).
Publish `dist/` as web resources under `qdb_edp_designer/` (the on-prem equivalent of
`bre-webresources.js` — via solution import or the web-resource UI).

### 6. Authorization (replaces F-03 `executeprivilegename`)

Custom Actions have no `executeprivilegename`. Two layers give equivalent protection on-prem:

1. **Table privileges** — every EDP operation reads/writes `qdb_edp_*` tables, so a caller without
   the relevant table privilege already fails. Assign the EDP security roles (from the schema import).
2. **In-plugin check (optional hardening)** — if you need an explicit per-message gate, add a
   privilege check at the top of the plugin's `Execute` (e.g. verify the caller holds
   `prvReadqdb_edp_rule`) and throw `InvalidPluginExecutionException` otherwise. Keep this behind an
   env/config flag so cloud (which uses `executeprivilegename`) is unaffected.

---

## Verification

The cloud `deploy/verify-*.js` scripts prove the runtime behaviour and are a good checklist, but they
authenticate via Azure AD. On-prem, re-point them at the org with **AD/IFD auth** (or reproduce the
calls with an authenticated `IOrganizationService` / a Postman collection using Windows auth), then
confirm, per feature:

- `ValidateRule` / `TestRule` return diagnostics / outputs (incl. `reasonCodes`).
- `RunScenarios` runs the saved suite; the **regression gate** blocks Publish on failure.
- `GetRuleAnalytics`, `ResolveEffectiveVersion`, `GetRuleHistory` return their `ResultJson`
  **as Actions** (POST) rather than Functions.
- The designer (built with `VITE_EDP_ONPREM=true`) loads, and Analytics populates.

---

## Known deltas / caveats

- **Not yet validated on an on-prem instance.** Compatibility is by-design (net462 target,
  sandbox-safe runtime, Custom Actions) — treat this runbook as the enablement path, not a
  certified deployment, until it has been run on a real on-prem org.
- **Older on-prem (< 9.0)** lacks the modern Custom Action + sandbox behaviour EDP relies on — not supported.
- **NCalc CVE note (ADR-SEC-NCALC / QA-B3):** the pinned NCalcSync 5.4.2 carries the factorial-DoS
  advisory; the fix requires System.Text.Json 10.x which is incompatible with the net462 sandbox.
  Same posture as cloud — mitigated by input/complexity limits, revisit at a framework bump.
- **SNK rotation (F-05)** applies here too — supply a fresh key before a production on-prem cutover.
