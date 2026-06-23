═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-PORT-001/SCHEMA — Configurable Portal Shell: Dataverse Schema Provisioning
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-06-16
Version:        1.0
Status:         DRAFT — Pending CEO Approval
Parent:         DFE-PORT-001 — Configurable Portal Shell (APPROVED WITH CONDITIONS 2026-06-16)
Engagement ID:  DFE-PORT-001/SCHEMA
Target Env:     https://org5869857f.crm4.dynamics.com (EU West, crm4)
New Solution:   QdbPortalShell
Publisher:      qdb (prefix: qdb_)
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
════════════════════

The Configurable Portal Shell (DFE-PORT-001) has been fully designed, built, and
approved with conditions by the CEO on 2026-06-16. The application code — the Fastify
API (apps/api), the Next.js web frontend (apps/web), and the CMS (Track C) — is
complete and passes all 101 QA test cases. However, the application cannot be started
in the target Dataverse environment because the 15 custom tables it reads from and
writes to do not exist. Additionally, two supporting junction tables and a service-tab
table that were discovered during code inspection are absent from the original brief.

This sub-engagement provisions the missing Dataverse schema: it creates a new managed
solution (QdbPortalShell), defines all 15 custom tables with their exact column sets
as required by the built API services, creates the required picklist values, establishes
lookup relationships between tables, seeds the minimum data the portal needs to boot,
and creates a least-privilege security role for the service principal so the API can
authenticate and operate without system administrator access.

The expected business outcome is that the portal API health check returns HTTP 200, the
portal config endpoint returns a valid configuration record, and the login endpoint
authenticates a test user — confirming the system is ready for staging smoke tests.


2. BUSINESS OBJECTIVES
══════════════════════

1. Enable the portal API to authenticate against Dataverse so that the deployed
   application can read and write all portal data without system administrator
   credentials.

2. Enable the qdb_portal_config entity to hold exactly one active configuration record
   so that the PortalConfigService can serve branding, navigation layout, and
   notification poll interval to every web request.

3. Enable the qdb_portal_users and qdb_portal_reset_tokens entities to store custom
   credential user accounts so that citizens can log in, recover passwords, and receive
   personalised portal sessions.

4. Enable the qdb_portal_revoked_tokens entity to maintain the JWT revocation blocklist
   so that the audit finding A-001 (JTI blocklist enforcement) remains resolved
   post-deployment.

5. Enable the navigation, widget, services, requests, notifications, and CMS entities to
   hold their operational data so that all portal features are functional from day one of
   the staging smoke test.

6. Enable staging smoke tests (TC-E2E-001 through TC-E2E-009) to pass so that the
   pre-production checklist items 1–10 (recorded in the project memory) can be signed
   off and the portal can proceed to production go-live.


3. STAKEHOLDERS
═══════════════

| Stakeholder              | Role                         | Interest in this project                                                  |
|--------------------------|------------------------------|---------------------------------------------------------------------------|
| CEO — Maqsad AI          | Strategic approver           | Ensures Dataverse schema unblocks go-live without violating Phase 7 conditions |
| Power Platform Developer | Schema implementer           | Needs exact column names, data types, picklist values, and relationships  |
| API Team (backend)       | Consumer of schema           | API services must match schema exactly or OData queries will fail         |
| QA Engineer              | Staging smoke tester         | Needs seed data and security role to run TC-E2E-001 through TC-E2E-009  |
| System Administrator     | Dataverse environment owner  | Must not have changes applied to QdbDynamicFormEngine or OOB entities     |
| Citizen (end user)       | Portal user                  | Indirectly benefits when schema unblocks portal go-live                   |
| Service Principal        | Non-interactive API identity | Needs a least-privilege security role scoped to qdb_* entities only       |


4. SCOPE
════════

4.1 In Scope
────────────

- Creation of a new managed Dataverse solution: QdbPortalShell, publisher qdb.
- Creation of 15 custom tables (entity set names are the Dataverse plural logical names
  used in OData queries as confirmed by the built API service code):
    1.  qdb_portal_users              (entity set: qdb_portal_users)
    2.  qdb_portal_reset_tokens       (entity set: qdb_portal_reset_tokens)
    3.  qdb_portal_revoked_tokens     (entity set: qdb_portal_revoked_tokens)
    4.  qdb_portal_configs            (entity set: qdb_portal_configs)
    5.  qdb_portal_nav_items          (entity set: qdb_portal_nav_items)
    6.  qdb_portal_widget_configs     (entity set: qdb_portal_widget_configs)
    7.  qdb_portal_services           (entity set: qdb_portal_services)
    8.  qdb_portal_service_tabs       (entity set: qdb_portal_service_tabs)
    9.  qdb_portal_requests           (entity set: qdb_portal_requests)
    10. qdb_portal_request_timelines  (entity set: qdb_portal_request_timelines)
    11. qdb_portal_request_documents  (entity set: qdb_portal_request_documents)
    12. qdb_portal_notifications      (entity set: qdb_portal_notifications)
    13. qdb_cms_contents              (entity set: qdb_cms_contents)
    14. qdb_cms_revisions             (entity set: qdb_cms_revisions)
    15. qdb_portal_user_entities      (entity set: qdb_portal_user_entities)
- All custom picklist (choice) fields for the 15 tables, with the exact integer codes
  as used in the API service code.
- All lookup relationships declared between tables, matching the OData navigation
  property names used in the built API code.
- A custom Dataverse security role named "Portal Shell API Role" with read/write
  privileges scoped to qdb_* entities only, assigned to the service principal
  (application user with CLIENT_ID 08e80e93-0bab-45ef-8372-2e554fa9af9b).
- Minimum seed data required for the portal API to boot and pass the TC-E2E smoke tests.
- Export of QdbPortalShell as a managed solution file for version control and ALM.

4.2 Out of Scope
────────────────

- Any modification to the existing QdbDynamicFormEngine solution or its entities.
- Any modification to OOB Dataverse entities (account, contact, systemuser, etc.),
  with the sole exception of assigning the application user to the new security role.
- Creation of any Power Automate flows, plugins, business rules, or calculated fields.
- Data migration of existing portal data (no legacy data exists).
- Portal Pages (Power Pages) configuration — this is outside this sub-engagement.
- Mobile (Track B) specific schema — Track B uses the same entities as Track A/C.
- Dynamics 365 F&O integration or any ERP-side schema.
- Any schema for DFE-PORT-002 (document upload to Azure Blob/Dataverse file columns).
- UI customisation inside Dataverse (forms, views, dashboards in the CRM UI).
- Changes to the QdbPortalShell solution after the managed solution export is delivered.


5. FUNCTIONAL REQUIREMENTS
══════════════════════════

All entity set names, column logical names, and picklist codes below are derived
directly from the built API service code in apps/api/src/services/ and
apps/api/src/routes/. They are the authoritative schema definition.

── 5.1 Authentication & User Management ──────────────────────────────────────────────

FR-SCHEMA-001: qdb_portal_users
  The system shall provision a custom table qdb_portal_users with the following columns:
  - qdb_portal_userid       : GUID, primary key (auto-generated by Dataverse)
  - qdb_email               : Single line of text (255), required, unique alternate key
  - qdb_password_hash       : Single line of text (1000), required
    (stores bcrypt hash — length accommodates bcrypt output of ~60 chars with headroom)
  - qdb_first_name          : Single line of text (100), required
  - qdb_last_name           : Single line of text (100), required
  - qdb_display_name        : Single line of text (255), required
  - qdb_avatar_url          : Single line of text (500), optional
  - qdb_roles               : Multiple lines of text (Memo), optional
    (stores JSON array of role strings, e.g. ["portal_user","admin"])
  - qdb_linked_entity_ids   : Multiple lines of text (Memo), optional
    (stores JSON array of account GUIDs)
  - qdb_preferred_language  : Choice (picklist), required, default = en
    Values: en (100000001), ar (100000002)
  The primary name attribute shall be qdb_display_name.
  The entity shall support statecode (active/inactive) for soft-delete.

FR-SCHEMA-002: qdb_portal_reset_tokens
  The system shall provision a custom table qdb_portal_reset_tokens with the following
  columns:
  - qdb_portal_reset_tokenid : GUID, primary key
  - qdb_token_hash           : Single line of text (1000), required
    (stores bcrypt hash of the raw token sent to the user)
  - qdb_user_id              : Single line of text (100), required
    (stores the portal user GUID as a plain string — not a Dataverse lookup —
     because the CustomCredentialAdapter filters by this string value directly via OData)
  - qdb_expires_on           : Date and Time, required
    (UTC expiry datetime; the adapter filters qdb_expires_on gt <now>)
  - qdb_used                 : Yes/No (boolean), required, default = No
    (once set to true the token cannot be replayed)
  The primary name attribute shall be qdb_portal_reset_tokenid (auto-name).

FR-SCHEMA-003: qdb_portal_revoked_tokens
  The system shall provision a custom table qdb_portal_revoked_tokens with the following
  columns:
  - qdb_portal_revoked_tokenid : GUID, primary key
  - qdb_jti                    : Single line of text (100), required
    (JWT ID claim; the auth-guard queries this table to check if a JTI has been revoked)
  - qdb_revoked_on             : Date and Time, required
    (UTC datetime at which the token was revoked)
  This table is append-only. The service principal security role shall have Create
  privilege but no Update or Delete privilege on this table.
  The primary name attribute shall be qdb_jti.

── 5.2 Portal Configuration ──────────────────────────────────────────────────────────

FR-SCHEMA-004: qdb_portal_configs
  The system shall provision a custom table qdb_portal_configs with the following
  columns (all column names confirmed from PortalConfigService.ts selectFields()):
  - qdb_portal_configid                 : GUID, primary key
  - qdb_portal_name                     : Single line of text (255), required
  - qdb_logo_url                        : Single line of text (500), optional
  - qdb_favicon_url                     : Single line of text (500), optional
  - qdb_primary_color                   : Single line of text (20), optional
    (hex colour string, e.g. "#1A73E8")
  - qdb_accent_color                    : Single line of text (20), optional
  - qdb_font_family                     : Single line of text (100), optional
  - qdb_background_color                : Single line of text (20), optional
  - qdb_nav_layout                      : Choice (picklist), required
    Values: sidebar (860000001), top-nav (860000002)
  - qdb_sidebar_default_state           : Choice (picklist), required
    Values: expanded (860000001), collapsed (860000002)
  - qdb_auth_provider                   : Choice (picklist), required
    Values: azure-ad-b2c (860000001), entra-external-id (860000002), custom (860000003)
  - qdb_sso_providers                   : Single line of text (1000), optional
    (JSON array of SSO provider strings)
  - qdb_landing_page                    : Single line of text (255), optional
  - qdb_rtl_enabled                     : Yes/No (boolean), required, default = No
  - qdb_header_show_entity_switcher     : Yes/No (boolean), required, default = No
  - qdb_header_show_support             : Yes/No (boolean), required, default = No
  - qdb_header_support_label            : Single line of text (255), optional
  - qdb_header_support_url              : Single line of text (500), optional
  - qdb_header_show_notifications       : Yes/No (boolean), required, default = Yes
  - qdb_footer_left_logo_url            : Single line of text (500), optional
  - qdb_footer_right_logo_url           : Single line of text (500), optional
  - qdb_footer_powered_by_text          : Single line of text (255), optional
  - qdb_footer_links                    : Multiple lines of text (Memo), optional
    (JSON array of footer link objects)
  - qdb_notification_poll_interval_seconds : Whole Number, required, default = 30
    (minimum 10, maximum 120 — enforced by business rule BR-004)
  The entity shall support statecode (active/inactive). Only records with statecode = 0
  (active) are returned by the PortalConfigService (filter: 'statecode eq 0', top: 1).
  The primary name attribute shall be qdb_portal_name.

FR-SCHEMA-005: qdb_portal_nav_items
  The system shall provision a custom table qdb_portal_nav_items with the following
  columns (confirmed from NavService.ts DataverseNavItem interface):
  - qdb_portal_nav_itemid : GUID, primary key
  - qdb_label             : Single line of text (255), required
  - qdb_label_ar          : Single line of text (255), optional (Arabic label)
  - qdb_icon              : Single line of text (100), optional
  - qdb_page_code         : Single line of text (100), required
  - qdb_display_order     : Whole Number, required, default = 0
  - qdb_is_visible        : Yes/No (boolean), required, default = Yes
  - qdb_badge_source      : Choice (picklist), required, default = none
    Values: none (860000001), static (860000002), query (860000003)
  - qdb_badge_value       : Single line of text (500), optional
    (static badge text OR OData query string e.g. "qdb_portal_requests?$filter=...")
  - qdb_required_role     : Single line of text (100), optional
    (role string; if set, nav item is only shown to users with this role)
  - qdb_parent_id         : Lookup to qdb_portal_nav_items (self-referential), optional
    (OData navigation property: _qdb_parent_id_value)
  The entity shall support statecode (active/inactive).
  The primary name attribute shall be qdb_label.

FR-SCHEMA-006: qdb_portal_widget_configs
  The system shall provision a custom table qdb_portal_widget_configs with the following
  columns (confirmed from widgets.ts DataverseWidgetConfig interface):
  - qdb_portal_widget_configid : GUID, primary key
  - qdb_widget_type            : Single line of text (100), required
    (maps to a widget registry key, e.g. "my-requests-summary")
  - qdb_title                  : Single line of text (255), optional
  - qdb_display_order          : Whole Number, required, default = 0
  - qdb_column_span            : Whole Number, required, default = 1
    (1 = half width, 2 = full width in a 2-column grid)
  - qdb_config                 : Multiple lines of text (Memo), optional
    (JSON object of widget-specific configuration)
  The entity shall support statecode (active/inactive).
  Only records with statecode = 0 are returned (filter: 'statecode eq 0').
  The primary name attribute shall be qdb_widget_type.

FR-SCHEMA-007: qdb_portal_services
  The system shall provision a custom table qdb_portal_services with the following
  columns (confirmed from services.ts DataverseService interface):
  - qdb_portal_serviceid      : GUID, primary key
  - qdb_code                  : Single line of text (100), required, unique alternate key
  - qdb_title                 : Single line of text (255), required
  - qdb_title_ar              : Single line of text (255), optional (Arabic title)
  - qdb_short_description     : Multiple lines of text (Memo), optional
  - qdb_short_description_ar  : Multiple lines of text (Memo), optional
  - qdb_full_description      : Multiple lines of text (Memo), optional
  - qdb_full_description_ar   : Multiple lines of text (Memo), optional
  - qdb_category_tag          : Single line of text (100), optional
  - qdb_image_url             : Single line of text (500), optional
  - qdb_form_code             : Single line of text (100), optional
    (code of the Dynamic Form Engine form to launch for this service)
  - qdb_is_active             : Yes/No (boolean), required, default = Yes
  - qdb_display_order         : Whole Number, required, default = 0
  Only records where qdb_is_active eq true are returned to citizens.
  The primary name attribute shall be qdb_title.

FR-SCHEMA-008: qdb_portal_service_tabs
  The system shall provision a custom table qdb_portal_service_tabs with the following
  columns (confirmed from services.ts DataverseServiceTab interface):
  - qdb_portal_service_tabid : GUID, primary key
  - qdb_service_id           : Lookup to qdb_portal_services, required
    (OData navigation property: _qdb_service_id_value)
  - qdb_title                : Single line of text (255), required
  - qdb_title_ar             : Single line of text (255), optional
  - qdb_content              : Multiple lines of text (Memo), required
  - qdb_content_ar           : Multiple lines of text (Memo), optional
  - qdb_display_order        : Whole Number, required, default = 0
  Tabs are ordered by qdb_display_order asc and filtered by parent service ID.
  The primary name attribute shall be qdb_title.

── 5.3 Citizen-Facing Data ───────────────────────────────────────────────────────────

FR-SCHEMA-009: qdb_portal_requests
  The system shall provision a custom table qdb_portal_requests with the following
  columns (confirmed from requests.ts DataverseRequest interface):
  - qdb_portal_requestid  : GUID, primary key
  - qdb_service_code      : Single line of text (100), required
  - qdb_service_title     : Single line of text (255), required
  - qdb_status            : Choice (picklist), required, default = submitted
    Values: submitted (860000001), under-review (860000002), approved (860000003),
            rejected (860000004), pending-docs (860000005)
    NOTE: The API code uses picklist code prefix 860000xxx for this entity, not
    100000xxx as stated in the brief. The code is authoritative.
  - qdb_reference_number  : Single line of text (100), optional
    (system-generated reference; formatted display identifier)
  - qdb_form_data         : Multiple lines of text (Memo), optional
    (JSON object of form submission data)
  - qdb_user_id           : Single line of text (100), required
    (portal user GUID stored as plain string — used in OData filter:
     qdb_user_id eq '<userId>'; not a Dataverse lookup)
  OOB fields createdon and modifiedon are used for submittedOn and lastUpdatedOn.
  Records are scoped to the authenticated user by qdb_user_id at query time.
  The primary name attribute shall be qdb_reference_number.

FR-SCHEMA-010: qdb_portal_request_timelines
  The system shall provision a custom table qdb_portal_request_timelines with the
  following columns (confirmed from requests.ts loadTimeline function):
  - qdb_portal_request_timelineid : GUID, primary key
  - qdb_request_id                : Lookup to qdb_portal_requests, required
    (OData navigation property: _qdb_request_id_value)
  - qdb_status                    : Single line of text (100), required
    (denormalised status label at the time of the event)
  - qdb_note                      : Multiple lines of text (Memo), optional
  - qdb_changed_by                : Single line of text (255), optional
  This table is append-only. The security role shall grant Create but not Update or
  Delete privileges on this table.
  OOB field createdon is used as the timeline event timestamp.
  The primary name attribute shall be qdb_status.

FR-SCHEMA-011: qdb_portal_request_documents
  The system shall provision a custom table qdb_portal_request_documents with the
  following columns (confirmed from requests.ts loadDocuments function):
  - qdb_portal_request_documentid : GUID, primary key
  - qdb_request_id                : Lookup to qdb_portal_requests, required
    (OData navigation property: _qdb_request_id_value)
  - qdb_name                      : Single line of text (255), required
    (display name of the uploaded document)
  - qdb_url                       : Single line of text (500), required
    (URL or path to the document; provisioned for DFE-PORT-002 full implementation)
  OOB field createdon is used as uploadedOn.
  The primary name attribute shall be qdb_name.

FR-SCHEMA-012: qdb_portal_notifications
  The system shall provision a custom table qdb_portal_notifications with the following
  columns (confirmed from NotificationService.ts DataverseNotification interface):
  - qdb_portal_notificationid : GUID, primary key
  - qdb_user_id               : Single line of text (100), required
    (portal user GUID as plain string — used in OData filter)
  - qdb_title                 : Single line of text (255), required
  - qdb_body                  : Multiple lines of text (Memo), required
  - qdb_type                  : Choice (picklist), required, default = info
    Values: info (860000001), success (860000002), warning (860000003),
            error (860000004)
  - qdb_link_url              : Single line of text (500), optional
  - qdb_is_read               : Yes/No (boolean), required, default = No
  Records are scoped to the authenticated user by qdb_user_id at query time.
  OOB field createdon is used as createdOn.
  The primary name attribute shall be qdb_title.

── 5.4 CMS ───────────────────────────────────────────────────────────────────────────

FR-SCHEMA-013: qdb_cms_contents
  The system shall provision a custom table qdb_cms_contents with the following
  columns (confirmed from CmsService.ts schema comment and DataverseCmsContent interface):
  - qdb_cms_contentid      : GUID, primary key
  - qdb_slug               : Single line of text (100), required, unique alternate key
    (URL-safe identifier; the CmsService queries by this field)
  - qdb_title              : Single line of text (255), required
  - qdb_title_ar           : Single line of text (255), optional
  - qdb_content_type       : Choice (picklist), required, default = blog
    Values: blog (100000001), news (100000002), announcement (100000003),
            page (100000004)
    NOTE: CmsService.ts uses these codes (100000xxx), which differ from the
    original brief values. The code is authoritative.
  - qdb_body_html          : Multiple lines of text (Memo), optional
    (Tiptap HTML output, English; DOMPurify sanitised before storage)
  - qdb_body_html_ar       : Multiple lines of text (Memo), optional
    (Tiptap HTML output, Arabic)
  - qdb_excerpt            : Single line of text (500), optional
  - qdb_excerpt_ar         : Single line of text (500), optional
  - qdb_cover_image_url    : Single line of text (500), optional
  - qdb_status             : Choice (picklist), required, default = draft
    Values: draft (100000001), published (100000002), archived (100000003)
  - qdb_published_on       : Date and Time, optional
    (set by publish action; cleared by unpublish action)
  - qdb_author_name        : Single line of text (255), optional
    (denormalised display name — no foreign key to portal user)
  - qdb_tags               : Single line of text (1000), optional
    (comma-separated tag strings; the CmsService filters with contains())
  - qdb_meta_description   : Single line of text (500), optional
  OOB fields createdon and modifiedon are used by the service.
  Public portal queries filter on qdb_status eq 100000002 (published).
  The primary name attribute shall be qdb_title.

FR-SCHEMA-014: qdb_cms_revisions
  The system shall provision a custom table qdb_cms_revisions with the following
  columns (confirmed from CmsService.ts DataverseCmsRevision interface):
  - qdb_cms_revisionid     : GUID, primary key
  - qdb_content_id         : Lookup to qdb_cms_contents, required
    (OData navigation property: _qdb_content_id_value)
    (OData bind syntax used in create: "qdb_content_id@odata.bind")
  - qdb_body_html          : Multiple lines of text (Memo), optional
    (point-in-time snapshot of English body HTML at the time of the save)
  - qdb_body_html_ar       : Multiple lines of text (Memo), optional
    (point-in-time snapshot of Arabic body HTML)
  - qdb_saved_by           : Single line of text (255), optional
    (display name of the CMS editor who triggered the save)
  OOB field createdon is used as the revision timestamp.
  This table is append-only. The security role shall grant Create but no Update or
  Delete privilege on this table.
  The primary name attribute shall be qdb_cms_revisionid (auto-name).

── 5.5 Entity Switcher Junction ──────────────────────────────────────────────────────

FR-SCHEMA-015: qdb_portal_user_entities
  The system shall provision a custom table qdb_portal_user_entities with the following
  columns (confirmed from EntityService.ts DataverseUserEntity interface):
  - qdb_portal_user_entityid : GUID, primary key
  - qdb_user_id              : Single line of text (100), required
    (portal user GUID stored as plain string — used in filter: qdb_user_id eq '<id>')
  - qdb_account_id           : Lookup to the OOB account entity, required
    (OData navigation property: _qdb_account_id_value)
    (EntityService expands this to get name, qdb_sub_type, qdb_logo_url)
  This table links a portal user to one or more Dataverse accounts for the entity
  switcher feature. A user may have 0–100 linked accounts.
  The primary name attribute shall be qdb_portal_user_entityid (auto-name).


6. NON-FUNCTIONAL REQUIREMENTS
════════════════════════════════

NFR-001: Performance
  The Dataverse OData endpoint for qdb_portal_configs (single record fetch, statecode = 0)
  must return a response within 200ms p95 from the API server in the EU West crm4 region
  under normal load, consistent with the Phase 7 pre-production checklist requirement
  of portal-config p95 < 50ms (API service to client; Dataverse to API server < 200ms).

NFR-002: Performance — Notifications
  The qdb_portal_notifications endpoint (top 50 records filtered by qdb_user_id) must
  return results within 500ms p95 from Dataverse to the API server, supporting the
  Phase 7 pre-production checklist requirement of notifications p95 < 200ms end-to-end.

NFR-003: Availability
  The provisioned entities must be part of a managed solution that can be exported,
  version-controlled, and reimported without data loss. The managed solution approach
  ensures the schema can be re-applied to a staging or production environment reliably.

NFR-004: Security — Service Principal Access
  The service principal (CLIENT_ID: 08e80e93-0bab-45ef-8372-2e554fa9af9b) shall be
  registered as a Dataverse application user and assigned only the "Portal Shell API Role"
  custom security role. It shall not be assigned System Administrator or
  System Customizer roles.

NFR-005: Security — Column-Level
  The qdb_password_hash column on qdb_portal_users shall not be retrievable via OData
  $select by any security role other than the "Portal Shell API Role". Production
  environments must ensure this column is not exposed via Power Apps or model-driven
  app forms accessible to general users.

NFR-006: Security — Append-Only Tables
  The following three tables must be provably append-only at the security role level:
    - qdb_portal_revoked_tokens (Create only; no Update, no Delete)
    - qdb_portal_request_timelines (Create only; no Update, no Delete)
    - qdb_cms_revisions (Create only; no Update, no Delete)
  The "Portal Shell API Role" must reflect this constraint exactly.

NFR-007: Scalability
  The schema must support the following estimated record volumes without schema change:
    - qdb_portal_users:           up to 100,000 records
    - qdb_portal_requests:        up to 500,000 records
    - qdb_portal_notifications:   up to 2,000,000 records
    - qdb_portal_revoked_tokens:  up to 10,000,000 records (one per token revocation)
    - qdb_cms_contents:           up to 10,000 records
    - qdb_cms_revisions:          up to 100,000 records (up to 10 per content record)
  All other tables: up to 10,000 records.

NFR-008: Compliance — Data Residency
  All entities are provisioned in the EU West (crm4) Dataverse environment
  (org5869857f.crm4.dynamics.com). No data shall leave the EU West region as a result
  of this schema provisioning work.

NFR-009: Audit Fields
  All 15 custom tables automatically inherit the OOB Dataverse audit columns:
  createdon, modifiedon, createdby, modifiedby. No additional audit columns are
  required beyond these OOB fields and the table-specific timestamp fields
  (qdb_revoked_on, qdb_expires_on, qdb_published_on).

NFR-010: Solution Versioning
  The QdbPortalShell managed solution shall be versioned 1.0.0.0 at initial delivery.
  Every subsequent schema change must increment the version number before export.


7. BUSINESS RULES
══════════════════

BR-001: One Active Portal Config
  At any point in time, exactly one qdb_portal_configs record with statecode = 0
  (active) shall exist. The PortalConfigService fetches records with statecode = 0
  and top = 1; if zero records exist, the API returns a 500 error. If more than one
  active record exists, the portal returns a non-deterministic configuration.
  The seed data must create exactly one active config record. Administrators must
  deactivate an existing config record before activating a new one.

BR-002: Reset Token Single-Use
  A qdb_portal_reset_tokens record with qdb_used = true shall not be used to reset
  a password. The CustomCredentialAdapter filters for qdb_used eq false before
  validating the bcrypt hash. This rule is enforced in application code; the schema
  must not allow the qdb_used column to be null.

BR-003: Reset Token Expiry
  A qdb_portal_reset_tokens record past its qdb_expires_on datetime shall not be used
  to reset a password. The CustomCredentialAdapter filters for
  qdb_expires_on gt <current datetime>. The schema must not allow qdb_expires_on to
  be null.

BR-004: Notification Poll Interval Bounds
  The qdb_notification_poll_interval_seconds column on qdb_portal_configs must store
  a value between 10 and 120 inclusive. The default is 30. This satisfies CEO
  binding condition C5 from DFE-PORT-001 Phase 7. A Dataverse column-level constraint
  (min/max) shall enforce these bounds.

BR-005: Revoked Token JTI Uniqueness
  Each JTI value stored in qdb_portal_revoked_tokens shall be unique. A duplicate JTI
  write attempt (e.g. double revocation of the same token) shall not corrupt the table
  but may produce a duplicate record because the adapter does not pre-check; the
  auth-guard checks for the existence of any record with the given JTI. A unique
  constraint on qdb_jti is desirable but not mandatory if Dataverse alternate key
  uniqueness causes performance issues on a high-volume append-only table.

BR-006: CMS Revision Limit
  No more than 10 revision records shall be retained per qdb_cms_contents record.
  When the 11th revision is created, the oldest revision for that content record
  shall be deleted. This rule is enforced in the CmsService application code
  (noted in the pre-production checklist as item 10). The schema itself does not
  enforce this limit; the schema must only allow the Create operation.

BR-007: Service Tab Ordering
  qdb_portal_service_tabs records shall always be ordered by qdb_display_order asc
  when returned via the API. This is enforced at query time, not at the schema level.

BR-008: Nav Item Self-Referential Lookup
  The qdb_parent_id lookup on qdb_portal_nav_items references the same entity. A nav
  item must not be its own parent. This is not enforced at the Dataverse schema level
  but must be enforced by the administrator when configuring navigation.


8. USER STORIES
═══════════════

US-01 — Portal API Boot
  As the portal API process, I want to query qdb_portal_configs for the active record
  so that the application can start and serve the PortalConfig to web clients.
  Priority: Must Have
  Acceptance Criteria:
    Given the QdbPortalShell solution is deployed and the seed config record exists,
    When the API calls GET /api/portal-config,
    Then the response is HTTP 200 with a JSON body containing portalName, navLayout,
         notificationPollIntervalSeconds, and authProvider.

US-02 — Citizen Login
  As a citizen, I want to submit my email and password to POST /api/auth/login so that
  I receive an access token and refresh token to authenticate subsequent requests.
  Priority: Must Have
  Acceptance Criteria:
    Given a qdb_portal_users record exists with the correct bcrypt password hash,
    When the citizen POSTs valid credentials to /api/auth/login,
    Then the response is HTTP 200 with accessToken, refreshToken, and user profile.

US-03 — Token Revocation on Logout
  As the portal security layer, I want logout to write the JWT's JTI to
  qdb_portal_revoked_tokens so that the revoked token cannot be used again.
  Priority: Must Have
  Acceptance Criteria:
    Given a citizen is logged in with a valid accessToken,
    When the citizen POSTs to /api/auth/logout,
    Then a qdb_portal_revoked_tokens record is created with the correct JTI,
         and a subsequent request with the same accessToken returns HTTP 401.

US-04 — Password Reset Flow
  As a citizen, I want to receive a password reset link and complete the reset
  so that I can regain access to my account.
  Priority: Must Have
  Acceptance Criteria:
    Given the citizen POSTs a valid email to /api/auth/forgot-password,
    When a qdb_portal_reset_tokens record is created with qdb_used = false and a
         future qdb_expires_on,
    Then the citizen can POST to /api/auth/reset-password with the raw token and
         their new password, and the qdb_password_hash on qdb_portal_users is updated
         and qdb_used is set to true.

US-05 — Navigation Tree
  As an authenticated citizen, I want to call GET /api/nav so that I receive the
  navigation tree filtered by my roles and assembled into a parent-child hierarchy.
  Priority: Must Have
  Acceptance Criteria:
    Given at least 3 seed qdb_portal_nav_items records exist,
    When the citizen calls GET /api/nav with a valid JWT,
    Then the response contains a tree structure of NavItem objects with correct
         displayOrder, and items requiring a role the user lacks are excluded.

US-06 — My Requests
  As a citizen, I want to call GET /api/requests so that I can see a list of all
  service requests I have submitted.
  Priority: Must Have
  Acceptance Criteria:
    Given at least one qdb_portal_requests record with qdb_user_id matching the
         authenticated user exists,
    When the citizen calls GET /api/requests,
    Then the response contains only records owned by that user, with status mapped
         to the correct string enum value.

US-07 — Notifications Poll
  As the portal web frontend, I want to poll GET /api/notifications every
  qdb_notification_poll_interval_seconds seconds so that the user sees unread
  notification counts without a full page reload.
  Priority: Must Have
  Acceptance Criteria:
    Given a qdb_portal_notifications record exists for the authenticated user,
    When the frontend polls /api/notifications,
    Then the response includes the notification with the correct type picklist mapping
         and isRead = false until the user marks it read.

US-08 — CMS Public Content
  As a citizen, I want to read published CMS content at GET /api/cms/content so that
  I can view portal announcements, articles, and static pages.
  Priority: Must Have
  Acceptance Criteria:
    Given at least one qdb_cms_contents record with qdb_status = 100000002 (published)
         exists,
    When the citizen calls GET /api/cms/content,
    Then only published records are returned, ordered by qdb_published_on desc.

US-09 — CMS Revision History
  As a CMS administrator, I want every content save to create a qdb_cms_revisions
  record so that previous versions of the HTML body can be reviewed or restored.
  Priority: Should Have
  Acceptance Criteria:
    Given a qdb_cms_contents record is created via the admin API,
    Then a qdb_cms_revisions record is automatically created with the same body HTML,
         and on subsequent update a second revision captures the previous body,
         and the total revision count for that content record does not exceed 10.

US-10 — Entity Switcher
  As an authenticated citizen linked to multiple accounts, I want to call
  GET /api/entities so that I can switch between the organisations I belong to.
  Priority: Should Have
  Acceptance Criteria:
    Given qdb_portal_user_entities records exist linking the user to one or more
         Dataverse accounts,
    When the citizen calls GET /api/entities,
    Then the response lists those accounts with name, subType, and logoUrl.

US-11 — Service Catalogue
  As an authenticated citizen, I want to call GET /api/services so that I can browse
  available government services and their detail tabs.
  Priority: Must Have
  Acceptance Criteria:
    Given at least one qdb_portal_services record with qdb_is_active = true exists,
    When the citizen calls GET /api/services,
    Then active services are returned ordered by qdb_display_order asc, each including
         their associated qdb_portal_service_tabs ordered by tab display order.

US-12 — Widget Dashboard
  As the dashboard page, I want to call GET /api/widgets so that I can render
  the correct widget layout in the correct column order.
  Priority: Should Have
  Acceptance Criteria:
    Given at least one qdb_portal_widget_configs record with statecode = 0 exists,
    When the dashboard calls GET /api/widgets,
    Then the widgets are returned ordered by qdb_display_order asc with widgetType,
         columnSpan, and parsed config object.


9. DATA REQUIREMENTS
════════════════════

| Entity                        | Est. Volume         | Retention          | Sensitivity    |
|-------------------------------|---------------------|--------------------|----------------|
| qdb_portal_users              | Up to 100,000       | Lifetime of portal | Restricted     |
| qdb_portal_reset_tokens       | Moderate (transient)| 90 days            | Restricted     |
| qdb_portal_revoked_tokens     | High (append-only)  | 90 days            | Confidential   |
| qdb_portal_configs            | 1 active at a time  | Indefinite         | Internal       |
| qdb_portal_nav_items          | < 100               | Indefinite         | Internal       |
| qdb_portal_widget_configs     | < 50                | Indefinite         | Internal       |
| qdb_portal_services           | < 500               | Indefinite         | Public         |
| qdb_portal_service_tabs       | < 2,000             | Indefinite         | Public         |
| qdb_portal_requests           | Up to 500,000       | 7 years            | Confidential   |
| qdb_portal_request_timelines  | Up to 2,000,000     | 7 years (append)   | Confidential   |
| qdb_portal_request_documents  | Up to 1,000,000     | 7 years            | Confidential   |
| qdb_portal_notifications      | Up to 2,000,000     | 1 year             | Confidential   |
| qdb_cms_contents              | < 10,000            | Indefinite         | Public/Internal|
| qdb_cms_revisions             | < 100,000           | Indefinite (capped)| Internal       |
| qdb_portal_user_entities      | < 500,000           | Lifetime of portal | Confidential   |

Sensitivity classifications:
  Restricted  — PII, password hashes, access tokens; access strictly limited to service principal
  Confidential — Citizen request data and notification content; access by authorised staff only
  Internal     — Configuration and content managed by administrators
  Public       — Published CMS content and service catalogue accessible by all authenticated users


10. SEED DATA REQUIREMENTS
══════════════════════════

The following minimum seed data must be inserted during or immediately after schema
deployment so that the portal API can boot and staging smoke tests can execute.

SD-001: Portal Config Record (1 record required in qdb_portal_configs)
  - qdb_portal_name                     = "Portal Shell (Staging)"
  - qdb_primary_color                   = "#1A73E8"
  - qdb_accent_color                    = "#FBBC04"
  - qdb_nav_layout                      = 860000001 (sidebar)
  - qdb_sidebar_default_state           = 860000001 (expanded)
  - qdb_auth_provider                   = 860000003 (custom)
  - qdb_rtl_enabled                     = false
  - qdb_header_show_notifications       = true
  - qdb_notification_poll_interval_seconds = 30
  - qdb_landing_page                    = "/dashboard"
  - statecode                           = 0 (active)

SD-002: Navigation Items (minimum 3 records required in qdb_portal_nav_items)
  Record 1:
    - qdb_label           = "Dashboard"
    - qdb_label_ar        = "لوحة التحكم"
    - qdb_page_code       = "dashboard"
    - qdb_icon            = "home"
    - qdb_display_order   = 1
    - qdb_is_visible      = true
    - qdb_badge_source    = 860000001 (none)
    - statecode           = 0 (active)
  Record 2:
    - qdb_label           = "My Requests"
    - qdb_label_ar        = "طلباتي"
    - qdb_page_code       = "my-requests"
    - qdb_icon            = "file-text"
    - qdb_display_order   = 2
    - qdb_is_visible      = true
    - qdb_badge_source    = 860000003 (query)
    - qdb_badge_value     = "qdb_portal_requests?$filter=qdb_status eq 860000001"
    - statecode           = 0 (active)
  Record 3:
    - qdb_label           = "Services"
    - qdb_label_ar        = "الخدمات"
    - qdb_page_code       = "services"
    - qdb_icon            = "grid"
    - qdb_display_order   = 3
    - qdb_is_visible      = true
    - qdb_badge_source    = 860000001 (none)
    - statecode           = 0 (active)

SD-003: Test Portal User (1 record required in qdb_portal_users for smoke testing)
  - qdb_email            = "smoketest@portalshell.internal"
  - qdb_password_hash    = <bcrypt hash of "SmokeTest@2026!" with cost factor 12>
  - qdb_first_name       = "Smoke"
  - qdb_last_name        = "Tester"
  - qdb_display_name     = "Smoke Tester"
  - qdb_roles            = '["portal_user"]'
  - qdb_linked_entity_ids = '[]'
  - qdb_preferred_language = 100000001 (en)
  IMPORTANT: This user is for staging smoke tests only. It must be deactivated
  (statecode = 1) before the environment is promoted to production.

SD-004: Widget Config (minimum 1 record in qdb_portal_widget_configs for dashboard test)
  - qdb_widget_type    = "my-requests-summary"
  - qdb_title          = "My Requests"
  - qdb_display_order  = 1
  - qdb_column_span    = 2
  - qdb_config         = '{}'
  - statecode          = 0 (active)


11. INTEGRATION DEPENDENCIES
════════════════════════════

| System                          | Integration Type           | Data Exchanged                                           | Direction                    |
|---------------------------------|----------------------------|----------------------------------------------------------|------------------------------|
| Dataverse OData v4 Web API      | REST / OData               | All 15 entity CRUD operations                            | API Server → Dataverse        |
| Azure AD (service principal)    | OAuth 2.0 client_credentials | Access token for Dataverse API                          | API Server → Azure AD → Dataverse |
| QdbDynamicFormEngine solution   | Dataverse (read only)      | form_codes referenced by qdb_portal_services.qdb_form_code | Portal → DFE forms          |
| OOB account entity              | Dataverse lookup            | qdb_portal_user_entities.qdb_account_id joins to account | EntityService → accounts   |
| NodeCache (in-memory)           | In-process cache            | Active portal config cached for configurable TTL         | PortalConfigService ↔ cache  |
| NodeCache (in-memory)           | In-process cache            | JTI blocklist cached for 60s (valid) / 1hr (revoked)    | Auth guard ↔ cache          |


12. ASSUMPTIONS
═══════════════

A-001: The org5869857f Dataverse environment is accessible to the delivery team with
       sufficient privileges (System Administrator) to create a new solution, publish
       entities, and register an application user.

A-002: The service principal CLIENT_ID 08e80e93-0bab-45ef-8372-2e554fa9af9b already
       exists as an Azure AD application registration in TENANT_ID
       d79e793c-f6de-4204-8508-7980a63df957. Only the Dataverse application user
       registration and security role assignment are in scope.

A-003: The qdb publisher (prefix qdb_) is already registered in the
       org5869857f environment from the QdbDynamicFormEngine solution. If not, the
       publisher must be created as part of this work.

A-004: The OOB account entity in the org5869857f environment has the custom columns
       qdb_sub_type (Single line of text) and qdb_logo_url (Single line of text) that
       EntityService.ts references. If these columns do not exist, the entity switcher
       feature will return empty subType and logoUrl values, but the API will not fail.

A-005: Dataverse alternate keys (unique constraints on qdb_email and qdb_slug) are
       supported in the target environment without additional configuration.

A-006: The picklist code ranges 860000xxx and 100000xxx are available for new custom
       option sets. No existing global option set in the environment uses these same
       integer values for conflicting purposes.

A-007: All CMS content types in the built code (blog, news, announcement, page) differ
       from the original brief (article, banner, static-page, announcement). The
       CmsService.ts code is the authoritative definition and the brief values are
       superseded.

A-008: The qdb_portal_requests picklist codes in the built code use the 860000xxx range
       (not 100000xxx as stated in the brief). The code is authoritative.

A-009: The FIFO cap of 10 revisions per CMS content record (pre-production checklist
       item 10) is enforced in application code, not by a Dataverse plugin or flow.
       The schema supports unlimited revisions; the cap is a service-layer concern.


13. CONSTRAINTS
═══════════════

C-001: The QdbDynamicFormEngine managed solution must not be modified. All new entities
       and components must be added to the new QdbPortalShell solution only.

C-002: The service principal may not be assigned the System Administrator or
       System Customizer roles in the Dataverse environment. The "Portal Shell API Role"
       must be purpose-built with least-privilege access.

C-003: OOB Dataverse entities (account, contact, systemuser) must not have columns
       added or modified as part of this schema provisioning, except that the application
       user record is created in the systemuser entity as a standard Dataverse operation.

C-004: The schema must be deployable as a managed solution to ensure ALM integrity.
       Unmanaged solution components are not acceptable for a production deployment.

C-005: The target environment is in the EU West (crm4) region. No cross-region data
       replication or integration is permitted as part of this work (data residency
       compliance for government citizen data).

C-006: Schema must be delivered within this sub-engagement (DFE-PORT-001/SCHEMA) before
       the staging smoke test sign-off in the pre-production checklist can proceed.
       The staging smoke test is a blocking gate before production go-live.

C-007: PAC CLI (Power Platform CLI) must be used for solution export and source control.
       Manual solution export via the browser UI is acceptable for initial development
       but PAC CLI export must be the documented and repeatable delivery mechanism.


14. RISKS AND OPEN QUESTIONS
════════════════════════════

| Risk / Question                                                                   | Impact | Owner               | Resolution needed by         |
|-----------------------------------------------------------------------------------|--------|---------------------|------------------------------|
| RQ-001: Does the qdb publisher already exist in org5869857f? If not, all entity    | HIGH   | Power Platform Dev  | Before schema implementation |
|         logical names will differ and the API will fail immediately.               |        |                     |                              |
| RQ-002: Do qdb_sub_type and qdb_logo_url columns exist on the OOB account entity?  | MEDIUM | System Admin        | Before entity switcher test  |
|         EntityService reads these columns; missing columns return null silently.   |        |                     |                              |
| RQ-003: Are picklist code ranges 860000xxx and 100000xxx free from conflict with   | HIGH   | Power Platform Dev  | Before schema implementation |
|         existing global option sets in org5869857f?                                |        |                     |                              |
| RQ-004: The original brief lists different picklist values for qdb_portal_requests  | HIGH   | BA + Backend Dev    | Confirmed — code is correct  |
|         (100000xxx) vs. what the built code uses (860000xxx). This BRD adopts the  |        |                     | No further action needed      |
|         code values. Confirm no test cases use the brief values.                   |        |                     |                              |
| RQ-005: qdb_portal_revoked_tokens volume may reach 10M records within 12 months.  | MEDIUM | Architect           | Before production go-live    |
|         A Dataverse bulk-delete job or TTL-based purge for records older than the  |        |                     |                              |
|         maximum JWT expiry window (e.g. 90 days) should be planned for Phase 2.   |        |                     |                              |
| RQ-006: The original brief described qdb_portal_pages as an entity. The built code | MEDIUM | BA                  | Before schema implementation |
|         contains no service or route that reads from this entity. It is excluded   |        |                     |                              |
|         from this BRD. Confirm with the backend team whether it is needed.         |        |                     |                              |
| RQ-007: The test user seed record (SD-003) requires a bcrypt hash to be generated  | LOW    | Power Platform Dev  | During seed data insertion   |
|         out of band (Node.js script or similar). A plain-text password must never  |        |                     |                              |
|         be stored in the schema provisioning scripts or version control.            |        |                     |                              |
| RQ-008: The qdb_portal_reset_tokens and qdb_portal_revoked_tokens tables will      | LOW    | Architect           | 30-day post-release window   |
|         accumulate stale records indefinitely. A scheduled bulk-delete Power       |        |                     |                              |
|         Automate flow should be planned to purge expired/used records.             |        |                     |                              |


15. GLOSSARY
════════════

| Term                        | Definition                                                                                             |
|-----------------------------|--------------------------------------------------------------------------------------------------------|
| Dataverse                   | Microsoft Dataverse — the cloud data platform backing Dynamics 365 and Power Platform                  |
| OData v4                    | Open Data Protocol version 4 — the REST API standard used by Dataverse Web API                        |
| Entity set name             | The plural logical name used in OData URLs (e.g. qdb_portal_configs in GET /qdb_portal_configs)        |
| Managed solution            | A Dataverse solution that is locked after import; components cannot be modified in the target org      |
| Publisher prefix            | The short string (qdb_) prepended to all custom column and entity logical names                        |
| Service principal           | An Azure AD application identity used by the API server to authenticate to Dataverse                  |
| Application user            | A Dataverse user record linked to a service principal; holds the security role assignment              |
| JTI                         | JWT ID — a unique identifier embedded in each JWT used to track revoked tokens                         |
| bcrypt                      | A password-hashing algorithm; cost factor 12 used for passwords, 10 for reset tokens                  |
| statecode                   | OOB Dataverse column: 0 = active, 1 = inactive; used to soft-deactivate records                       |
| DFE-PORT-001                | Parent engagement: Configurable Portal Shell — the full web + API + CMS build                         |
| DFE-PORT-001/SCHEMA         | This sub-engagement: Dataverse schema provisioning for the portal shell                               |
| QdbDynamicFormEngine        | The existing Dataverse managed solution in the target environment — must not be modified               |
| QdbPortalShell              | The new Dataverse managed solution created by this sub-engagement                                     |
| Picklist / Choice           | Dataverse column type that stores a predefined set of integer-keyed options                            |
| Alternate key               | A Dataverse uniqueness constraint on one or more columns (equivalent to a unique index)               |
| crm4                        | Microsoft datacenter region code for EU West (used in org URL: org5869857f.crm4.dynamics.com)         |
| PAC CLI                     | Power Platform CLI — the command-line tool for exporting and importing Dataverse solutions             |
| TC-E2E-001..009             | Playwright end-to-end test cases defined in Phase 5 QA; must pass before production go-live           |
| Track A / C / B             | The three delivery tracks of DFE-PORT-001: Web+API (A), CMS (C), Mobile (B)                          |


16. REQUIREMENTS TRACEABILITY MATRIX
══════════════════════════════════════

| User Story | Functional Requirement           | Business Objective | Test Case (QA fills) | Status |
|------------|----------------------------------|--------------------|----------------------|--------|
| US-01      | FR-SCHEMA-004                    | BO-2               | TC-E2E-001 (pending) | Draft  |
| US-02      | FR-SCHEMA-001, FR-SCHEMA-002     | BO-3               | TC-E2E-002 (pending) | Draft  |
| US-03      | FR-SCHEMA-003                    | BO-4               | TC-E2E-003 (pending) | Draft  |
| US-04      | FR-SCHEMA-001, FR-SCHEMA-002     | BO-3               | TC-E2E-004 (pending) | Draft  |
| US-05      | FR-SCHEMA-005                    | BO-5               | TC-E2E-005 (pending) | Draft  |
| US-06      | FR-SCHEMA-009, FR-SCHEMA-010     | BO-5               | TC-E2E-006 (pending) | Draft  |
| US-07      | FR-SCHEMA-012, FR-SCHEMA-004     | BO-5               | TC-E2E-007 (pending) | Draft  |
| US-08      | FR-SCHEMA-013                    | BO-5               | TC-E2E-008 (pending) | Draft  |
| US-09      | FR-SCHEMA-013, FR-SCHEMA-014     | BO-5               | TC-E2E-009 (pending) | Draft  |
| US-10      | FR-SCHEMA-015                    | BO-5               | TC-SCHEMA-010 (pending) | Draft |
| US-11      | FR-SCHEMA-007, FR-SCHEMA-008     | BO-5               | TC-SCHEMA-011 (pending) | Draft |
| US-12      | FR-SCHEMA-006                    | BO-5               | TC-SCHEMA-012 (pending) | Draft |


17. SUCCESS CRITERIA
═════════════════════

The schema provisioning sub-engagement is complete when all of the following are true:

SC-001: The QdbPortalShell managed solution is deployed to org5869857f and all 15
        custom tables are visible in the Dataverse maker portal with the correct
        column sets, data types, and picklist values as defined in Section 5.

SC-002: The "Portal Shell API Role" security role is created and assigned to the
        service principal application user with at minimum: Create, Read, Write on
        all qdb_portal_* and qdb_cms_* entities, and Create-only on
        qdb_portal_revoked_tokens, qdb_portal_request_timelines, and qdb_cms_revisions.

SC-003: The API health check endpoint GET /api/health returns HTTP 200.

SC-004: GET /api/portal-config returns HTTP 200 with a valid PortalConfig JSON body
        (portalName, navLayout, notificationPollIntervalSeconds, authProvider populated).

SC-005: POST /api/auth/login with credentials smoketest@portalshell.internal /
        SmokeTest@2026! returns HTTP 200 with a valid accessToken and refreshToken.

SC-006: GET /api/nav with a valid Bearer token returns HTTP 200 with at least 3
        navigation items in the correct display order.

SC-007: The QdbPortalShell solution can be exported as a managed solution file via
        PAC CLI without errors, and the file is committed to version control.


18. APPROVAL
════════════

| Role          | Name              | Decision  | Date |
|---------------|-------------------|-----------|------|
| CEO           | Pending           | PENDING   |      |
| Requestor     | Pending           | PENDING   |      |

═══════════════════════════════════════════════════
END OF DOCUMENT — DFE-PORT-001/SCHEMA v1.0
═══════════════════════════════════════════════════
