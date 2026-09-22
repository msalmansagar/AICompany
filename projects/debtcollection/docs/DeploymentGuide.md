# DCP — Deployment Guide (Phase 0 proposal)

**Status:** proposal · 2026-09-17 · Master Prompt §83 · Correction Prompt §1–2. Describes the *target*
pipeline. Today only the cloud path exists (Web-API scripts, Entra auth, no solution package).
**Every on-prem step below is "not yet executed for DCP".** No values, no secrets — names only.

---

## 1. One source → two packages

```
                       Source repository (projects/debtcollection)
                                       │
                                     BUILD (one commit, one run)
             ┌─────────────────────────┼─────────────────────────┐
             ▼                         ▼                         ▼
   React workspace bundle      Qdb.DebtCollection.Plugins     Integration Service image
   qdb_dcp_workspace.html      (net471, signed once,           (Fastify, containerised,
   (single file, house         key.snk — same identity          same image both targets)
    pattern: DFE, Report Eng.)  on both platforms)
             └─────────────────────────┼─────────────────────────┘
                                       ▼
                        CORE SOLUTION  qdb_debtcollection.zip
                        entities · choices · relationships · alternate keys · roles ·
                        queues · field security · web resource(s) declared individually
             ┌─────────────────────────┴─────────────────────────┐
             ▼                                                   ▼
   ON-PREM PACKAGE (D365 CE 9.1)                        CLOUD PACKAGE (Dataverse)
   + Process Action definitions (one per operation)     + Custom API definitions
   + PRT registration runbook (assembly, steps, images)  + Web-API registration scripts
   + org step: facility lookup (HL / BFD)                + org step: facility lookup (HL / BFD)
   + SolutionPackageVersion = 9.0                        + Entra app registration notes
   auth: AD / IFD / AD FS                                auth: Entra client credentials
```

Application source is identical in both packages. Only definitions, scripts and registration
mechanics differ (MP §83).

---

## 2. Build steps

| # | Step | Output | Notes |
|---|---|---|---|
| 1 | `npm ci && npm run build` (monorepo) | `packages/*` dist, `apps/api` dist | type-check clean, 45+ tests |
| 2 | React build → single-file inline bundle | `qdb_dcp_workspace.html` | ≤ 5 MB (on-prem default web-resource limit); no external CDN; no absolute URLs; API version from `getGlobalContext().getVersion()` |
| 3 | `dotnet build -c Release` + ILMerge/ILRepack of Newtonsoft | `Qdb.DebtCollection.Plugins.dll` (merged, signed) | Register the **merged** DLL only — the un-merged one binds to the on-prem server's own Newtonsoft 6.0 and fails at `ParseSecureConfig` (DFE lesson) |
| 4 | Assemble `solution.xml` / `customizations.xml` | `qdb_debtcollection_<ver>.zip` (unmanaged for dev, managed for test/prod) | Every web resource declared **individually** in `RootComponents`; folder wildcards fail import. Entry names with **forward slashes** (a backslash zip was refused by CRM) |
| 5 | Emit two packages | `dist/onprem/`, `dist/cloud/` | Same solution zip + target-specific definitions/scripts |
| 6 | Container image | `dcp-integration-service:<sha>` | Config by env only |

CI (GitHub Actions / Azure DevOps — `TBD` which QDB uses) runs 1–6 on every merge to `main`; both
package directories are artefacts of the same run.

---

## 3. Environment configuration (names only)

### Integration Service (`apps/api`)
`PORT` · `NODE_ENV` · `LOG_LEVEL` · `AUTH_PROVIDER` (`adfs` \| `azure-ad`) · `AUTH_ISSUER_URL` ·
`AUTH_AUDIENCE` · `DV_DATAVERSE_URL` · **`DV_API_VERSION`** (`9.1` \| `9.2` — new, replaces the constant) ·
`DV_TENANT_ID` · `DV_CLIENT_ID` · `DV_CLIENT_SECRET` · `DV_SCOPE` · `FEATURE_BFD` · `DV_BFD_DATAVERSE_URL` ·
**`DV_BFD_API_VERSION`** · `DV_BFD_TENANT_ID` · `DV_BFD_CLIENT_ID` · `DV_BFD_CLIENT_SECRET` · `DV_BFD_SCOPE` ·
`MIS_PROVIDER` (`mock` \| `api`) · `MIS_BASE_URL` · `MIS_AUTH_*` (`TBD — Requires QDB Confirmation`) ·
`MIS_SYNC_CRON` (`TBD`) · `PGBOSS_CONNECTION` (job state only).

### Deployment tooling (`crm/scripts`)
`DV_DATAVERSE_URL` · `DV_API_VERSION` · `TOOLING_AUTH` (`entra` \| `adfs` \| `prt`) · `DV_TENANT_ID` ·
`DV_CLIENT_ID` · `DV_CLIENT_SECRET` · `ADFS_TOKEN_ENDPOINT` (on-prem, `TBD`) · `SOLUTION_NAME`.

### In-CRM (rows, never secrets)
`qdb_platformconfiguration` one active row per deployment — see `ConfigurationGuide.md`.

---

## 4. Deployment order — CLOUD (Dataverse)  *(path exercised today for `msst_`; not yet for `qdb_`)*

1. Import `qdb_debtcollection_<ver>.zip` (or run `provision-schema.mjs` with `TOOLING_AUTH=entra` in dev).
   Entity creation sets **`IsValidForQueue = true`** on `qdb_collectioncase` (the `msst_` case was
   created without it and every `AddToQueueRequest` fails — MP §59). Verify with
   `EntityDefinitions(LogicalName='qdb_collectioncase')?$select=IsValidForQueue`.
2. Org step: create `qdb_facilityid` lookup targeting the configured facility entity (`TBD` name) and
   the alternate keys.
3. Create Custom APIs (one per DCP operation) bound to the plugin types.
4. Register assembly → types → steps → images (`register-plugins.mjs`). **After recreating any image,
   disable then enable its step** (`statecode` 1/2 → 0/1) — a step caches its image definition.
5. Upload / update web resource `qdb_dcp_workspace.html`; add sitemap entry.
6. Seed `qdb_platformconfiguration` + `qdb_platformmapping` rows for this org (HL or BFD).
7. **PublishAllXml** — then **re-run it with retries**. A deploy can exit 0 with a failed publish
   (`ECONNRESET` mid-publish is recurring); "nothing changed" on the next run then skips forever.
   Recovery is an explicit `--publish`.
8. Deploy the Integration Service image with the cloud env set.
9. Verify (§6).

## 5. Deployment order — ON-PREM (D365 CE 9.1)  *(not yet executed for DCP)*

1. Confirm the org build (`TBD — Requires QDB Confirmation`) and that `solution.xml` declares
   `SolutionPackageVersion="9.0"` — a zip exported at 9.2 may be refused by an older on-prem build.
2. Raise the web-resource size limit if the org lowered it below the bundle size (default 5 MB).
3. Import `qdb_debtcollection_<ver>.zip` (unmanaged dev / managed test-prod), *Maintain customizations*.
   `IsValidForQueue = true` travels in the entity definition. Verify as in cloud step 1 via
   `/api/data/v9.1/`.
4. Org step: facility lookup for HL or BFD.
5. Create **Process Actions** (Settings → Processes → Action, entity *None*), one per DCP operation,
   unique name = the message name, arguments per the manifest; activate.
6. Plugin Registration Tool: *Register New Assembly* → merged signed DLL → **Sandbox**, database. On
   updates use **Update**, not a new registration, so steps and bindings survive. Register steps on the
   Process Action messages (PostOperation, synchronous) and on entity messages per the manifest.
7. Web resource + sitemap via the solution import; if editing later, re-point the inner
   `main.aspx?pagetype=webresource&webresourceName=…` URL with a cache-buster — a full publish plus
   Ctrl+F5 still serves a stale web resource from memory cache. Never use the raw `/WebResources/` path
   (no `Xrm` there).
8. Seed configuration rows.
9. Publish All Customizations; verify.
10. Deploy the Integration Service image on QDB infrastructure with `AUTH_PROVIDER=adfs`,
    `DV_API_VERSION=9.1`.

---

## 6. Verification (both targets)

| Check | How |
|---|---|
| Schema present | `verify-schema.mjs` (needs tooling auth adapter on-prem) or `$metadata` diff against `EntityDictionary.md` |
| `IsValidForQueue` | metadata read on `qdb_collectioncase` |
| Steps/images read back | `sdkmessageprocessingsteps` / `sdkmessageprocessingstepimages` query — compare with the manifest count |
| Smoke | `smoke-plugins.mjs` (15 checks today; add queue-move and uniqueness assertions) |
| Web resource live | open via `main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html`; runtime context shows org/version/user |
| Integration Service | `/health` = 200 with `reachable`; MIS provider echoed |
| Publish state | second `PublishAllXml` returns success; no pending customizations |

A verification that greps a deploy log for "nothing changed" is not a verification — read the org.

---

## 7. Rollback

| Layer | Rollback |
|---|---|
| Solution (managed) | Import the previous managed version; holding solution for removals |
| Solution (unmanaged / dev) | Re-run provisioning at the previous tag (idempotent, `[SKIP]` on existing); schema removals are manual and gated |
| Plugin assembly | PRT *Update* to the previous merged DLL (same identity — `key.snk` must be the same file) |
| Web resource | Re-upload the previous bundle; cache-bust |
| Configuration rows | Export before change; re-import |
| Integration Service | Redeploy previous image tag |
| Data | Snapshots and integration log are append-only — never rolled back; case updates from a bad sync batch are replayed by batch id |

No `msst_` component is removed by any step in this guide until the Phase 1 migration is approved.
