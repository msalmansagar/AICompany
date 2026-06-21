# BRD — DXP-P1-002: Role-Based Access Control (RBAC)

**Engagement ID:** DXP-P1-002
**Date:** 2026-06-18
**Author:** Maqsad AI — Business Analyst
**Status:** Draft — Awaiting CEO Review

---

## 1. Executive Summary

The QDB Digital Experience Platform (DXP) currently has a token-based authentication layer (JWT + Fastify auth-guard) with a rudimentary single-role check (`requireRole(role: string)`). There is no defined role taxonomy, no stored permission model, no mapping between roles and component categories, and no admin interface for managing role assignments.

DXP-P1-002 delivers a full Role-Based Access Control (RBAC) system that:

- Defines a formal role taxonomy covering both QDB Staff (internal) and Citizens (external) user populations.
- Stores role definitions and user-role assignments in Dataverse (solution `QdbDxpPlatform`).
- Maps roles to component categories (from the DXP-P1-001 Component Registry) and to portal pages/routes.
- Surfaces permissions in JWT claims at login/refresh time to keep the API hot path free of Dataverse calls.
- Provides admin screens for role assignment management and an audit log of all role changes.
- Integrates backward-compatibly with the existing `fastify.authenticate` / `fastify.requireRole()` infrastructure.

**Architecture gate:** Architecture and build phases for DXP-P1-002 may not begin until DXP-P1-001's six blocking conditions are cleared. Target clearance date: 2026-06-18.

---

## 2. Business Context and Problem Statement

### 2.1 Background

Qatar Development Bank (QDB) is a government-owned development finance institution. Its DXP portal serves two distinct populations:

1. **QDB Staff** — internal employees ranging from system administrators to read-only analysts.
2. **Citizens and Corporate Entities** — external users who apply for QDB financing products, track applications, and manage documents.

### 2.2 Current State

- `fastify.requireRole('Admin')` checks whether the string `'Admin'` exists in the JWT `roles` array.
- The `roles` array in the JWT is populated at login by logic not yet specified (assumed hardcoded or manually seeded).
- There is no Dataverse storage for role definitions or user-role assignments.
- There is no enforcement of which components a user may see based on their role.
- There is no admin screen to assign or revoke roles.
- There is no audit trail for role changes.

### 2.3 Problem Statement

Without a structured RBAC layer:

1. Any user can access any portal page or API endpoint beyond the single-role check.
2. Component visibility is purely frontend cosmetic — a determined caller can hit API endpoints directly.
3. Role management requires developer intervention (manual DB edits or redeployment).
4. There is no audit trail for compliance reporting, which is a regulatory requirement for a government entity.
5. The portal cannot safely onboard Citizens without risk of data leakage to the wrong role.

### 2.4 Strategic Objectives

- Enforce least-privilege access at the API layer for every role.
- Enable business administrators to manage role assignments without developer involvement.
- Maintain a full, immutable audit trail of all role assignment changes.
- Support bilingual (English/Arabic) role metadata throughout.
- Deliver a permission model that scales to future DXP phases without architectural rework.

---

## 3. Stakeholders

| Stakeholder | Role | Interest |
|---|---|---|
| QDB IT Director | System owner | RBAC security posture, compliance |
| QDB Portal Admin | Day-to-day admin | Role assignment UI usability |
| QDB Service Owners | Content/service managers | Which staff can manage their services |
| QDB Compliance Team | Regulatory | Audit trail completeness |
| QDB Citizens / Corporate Users | External portal users | Seamless access to permitted features only |
| Maqsad AI — DXP Team | Delivery | Integration with existing DXP-P1-001 infrastructure |

---

## 4. Role Taxonomy

All roles are identified by a slug (per BRD C-010: slug is the cross-environment identity key, never the Dataverse GUID).

### 4.1 QDB Staff Roles (internal user population)

| Slug | Display Name (EN) | Display Name (AR) | Description |
|---|---|---|---|
| `portal-admin` | Portal Administrator | مدير البوابة | Full control over portal configuration, component management, RBAC administration, and content. |
| `service-owner` | Service Owner | مالك الخدمة | Manages a specific QDB product/service offering: configures service-related components, views applications for their service. |
| `content-manager` | Content Manager | مدير المحتوى | Creates and edits portal content (CMS pages, banners, announcements). No access to financial data. |
| `staff-viewer` | Staff Viewer | موظف (عرض فقط) | Read-only access to portal analytics, reports, and application status dashboards. No modification permissions. |
| `support-agent` | Support Agent | وكيل الدعم | Can view citizen profiles, application status, and documents to assist citizens. Cannot modify financial records. |

### 4.2 Citizen / External User Roles (external user population)

| Slug | Display Name (EN) | Display Name (AR) | Description |
|---|---|---|---|
| `citizen` | Citizen | مواطن | Authenticated individual citizen. Can submit and track personal financing applications, manage own documents and profile. |
| `corporate-user` | Corporate User | مستخدم مؤسسي | Authenticated representative of a corporate entity. Can submit corporate financing applications, manage company documents. |
| `guest` | Guest | زائر | Unauthenticated or pre-registration visitor. View-only access to public informational pages. No application submission. |

### 4.3 Role Hierarchy Notes

- `portal-admin` is the only role that can assign/revoke any other role.
- `service-owner` can only be granted by `portal-admin`.
- `citizen` and `corporate-user` are assigned automatically by the registration flow based on registration type.
- `guest` is the implicit role for all unauthenticated requests (not stored in Dataverse; inferred at runtime).
- A user may hold multiple staff roles simultaneously (e.g. `service-owner` + `staff-viewer`).
- A citizen user may never hold a staff role and vice versa. Cross-population role assignment is prohibited.

---

## 5. Permission Model

### 5.1 Role-to-Component-Category Permissions

Component categories are defined in the DXP-P1-001 Component Registry. Permission levels:

- `none` — component category is invisible and inaccessible.
- `view` — user can see rendered output of components in this category.
- `interact` — user can interact with components (e.g. submit forms, click action buttons).
- `manage` — user can configure/administer components in this category via admin screens.

| Component Category | portal-admin | service-owner | content-manager | staff-viewer | support-agent | citizen | corporate-user | guest |
|---|---|---|---|---|---|---|---|---|
| `widget` (dashboard widget) | manage | view | view | view | view | view | view | none |
| `form` (form component) | manage | interact | view | view | interact | interact | interact | none |
| `nav-component` | manage | view | manage | view | view | view | view | view |
| `layout` | manage | view | manage | view | view | view | view | view |
| `data-display` | manage | view | view | view | view | view | view | none |
| `action-button` | manage | interact | view | view | interact | interact | interact | none |

**Enforcement rule:** Permission checks for component category access must be enforced at the API layer (Fastify route pre-handler), not only in the frontend. A `view`-level token must not be able to call a `manage`-level API endpoint even if the frontend UI is bypassed.

### 5.2 Role-to-Page Permissions

Portal pages/routes and their permitted roles:

| Page / Route | portal-admin | service-owner | content-manager | staff-viewer | support-agent | citizen | corporate-user | guest |
|---|---|---|---|---|---|---|---|---|
| `/` (public home) | yes | yes | yes | yes | yes | yes | yes | yes |
| `/dashboard` | yes | yes | yes | yes | yes | yes | yes | no |
| `/applications` | yes | yes | no | yes (read) | yes (read) | yes | yes | no |
| `/applications/new` | no | no | no | no | no | yes | yes | no |
| `/documents` | yes | no | no | no | yes (read) | yes | yes | no |
| `/profile` | yes | yes | yes | yes | yes | yes | yes | no |
| `/notifications` | yes | yes | yes | yes | yes | yes | yes | no |
| `/reports` | yes | yes | no | yes | no | no | no | no |
| `/admin` | yes | no | no | no | no | no | no | no |
| `/admin/cms` | yes | no | yes | no | no | no | no | no |
| `/admin/components` | yes | no | no | no | no | no | no | no |
| `/admin/rbac` | yes | no | no | no | no | no | no | no |
| `/admin/audit` | yes | no | no | no | no | no | no | no |

**Note:** `guest` may access public informational pages outside this list. The table above covers authenticated routes only.

---

## 6. Role Assignment and Lifecycle

### 6.1 Assignment Mechanisms

| Scenario | Mechanism | Who triggers |
|---|---|---|
| Staff user created | `portal-admin` assigns role via `/admin/rbac` screen | Portal Admin |
| Citizen registration | Registration flow auto-assigns `citizen` role | System (no human approval needed) |
| Corporate registration | Registration flow auto-assigns `corporate-user` role after KYC step | System (post-KYC callback) |
| Role promotion (e.g. staff viewer → service owner) | `portal-admin` explicit assignment via admin screen | Portal Admin |
| Role revocation | `portal-admin` explicit revocation via admin screen | Portal Admin |

### 6.2 Role Assignment Rules

- Only `portal-admin` may assign or revoke staff roles.
- Staff roles (`portal-admin`, `service-owner`, `content-manager`, `staff-viewer`, `support-agent`) may not be assigned to citizen-population accounts.
- Citizen roles (`citizen`, `corporate-user`) may not be assigned to staff-population accounts.
- A user may hold at most one citizen role (citizen XOR corporate-user) and zero or more staff roles.
- `portal-admin` role may be assigned only to users in the QDB staff population.
- There must be at least one active `portal-admin` at all times (system must prevent removal of the last admin).

### 6.3 Role Change Propagation

When a user's role assignment changes, the following must occur:

1. The Dataverse `qdb_rbac_user_roles` record is created/deactivated (audit append; never deleted).
2. The user's existing access tokens remain valid until expiry (default: 1 hour) unless the admin also triggers a JTI revocation.
3. On next token refresh (or forced re-login), the API re-reads the user's Dataverse role assignments and issues a new JWT with updated `roles` and `permissions` claims.
4. **Forced revocation SLA:** If an admin revokes a sensitive role, they may optionally trigger immediate JTI revocation via the admin screen, adding all current JTIs for that user to the `qdb_portal_revoked_tokenses` blocklist. Maximum propagation delay in this case: 60 seconds (existing JTI cache TTL).

---

## 7. Dataverse Data Model

All entities belong to solution `QdbDxpPlatform`, publisher prefix `qdb_`. All entities include `createdon`, `createdby`, `modifiedon`, `modifiedby` standard Dataverse columns.

### 7.1 Entity: `qdb_rbac_role_definitions`

Stores the canonical definition of each RBAC role.

| Column | Type | Notes |
|---|---|---|
| `qdb_rbac_role_definitionid` | Unique Identifier (PK) | Dataverse standard |
| `qdb_slug` | Single Line of Text (100) | Unique, required. Cross-environment identity key (C-010). e.g. `portal-admin` |
| `qdb_displayname_en` | Single Line of Text (200) | Required |
| `qdb_displayname_ar` | Single Line of Text (200) | Required |
| `qdb_population` | Option Set | `staff` (860005001), `citizen` (860005002) |
| `qdb_description_en` | Multi-Line Text | Optional |
| `qdb_description_ar` | Multi-Line Text | Optional |
| `qdb_issystem` | Two Options (bool) | True = seeded by solution, cannot be deleted via UI |
| `statecode` | State | Active / Inactive |

**Indexes:** Unique index on `qdb_slug`.

### 7.2 Entity: `qdb_rbac_category_permissions`

Stores the permission level granted to a role for a specific component category.

| Column | Type | Notes |
|---|---|---|
| `qdb_rbac_category_permissionid` | Unique Identifier (PK) | |
| `qdb_role` | Lookup → `qdb_rbac_role_definitions` | Required |
| `qdb_role_slug` | Single Line of Text (100) | Denormalised slug for query efficiency (C-010 compliance) |
| `qdb_component_category` | Option Set | Mirrors `qdb_component_definitions.qdb_category` codes |
| `qdb_permission_level` | Option Set | `none` (0), `view` (1), `interact` (2), `manage` (3) |
| `statecode` | State | Active / Inactive |

**Indexes:** Unique composite index on (`qdb_role`, `qdb_component_category`).

### 7.3 Entity: `qdb_rbac_page_permissions`

Stores the page/route access grant for each role.

| Column | Type | Notes |
|---|---|---|
| `qdb_rbac_page_permissionid` | Unique Identifier (PK) | |
| `qdb_role` | Lookup → `qdb_rbac_role_definitions` | Required |
| `qdb_role_slug` | Single Line of Text (100) | Denormalised slug |
| `qdb_route_pattern` | Single Line of Text (500) | Route pattern, e.g. `/admin/rbac`, `/applications/*` |
| `qdb_can_access` | Two Options (bool) | True = access granted |
| `statecode` | State | Active / Inactive |

### 7.4 Entity: `qdb_rbac_user_roles`

Stores user-to-role assignments. This is an append-only audit record — rows are deactivated, never deleted.

| Column | Type | Notes |
|---|---|---|
| `qdb_rbac_user_roleid` | Unique Identifier (PK) | |
| `qdb_portal_user` | Lookup → `qdb_portal_users` (existing) | The user receiving the role |
| `qdb_role` | Lookup → `qdb_rbac_role_definitions` | Required |
| `qdb_role_slug` | Single Line of Text (100) | Denormalised slug |
| `qdb_assigned_by` | Lookup → `systemuser` | The staff user who made the assignment |
| `qdb_assigned_on` | Date and Time | Timestamp of assignment |
| `qdb_revoked_by` | Lookup → `systemuser` | Nullable — populated on revocation |
| `qdb_revoked_on` | Date and Time | Nullable — populated on revocation |
| `qdb_revocation_reason` | Multi-Line Text | Optional free-text reason |
| `statecode` | State | Active = currently active assignment; Inactive = revoked |

**Constraint:** May not be deleted via API or UI. Only `statecode` transitions are permitted.

### 7.5 Entity: `qdb_rbac_audit_log`

Immutable append-only audit log for all RBAC mutations.

| Column | Type | Notes |
|---|---|---|
| `qdb_rbac_audit_logid` | Unique Identifier (PK) | |
| `qdb_event_type` | Option Set | `role_assigned` (1), `role_revoked` (2), `role_created` (3), `role_deactivated` (4), `permission_changed` (5) |
| `qdb_actor_user_id` | Single Line of Text | Dataverse user GUID or `system` for automated events |
| `qdb_target_user_id` | Single Line of Text | Affected user's `qdb_portal_user` ID |
| `qdb_role_slug` | Single Line of Text (100) | Slug of the affected role |
| `qdb_previous_state` | Multi-Line Text | JSON snapshot of state before change |
| `qdb_new_state` | Multi-Line Text | JSON snapshot of state after change |
| `qdb_event_timestamp` | Date and Time | UTC |
| `qdb_correlation_id` | Single Line of Text (100) | Propagated from API request context |

**Constraint:** No UPDATE or DELETE operations permitted. Insert-only via service layer.

---

## 8. JWT Integration Design

### 8.1 Extended TokenClaims

The existing `TokenClaims` interface must be extended backward-compatibly:

```typescript
interface TokenClaims {
  sub: string;                    // existing
  email: string;                  // existing
  roles: string[];                // existing — role slugs e.g. ['portal-admin']
  jti?: string;                   // existing
  iat: number;                    // existing
  exp: number;                    // existing
  // NEW — added by DXP-P1-002:
  permissions?: RbacPermissions;  // optional; absent = legacy token, treat as guest
}

interface RbacPermissions {
  /** Component category permission levels keyed by category option-set code */
  categories: Record<string, 'none' | 'view' | 'interact' | 'manage'>;
  /** Explicit page route patterns the user is permitted to access */
  pages: string[];
}
```

Adding `permissions` as an optional field ensures all existing tokens remain valid — the auth-guard treats a missing `permissions` field as requiring a Dataverse fallback (for the transition period), after which all tokens will carry it.

### 8.2 Permission Embedding at Login/Refresh

At login and token refresh, the auth service:

1. Reads the user's active `qdb_rbac_user_roles` records from Dataverse (filtered by `statecode eq 0`).
2. For each active role slug, reads the corresponding `qdb_rbac_category_permissions` and `qdb_rbac_page_permissions` records.
3. Merges permissions across all assigned roles using a highest-privilege-wins strategy (e.g. if role A has `view` and role B has `manage` for the same category, the user gets `manage`).
4. Embeds the merged `RbacPermissions` object into the JWT `permissions` claim.
5. Signs the JWT with the existing `JWT_SECRET`.

This means **zero Dataverse calls are needed per API request** for permission checks on the hot path. The JWT itself is the authority.

### 8.3 Token Refresh Trigger on Role Change

When an admin assigns or revokes a role:

1. The `qdb_rbac_user_roles` record is created/deactivated in Dataverse.
2. An entry is appended to `qdb_rbac_audit_log`.
3. If the admin selects "Force immediate revocation": all current JTIs for that user are added to `qdb_portal_revoked_tokenses`. The user will receive a 401 `token_revoked` response on the next request and must re-authenticate, receiving a new JWT with updated permissions. Maximum propagation delay: 60 seconds.
4. If "Force revocation" is not selected: the user's existing tokens remain valid until natural expiry (≤1 hour). On next refresh, the new permissions are embedded. Propagation delay: up to 1 hour.

### 8.4 requireRole Extension

The existing `fastify.requireRole(role: string)` must remain functional for backward compatibility. DXP-P1-002 adds:

- `fastify.requirePermission(category: string, level: PermissionLevel)` — checks `request.user.permissions.categories[category] >= level`.
- `fastify.requirePageAccess(route: string)` — checks `request.user.permissions.pages` for a matching pattern.

---

## 9. Admin Screens

All admin RBAC screens are accessible only to `portal-admin` role, hosted under the `/admin/rbac` route.

### 9.1 Screen: Role List (`/admin/rbac/roles`)

- Table of all role definitions with columns: Slug, Display Name (EN/AR), Population, Status (Active/Inactive), Action buttons.
- Filter by population (Staff / Citizen).
- "Add Role" button (only for non-system roles — `qdb_issystem = false`).
- "Deactivate" action for non-system roles with zero active user assignments.

### 9.2 Screen: Role Detail / Edit (`/admin/rbac/roles/[slug]`)

- Edit display names (EN/AR), description (EN/AR).
- Read-only view of category permission matrix for this role (no inline editing — permissions managed separately).
- Read-only view of page permissions for this role.
- List of current active user assignments for this role (with links to user profiles).

### 9.3 Screen: Permission Matrix (`/admin/rbac/permissions`)

- Read-only grid: rows = component categories, columns = roles.
- Cell value: permission level badge (none / view / interact / manage).
- "Edit Permissions" button opens a modal per role × category cell with a dropdown to select permission level.
- Changes require confirmation ("This will affect N active users.").
- Saved changes take effect on next user token refresh.

### 9.4 Screen: User Role Assignment (`/admin/rbac/users/[userId]`)

- Shows the target user's current active role assignments.
- "Assign Role" button: dropdown of available roles filtered by population match.
- "Revoke Role" button per active assignment: optional free-text reason field.
- "Force Immediate Revocation" toggle: if enabled, revocation also adds all current JTIs for the user to the blocklist.
- Assignment and revocation actions are confirmed with a modal before executing.

### 9.5 Screen: Audit Log (`/admin/rbac/audit`)

- Paginated table of `qdb_rbac_audit_log` records.
- Columns: Timestamp, Event Type, Actor, Target User, Role Slug, Details.
- Filters: date range, event type, role slug, actor.
- Export to CSV button (for compliance reporting).
- Read-only — no delete or edit controls.

---

## 10. Security and Compliance Requirements

### 10.1 Qatar Government Data Classification

QDB operates under Qatar's National Information Assurance Policy (NIAP) and relevant MOTC (Ministry of Transport and Communications) data governance frameworks. RBAC records are classified as:

- **Role definitions:** Internal / Unrestricted — publishable within the portal system.
- **User-role assignments:** Internal / Restricted — accessible only to `portal-admin` and the assigned user themselves.
- **Audit log:** Internal / Confidential — accessible only to `portal-admin` and QDB Compliance team.

All Dataverse data must remain within the Qatar/GCC Azure region (consistent with existing DXP-P1-001 data residency commitment).

### 10.2 Least-Privilege Enforcement

- Every API route must declare its minimum required permission level explicitly. No route is "open by default" beyond the public home page.
- Service accounts used by the portal API to read Dataverse RBAC data must have read-only access to RBAC entities only. They must not have write access to `qdb_rbac_audit_log` (audit writes go through a separate privileged service account).
- The `guest` role has no JWT — any attempt to reach a non-public route without a token returns 401.

### 10.3 Audit Trail Requirements

- Every role assignment, revocation, role definition creation, and permission change must produce an entry in `qdb_rbac_audit_log` within the same transaction.
- Audit log records may not be deleted or modified by any user, service account, or process. Enforcement: Dataverse table-level permissions (no delete, no update).
- Audit log must be queryable by QDB Compliance for a minimum of 7 years.

### 10.4 Token Security

- Role claims in the JWT are verified on every API call by the existing auth-guard plugin. No client-side trust.
- Permission claims in the JWT are embedded server-side and signed. Any tampering invalidates the signature.
- `permissions` claim is read-only from the client perspective. Clients cannot modify their own permissions.

### 10.5 Role Separation

- The `portal-admin` role itself must be managed by the QDB IT Director — it cannot be self-assigned.
- A `portal-admin` may not assign `portal-admin` to another user without a second `portal-admin` account confirming the action (four-eyes principle for admin promotion). **[Open question — see Section 15]**

---

## 11. Non-Functional Requirements

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-001 | Performance | Permission check on API hot path (JWT claim read) | < 1 ms — in-memory JWT parse only |
| NFR-002 | Performance | Role assignment admin operation (Dataverse write + token revocation) | < 3 seconds end-to-end |
| NFR-003 | Performance | Login/refresh including Dataverse role fetch | < 800 ms p95 |
| NFR-004 | Scalability | Concurrent portal users | 5,000 simultaneous authenticated users |
| NFR-005 | Scalability | Total user-role assignment records | Up to 100,000 records |
| NFR-006 | Scalability | Number of distinct roles | Up to 50 (current: 7) |
| NFR-007 | Availability | RBAC check must not block API if Dataverse is unavailable | JWT claims are the authority; Dataverse is consulted only at login/refresh |
| NFR-008 | Availability | Admin RBAC screens availability | 99.5% uptime (same as portal SLA) |
| NFR-009 | Localisation | All role display names | English and Arabic required |
| NFR-010 | Localisation | Admin screen UI | Full RTL support for Arabic |
| NFR-011 | Audit | Retention period for audit log | 7 years minimum |
| NFR-012 | Security | Role change propagation with forced revocation | ≤ 60 seconds |
| NFR-013 | Security | Role change propagation without forced revocation | ≤ 1 hour (token natural expiry) |

---

## 12. Integration with Existing Auth Infrastructure

### 12.1 Backward Compatibility Commitments

The following existing interfaces must remain unmodified or extended only in a backward-compatible way:

| Interface | Current state | DXP-P1-002 change |
|---|---|---|
| `TokenClaims` (auth.ts) | `roles: string[]` | Add optional `permissions?: RbacPermissions` |
| `fastify.authenticate` | Validates JWT + JTI blocklist | No change |
| `fastify.requireRole(role: string)` | Checks roles array | No change to signature; behaviour unchanged |
| `UserProfile.roles` | `string[]` | No change |

### 12.2 New Auth Infrastructure Added

- `fastify.requirePermission(category: string, level: PermissionLevel)` — new decorator.
- `fastify.requirePageAccess(route: string)` — new decorator.
- `RbacService` — Fastify plugin that encapsulates all Dataverse RBAC reads/writes.
- `PermissionEmbedder` — called by auth service at login/refresh to build the `permissions` JWT claim.

### 12.3 Component Registry Integration (C-010)

All references from RBAC entities to component categories use the Dataverse option set code integer (matching `qdb_component_definitions.qdb_category`). No GUIDs. When the API returns permission data to the client, it uses the `qdb_name` slug notation (e.g. `widget`, `form`) mapped from option set codes — consistent with C-010.

---

## 13. Out of Scope

The following are explicitly excluded from DXP-P1-002:

1. **SSO / Entra ID / Azure AD federation** — external identity provider integration is deferred to a future phase.
2. **Row-level security** — restricting which specific records (e.g. specific loan applications) a user can see within a permitted page. This is a DXP-P1-003+ concern.
3. **Multi-tenancy** — a single portal instance serves all QDB users. Multi-tenant isolation is not required.
4. **Third-party IdP integration** (SAML, OAuth2 social login) — out of scope.
5. **Dynamic permission rules / ABAC** — attribute-based access control. The permission model is role-based only.
6. **Mobile app RBAC** — the DXP mobile channel is not in scope for this phase.
7. **Dynamics 365 / CRM-side security roles** — RBAC for the DXP portal only, not for backend CRM access.
8. **Automated role expiry** — time-limited role grants (e.g. "grant access for 30 days") are deferred.
9. **Self-service role request workflow** — staff requesting role promotions via portal with approval flow is deferred.
10. **Bulk user import with roles** — CSV import of users with pre-assigned roles is out of scope.

---

## 14. Assumptions

| ID | Assumption |
|---|---|
| A-001 | The existing `qdb_portal_users` entity in Dataverse contains the canonical user identity record for all portal users (staff and citizens). |
| A-002 | The existing JWT infrastructure (HS256, `JWT_SECRET`) remains unchanged. No certificate-based tokens in this phase. |
| A-003 | The Dataverse org `org5869857f.crm4.dynamics.com` and solution `QdbDxpPlatform` remain the deployment target. |
| A-004 | DXP-P1-001's six blocking conditions will be cleared before architecture begins (per the architecture gate). |
| A-005 | The portal currently has at most a handful of active users (pre-production), so there is no migration risk for existing JWT tokens. All users will re-authenticate after DXP-P1-002 is deployed. |
| A-006 | QDB has not yet mandated specific Qatar NIAP controls beyond those already implemented in DXP-P1-001 (data residency, TLS, encrypted tokens). The auditor will validate this in Phase 9. |
| A-007 | The four-eyes requirement for `portal-admin` promotion is desirable but not formally mandated by QDB. It is raised as an open question for architecture confirmation. |
| A-008 | "Guest" is not a stored role in Dataverse. It is a runtime inference for unauthenticated requests. |

---

## 15. Open Questions for Architecture Phase

| ID | Question | Owner | Impact |
|---|---|---|---|
| OQ-001 | Should the `permissions` claim embed the full permissions object (all categories + pages) or a compressed bitmap? At 7 roles × 6 categories the payload is small now, but needs an upper-bound analysis for 50 roles × N categories. | Architect | JWT payload size, parsing performance |
| OQ-002 | Four-eyes principle for `portal-admin` promotion: is a second active `portal-admin` confirmation required? This adds complexity to the assignment flow. | QDB IT Director + Architect | Admin screen complexity |
| OQ-003 | Should `qdb_rbac_category_permissions` be evaluated by the API on every request, or only embedded in the JWT at login/refresh? If evaluated per-request, what is the caching strategy? | Architect | Performance, consistency |
| OQ-004 | The `requirePageAccess` check: should route pattern matching use exact match or glob patterns? (e.g. `/admin/*` covers all admin sub-routes). Glob matching on the hot path must be benchmarked. | Architect | Route permission granularity |
| OQ-005 | The `qdb_rbac_audit_log` must be immutable. Dataverse table permissions can prevent delete/update via the UI, but can the service account be further restricted? Consider a write-only service account specifically for audit log inserts. | Architect + Security | Audit log integrity |
| OQ-006 | Token refresh: should role changes trigger a push notification to the client (e.g. via SignalR/WebSocket) prompting immediate token refresh? Or is passive refresh on next expiry sufficient? | Architect + QDB | UX impact of up-to-1-hour delay |
| OQ-007 | The `support-agent` role can view citizen profiles and documents. Does this require explicit citizen consent or a QDB data governance approval? | QDB Compliance + BA | Regulatory risk |

---

## 16. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-001 | A user with role `portal-admin` can access all routes listed in the page permission table (Section 5.2). |
| AC-002 | A user with role `citizen` receives HTTP 403 when attempting to access `/admin` or any `/admin/*` sub-route. |
| AC-003 | A user with role `staff-viewer` receives HTTP 403 when calling a `manage`-level API endpoint for any component category. |
| AC-004 | A user with role `citizen` can interact with `form` and `action-button` category components (HTTP 200 on interact-level endpoints). |
| AC-005 | A user with role `guest` (no JWT) receives HTTP 401 on any authenticated route. |
| AC-006 | When a `portal-admin` assigns a new role to a user, a record appears in `qdb_rbac_user_roles` with `statecode = Active` and `qdb_assigned_on` set to the current timestamp. |
| AC-007 | When a `portal-admin` revokes a role with "Force Immediate Revocation" enabled, the user's next API request (within 60 seconds) returns HTTP 401 `token_revoked`. |
| AC-008 | When a `portal-admin` revokes a role without forced revocation, the user's current JWT remains valid until its natural expiry; after token refresh, the revoked role is absent from the new JWT's `roles` claim. |
| AC-009 | Every role assignment and revocation produces an entry in `qdb_rbac_audit_log` with the correct `qdb_event_type`, `qdb_actor_user_id`, `qdb_target_user_id`, `qdb_role_slug`, and `qdb_event_timestamp`. |
| AC-010 | `qdb_rbac_audit_log` records cannot be deleted or updated via any API endpoint or Dataverse UI (Dataverse permission enforcement confirmed in integration test). |
| AC-011 | A JWT issued after DXP-P1-002 deployment contains a `permissions` claim with a `categories` map and a `pages` array consistent with the user's active role assignments. |
| AC-012 | The `permissions` claim is absent (or `undefined`) for tokens issued before DXP-P1-002; the auth-guard handles this gracefully without throwing an unhandled exception. |
| AC-013 | All role display names appear in both English and Arabic in the admin RBAC screens. |
| AC-014 | The `/admin/rbac/audit` screen correctly paginates audit log entries and the CSV export contains all records for the selected filter range. |
| AC-015 | The `portal-admin` cannot delete the last remaining active `portal-admin` assignment (system returns HTTP 409 with code `last_admin_removal_prohibited`). |
| AC-016 | Component category permission checks on the API hot path (JWT claim read + comparison) complete in under 1 ms as measured by Vitest benchmark. |
| AC-017 | Login including Dataverse role fetch and permission embedding completes within 800 ms at p95 under a simulated load of 100 concurrent logins. |
| AC-018 | A user's role `roles` array in the JWT contains all active role slugs from `qdb_rbac_user_roles` and no deactivated or revoked roles. |
| AC-019 | The `guest` role is not stored in Dataverse; the system correctly infers guest status from the absence of a valid JWT without any database query. |
| AC-020 | Assigning a staff role (`portal-admin`, `service-owner`, `content-manager`, `staff-viewer`, `support-agent`) to a citizen-population user returns HTTP 400 with code `cross_population_role_prohibited`. |
