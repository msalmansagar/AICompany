# EDP Deployment Scripts

Node scripts that deploy the BusinessRuleEngine solution to Dataverse via the Web API.
They read the service-principal credentials from `dynamic-form-engine/backend/.env`
(AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / DATAVERSE_URL) — no secrets
are embedded. All are idempotent.

| Script | Purpose |
|--------|---------|
| `bre-deploy.js` | Create the 22 `qdb_edp_` entities + lookups + picklists |
| `bre-envvars.js` | Create the 2 environment variables |
| `bre-register.js` | Register the plugin assembly + `qdb_edp_EvaluateDecision` Custom API |
| `bre-governance.js` | Register the `qdb_edp_RuleGovernanceAction` Custom API |
| `bre-webresources.js` | Deploy the designer build (`designer/dist`) as web resources |
| `bre-seed.js` / `bre-seed-all.js` | Seed sample rules |
| `bre-fixopt.js` | Make a Custom API request parameter optional (delete+recreate) |

Plugin assembly must be IL-merged first (see `../runtime/README.md`); bump the
`AssemblyVersion` in `EDP.RuleRuntime.Crm.csproj` on every change so the sandbox reloads.
