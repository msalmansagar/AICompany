# Business Requirements Document — DFE Configurable Portal Shell
**Engagement ID:** DFE-PORT-001  
**Phase:** Phase 2 — Business Analysis  
**Status:** FINAL — All open questions resolved  
**Author:** BA Agent  
**Date:** 2026-06-16

---

## 1. Business Context

The Dynamic Form Engine delivers metadata-driven forms. This engagement builds the **portal shell** that surrounds them — a fully white-label, configurable application frame. Any client (QDB, Reyada, future tenants) can brand and configure the portal without code changes.

The Reyada portal screenshot (QDB SME advisory platform) is the reference visual standard.

**Scope:** Portal shell · Authentication (3 providers + SSO) · Navigation (sidebar or top-nav) · Dashboard (plug-in widgets) · Services & Requests · CMS (blog, news, static pages) · Arabic RTL · React Native mobile app

---

## 2. All Decisions Locked

| Question | Decision |
|----------|----------|
| Auth provider | All three: Azure AD B2C, Entra External ID, Custom credential store (pluggable adapter) |
| SSO | Microsoft and Google — required v1 |
| Entity switcher | Per-user linked entities (user sees only companies they are associated with in Dataverse) |
| Notification source | Custom Dataverse entity (`qdb_portal_notification`) |
| Dashboard widgets | Fully plug-in extensible from day one |
| Arabic RTL | Required in this phase |
| Mobile app | In scope — React Native + Expo |
| CMS | In scope — Dataverse-backed, no external CMS |

---

## 3. Functional Requirements

### 3.1 Portal Configuration

| ID | Requirement |
|----|-------------|
| PC-001 | Admin defines branding: logo URL, favicon, primary color, accent color, font family, background color |
| PC-002 | Admin selects navigation layout per portal instance: `Left Sidebar` or `Top Navigation` |
| PC-003 | Admin toggles each header slot independently: entity switcher, support link, notification bell, user avatar |
| PC-004 | Admin configures footer: left logo, right logo, powered-by text, optional link row (Privacy Policy, Terms, Contact) |
| PC-005 | Admin sets sidebar width and default state: `Expanded` or `Collapsed` |
| PC-006 | Admin selects auth provider per portal: `Azure AD B2C`, `Entra External ID`, or `Custom` |
| PC-007 | Admin configures SSO providers on login page: Microsoft, Google, both, or neither |
| PC-008 | Admin sets default landing page after login: Dashboard, Services, or My Requests |
| PC-009 | Admin sets portal language defaults and enables Arabic RTL mode |
| PC-010 | All configuration stored in `qdb_portal_config`; runtime-loaded, no redeployment required |

---

### 3.2 Authentication & Identity

| ID | Requirement |
|----|-------------|
| AUTH-001 | Login page fully branded from `qdb_portal_config` (logo, colors, font) |
| AUTH-002 | Three auth adapters, selectable per portal: **Azure AD B2C**, **Entra External ID**, **Custom** (email + password + OTP) |
| AUTH-003 | SSO: "Sign in with Microsoft" and "Sign in with Google" buttons on login page |
| AUTH-004 | Forgot Password: email OTP → reset password |
| AUTH-005 | New user self-registration: email verification → profile completion → account active |
| AUTH-006 | Admin can disable self-registration and require invite-only |
| AUTH-007 | Unauthenticated users redirected to login; deep link preserved and resumed after auth |
| AUTH-008 | Tokens: access token (15 min) + refresh token (7 days); stored in HttpOnly cookies (web) / SecureStore (mobile) |
| AUTH-009 | Refresh token rotation on every use; revoke all sessions on password change |
| AUTH-010 | Logout clears session state and redirects to login |
| AUTH-011 | Configurable idle session timeout (default 30 min) with warning dialog before expiry |
| AUTH-012 | Mobile: biometric login (Face ID / fingerprint) via `expo-local-authentication` |

---

### 3.3 Navigation Menu

| ID | Requirement |
|----|-------------|
| NAV-001 | Menu items stored in `qdb_portal_nav_item` with: Fluent icon name, label (EN + AR), page code, display order, visibility, required role |
| NAV-002 | Each item supports an optional badge: static number, or live count from a Dataverse OData query |
| NAV-003 | One level of sub-items — children expand inline with chevron icon |
| NAV-004 | Active item highlighted with brand primary color + filled background |
| NAV-005 | **Left Sidebar mode:** collapsible via hamburger toggle; collapsed state shows icons-only with tooltips |
| NAV-006 | **Top Navigation mode:** same items render as horizontal tab bar; overflow items collapse into "More" dropdown |
| NAV-007 | Sidebar footer area shows two configurable logo slots (e.g., "Powered by QDB") |
| NAV-008 | Role-based visibility: items hidden if user lacks required role |
| NAV-009 | **Mobile:** bottom tab bar for primary items; drawer for secondary items |

---

### 3.4 Header

| ID | Requirement |
|----|-------------|
| HDR-001 | Left section: hamburger toggle (sidebar collapse/expand) + optional app icon |
| HDR-002 | Centre section: current entity name, entity sub-type/sector, dropdown chevron |
| HDR-003 | Entity switcher lists only companies the logged-in user is linked to in Dataverse (per-user entities) |
| HDR-004 | Switching entity reloads context-sensitive data without full page reload |
| HDR-005 | Right section (each independently toggleable): Get Support link, notification bell with unread count, user avatar |
| HDR-006 | User avatar dropdown: display name, email, My Profile, Switch Language (EN/AR), Sign Out |
| HDR-007 | Notification bell opens a right-side panel: last 50 notifications with timestamp, read/unread state, link to source record, mark-all-read |
| HDR-008 | Header is sticky (fixed at top) on desktop and mobile |

---

### 3.5 Dashboard — Plug-in Widget System

| ID | Requirement |
|----|-------------|
| DASH-001 | Dashboard is a configurable responsive grid of widgets |
| DASH-002 | Widget registry: widgets are self-describing plug-ins registered by name. Adding a new widget requires no changes to the portal shell |
| DASH-003 | Admin assigns widgets to a dashboard layout: widget type, display order, column span, widget-specific config — stored in `qdb_portal_widget_config` |
| DASH-004 | Each widget instance has: title (overridable), visibility toggle, and its own config payload (JSON) |
| DASH-005 | **Built-in widgets v1:** My Requests summary (count by status), Recent Activity feed, Announcements banner, Quick Actions grid, Statistics counters |
| DASH-006 | Each widget fetches its own data independently (no global data fetch) |
| DASH-007 | Each widget renders a loading skeleton and has its own error boundary — one failed widget does not break the page |
| DASH-008 | Widget API contract: `{ name, title, component, configSchema, defaultConfig }` |

---

### 3.6 Services & Requests

| ID | Requirement |
|----|-------------|
| SRV-001 | Services listing: card grid filterable by category tag, with keyword search |
| SRV-002 | Service card: thumbnail image, category badge (SME etc.), title, short description |
| SRV-003 | Service detail: hero image, category badge, title, full description, **Apply Now** CTA button |
| SRV-004 | Detail tab strip (configurable per service): Eligibility, Scope of Work, Coverage, Milestones, Service Providers — content in Dataverse rich-text fields |
| SRV-005 | "Apply Now" navigates to the DFE form linked to that service via `formCode` |
| SRV-006 | Optional eligibility gate: check user/entity eligibility before showing Apply Now; show ineligibility reason if blocked |
| SRV-007 | My Requests: paginated list of user's applications with service name, date, status badge, action buttons |
| SRV-008 | Request detail: read-only submitted form data + status timeline (submitted → under review → approved/rejected) with dates and notes |
| SRV-009 | User can upload additional documents on a request post-submission (if service allows) |
| SRV-010 | Request status changes write a `qdb_portal_notification` record |

---

### 3.7 Notifications

| ID | Requirement |
|----|-------------|
| NOTIF-001 | Custom entity `qdb_portal_notification` with fields: user_id, title, body, type (info/success/warning/error), link_url, is_read, created_on |
| NOTIF-002 | Backend writes a notification record on: application status change, document request, message received, approval decision |
| NOTIF-003 | Unread count shown on bell icon; polled on page focus (30s interval) |
| NOTIF-004 | Notification panel shows last 50 records; "View All" links to full notifications page |
| NOTIF-005 | Mark single as read (click notification); mark all as read (button) |
| NOTIF-006 | Mobile: same `qdb_portal_notification` records trigger push notifications via Firebase / APNs |
| NOTIF-007 | Notification tap on mobile deep-links to the relevant screen |

---

### 3.8 CMS — Blog, News & Static Pages

| ID | Requirement |
|----|-------------|
| CMS-001 | Content types: `Blog Post`, `News Article`, `Announcement`, `Static Page` |
| CMS-002 | Content item fields: title (EN + AR), slug, body rich-text (EN + AR), category/tags, hero image, publish date, author, status (draft/published/archived), SEO meta description |
| CMS-003 | Admin CMS editor: create, edit, preview, publish, schedule, archive content |
| CMS-004 | Rich text editor supports: headings H1-H4, bold, italic, bullet/numbered lists, links, inline images, embedded video (YouTube URL) |
| CMS-005 | News/Blog listing page: paginated, filterable by category and tag, keyword search |
| CMS-006 | Article detail page: renders rich text body with SEO metadata and Open Graph tags |
| CMS-007 | Announcements appear on Dashboard as a banner widget and on relevant portal pages |
| CMS-008 | Static pages accessible at configurable routes (e.g., `/about`, `/privacy`) and optionally in the footer link row |
| CMS-009 | Content stored in `qdb_cms_content` (Dataverse) — no external CMS dependency |
| CMS-010 | Arabic content: separate AR title and AR body fields; language toggle switches EN ↔ AR |
| CMS-011 | Admin can schedule publish/unpublish dates per content item |
| CMS-012 | Content revisions: last 10 versions retained; admin can roll back to any revision (`qdb_cms_revision`) |

---

### 3.9 Arabic RTL Support

| ID | Requirement |
|----|-------------|
| RTL-001 | Portal shell fully mirrors in RTL: sidebar moves to right, header items reverse, directional icons flip |
| RTL-002 | Language toggle (EN / AR) in user avatar dropdown and on the login page |
| RTL-003 | Language preference persisted in user profile |
| RTL-004 | All UI labels, navigation items, and button text have Arabic translation keys in an i18n JSON file |
| RTL-005 | CMS content has separate AR title and AR body fields (CMS-010) |
| RTL-006 | DFE form labels and option values already support Arabic strings via `qdb_label` attribute |
| RTL-007 | Number and date formatting follows `ar-QA` locale in AR mode |
| RTL-008 | Mobile: RTL layout via React Native's `I18nManager.forceRTL` |

---

### 3.10 Mobile App — React Native + Expo

| ID | Requirement |
|----|-------------|
| MOB-001 | Platforms: iOS 15+ and Android 11+ |
| MOB-002 | Technology: React Native + Expo SDK (managed workflow) |
| MOB-003 | Shared backend API with the web portal — same endpoints, same auth tokens |
| MOB-004 | Navigation: bottom tab bar (Dashboard, My Requests, Services, Messages) + drawer for secondary items |
| MOB-005 | Auth: same three adapter options as web; biometric login via `expo-local-authentication` |
| MOB-006 | SSO: Microsoft and Google via `expo-auth-session` |
| MOB-007 | Push notifications: Firebase (Android) + APNs (iOS) via `expo-notifications` |
| MOB-008 | DFE forms rendered natively — all field types supported (text, dropdown, date, boolean, file upload) |
| MOB-009 | Offline draft support: form drafts saved to device via `expo-secure-store`; auto-sync on reconnect |
| MOB-010 | File upload: camera capture + gallery + document picker via `expo-image-picker` and `expo-document-picker` |
| MOB-011 | Deep links: push notification taps open the relevant screen (request detail, message, service detail) |
| MOB-012 | App branding loaded from `qdb_portal_config` (logo, primary color) at runtime |
| MOB-013 | My Requests: list and detail view with status timeline |
| MOB-014 | Services: listing, detail, and Apply Now (embedded DFE form) |
| MOB-015 | Messages: in-app messaging thread view |
| MOB-016 | News/Blog: read CMS content articles |
| MOB-017 | Arabic RTL: full mirroring via `I18nManager.forceRTL` |
| MOB-018 | OTA updates: Expo EAS Update for hotfixes without App Store re-submission |
| MOB-019 | App distribution: Expo EAS Build → App Store and Google Play |

---

## 4. Data Model — New Entities Required

| Entity | Purpose |
|--------|---------|
| `qdb_portal_config` | One record per portal instance — all branding and layout config |
| `qdb_portal_nav_item` | Navigation menu items (self-referential parent for sub-items) |
| `qdb_portal_notification` | Custom notification records per user |
| `qdb_portal_widget_config` | Widget assignments and per-instance config for each dashboard |
| `qdb_cms_content` | Blog posts, news articles, announcements, static pages |
| `qdb_cms_revision` | Content revision history (up to 10 per content item) |

---

## 5. Page Inventory — Web

| Page | Route | Auth Required |
|------|--------|--------------|
| Login | `/login` | No |
| Register | `/register` | No |
| Forgot Password | `/forgot-password` | No |
| Dashboard | `/` | Yes |
| Services | `/services` | Yes |
| Service Detail | `/services/:code` | Yes |
| My Requests | `/my-requests` | Yes |
| Request Detail | `/my-requests/:id` | Yes |
| Form — Apply | `/forms/:formCode` | Yes |
| Profile | `/profile` | Yes |
| Notifications | `/notifications` | Yes |
| News / Blog | `/news` | No |
| Article Detail | `/news/:slug` | No |
| Static Page | `/:slug` | Configurable |
| Admin — Portal Config | `/admin/portal` | Admin |
| Admin — CMS Editor | `/admin/cms` | Admin |
| Admin — Nav Builder | `/admin/nav` | Admin |
| Admin — Widget Config | `/admin/dashboard` | Admin |

---

## 6. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-001 | First Contentful Paint < 1.5s; Time to Interactive < 3s on broadband |
| NFR-002 | Responsive: 1280px+ desktop, 768px tablet, 375px mobile |
| NFR-003 | Arabic RTL — full layout mirror with no visual breakage |
| NFR-004 | WCAG 2.1 AA — screen reader compatible, fully keyboard navigable |
| NFR-005 | Portal config cached at CDN with 5-minute TTL; nav items cached per session |
| NFR-006 | All auth over HTTPS; no tokens in URL params or `localStorage` |
| NFR-007 | Mobile initial bundle < 25 MB |
| NFR-008 | API p95 response time < 500ms; form submission < 2s |
| NFR-009 | 99.5% uptime SLA for portal shell |

---

## 7. Out of Scope

- Payment processing
- Real-time notifications via Service Bus / SignalR (deferred to v2 — v1 uses polling)
- Multi-tenant cross-org switching (per OQ-3 decision)
- Native desktop app

---

*BRD authored by BA Agent — DFE-PORT-001 — 2026-06-16*
