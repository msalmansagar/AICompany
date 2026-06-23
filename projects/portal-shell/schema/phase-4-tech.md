# Phase 4 Build Summary — DFE-PORT-001/SCHEMA
# Dataverse Schema Provisioning Script

**Engagement ID:** DFE-PORT-001/SCHEMA
**Phase:** Phase 4 — Technical Build
**Status:** COMPLETE
**Author:** Power Platform Developer — Maqsad AI
**Date:** 2026-06-16
**Output:** `projects/portal-shell/scripts/provision-schema/`

---

## 1. Files Written

```
provision-schema/
├── .env.example
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── output/
    │   └── ProvisioningCompleteEmitter.ts       [NEW — CHALLENGE 8]
    ├── config/
    │   └── env.ts
    ├── auth/
    │   └── TokenProvider.ts
    ├── http/
    │   └── DataverseHttpClient.ts
    ├── preflight/
    │   ├── PublisherCheck.ts
    │   ├── PicklistConflictCheck.ts
    │   ├── ExistingSolutionCheck.ts
    │   └── ServicePrincipalRoleCheck.ts
    ├── solution/
    │   └── SolutionProvisioner.ts
    ├── optionsets/
    │   └── GlobalOptionSetProvisioner.ts
    ├── entities/
    │   ├── EntityProvisioner.ts
    │   ├── EntityCreationOrchestrator.ts
    │   └── definitions/
    │       ├── shared.ts                         [NEW — builder helpers]
    │       ├── portalUsers.ts
    │       ├── portalResetTokens.ts
    │       ├── portalRevokedTokens.ts
    │       ├── portalConfigs.ts
    │       ├── portalNavItems.ts
    │       ├── portalWidgetConfigs.ts
    │       ├── portalServices.ts
    │       ├── portalServiceTabs.ts
    │       ├── portalRequests.ts
    │       ├── portalRequestTimelines.ts
    │       ├── portalRequestDocuments.ts
    │       ├── portalNotifications.ts
    │       ├── cmsContents.ts
    │       ├── cmsRevisions.ts
    │       └── portalUserEntities.ts
    ├── relationships/
    │   └── RelationshipProvisioner.ts
    ├── security/
    │   ├── SecurityRoleProvisioner.ts
    │   └── ServicePrincipalRoleAssignment.ts
    ├── seed/
    │   ├── SeedOrchestrator.ts
    │   ├── PortalConfigSeed.ts
    │   ├── NavItemSeed.ts
    │   ├── TestUserSeed.ts
    │   └── WidgetConfigSeed.ts
    ├── validation/
    │   └── PostProvisioningValidator.ts
    └── types/
        ├── DataverseMetadata.ts
        └── ProvisioningResult.ts
```

Total files written: **36** (35 TypeScript + 1 env.example)
Extra file vs architecture spec: `src/output/ProvisioningCompleteEmitter.ts` (CHALLENGE 8)
Extra file vs architecture spec: `src/entities/definitions/shared.ts` (builder helpers to eliminate boilerplate)

---

## 2. All 10 Challenge Resolutions Implemented

| Challenge | Resolution | File(s) |
|-----------|-----------|---------|
| CHALLENGE 1 — Pagination | `fetchAllPages<T>` in `DataverseHttpClient.ts` follows `@odata.nextLink` until exhausted. Used in `PicklistConflictCheck.ts`. | `DataverseHttpClient.ts`, `PicklistConflictCheck.ts` |
| CHALLENGE 2 — Batch placement | Corrected batch assignments applied: Batch A = {configs, users, services}, Batch B = 9 entities, Batch C = 3 entities. | `EntityCreationOrchestrator.ts` |
| CHALLENGE 3 — Privilege GUIDs | `resolvePrivilegeId()` polls up to 3 times with 3-second delays. `SecurityRoleProvisioner` called at end of Phase 7 (maximum delay from entity creation). | `SecurityRoleProvisioner.ts` |
| CHALLENGE 4 — MSCRM header | `postWithCustomHeaders()` on relationship POST. Log line asserts header before call. | `RelationshipProvisioner.ts`, `DataverseHttpClient.ts` |
| CHALLENGE 5 — DRY_RUN password | `SEED_TEST_USER_PASSWORD` optional in Zod schema. Zod refinement enforces it only when `DRY_RUN=false`. `TestUserSeed.ts` skips entirely if absent. | `env.ts`, `TestUserSeed.ts` |
| CHALLENGE 6 — Column security | Post-provisioning checklist step emitted in Phase 11 stdout and in `PROVISIONING-COMPLETE.md`. | `index.ts`, `ProvisioningCompleteEmitter.ts` |
| CHALLENGE 7 — DRY_RUN publisher | Mock publisherId `00000000-0000-0000-0000-000000000001` returned when publisher absent and `DRY_RUN=true`. Subsequent phases use this GUID without aborting. | `PublisherCheck.ts` |
| CHALLENGE 8 — Checklist file | `ProvisioningCompleteEmitter.ts` writes `PROVISIONING-COMPLETE.md` at end of Phase 11. Contains all 24 check results, PAC CLI command, column security step, test user deactivation reminder. | `ProvisioningCompleteEmitter.ts`, `index.ts` |
| CHALLENGE 9 — Intra-batch order | Batch A: `portalConfigs` (1), `portalUsers` (2), `portalServices` (3). Explicit ordering documented in `EntityCreationOrchestrator.ts` comments. | `EntityCreationOrchestrator.ts` |
| CHALLENGE 10 — Simplicity | Kept. `PostProvisioningValidator.ts` runs all 24 checks per architecture spec. `shared.ts` eliminates repeated boilerplate across 15 definition files. | `shared.ts`, all definition files |

---

## 3. BRD Field Name Reconciliation

Where the BRD (authoritative, from built API service code) differs from the architecture document:

### qdb_portal_users

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name attribute | `qdb_display_name` | `qdb_name` (Email) | BRD FR-SCHEMA-001: "primary name attribute shall be qdb_display_name". API CustomCredentialAdapter queries by `qdb_email` field |
| `qdb_email` | `qdb_email` (String, 255) | `qdb_name` | BRD FR-SCHEMA-001: distinct email field; API queries `qdb_email eq '...'` |
| `qdb_first_name` | present | absent | BRD FR-SCHEMA-001: required field |
| `qdb_last_name` | present | absent | BRD FR-SCHEMA-001: required field |
| `qdb_roles` | Memo (JSON) | absent | BRD FR-SCHEMA-001: stores role array |
| `qdb_linked_entity_ids` | Memo (JSON) | absent | BRD FR-SCHEMA-001: stores account GUIDs |
| `qdb_contact` lookup | absent | present | Not in BRD; omitted to avoid breaking API queries |

### qdb_portal_reset_tokens

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| `qdb_user_id` | String (plain) | `qdb_user` (Lookup) | BRD FR-SCHEMA-002: "stores the portal user GUID as a plain string — not a Dataverse lookup" |
| `qdb_used` | Boolean | `qdb_is_used` | BRD FR-SCHEMA-002: exact field name is `qdb_used` |

### qdb_portal_revoked_tokens

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_jti` | `qdb_name` | BRD FR-SCHEMA-003: "primary name attribute shall be qdb_jti" |
| `qdb_jti` | Single text (100) | `qdb_name` string | BRD: auth-guard queries `qdb_jti eq '<jti>'` |

### qdb_portal_configs

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_portal_name` | `qdb_name` | BRD FR-SCHEMA-004: "primary name attribute shall be qdb_portal_name" |
| `qdb_portal_name` | String (255) | `qdb_name` | PortalConfigService.ts selectFields() authoritative |
| `qdb_sso_providers` | String (1000) JSON | `qdb_sso_microsoft` / `qdb_sso_google` booleans | BRD stores SSO as JSON array; arch split into booleans |
| `qdb_header_show_entity_switcher` | present | `qdb_header_entity_switcher` | BRD name is authoritative |
| `qdb_header_show_support` | present | `qdb_header_support_link` | BRD name is authoritative |
| `qdb_header_show_notifications` | present | `qdb_header_notifications` | BRD name is authoritative |
| `qdb_footer_links` | Memo (JSON) | `qdb_footer_link_json` | BRD name is authoritative |

### qdb_portal_nav_items

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_label` | `qdb_name` | BRD FR-SCHEMA-005: "primary name attribute shall be qdb_label" |
| `qdb_label` | String (255) | `qdb_name` | NavService.ts DataverseNavItem interface |
| `qdb_label_ar` | present | `qdb_name_ar` | BRD name is authoritative |
| `qdb_icon` | present | `qdb_icon_name` | BRD name from NavService.ts |
| `qdb_badge_value` | String (500) | `qdb_badge_odata_query` + `qdb_badge_static_count` | BRD stores both in single field |
| `qdb_portal_config` lookup | absent | present | Not in BRD FR-SCHEMA-005; omitted |

### qdb_portal_widget_configs

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_widget_type` | `qdb_name` | BRD FR-SCHEMA-006: authoritative |
| `qdb_title` | String (255) | `qdb_title_override` | BRD name from widgets.ts |
| `qdb_config` | Memo | `qdb_config_json` + `qdb_grid_layout_json` | BRD uses single `qdb_config` field |

### qdb_portal_services

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_title` | `qdb_name` | BRD FR-SCHEMA-007: authoritative from services.ts |
| `qdb_code` | String (100) | `qdb_code` | Match |
| `qdb_category_tag` | present | `qdb_category` | BRD name authoritative |
| `qdb_image_url` | present | `qdb_thumbnail_url` + `qdb_hero_image_url` | BRD uses single image field |
| `qdb_full_description` | present | absent | BRD FR-SCHEMA-007 includes it |

### qdb_portal_service_tabs

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| `qdb_service_id` (lookup) | present | `qdb_service` | BRD FR-SCHEMA-008: OData nav property `_qdb_service_id_value` |
| `qdb_content` | present | `qdb_content_html` | BRD name from DataverseServiceTab interface |
| `qdb_content_ar` | present | `qdb_content_html_ar` | BRD name |

### qdb_portal_requests

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_reference_number` | `qdb_name` | BRD FR-SCHEMA-009: authoritative |
| `qdb_user_id` | String (plain) | `qdb_user` (Lookup) | BRD: "portal user GUID stored as plain string" |
| `qdb_service_code` | present | absent | BRD FR-SCHEMA-009 authoritative from requests.ts |
| `qdb_service_title` | present | absent | BRD FR-SCHEMA-009 authoritative |
| `qdb_form_data` | present | `qdb_submission_data_json` | BRD name from DataverseRequest interface |
| `qdb_service` lookup | absent | present | BRD uses plain string fields instead |
| `qdb_status` | global picklist | global picklist | Match — 860000xxx codes |

### qdb_portal_request_timelines

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_status` | `qdb_name` | BRD FR-SCHEMA-010: authoritative |
| `qdb_status` | String (100) plain | Picklist (global) | BRD: "denormalised status label" — NOT a picklist |
| `qdb_request_id` | Lookup | `qdb_request` | BRD OData nav property name `_qdb_request_id_value` |
| `qdb_note` | present | `qdb_notes` | BRD name from loadTimeline function |
| `qdb_changed_by` | present | `qdb_actor` | BRD name |

### qdb_portal_request_documents

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| `qdb_request_id` | Lookup | `qdb_request` | BRD OData nav property `_qdb_request_id_value` |
| `qdb_url` | String (500) | `qdb_blob_url` | BRD FR-SCHEMA-011 from loadDocuments function |

### qdb_portal_notifications

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_title` | `qdb_name` | BRD FR-SCHEMA-012: authoritative |
| `qdb_user_id` | String (plain) | `qdb_user` (Lookup) | BRD: "portal user GUID as plain string" |
| `qdb_type` | global picklist | `qdb_notification_type` picklist | BRD field name is `qdb_type` |
| `qdb_body` | Memo | `qdb_body` Memo | Match |

### qdb_cms_contents

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| Primary name | `qdb_title` | `qdb_name` | BRD FR-SCHEMA-013: authoritative |
| `qdb_content_type` | `qdb_content_type` (100000xxx) | `qdb_cms_content_type` | BRD field name from CmsService.ts |
| `qdb_status` | `qdb_status` (100000xxx) | `qdb_cms_status` | BRD field name |
| `qdb_published_on` | present | `qdb_published_at` | BRD name |
| `qdb_author_name` | String (plain) | `qdb_author` (Lookup) | BRD: "denormalised display name — no foreign key to portal user" |
| `qdb_tags` | String (1000) | `qdb_tags_json` | BRD uses comma-separated string |
| `qdb_portal_config` lookup | absent | present | Not in BRD FR-SCHEMA-013 |

### qdb_cms_revisions

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| `qdb_content_id` | Lookup | `qdb_content` | BRD OData bind syntax: `qdb_content_id@odata.bind` |
| `qdb_saved_by` | String (plain) | Lookup (systemuser) | BRD: "display name of the CMS editor — no foreign key" |

### qdb_portal_user_entities

| Field | BRD (USED) | Arch spec | Reason |
|-------|-----------|-----------|--------|
| `qdb_user_id` | String (plain) | `qdb_user` (Lookup) | BRD: "portal user GUID stored as plain string" |
| `qdb_account_id` | Lookup (account) | `qdb_account` | BRD OData nav property `_qdb_account_id_value` |

---

## 4. Architecture Deviations (with rationale)

| Deviation | Architecture | Implementation | Rationale |
|-----------|-------------|----------------|-----------|
| `shared.ts` definition helper | Not specified | Added | Eliminates 150+ lines of repeated LocalizedLabel boilerplate across 15 definition files. Clean code principle: DRY. |
| `ProvisioningCompleteEmitter.ts` | Not specified | Added | CHALLENGE 8 resolution: emits `PROVISIONING-COMPLETE.md` with all 24 check results and manual step instructions. |
| `src/output/` directory | Not specified | Added | Houses the emitter; keeps output concerns separate from validation. |
| `postRaw()` on HttpClient | Architecture showed `post<T>()` returning T | Added `postRaw()` alongside | Metadata POSTs need OData-EntityId header; data POSTs return 204. Two methods keep concerns separate. |
| `postWithCustomHeaders()` | Not in architecture | Added | CHALLENGE 4: allows explicit header assertion on relationship POST. |
| Phase numbering in `ServicePrincipalRoleCheck` | Single phase label | `'2d' | '7'` parameter | Allows same function to run in both Phase 2d and Phase 7 with correct log prefix. |
| Arch batch A included `qdb_portal_notifications` and `qdb_cms_revisions` | Arch Phase 5 | Moved to Batch B and Batch C respectively | CHALLENGE 2 + 9 resolutions: lookup dependencies require these to be in later batches. |

---

## 5. Open Items for Code Reviewer

| Item | Priority | Detail |
|------|----------|--------|
| CR-001 | HIGH | Verify Dataverse entity set name for `qdb_portal_configs`. Dataverse pluralises as `qdb_portal_configses` (double-s). Confirm against `$metadata` before first run. Same applies to `qdb_portal_nav_itemses`, `qdb_portal_widget_configses`, `qdb_portal_userses`, `qdb_portal_request_timelines` (no double-s?). Run `GET $metadata` and grep for each. |
| CR-002 | HIGH | Confirm the correct Dataverse primary key field name for the self-referential relationship `ReferencedAttribute`. Architecture uses `qdb_portal_nav_itemsid` — verify this matches the actual auto-generated PK name after entity creation. |
| CR-003 | MEDIUM | `ServicePrincipalRoleCheck.ts` Phase 7 label is passed as `'7'` but logs `[PHASE-7]`. The validator also calls this with `'7'` — confirm log output is unambiguous. Consider using `'9-sp'` for the validation phase call. |
| CR-004 | MEDIUM | `ExistingSolutionCheck.ts` queries `solutioncomponents/$count` — verify this OData path is valid in Dataverse v9.2. Alternative: query `solutioncomponents?$filter=solutionid eq ...&$select=solutioncomponentid` and count the returned array. |
| CR-005 | MEDIUM | `PicklistConflictCheck.ts` skips option sets already in `PLANNED_OPTION_SETS` when building the conflict index. This is correct for first-run but on re-run (if some planned option sets were already created), their values won't be in the index. Verify the skip logic is safe for idempotent re-runs. |
| CR-006 | LOW | `TestUserSeed.ts` uses dynamic `import('bcrypt')` to avoid loading bcrypt in dry-run paths. Verify this works correctly with `"type": "module"` and `tsx`. Alternative: top-level import with guard. |
| CR-007 | LOW | `SeedOrchestrator.ts` comment states nav items don't need portal config ID binding. Confirm `qdb_portal_nav_items` has no portal config lookup in the BRD (it does not — confirmed FR-SCHEMA-005 has no config FK). |
| CR-008 | LOW | Alternate key creation for `qdb_email` (qdb_portal_users) and `qdb_slug` (qdb_cms_contents) is not in scope for this script (BRD A-005 assumes they're supported, but the script doesn't create them). Add to a post-provisioning enhancement if uniqueness enforcement is needed at the schema level. |
