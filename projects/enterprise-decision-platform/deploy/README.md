# EDP Deployment Scripts

Node scripts that deploy the BusinessRuleEngine solution to Dataverse via the Web API.
They read the service-principal credentials from a `.env` file — no secrets are embedded.
All are idempotent.

**Credentials path (F-09).** The `.env` path is taken from the `EDP_ENV_PATH` environment
variable, falling back to a legacy default if unset. Copy `.env.example` to your own `.env`
and run e.g. `EDP_ENV_PATH=/abs/path/edp.env node bre-api-privileges.js`. Required keys:
`AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `DATAVERSE_URL`. The plugin
DLL path is likewise overridable via `EDP_DLL_PATH`.

| Script | Purpose |
|--------|---------|
| `bre-deploy.js` | Create the 22 `qdb_edp_` entities + lookups + picklists |
| `bre-envvars.js` | Create the 2 environment variables |
| `bre-register.js` | Register the plugin assembly + `qdb_edp_EvaluateDecision` Custom API |
| `bre-governance.js` | Register the `qdb_edp_RuleGovernanceAction` Custom API |
| `bre-webresources.js` | Deploy the designer build (`designer/dist`) as web resources |
| `bre-guides.js` | Deploy the 4 in-app authoring guides (`deploy/guides/*.html`) — `--verify` compares the org against the repo without writing |
| `bre-seed.js` / `bre-seed-all.js` | Seed sample rules |
| `bre-fixopt.js` | Make a Custom API request parameter optional (delete+recreate) |
| `bre-roles.js` | Provision the 6 EDP security roles + per-role privileges |

Plugin assembly must be IL-merged first (see `../runtime/README.md`); bump the
`AssemblyVersion` in `EDP.RuleRuntime.Crm.csproj` on every change so the sandbox reloads.

**The designer needs both web-resource scripts.** `bre-webresources.js` ships the app bundle;
`bre-guides.js` ships the documentation the app links to. Running only the first leaves the
in-app "Documentation" side pane rendering empty iframes — the feature fails silently, since
the pane opens correctly and simply has nothing to show.
