# DCP-001 CRM Scripts

Idempotent Node.js scripts for DCP-001 schema provisioning and plugin registration.
All scripts share `lib/crm-client.mjs`.

Required env vars: `DV_TENANT_ID`, `DV_CLIENT_ID`, `DV_CLIENT_SECRET`, `DV_DATAVERSE_URL`.
Run: `node --env-file="<path>/.env" projects/debtcollection/crm/scripts/<script>.mjs`

---

## provision-schema.mjs

Provisions Phase 1 entities, option sets, relationships, status codes, security roles,
and field-security profiles. Skips existing components by logical name / alternate key.

```
node --env-file=".env" projects/debtcollection/crm/scripts/provision-schema.mjs
```

## verify-schema.mjs

Reads back every provisioned entity, attribute, and relationship; reports counts.
Run after provisioning to confirm completeness.

```
node --env-file=".env" projects/debtcollection/crm/scripts/verify-schema.mjs
```

## cleanup-ptp-picklist.mjs

**One-off, already run on the sandbox on 2026-09-15.** Deleted the draft picklist column
`msst_dcpptprecord.msst_ptpstatus` and the global option set `msst_dcpptpstatus`, because the PTP
lifecycle lives in the platform `statuscode` (architecture section 4.3). Do not run again.

## register-plugins.mjs

Registers `Qdb.DebtCollection.Plugins.dll` and all 28 steps from REGISTRATION.md.
Assembly is patched only when its sha256 content hash has changed. Steps and images
are skipped if they already exist by deterministic name.

```
# Dry run (no API calls)
node --env-file=".env" projects/debtcollection/crm/scripts/register-plugins.mjs --dry-run

# Live registration
node --env-file=".env" projects/debtcollection/crm/scripts/register-plugins.mjs

# Override DLL path
node --env-file=".env" projects/debtcollection/crm/scripts/register-plugins.mjs --dll <path>
```

Build the DLL first (`dotnet build -c Release` in `crm/plugins/Qdb.DebtCollection.Plugins/`).
Run only after `provision-schema.mjs` — steps reference entities that must exist first.
