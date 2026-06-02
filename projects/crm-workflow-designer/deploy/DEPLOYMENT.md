# CRM Visual Workflow Designer — Deployment Guide

This guide covers deploying the QDB Workflow Designer to both
Dynamics 365 Online (org5869857f.crm4.dynamics.com) and
Dynamics CRM On-Premise 9.x.

---

## Prerequisites

- Node.js 18 or later (`node --version`)
- `npm install` completed (installs ts-node, TypeScript, and build tooling)
- Azure service principal with Dataverse access:
  - Tenant ID: `d79e793c-f6de-4204-8508-7980a63df957`
  - Client ID: `08e80e93-0bab-45ef-8372-2e554fa9af9b`
  - Client Secret: stored in a secret manager — never in source control

---

## Deployment: Dynamics 365 Online (org5869857f.crm4.dynamics.com)

### Step 1 — Set environment variables

PowerShell:
```powershell
$env:AZURE_TENANT_ID     = "d79e793c-f6de-4204-8508-7980a63df957"
$env:AZURE_CLIENT_ID     = "08e80e93-0bab-45ef-8372-2e554fa9af9b"
$env:AZURE_CLIENT_SECRET = "<your-client-secret>"
```

Bash:
```bash
export AZURE_TENANT_ID="d79e793c-f6de-4204-8508-7980a63df957"
export AZURE_CLIENT_ID="08e80e93-0bab-45ef-8372-2e554fa9af9b"
export AZURE_CLIENT_SECRET="<your-client-secret>"
```

### Step 2 — Run schema migration (idempotent — safe to re-run)

```bash
npm run migrate
```

The migrate script:
- Acquires a token via client credentials flow
- Checks each entity for existence before creating it (idempotent)
- Creates four tables: Process, Step, Outcome, Route
- Adds all lookup attributes in a second phase (cross-entity references)
- Calls PublishAllXml on completion
- Retries 503 Service Unavailable errors with exponential backoff (8s, 16s, 24s)

On success the output ends with:
```
  [OK]   PublishAllXml — all customisations published

  Migration complete.
```

### Step 3 — Build and package the solution

```bash
npm run package
```

This runs `npm run build` followed by `node scripts/packageSolution.js`.
The output is `deploy/QdbWorkflowDesigner_1.0.0.zip`.

To override the version number:
```bash
node scripts/packageSolution.js --version 1.1.0
```

### Step 4 — Import the solution

1. Open https://org5869857f.crm4.dynamics.com
2. Navigate to: Settings > Solutions
3. Click Import
4. Select `deploy/QdbWorkflowDesigner_1.0.0.zip`
5. Follow the import wizard (leave all defaults)
6. Wait for the import to complete

### Step 5 — Publish all customizations

After import, click "Publish All Customizations" in Settings > Solutions,
or run:

```powershell
# Via Web API (requires a valid Bearer token)
$token = az account get-access-token `
  --resource "https://org5869857f.crm4.dynamics.com/" `
  --query accessToken -o tsv

Invoke-RestMethod `
  -Uri "https://org5869857f.crm4.dynamics.com/api/data/v9.2/PublishAllXml" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token"; "OData-Version" = "4.0" }
```

### Step 6 — Assign the security role

1. Settings > Security > Users
2. Select the user(s) who need access to the designer
3. Manage Roles > tick "Workflow Designer User"
4. OK

### Step 7 — Verify the web resource loads

Navigate to:
```
https://org5869857f.crm4.dynamics.com/WebResources/qdb_/workflow-designer/workflow-designer.htm
```

The React SPA should load without console errors. If you see a 404, confirm
the solution import completed successfully and that Publish All Customizations
was run.

The web resource is also accessible from the SiteMap:
- Left nav > Workflow Designer > Workflow Designer

### Step 8 — Seed demo data (optional)

Creates one sample "Loan Application" workflow with 3 steps, 6 outcomes,
and 5 routes for functional testing.

```bash
npm run seed
```

Note: the seed script is NOT idempotent — running it twice creates duplicate
demo records. To reset, delete the records from Settings > Customizations > 
Developer Resources > or via Web API before re-seeding.

---

## Deployment: Dynamics CRM On-Premise 9.x

The build and package steps are identical. The schema migration requires an
org URL override because there is no Azure AD app token endpoint for on-prem.

### Option A — Service account token (AD FS / IFD)

For IFD deployments that have an ADFS STS, client credentials flow works
identically to cloud. Override the org URL:

```bash
export CRM_ORG_URL="https://yourcrm.company.com"
npm run migrate
```

### Option B — Manual schema creation

For on-prem environments without an ADFS token endpoint, create the four
entities manually through the CRM Customization UI before importing the
solution:

1. Settings > Customizations > Customize the System
2. Create entity `qdb_work_item_record_type` with the columns listed in
   `scripts/migrate-workflow-schema.ts` (TABLE 1 section)
3. Repeat for `qdb_work_item_steps`, `qdb_outcome`, `qdb_outcomeworktasks`
4. Add lookup attributes as described in the TABLE 2–4 lookup sections
5. Publish All Customizations

### Build and package

```bash
npm run build
node scripts/packageSolution.js
```

### Solution import

Settings > Solutions > Import > upload `deploy/QdbWorkflowDesigner_1.0.0.zip`

On-prem import follows the same steps as cloud. The solution ZIP format is
compatible with CRM 9.x On-Premise.

### Publish and assign role

Same as cloud steps 5 and 6 above.

### Verify

```
https://yourcrm.company.com/WebResources/qdb_/workflow-designer/workflow-designer.htm
```

---

## SiteMap Configuration

The solution package includes a SiteMap entry. After import it appears as:

```
Area:    Workflow Designer  (Id: qdb_workflowdesigner_area)
Group:   Workflow Designer  (Id: qdb_workflowdesigner_group)
SubArea: Workflow Designer  (Id: qdb_workflowdesigner_subarea)
URL:     $webresource:qdb_/workflow-designer/workflow-designer.htm
```

If you need to embed the designer inside an existing SiteMap area instead,
add this SubArea XML to your customizations.xml:

```xml
<SubArea Id="qdb_workflowdesigner_subarea"
         Icon="/_imgs/ico_16_webresource.gif"
         Title="Workflow Designer"
         Url="$webresource:qdb_/workflow-designer/workflow-designer.htm"
         Client="All"
         AvailableOffline="false"
         PassParams="false"
         Sku="All">
  <Titles>
    <Title LCID="1033" Title="Workflow Designer" />
  </Titles>
  <Descriptions>
    <Description LCID="1033"
      Description="Open the visual workflow designer to create and manage CRM workflow processes." />
  </Descriptions>
</SubArea>
```

Place it inside the `<Group>` of your target area, then Publish All.

---

## Rollback

To remove the solution:
1. Settings > Solutions > select QdbWorkflowDesigner > Delete
2. Confirm deletion

Deleting an unmanaged solution does NOT delete the customized entities or
data — it only removes the solution container. To remove the entities and
all data, delete each entity individually from the Customization UI.

For production deployments, use a Managed solution (set `<Managed>1</Managed>`
in solution.xml before packaging). Managed solutions can be deleted cleanly,
which removes all components they introduced.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| 401 on migrate | Token expired or wrong scope | Re-run — script acquires a fresh token |
| 503 on migrate | Dataverse maintenance window | Script retries automatically (3 attempts) |
| Entity already exists skipped | Prior partial run | Expected — script is idempotent |
| Import error: component not in target | Solution version mismatch | Run migrate first, then re-import |
| Web resource 404 after import | Publish not run | Settings > Solutions > Publish All |
| SiteMap entry not visible | User lacks security role | Assign "Workflow Designer User" role |
| Blank page in designer | CORS / mixed content | Ensure org URL uses HTTPS |
