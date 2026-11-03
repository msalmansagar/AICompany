# EDP Deployment Scripts

Node scripts that deploy the BusinessRuleEngine solution to Dataverse via the Web API.
They read the service-principal credentials from a `.env` file — no secrets are embedded.
All are idempotent.

**Credentials path (F-09).** The `.env` path is taken from the `EDP_ENV_PATH` environment
variable, falling back to a legacy default if unset. Copy `.env.example` to your own `.env`
and run e.g. `EDP_ENV_PATH=/abs/path/edp.env node bre-api-privileges.js`. Required keys:
`AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `DATAVERSE_URL`. The plugin
DLL path is likewise overridable via `EDP_DLL_PATH`.

## Plug-in registration: cloud (ADR-18, A7)

The cloud runtime is the **plug-in package** `qdb_EdpRuleRuntime` (assembly `EDP.RuleRuntime.Crm`).
Its registrations are declared once in [`registration/rule-engine-registration.json`](registration/rule-engine-registration.json).
Read [`A7-RELEASE-PROCEDURE.md`](A7-RELEASE-PROCEDURE.md) before any release.

| Tool | Purpose | Default |
|------|---------|---------|
| `a7-repoint.mjs` | Inventory → snapshot → plan → (apply: metadata, then moves, then verify) · `--rollback <snapshot>` · `--to-legacy` · `--smoke` | **dry run** |
| `a7-metadata.mjs` | Register missing Custom API parameters/properties; refuses on incompatible definitions | **dry run** |
| `tools/generate-onprem-manifest.mjs` | Regenerate `onprem/actions-manifest.json` from the contract (`--check` for CI) | writes the file |
| `node --test test/*.test.mjs` | Tool tests against an in-memory org: never touches Dataverse | — |

The pre-A7 scripts below that register against the **retired signed assembly** (`bre-register*.js`,
`bre-governance.js`) now refuse to run unless `EDP_ALLOW_LEGACY_SIGNED_REGISTRATION=1`, which is for
a deliberate rollback only. Running them routinely would move the cloud runtime back to 1.0.23.

## Other scripts

| Script | Purpose |
|--------|---------|
| `bre-deploy.js` | Create the 22 `qdb_edp_` entities + lookups + picklists |
| `bre-envvars.js` | Create the 2 environment variables |
| `bre-register.js` | *(legacy, guarded)* Register the signed assembly + `qdb_edp_EvaluateDecision` Custom API |
| `bre-governance.js` | *(legacy, guarded)* Register the `qdb_edp_RuleGovernanceAction` Custom API |
| `bre-webresources.js` | Deploy the designer build (`designer/dist`) as web resources |
| `bre-guides.js` | Deploy the 4 in-app authoring guides (`deploy/guides/*.html`) — `--verify` compares the org against the repo without writing. Both modes first assert that every guide named in the designer's `docRedirect.ts` has a source file, and exit 1 if not |
| `bre-seed.js` / `bre-seed-all.js` | Seed sample rules |
| `bre-fixopt.js` | Make a Custom API request parameter optional (delete+recreate) |
| `bre-roles.js` | Provision the 6 EDP security roles + per-role privileges |

**Versioning.** Bump `RuleEngineVersion` in `../runtime/Directory.Build.props` on every change
that ships, so the sandbox reloads (it caches by assembly version). Never change
`DataversePluginPackageVersion`: it is the immutable version of the package record.
The on-prem build is still IL-merged and signed (see `../runtime/README.md`, `onprem/ONPREM.md`).

**The designer needs both web-resource scripts.** `bre-webresources.js` ships the app bundle;
`bre-guides.js` ships the documentation the app links to. Running only the first leaves the
in-app "Documentation" side pane rendering empty iframes — the feature fails silently, since
the pane opens correctly and simply has nothing to show.
