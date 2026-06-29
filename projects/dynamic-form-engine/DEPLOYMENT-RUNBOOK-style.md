# DFE-STYLE-001 — Deployment Runbook (Advanced Visual Styling & Full CSS Control)

Satisfies CEO condition **C-004a** (schema deployment sequencing + rollback). All new
attributes are optional/nullable → **zero-downtime, additive** change. Existing forms render
unchanged until a designer explicitly edits a Style panel (backward compat: FR-083/093/094, SM-002).

**Verified state of org5869857f (2026-06-29):** 36 of 56 design attributes already exist
(from DFE-ADD); `qdb_layout_grid` already exists fully. So on the current cloud org this deploy
is **20 attributes + the new `qdb_css_allowlist_config` entity + the security role + the seed**.
A fresh environment gets the full set (the script is idempotent and covers everything).

---

## Pre-flight
- [ ] Service principal secret available (`scripts/.env` → `DV_CLIENT_SECRET`).
- [ ] Back up / export the current `QdbDynamicFormEngine` (and `FormEngine`) solution.
- [ ] Confirm target org URL in `scripts/provision-style-schema.mjs` (`DATAVERSE_URL`).
- [ ] Maintenance window: **optional** (additive change). 30 min off-peak if QDB policy requires.

## Step 1 — Schema (attributes + entities)
Dry-run first, then execute:
```
node --env-file=scripts/.env scripts/provision-style-schema.mjs --dry-run
node --env-file=scripts/.env scripts/provision-style-schema.mjs
```
Creates the missing design attributes, ensures `qdb_layout_grid`, and creates
`qdb_css_allowlist_config` + its attributes. **Failure detection (SC-01):** the script exits
non-zero and prints `PROVISIONING FAILED` on any error; re-run (idempotent) after fixing.

## Step 2 — Seed the CSS allowlist  ⚠️ before any code that reads it (SC-01)
The provisioning script seeds the `default` `qdb_css_allowlist_config` record
(`fonts.googleapis.com`, `fonts.gstatic.com`). **Verify it exists** — if absent, `AllowlistService`
returns an empty array and every `url()`/`fontUrl` is stripped:
```
node --env-file=scripts/.env scripts/verify-style-schema.mjs   # or check the record in the maker portal
```
QDB Brand/IT expand the domain list per **OQ-007** (no code change — edit the record).

## Step 3 — Security role (SC-05 / C-005)
Import the **"CSS Allowlist Admin"** role (in `crm-solution/src/Roles/`) and restrict **write** on
`qdb_css_allowlist_config` to it. Without this, any user with write access can inject an
attacker-controlled domain. Read access for the app user / runtime remains org-wide.

## Step 4 — Publish customizations
`Publish All Customizations` (maker portal or `pac solution publish`). This rotates the org
customization-version token so web-resource caches bust automatically.

## Step 5 — Application code + web resources
Only **after** Steps 1–4:
- Backend (Fastify): deploy with `ALLOWED_CSS_DOMAINS_JSON` env var set to mirror the allowlist record.
- Designer + frontend builds.
- On-prem: re-upload `qdb_form_runtime.html` (carries the PostCSS browser-build sanitizer — C-005b).
- Run the existing solution-packaging/upload flow.

---

## Rollback (C-004a)
Additive + nullable → low-risk. To revert:
1. **Code:** redeploy the prior backend/designer/frontend build and the prior `qdb_form_runtime.html`.
2. **Seed/role:** deactivate the `qdb_css_allowlist_config` default record and/or remove the security role if needed.
3. **Schema:** the new attributes are nullable and ignored by old code — they can be **left in place**
   (safest). If full removal is required, re-import the pre-deploy solution version; data in the new
   attributes and any `qdb_css_allowlist_config` records is lost; **existing attributes on
   `qdb_theme`/`form_design`/`section_design`/`field_design`/`button_design` and all `qdb_layout_grid`
   data are unaffected.**
No data migration runs in this engagement, so rollback never risks existing form/style data.

## Post-deploy verification
- [ ] `verify-style-schema.mjs` → all 56 attributes EXIST, 0 mismatches; both entities present.
- [ ] Allowlist `default` record active with expected domains.
- [ ] Publish a test form, edit a Field/Section/Button Style panel, re-publish → cache JSON
      contains the `DesignPayload`; portal and `qdb_form_runtime.html` render identically (SM-005).
- [ ] An existing pre-engagement form renders with no visual change (SM-002).
- [ ] WCAG gate blocks a deliberately <3:1 colour pair (SM-007).
