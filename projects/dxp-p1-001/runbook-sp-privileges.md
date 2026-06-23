# Runbook: Service Principal Privilege Configuration

**Engagement:** DXP-P1-001  
**Addresses:** CEO Condition 5 / GGAP-005 / AUD-005  
**Script:** `scripts/configure-sp-privileges/`

---

## Purpose

This runbook satisfies CEO Condition 5 from `phase-7-ceo.md`:

> Runtime SP must have only minimum required privileges on QdbDxpPlatform solution entities.
> Provisioning SP's System Administrator privilege must be revoked after initial schema provisioning.

The script creates the **QDB DXP Platform Runtime** Dataverse security role, assigns it CRUD
privileges on the two component registry entities and Read on the JTI revocation table, then
assigns that role to the runtime service principal's system user. It also reports whether the
provisioning SP still holds System Administrator (and instructs you to remove it if so).

---

## Prerequisites

Before running this script, confirm that:

1. `scripts/provision-schema/` has run successfully (entities and solution exist)
2. Both service principals have been added as **Application Users** in Dataverse:
   - **Provisioning SP** — the SP used to run `provision-schema` (holds System Administrator)
   - **Runtime SP** — the SP used by the Fastify API (`apps/api`)
3. The operator running this script has access to the provisioning SP credentials

---

## Environment Setup

```bash
cd projects/dxp-p1-001/scripts/configure-sp-privileges
npm install
cp .env.example .env
```

Edit `.env` and populate:

| Variable | Value | Source |
|---|---|---|
| `DATAVERSE_ORG_URL` | `https://org5869857f.crm4.dynamics.com` | Dataverse environment URL |
| `DATAVERSE_TENANT_ID` | Azure AD tenant ID | Azure Portal > Azure AD |
| `DATAVERSE_CLIENT_ID` | Provisioning SP client ID | Azure Portal > App registrations |
| `DATAVERSE_CLIENT_SECRET` | Provisioning SP secret | Azure Portal > Certificates & secrets |
| `RUNTIME_SP_CLIENT_ID` | Runtime SP client ID | `apps/api/.env` `CLIENT_ID` value |
| `DRY_RUN` | `false` | Set `true` first to preview |
| `LOG_LEVEL` | `info` | |

---

## Execution

### Step 1 — Dry run (verify what the script will do)

```bash
npm run configure:dry
```

Expected output:
```
[PHASE-0] Environment validated.
[PHASE-0] DRY_RUN=true — no writes will be made to Dataverse.
[PHASE-1] Token acquired.
[PHASE-2] [PASS] Runtime SP: <name> (<guid>)
[PHASE-3] [PASS] Root BU: <guid>
[PHASE-4] [DRY RUN] Would create role: "QDB DXP Platform Runtime"
[PHASE-5]   qdb_component_definitions: 4 CRUD privileges
[PHASE-5]   qdb_component_versions: 4 CRUD privileges
[PHASE-5]   qdb_portal_revoked_tokens: 1 Read privileges
[PHASE-5] [PASS] Total privileges to assign: 9
[PHASE-6] [DRY RUN] Would add 9 privileges to role dry-run-role-id
[PHASE-7] [DRY RUN] Would assign role dry-run-role-id to user <guid>
[PHASE-8] Provisioning SP roles: System Administrator
[PHASE-8] [FAIL] Provisioning SP still holds System Administrator.
[PHASE-8]        ACTION REQUIRED: Remove System Administrator from the provisioning SP in Dataverse.
```

### Step 2 — Live run

```bash
npm run configure
```

The script is **idempotent** — safe to re-run. Existing role and assignments are detected and
skipped.

### Step 3 — Revoke provisioning SP System Administrator

If Phase 8 reports `[FAIL]` after the live run:

1. Navigate to: `Dynamics 365 > Settings > Security > Users`
2. Search for the provisioning SP user by name
3. Click **Manage Roles**
4. Uncheck **System Administrator**
5. Click **OK**

Re-run the script to confirm Phase 8 now reports `[PASS]`.

### Step 4 — Record evidence for auditor

Save the full script output to a file:

```bash
npm run configure 2>&1 | tee configure-sp-privileges-$(date +%Y%m%d).log
```

Attach the log file to the DXP-P1-001 audit artefacts folder. The auditor requires:
- Phase 8 `[PASS]` — provisioning SP does not hold System Administrator
- Phase 7 `[PASS]` — runtime role assigned
- Phase 6 `[PASS]` — privileges applied

---

## What the script creates

### Security role: QDB DXP Platform Runtime

| Entity | Privilege | Depth |
|---|---|---|
| `qdb_component_definitions` | Create | Global |
| `qdb_component_definitions` | Read | Global |
| `qdb_component_definitions` | Write | Global |
| `qdb_component_definitions` | Delete | Global |
| `qdb_component_versions` | Create | Global |
| `qdb_component_versions` | Read | Global |
| `qdb_component_versions` | Write | Global |
| `qdb_component_versions` | Delete | Global |
| `qdb_portal_revoked_tokens` | Read | Global |

### Role assignment

The role is assigned to the runtime SP's system user (the Application User whose
`applicationid` matches `RUNTIME_SP_CLIENT_ID`).

---

## Troubleshooting

### "Runtime SP system user not found"

The runtime SP has not been added as an Application User in Dataverse.

1. Go to `Settings > Security > Users`
2. Switch view to **Application Users**
3. Click **New** and enter the runtime SP's client ID

### "EntityDefinitions — entity not found" on `qdb_portal_revoked_tokens`

The revoked tokens entity may not be in this Dataverse environment. The script logs a warning
and continues. The `auth-guard` plugin operates fail-open when the entity is unreachable, so
this is not a blocking issue. Raise with the architect.

### Script fails on Phase 6 with "Caller does not have required privilege"

The provisioning SP still needs System Administrator (or equivalent) to manage role privileges.
Confirm `DATAVERSE_CLIENT_ID` refers to the provisioning SP, not the runtime SP.

---

## Security notes

- The `.env` file containing `DATAVERSE_CLIENT_SECRET` must **never** be committed to source control.
- The secret is transmitted only over MSAL secure channels and is never logged.
- After the provisioning SP's System Administrator is revoked, this script cannot be re-run
  with the same credentials (the SP would lack permission to create/modify roles). Keep a
  separate break-glass procedure or retain one admin account for this purpose.
