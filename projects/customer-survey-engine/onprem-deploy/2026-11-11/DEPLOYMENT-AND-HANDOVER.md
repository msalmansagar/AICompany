# Form Engine and Survey Engine — on-prem deployment and code handover

| | |
|---|---|
| For | QDB IT (deployment), QDB backend, frontend and mobile developers (code), QDB Compliance (erasure requests) |
| Orgs | **HL CRM** (customers are contacts) and **BFD CRM / QDB1** (customers are accounts), Dynamics 365 CE 9.1 on-prem. **Test orgs first, production after** |
| Source | `main` (Addendum D merged 2026-11-18, PR #186; large-audience timing recorded 2026-11-19, PR #187). Survey Engine solution **1.2.0.3** (1.2.0.0 plus the DEF-CSE-001 trigger fix, the DEF-CSE-002 separate scheduler passes and the DEF-CSE-003 missed-day catch-up; Addendum D: one-time general surveys, audience from a view, multi-number SMS, scheduler every 15 minutes), Form Engine designer **1.6.1** |
| Detail | This guide is the overview and the order. The step-by-step detail for the Survey Engine is `RUNBOOK.md` in this folder; follow it exactly |

---

## 1. What you receive

```
projects/
  dynamic-form-engine/                Form Engine
    backend/                          Node.js + Fastify API (external portal and mobile only)
    frontend/                         React portal (external) and the in-CRM runtime build
    mobile/                           React Native + Expo app
    designer/                         Form Designer (runs inside CRM as a web resource)
    shared/                           Types and code shared by backend, frontend, mobile, designer
    crm-plugins/                      Form Engine CRM plugin (C#)
    crm-solution/, crm-webresources/  CRM solution sources
    onprem-deploy/                    Form Engine on-prem kits (base solution, earlier update kits)
    docs/                             Developer and deployment guides
  customer-survey-engine/             Survey Engine
    crm-plugins/                      Survey Engine CRM plugin (C#)
    provisioning/                     Schema definition (used to build the kit; not needed on-prem)
    onprem-deploy/2026-11-11/         THE ON-PREM KIT: packages, RUNBOOK, checks, config, scheduler
    docs/integration-guide.md         For the portal team: the four survey APIs
    scheduler/                        Daily-run scheduler
```

**Who gets what**

| Team | Needs |
|---|---|
| QDB IT (CRM deployment) | `customer-survey-engine/onprem-deploy/2026-11-11/` (everything), and `dynamic-form-engine/onprem-deploy/` only if the Form Engine is not yet on the org (section 3) |
| QDB portal team | `customer-survey-engine/docs/integration-guide.md` (calling the survey APIs from the portal backend) |
| Backend developers | `dynamic-form-engine/backend/` and `shared/` (section 8) |
| Frontend developers | `dynamic-form-engine/frontend/`, `designer/` and `shared/` (section 8) |
| Mobile developers | `dynamic-form-engine/mobile/` and `shared/` (section 8) |
| CRM / plugin developers | both `crm-plugins/` folders (section 9.4: the signing key) |
| QDB Compliance | `RUNBOOK.md` section 11 (erasure requests) |

---

## 2. Before you start (each org)

| # | Item |
|---|---|
| 2.1 | Dynamics 365 CE **9.x** on-prem (9.1 confirmed). A **System Administrator** account for the imports |
| 2.2 | A **full database backup** taken in the maintenance window (the real rollback) |
| 2.3 | **Plugin Registration Tool** (from the Dynamics 365 SDK / XrmToolBox) on the admin's machine |
| 2.4 | **Windows PowerShell 5.1** on a machine that reaches CRM (smoke test, scheduler, speed test) |
| 2.5 | A server and an **AD service account** for the scheduler (every 15 minutes); the **portal backend's service account** |
| 2.6 | Check every file against the SHA-256 checksums in `README.md`: `Get-FileHash <file> -Algorithm SHA256` |
| 2.7 | Time: about **2 hours per org** for RUNBOOK stages 1–6 |

**Stop rule (all stages):** a **FAIL** stops the deployment at that stage; send the report to MSS and wait. A
**WARN** needs a named person's written decision before going on. MSS has no access to the on-prem orgs: QDB IT
runs every step and sends the reports; MSS confirms each gate in writing.

---

## 3. Form Engine — is it already on the org?

Run the **preflight** first (RUNBOOK stage 1). Checks **P4–P7** say whether the Form Engine is present.

| Preflight says | Do |
|---|---|
| P4–P7 **PASS** (Form Engine installed) | Nothing extra. RUNBOOK stage 2 updates the designer and runtime to **1.6.1** (it supersedes 1.6.0, 1.5.0 and the 2026-10-19 kit 1.4.1) and stage 3 updates the plugin |
| P4–P7 **FAIL** (no Form Engine) | Install the base Form Engine first, as below, then re-run the preflight |

**Base Form Engine install** (only when it is missing; `dynamic-form-engine/onprem-deploy/README-onprem-deploy.md`):

| # | Step |
|---|---|
| 3.1 | Plugin Registration Tool → **Register New Assembly** → `customer-survey-engine/onprem-deploy/2026-11-11/form-engine/Qdb.FormEngine.Plugins.dll` (the latest plugin). Isolation **Sandbox**, location **Database** |
| 3.2 | **Settings → Solutions → Import** → `dynamic-form-engine/onprem-deploy/FORM_ENGINE_unmanaged.zip`. If CRM refuses it as "exported from a newer version", stop and ask MSS for a 9.0-stamped package |
| 3.3 | In the Plugin Registration Tool, set the plugin type of the Custom APIs `qdb_PublishForm` and `qdb_GetPublishedFormJson` to the matching types from 3.1 |
| 3.4 | **Publish All Customizations**, then re-run the preflight: P4–P7 must PASS |

---

## 4. Survey Engine — install on each TEST org

Follow `RUNBOOK.md` stage by stage. Summary:

| Stage | What | Files | Gate |
|---|---|---|---|
| 0 | Backup, checksums, name the people | `README.md` | — |
| 1 | **Preflight** (read-only, browser console). **P3 Custom APIs supported is the deciding check**: all ten survey APIs are Custom APIs. P15 (CRM condition editor page) only decides whether the One-time audience panel uses CRM's editor or a FetchXML box. Also save the rollback backup | `scripts/survey-preflight-HL.console.js` or `-BFD`, `scripts/survey-rollback-backup.console.js` | **Gate 1**: send the preflight report; MSS confirms |
| 2 | Form Engine columns + designer/runtime **1.6.1**, Publish All; on test orgs, the A2 evidence (republish three forms, two stage-2 reports) | `form-engine/QdbFormEngineSurveyUpdate_1_0_0_0_onprem_unmanaged.zip`, `form-engine/FormDesignerWebResource_1.6.1.zip`, `scripts/survey-stage2-check.console.js` | **Gate 1b** (test orgs) |
| 3 | Form Engine plugin update (**only if P12 passed** or every listed grid column is confirmed read-only) | `form-engine/Qdb.FormEngine.Plugins.dll` | — |
| 4 | Import **SurveyEngine 1.2.0.3**, Publish All | `SurveyEngine_1_2_0_3_onprem_unmanaged.zip` | — |
| 5 | **Post-import check** (read-only): Q1–Q15, including Q13 (change history on 8 tables), Q14 (one Survey Data Officer role) and Q15 (both One-time trigger validation steps enabled) | `scripts/survey-post-import.console.js` | **Gate 2**: send the report; MSS confirms |
| 6 | Give the roles: Survey Admin, Survey Analyst, Survey Integration (portal account), Survey Scheduler (scheduler account only), **Survey Data Officer (named Compliance staff only, never a service account)** | — | — |
| 7 | Configuration rows: **Survey Settings** (Customer Table = Contact on HL, Account on QDB1; **Retention Days 730, Mode Delete**; default language Arabic on HL, English on QDB1), Survey Sources (inactive), surveys published with Form Type = Survey, setups and triggers | `config/HL.json`, `config/BFD.json`, `config/README.md` | Rows with `TO_CONFIRM` values wait for QDB's answers |
| 8 | Activate sources (`qdb_srv_ActivateSource`), register the scheduled task (every 15 minutes) | `scheduler/Register-RunDueSurveysTask.ps1` | — |
| 9 | **Smoke test** (read-only, then end-to-end on test orgs) and the **trigger speed test** | `smoke-test.ps1`, `trigger-speed-test.ps1` | **Gate 3**: both test orgs pass |

Also on each test org, for the erasure feature (QA conditions): time a large erasure and confirm anonymise mode
works on 9.1 (MSS sends the steps when you reach this point).

---

## 5. Production

Only when **all** of these are true:

1. **Gate 3** passed on **both** HL test and QDB1 test (go-live checklist A2, A3, B8, B9 closed by those runs).
2. The erasure checks passed on the test orgs (speed within limits; anonymise confirmed on 9.1).
3. **QDB Compliance's written PDPPL sign-off** (go-live checklist B2).
4. QDB IT has set CRM **audit-log retention to at least 24 months** and turned org auditing on (P14).

Then repeat RUNBOOK stages 0–9 on each production org, with the production differences the runbook marks (no
stage 2.5–2.7, smoke test step 1 only unless the change owner approves step 2).

---

## 6. After go-live (operations)

| Task | How often | Where |
|---|---|---|
| Scheduled run: due one-time surveys every 15 minutes; scheduled surveys and retention clean-up once a day | automatic | scheduled task log in `-LogPath`; **Survey Engine → Health → Survey Jobs** for failures |
| Re-run the post-import check (Q14: a second "Survey Data Officer" role would grant erasure rights) | **quarterly**, and after any role or business-unit change | `scripts/survey-post-import.console.js` |
| Erasure requests | when Compliance accepts one | RUNBOOK **section 11** (dry run → live → rerun until complete → record both log rows) |
| "Send now" on a One-time trigger shows an error or keeps waiting | when it happens | press **Send now** again. A large audience is sent in several calls of up to about a minute each (measured: 1,000 customers in 3 calls), and a call's answer can be lost on the network after the work is saved. The next press continues where the last one stopped and never invites a customer twice; the 15-minute scheduled run also finishes it |
| Retention | automatic | responses, invitations, suppression logs deleted after 730 days (never invitations under 13 months, suppression logs under 12) |
| Rollback | if needed | RUNBOOK **stage 10** |

---

## 7. Secure links (SMS / email) — not part of release 1

Secure links stay **off**. Before switching them on, QDB answers HL-07..HL-11 and BFD-07..BFD-09 (`config/README.md`),
the portal team builds the survey link page and rate-limits it, and a security review of the token path is done
(go-live checklist B4, B5, E1–E5).

---

## 8. Backend, frontend and mobile (developers)

### 8.1 What runs where — read this first

| Part | Runs | On-prem 9.1 |
|---|---|---|
| Designer, in-CRM runtime, Form Engine plugin, Survey Engine | **inside CRM** (web resources and plugins) | **Yes**: delivered by the kits above |
| `backend/` (Node.js API), `frontend/` portal app, `mobile/` app | **outside CRM**, for the external portal and mobile | **Not as built**: see below |

The backend signs in to CRM with an **Azure AD app registration (client secret)** and calls the CRM Web API at
**`/api/data/v9.2`** (`backend/src/services/CrmBaseService.ts`, `services/CrmAuthService.ts`,
`global/dataverse-lookup/node/CrmLookupService.ts`). An on-prem 9.1 CRM serves `v9.0`/`v9.1` and uses AD / ADFS
(IFD) authentication, so **pointing this backend at HL or QDB1 will not work without changes**: an on-prem
authentication mode and a configurable API version. That is new work (MSS raises it as a change request if QDB
wants the external portal or mobile app on-prem). The in-CRM path does not need the backend at all.

For **surveys in the customer portal**, QDB's portal backend calls the four survey Custom APIs on CRM directly with
the portal service account (Survey Integration role): see `customer-survey-engine/docs/integration-guide.md`.

### 8.2 Build and run locally

Requires **Node.js 20+** and npm. It is an npm-workspaces monorepo (`dynamic-form-engine/package.json`; workspaces
`shared`, `backend`, `frontend`, `mobile`, `designer`).

```bash
cd projects/dynamic-form-engine
npm ci                          # installs every workspace
npm run build                   # builds shared first, then the others (turbo)
npm test                        # unit tests for every workspace
npm run dev                     # backend (http://localhost:4000) + portal (http://localhost:5173)
```

| Part | Build | Test | Notes |
|---|---|---|---|
| `shared` | `npm run build -w shared` | — | build first; the others import it |
| `backend` | `npm run build -w backend` | `npm test -w backend` | `npm run dev -w backend`; `MOCK_CRM=true` runs without a CRM |
| `frontend` (portal) | `npm run build -w frontend` | `npm test -w frontend` | Vite + React |
| in-CRM runtime | `npx vite build --config frontend/vite.webresource.config.ts` | — | produces `qdb_form_runtime.html` |
| `designer` | `npm run build:singlefile -w designer` | `npm test -w designer` | produces the single-file designer web resource; `node designer/scripts/packageSolution.js --version <x.y.z> --runtime <runtime html>` packs the CRM solution |
| `mobile` | `npx expo start` in `mobile/` | `npm test -w mobile` | Expo / React Native |

**Docker** (backend + portal): `docker compose up --build` in `dynamic-form-engine/` (backend on 4000, portal on
3000, `MOCK_CRM=true` by default). Dockerfiles: `backend/Dockerfile`, `frontend/Dockerfile` + `frontend/nginx.conf`.

### 8.3 Configuration (environment variables)

Never commit these; set them in the host's secret store. **Create your own** app registrations and secrets: none
are shipped.

| Backend (`backend/src/config/env.ts`) | Meaning |
|---|---|
| `DATAVERSE_URL` | CRM organisation URL |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | app registration the backend uses to call CRM |
| `AZURE_AD_AUDIENCE` | the API's audience, for validating portal users' tokens |
| `CORS_ORIGIN` | allowed portal origins (comma-separated) |
| `MOCK_CRM` | `true` = no CRM (local development only) |
| `SKIP_AUTH` | development only; **never `true` outside a developer machine** |
| `STORAGE_ACCOUNT_NAME` / `_KEY` / `_CONTAINER_NAME` | file uploads (Azure Blob) |
| `USE_RENDER_CACHE`, cache TTLs, `LOG_LEVEL` | tuning |

| Frontend (build-time) | Meaning |
|---|---|
| `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID` | portal's app registration (sign-in) |
| `VITE_API_SCOPE` | scope the portal requests for the backend |
| `VITE_API_BASE_URL` | backend URL |

More: `dynamic-form-engine/docs/deployment-guide.md` (Docker, CI, hosting), `TECHNICAL.md`, `docs/DEVELOPER-GUIDE-*.md`.

---

## 9. Sharing the code

### 9.1 What to send

Send the **code-only package** that MSS builds from the current `main` when QDB asks for the code (named
`QDB-FormEngine-SurveyEngine-code-<commit>.zip` after the commit it was built from): committed files only, MSS's internal engagement records removed, no secrets, no signing key. Share it over QDB's
approved secure file transfer, and send its SHA-256 separately so the receiver can check it.

### 9.2 What is never in it, and must never be added

| Item | Why |
|---|---|
| `.env` files, client secrets, passwords | each environment creates its own (section 8.3) |
| `node_modules/`, build output, logs | rebuilt with `npm ci` / `npm run build` |
| The plugin signing key `Qdb.FormEngine.snk` | see 9.4 |

### 9.3 Giving each team its part

Everyone gets the same package (the parts depend on `shared/`). Point each team at its folder (section 1, "Who gets
what"), at `README.md` and `TECHNICAL.md`, and at section 8 of this guide. The portal team also gets
`docs/integration-guide.md`.

If QDB prefers a Git repository to a zip: create a private repository on QDB's own Git server, unzip the package
into it as the first commit, and give each team read or write access there. Keep MSS's repository separate.

### 9.4 The plugin signing key

Both CRM plugins are signed with `Qdb.FormEngine.snk`
(`customer-survey-engine/crm-plugins/Qdb.SurveyEngine/Qdb.SurveyEngine.csproj` points to it, and the Form Engine's
`merge-plugin.ps1` uses it). It is **not** in the package.

* **Deploying** does not need it: the kits carry the plugins already built and signed.
* **Rebuilding** the plugins does. Either MSS hands the key over separately through a secure channel to the named
  QDB plugin developer, or QDB signs with its own key. A plugin signed with a different key is a different assembly
  to CRM: it must be **registered again** (and its Custom APIs re-bound), not updated in place.

### 9.5 Licence note for developers

The designer has a development-only dependency, `agentation` (licence PolyForm Shield 1.0.0). It loads only in
development mode and is never part of a built web resource. It may be used for internal development only; do not
ship it or build a competing product on it. Remove it from `designer/package.json` if QDB's policy does not allow it.

---

## 10. Summary checklist

| # | Done? | Item |
|---|---|---|
| 1 | ☐ | Package received, SHA-256 checked |
| 2 | ☐ | HL test: preflight sent, Gate 1 confirmed |
| 3 | ☐ | HL test: stages 2–5 done, Gate 1b and Gate 2 confirmed |
| 4 | ☐ | HL test: roles, configuration, activation, smoke and speed tests, Gate 3 |
| 5 | ☐ | QDB1 test: the same (2–4) |
| 6 | ☐ | Erasure checks on both test orgs |
| 7 | ☐ | QDB Compliance written sign-off |
| 8 | ☐ | Audit-log retention ≥ 24 months, org auditing on (both production orgs) |
| 9 | ☐ | HL production, then QDB1 production (RUNBOOK 0–9, production variants) |
| 10 | ☐ | Operations handed over: daily task owner, quarterly Q14 owner, erasure procedure owner |
