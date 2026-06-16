# DFE-PORT-001 — Dependency Research
Date: 2026-06-16
Researcher: GitHub Research Agent — Maqsad AI
Stack: Next.js 14 + TypeScript + Tailwind CSS (web) | Fastify + Node.js (backend) | React Native + Expo (mobile) | Dataverse/OData (data store) | Fluent UI v9 (existing)

---

## Decision Summary

| Area | Library | Stars | npm Package | Decision | Rationale |
|------|---------|-------|-------------|----------|-----------|
| Auth — adapter | Auth.js (next-auth v5) | 25k+ | `next-auth` | ADOPT | Framework-native, built-in Azure AD B2C + Microsoft Entra ID + Google providers, ~2.5–4.2M weekly downloads, MIT |
| Auth — MSAL | @azure/msal-browser | 4.3k (monorepo: 4.3k) | `@azure/msal-browser` | ADOPT (companion) | Required for enterprise MSAL token flows; MIT; official Microsoft library; use alongside Auth.js |
| Rich Text Editor | Tiptap | 37k | `@tiptap/react` | ADOPT | 37k stars, MIT, headless, RTL supported via extension, 8M weekly downloads for @tiptap/react, extensible |
| i18n / RTL | next-intl | 4.3k | `next-intl` | ADOPT | App Router-native, SSR + Server Components support, MIT, clean API; pair with Tailwind v4 logical properties for RTL layout |
| i18n core | i18next + react-i18next | 9.8k / 9.8k | `i18next` + `react-i18next` | EVALUATE | 14.6M / 6.7M weekly downloads, battle-tested, but next-intl is App Router-first — prefer next-intl unless translation pipeline requires i18next ecosystem tools |
| Dashboard / Widgets | react-grid-layout | 22k | `react-grid-layout` | ADOPT | 22k stars, TypeScript rewrite (v2), MIT, actively maintained (v2.2.3, 2026), 2.3M weekly downloads |
| Portal Shell | Refine | 33k | `@refinedev/core` | ADAPT | 33k stars, MIT, data-provider pattern fits Dataverse OData perfectly; no Fluent UI v9 adapter (build thin wrapper) |
| Portal Shell — charts | Tremor | — | `@tremor/react` | ADOPT | Apache 2.0, 35+ analytics components, Tailwind + Recharts, 277k weekly downloads; for KPI/chart widgets |
| Mobile — auth | expo-auth-session | Part of expo/expo (48k) | `expo-auth-session` | ADOPT | Official Expo package; OAuth/OIDC browser flow; SDK 53 compatible; pairs with @azure/msal-browser for Entra |
| Mobile — biometric | expo-local-authentication | Part of expo/expo (48k) | `expo-local-authentication` | ADOPT | Face ID / Touch ID / Biometric Prompt; SDK 53 compatible; official |
| Mobile — push notifications | expo-notifications | Part of expo/expo (48k) | `expo-notifications` | ADOPT | SDK 53 requires dev build (not Expo Go); official; well-documented |
| Mobile — token store | expo-secure-store | Part of expo/expo (48k) | `expo-secure-store` | ADOPT | Encrypted key-value store; official; SDK 53 compatible |
| Mobile — file pick | expo-document-picker + expo-image-picker | Part of expo/expo (48k) | `expo-document-picker`, `expo-image-picker` | ADOPT | Official; SDK 53 compatible |
| Mobile — navigation | expo-router (tabs) | Part of expo/expo (48k) | `expo-router` | ADOPT | File-based routing; App Router analogy for mobile; default recommendation for Expo apps in 2026; built on react-navigation v7 |
| Mobile — OTA | expo-updates | Part of expo/expo (48k) | `expo-updates` | ADOPT | Official OTA delivery; SDK 53 compatible |
| Notification polling | TanStack Query | 50k | `@tanstack/react-query` | ADOPT | 50k stars, MIT, 49.7k stars, polling via refetchInterval, cache invalidation, Next.js SSR-safe |
| Notification polling (alt) | SWR | 32k | `swr` | EVALUATE | 32k stars, MIT, Vercel-native, simpler than TanStack; use if project avoids TanStack dependency |
| Real-time (future) | Socket.io client | 63k | `socket.io-client` | ADOPT (future) | 63k stars, MIT, 6.7M weekly downloads; defer until real-time requirement is confirmed |
| File upload — UI | react-dropzone | 11k | `react-dropzone` | ADOPT | 11k stars, MIT, 9.6M weekly downloads, headless drag-drop hooks, pair with Azure SDK for Blob upload |
| File upload — managed | uploadthing | 5k | `uploadthing` | SKIP | 5k stars, MIT, but requires hosted uploadthing service — not compatible with on-premise Dataverse file columns or Azure Blob direct upload strategy |

---

## 1. Auth & SSO

### 1.1 Auth.js (next-auth v5)

- URL: https://github.com/nextauthjs/next-auth
- Stars: ~25,000
- Last commit: Active — releases tracked through May 2026; v5 (Auth.js) is stable
- License: MIT
- npm package: `next-auth` (v4.24.14 stable; v5 beta track as `next-auth@beta`)
- Weekly downloads: ~2.5–4.2M (range across measurement sources)
- Verdict: ADOPT

Auth.js is the de-facto standard for Next.js authentication. Version 5 rebrands to Auth.js and aligns with the App Router model using Server Actions and edge-compatible JWT handling. It ships built-in providers for:
- Azure AD B2C (provider: `azure-ad-b2c`) — documented with custom user flow configuration
- Microsoft Entra ID (formerly Azure AD) (provider: `microsoft-entra-id`) — first-class, actively updated
- Google OAuth 2.0 — built-in
- Generic OIDC — any provider via `OIDCConfig`

Auth.js handles HttpOnly cookie-based session storage natively in v5. The `credentials` provider pattern supports custom JWT generation for Dataverse service principal flows. No cloud dependency — works fully self-hosted with a database adapter (Prisma adapter exists).

Note from search results: Some sources suggest Auth.js is converging with the better-auth ecosystem. The nextauthjs/next-auth repo remains the canonical package; do not migrate to better-auth without a deliberate ADR.

Integration approach:
- Install `next-auth@beta` for App Router compatibility
- Configure `azure-ad-b2c` or `microsoft-entra-id` provider
- Use `@auth/prisma-adapter` if session persistence in PostgreSQL is needed
- Wrap with `SessionProvider` for client components

### 1.2 @azure/msal-browser (MSAL.js)

- URL: https://github.com/AzureAD/microsoft-authentication-library-for-js
- Stars: ~4,300 (monorepo)
- Last commit: Active (monthly releases as of 2026)
- License: MIT
- npm packages: `@azure/msal-browser`, `@azure/msal-node`
- Verdict: ADOPT as companion

MSAL is the official Microsoft Authentication Library. It handles Azure AD B2C user flows, Entra External ID (formerly External Identities), and token acquisition with refresh. When Auth.js wraps MSAL, the integration is cleaner; alternatively, use MSAL directly for scenarios that require silent token acquisition for Dataverse OData calls (on-behalf-of flow, access token injection into OData headers).

Use case in DFE Portal: The Dataverse OData API requires a Bearer token from Entra. MSAL's `acquireTokenSilent()` is required for this. Auth.js alone does not manage Dataverse resource tokens — pair both.

### 1.3 better-auth

- URL: https://github.com/better-auth/better-auth
- Stars: ~28,700
- Last commit: Active (rapid growth library, v1 released ~2025)
- License: MIT
- Weekly downloads: ~350k/month
- Verdict: SKIP for this engagement

better-auth is a newer comprehensive auth framework that is gaining significant traction. However, it is still early compared to Auth.js v5 for enterprise Microsoft identity scenarios. The Microsoft Entra / Azure AD B2C provider ecosystem in better-auth is not as battle-tested as Auth.js. Revisit in 12 months.

### 1.4 Summary — Auth Decision

- Primary: Auth.js (next-auth v5) — ADOPT
- Companion: @azure/msal-browser — ADOPT (for Dataverse OData token acquisition)
- Skip: better-auth, raw MSAL-only approaches

---

## 2. Rich Text Editor

### Comparison Table

| Library | Stars | License | Maintainer | RTL | React | Headless | Bundle | Status |
|---------|-------|---------|------------|-----|-------|----------|--------|--------|
| Tiptap (ueberdosis/tiptap) | 37k | MIT | ueberdosis GmbH | Yes (extension) | First-class | Yes | ~100kb core | Active |
| Lexical (facebook/lexical) | 23.5k | MIT | Meta / Facebook | Partial (issue #2610 open) | @lexical/react | Yes | ~50kb core | Active |
| Quill (slab/quill) | 47k | BSD-3 | Slab | Limited (v2 no native RTL) | react-quill wrapper | No (opinionated UI) | ~200kb | Slow-moving |
| Slate (ianstormtaylor/slate) | 31.7k | MIT | Community | None built-in | Yes | Yes | ~100kb | Beta (ongoing) |

### Detailed Findings

#### Tiptap — ueberdosis/tiptap
- URL: https://github.com/ueberdosis/tiptap
- Stars: 37,100
- Last commit: Active (weekly; v3 actively developed as of 2026)
- License: MIT (core and extensions; Tiptap Cloud is commercial)
- npm: `@tiptap/react` — 8M weekly downloads; `@tiptap/core` — 11.6M weekly downloads
- RTL: Supported via `setTextDirection` command and the `tiptap-text-direction` community extension. Official docs include RTL/LTR examples.
- React: First-class (`@tiptap/react` package with `useEditor` hook)
- Fluent UI integration: Headless — no UI coupling, works with any design system including Fluent UI v9
- Extensions: 50+ official extensions (tables, images, mentions, code blocks, collaboration via Yjs)
- Verdict: ADOPT

#### Lexical — facebook/lexical
- URL: https://github.com/facebook/lexical
- Stars: 23,525
- Last commit: Active
- License: MIT
- npm: `@lexical/react` — 156k weekly downloads; `lexical` core — 3.6M weekly downloads
- RTL: GitHub issue #2610 ("Full bidirectional RTL support") remains open — basic DOM reconciler handles LTR/RTL but full bidirectional support is not complete
- React: `@lexical/react` package available
- Verdict: EVALUATE (strong candidate but RTL gap is a blocker given DFE's Arabic/RTL requirement)

#### Quill — slab/quill
- URL: https://github.com/slab/quill
- Stars: 47,000
- Last commit: v2.0.3 released November 2024 — slow release cadence
- License: BSD-3-Clause
- RTL: Limited. Not natively supported in v2; requires hacks
- Verdict: SKIP — BSD-3 is acceptable, but slow maintenance and RTL limitation disqualify

#### Slate — ianstormtaylor/slate
- URL: https://github.com/ianstormtaylor/slate
- Stars: 31,700
- Last commit: Active (issues as recent as May 2026)
- License: MIT
- RTL: No built-in RTL support; community must implement
- Status: Still in beta after years; breaking changes ongoing
- Verdict: SKIP — perpetual beta is a risk for enterprise portal; no RTL

### Recommendation — Rich Text Editor: ADOPT Tiptap

Tiptap wins on all criteria: highest star count in the headless category (37k), MIT license, React-first, RTL supported out of the box via extension, headless architecture compatible with Fluent UI v9, extensible plugin system, and largest download volume. The paid Tiptap Cloud is optional — the open-source core is sufficient for DFE requirements.

- Recommended repo: https://github.com/ueberdosis/tiptap
- npm: `@tiptap/react`, `@tiptap/starter-kit`
- RTL: install `tiptap-text-direction` (https://github.com/amirhhashemi/tiptap-text-direction)
- License risk: None — MIT core
- Next step: Architect to define Tiptap extension set (starter-kit + text-direction + image + table at minimum)

---

## 3. Internationalization / RTL

### 3.1 next-intl

- URL: https://github.com/amannn/next-intl
- Stars: 4,300
- Last commit: Active (releases tracked through 2026)
- License: MIT
- npm: `next-intl`
- App Router support: First-class — designed from ground up for App Router + Server Components + static rendering
- RTL: Provides locale-based `dir` attribute management; pairs with Tailwind v4 logical properties for layout flip
- Verdict: ADOPT (primary)

next-intl is the only i18n library architecturally designed for Next.js App Router from the start. It supports Server Components without hydration overhead, locale-in-path routing, and middleware-based locale detection. For the DFE Portal with Arabic RTL support, this is the correct choice.

### 3.2 i18next + react-i18next

- URL: https://github.com/i18next/react-i18next
- Stars (react-i18next): ~9,800
- Stars (i18next core): ~8,500
- License: MIT
- npm: `i18next` — 14.6M weekly downloads; `react-i18next` — 6.7M weekly downloads
- App Router support: Requires configuration (`next-app-dir-i18next-example` shows how); not as clean as next-intl
- RTL: No built-in RTL; locale must drive `dir` attribute manually
- Verdict: EVALUATE (adopt if translation management pipeline already uses i18next ecosystem — e.g., i18next-locize or i18next-parser; otherwise prefer next-intl)

### 3.3 FormatJS / react-intl

- URL: https://github.com/formatjs/formatjs
- Stars: 14,000
- Last commit: Active (v10.1.13 published June 2026)
- License: MIT
- npm: `react-intl` — 3.4M weekly downloads
- App Router support: Requires wrapper; not as App Router-native as next-intl
- Verdict: SKIP for this engagement — no advantage over next-intl; more boilerplate

### 3.4 Tailwind CSS v4 Logical Properties for RTL

- Tailwind v4 (current) ships CSS logical property utilities natively: `ms-*`, `me-*`, `ps-*`, `pe-*` (margin-inline-start/end, padding-inline-start/end)
- Setting `dir="rtl"` on the `<html>` element causes logical property utilities to automatically mirror spacing
- No additional plugin required for basic RTL layout flip in Tailwind v4
- For older Tailwind: `tailwindcss-vanilla-rtl` plugin (https://github.com/thibaudcolas/tailwindcss-vanilla-rtl) maps logical properties
- Verdict: ADOPT Tailwind v4 logical properties natively; no plugin needed

### RTL Implementation Strategy

1. next-intl middleware detects locale from URL path (`/ar/...`, `/en/...`)
2. Root layout sets `<html lang={locale} dir={dir}>` based on locale map
3. Tailwind v4 logical properties (`ms-*`, `me-*`, `start-*`, `end-*`) handle spacing and positioning
4. Tiptap's `setTextDirection` handles content-level RTL in rich text fields
5. Fluent UI v9 has built-in RTL support — no additional configuration needed

---

## 4. Dashboard / Widget System

### 4.1 react-grid-layout

- URL: https://github.com/react-grid-layout/react-grid-layout
- Stars: 22,308
- Last commit: Active (v2.2.3, 2026 — at least one release in past 3 months)
- License: MIT
- npm: `react-grid-layout` — 2.3M weekly downloads
- TypeScript: v2 is a full TypeScript rewrite; first-party types, no `@types/` package needed
- Features: Draggable, resizable grid with responsive breakpoints; `GridLayout` and `ResponsiveGridLayout` components; serializable layout state (JSON)
- React compatibility: React 18/19 compatible
- Verdict: ADOPT

react-grid-layout is the dominant library for dashboard widget grids in React. The v2 TypeScript rewrite removes the maintenance concern that existed with v1. The layout state is a plain JSON array — compatible with storing widget configurations in Dataverse custom entities.

### 4.2 gridstack.js

- URL: https://github.com/gridstack/gridstack.js
- Stars: ~4,400 (at last indexed count; likely higher in 2026)
- Last commit: Active
- License: MIT
- TypeScript: Pure TypeScript, no external dependencies
- React: React wrapper included (`gridstack-react`)
- Verdict: EVALUATE (viable alternative; choose react-grid-layout over gridstack unless CSS Grid-native layout is specifically required — gridstack targets CSS Grid while react-grid-layout uses absolute positioning)

### 4.3 Fluent UI Dashboard Templates

No battle-tested Fluent UI v9 dashboard starter found on GitHub with 1000+ stars. The microsoft/fluentui repo (20k stars, MIT) provides the component library itself but not a pre-built portal shell. Conclusion: no adoptable Fluent UI dashboard template exists — the shell must be built using Fluent UI v9 components plus react-grid-layout for the widget grid.

### 4.4 Tremor (for chart/analytics widgets)

- URL: https://github.com/tremorlabs/tremor
- Stars: Not confirmed above 5k but widely referenced
- License: Apache 2.0
- npm: `@tremor/react` — 277k weekly downloads
- Purpose: Pre-built analytics components (KPI cards, line/bar/area charts, data tables)
- Tailwind: Built on Tailwind CSS + Recharts
- Fluent UI compatibility: Tremor uses its own Tailwind-based styles; in a Fluent UI v9 project, treat Tremor as chart-only and style isolation is required. Adopt only for the chart/widget content area, not for shell chrome.
- Verdict: ADOPT (for analytics chart widgets within the grid; scope carefully to chart content only)

---

## 5. Portal Shell / Admin Panel Templates

### 5.1 Refine

- URL: https://github.com/refinedev/refine
- Stars: 33,311
- Last commit: Active (Next.js 15 support added)
- License: MIT
- npm: `@refinedev/core`
- Next.js App Router: Supported via `@refinedev/nextjs-router`
- UI framework: Ant Design, Material UI, Mantine, Chakra UI adapters exist; NO Fluent UI v9 adapter
- Data provider: OData data provider exists (`@refinedev/odata`), directly compatible with Dataverse OData v4
- Verdict: ADAPT

Refine's `@refinedev/odata` data provider is a significant asset — it maps CRUD operations to OData v4 queries out of the box, which directly targets the Dataverse OData API. The architecture (data providers, access control, notification providers, i18n provider) fits the DFE portal requirements. The gap is Fluent UI v9: no official adapter exists, but Refine's headless mode allows mounting any UI component. Build a thin Fluent UI v9 shell around Refine's headless core.

Integration approach:
- Use Refine in headless mode (`@refinedev/core` without a UI adapter)
- Wire `@refinedev/odata` to Dataverse endpoint with Bearer token injected from MSAL
- Build Fluent UI v9 layout components (nav, sidebar, command bar) as the shell
- react-grid-layout for widget positioning within Refine pages

### 5.2 Tremor Admin Templates

Tremor is referenced in 2026 admin template roundups. Works well as a chart/analytics layer inside the shell but is not a full portal framework. Scope narrowly to analytics widgets.

### 5.3 shadcn/ui admin examples

- shadcn Admin (community): 11,100 stars, updated to Next.js 16 / React 19 / Tailwind v4
- Architecture: Copy-paste components, no runtime library coupling
- Fluent UI compatibility: shadcn/ui and Fluent UI v9 class systems clash (Radix + CVA vs Griffel/tokens); not safe to mix in the same DOM tree
- Verdict: SKIP for DFE portal (existing Fluent UI v9 investment makes shadcn/ui integration high-risk)

### 5.4 AdminJS

- URL: https://github.com/SoftwareBrothers/adminjs
- Stars: 8,600
- License: MIT (restrictive note in some versions — verify LICENSE.md)
- Fastify: Official `@adminjs/fastify` plugin exists
- Verdict: SKIP — AdminJS auto-generates CRUD UI from database models; not suitable for white-label configurable portal shell; design model conflicts with DFE's form-engine-driven approach

---

## 6. React Native / Expo Mobile Libraries

All libraries below are part of the main expo/expo monorepo (47,800+ stars, MIT) unless noted separately. SDK version noted is the current stable as of 2026-06-16.

### 6.1 expo-auth-session (OAuth / OIDC browser flow)

- npm: `expo-auth-session`
- SDK: Part of expo/expo; compatible through SDK 53+
- Purpose: OAuth 2.0 / OIDC auth code flow using the device's browser; required for Azure AD B2C and Entra External ID on mobile
- Pairing: Use alongside `@azure/msal-browser` (via React Native compatible wrapper) or use expo-auth-session's built-in discovery document support pointing at Entra B2C user flow endpoints
- Verdict: ADOPT

### 6.2 expo-local-authentication (Biometric)

- npm: `expo-local-authentication` — v15.0.14 (published within hours of research date)
- SDK: SDK 53+ compatible
- Purpose: Face ID, Touch ID (iOS), Biometric Prompt (Android)
- Verdict: ADOPT

### 6.3 expo-notifications (Push Notifications)

- npm: `expo-notifications`
- SDK: SDK 53+ compatible; IMPORTANT — push notifications are unavailable in Expo Go on Android from SDK 53+. A development build (EAS Build or local prebuild) is required.
- Purpose: Local and push notifications, FCM/APNs token management
- Verdict: ADOPT — but Architect must note the dev build requirement in the mobile ADR

### 6.4 expo-secure-store (Token Storage)

- npm: `expo-secure-store`
- SDK: SDK 53+ compatible
- Purpose: Encrypted key-value storage backed by Keychain (iOS) and Keystore (Android); use for storing MSAL refresh tokens and session tokens
- Verdict: ADOPT

### 6.5 expo-image-picker + expo-document-picker

- npm: `expo-image-picker`, `expo-document-picker`
- SDK: SDK 53+ compatible
- Purpose: Media gallery access and file system document picking for file upload flows
- Verdict: ADOPT

### 6.6 Navigation — expo-router tabs vs @react-navigation/bottom-tabs

In 2026, the community consensus is clear:
- expo-router (file-based, built on react-navigation v7 internally) is the default recommendation for new Expo apps
- react-navigation v7 (25k+ stars) remains the foundation; react-navigation 8 (alpha in early 2026) brings native bottom tabs as default
- For DFE mobile: Use expo-router with `(tabs)` layout; this mirrors the Next.js App Router mental model already in use on the web track

- Verdict: ADOPT expo-router tabs (built on react-navigation v7)

### 6.7 expo-updates (OTA)

- npm: `expo-updates`
- SDK: SDK 53+ compatible; SDK 54+ required for some newer OTA server features
- Purpose: Over-the-air JavaScript bundle updates without app store submission
- Note: For self-hosted OTA, `expo-open-ota` (GitHub: axelmarciano/expo-open-ota) provides an open-source self-hosted updates server implementing the Expo Updates protocol
- Verdict: ADOPT; evaluate expo-open-ota if on-premise OTA hosting is required

---

## 7. Notification Delivery

### 7.1 TanStack Query (primary recommendation)

- URL: https://github.com/TanStack/query
- Stars: 49,700
- Last commit: Active (release 2026-05-08 confirmed)
- License: MIT
- npm: `@tanstack/react-query`
- Next.js: SSR-safe with `HydrationBoundary`; works in App Router via `ReactQueryStreamedHydration` or server prefetch patterns
- TypeScript: Full first-party TypeScript support
- Polling: `refetchInterval` on any query; supports exponential backoff via `refetchIntervalInBackground`
- Cache invalidation: `queryClient.invalidateQueries()` for targeted invalidation
- Verdict: ADOPT

TanStack Query is the standard for server-state management in React. At 50k stars it is more battle-tested than SWR. For DFE portal notifications, polling a Dataverse notification endpoint with `refetchInterval: 30000` is the correct first implementation. The cache-first model means notification banners update smoothly without layout flash.

### 7.2 SWR

- URL: https://github.com/vercel/swr
- Stars: 32,400
- Last commit: Active
- License: MIT
- npm: `swr`
- Features: `refreshInterval` for polling; `revalidateOnFocus`, `revalidateOnReconnect`
- Next.js: Vercel-maintained; excellent Next.js integration
- Verdict: EVALUATE (viable alternative; simpler API than TanStack Query; choose if project wants a lighter dependency and does not need TanStack Query's mutation/optimistic update features)

Decision guide: If DFE Portal also manages form submissions and mutations (likely), TanStack Query's mutation primitives are worth the extra setup cost. Use TanStack Query.

### 7.3 Socket.io (future real-time upgrade path)

- URL: https://github.com/socketio/socket.io
- Stars: 62,695
- Last commit: Active (v4.8.3)
- License: MIT
- npm: `socket.io-client` — 6.7M weekly downloads
- TypeScript: Supported
- Verdict: ADOPT when real-time requirement is confirmed. The polling-first approach with TanStack Query can be swapped for Socket.io room subscriptions without changing component contracts — just replace the `useQuery` hook with a `useSocket` hook behind the same interface.

---

## 8. File Upload

### 8.1 react-dropzone (primary recommendation)

- URL: https://github.com/react-dropzone/react-dropzone
- Stars: 10,981
- Last commit: Active (v15.0.0)
- License: MIT
- npm: `react-dropzone` — 9.6M weekly downloads
- TypeScript: Full TypeScript support
- Pattern: Headless hooks (`useDropzone`) — returns `getRootProps`, `getInputProps`, `acceptedFiles`; no UI coupling; compatible with Fluent UI v9 styling
- Azure Blob compatibility: react-dropzone returns `File` objects; pass directly to `@azure/storage-blob` `BlockBlobClient.uploadData()` or to a Dataverse file column API endpoint
- Verdict: ADOPT

react-dropzone is the correct base layer. It handles drag-drop UX and file validation (MIME type, size). The actual upload logic must be implemented using either:
1. `@azure/storage-blob` for Azure Blob Storage direct upload (with SAS token from backend)
2. Dataverse file column API (`/api/data/v9.2/entity(id)/filecolumn`) for Dataverse-stored files

### 8.2 uploadthing

- URL: https://github.com/pingdotgg/uploadthing
- Stars: 5,100
- Last commit: April 2026
- License: MIT
- npm: `uploadthing` — 118k downloads
- Assessment: uploadthing requires the hosted pingdotgg upload service. It is not compatible with Azure Blob direct upload or Dataverse file column storage. The service dependency is a blocking issue for an enterprise on-premise/cloud-first Dataverse deployment.
- Verdict: SKIP — service dependency incompatible with Dataverse file storage requirement

### 8.3 File Upload Architecture for DFE Portal

Adopt react-dropzone + custom upload service:

```
[react-dropzone] --> acceptedFiles: File[]
  --> [Backend Fastify route: POST /upload/sas-token]  (Dataverse or Azure Blob)
      --> [Azure SDK: BlockBlobClient.uploadData(file, { onProgress })]
      OR
      --> [Dataverse OData file column: PUT /entity(id)/filecolumn]
  --> [Progress callback --> TanStack Query mutation onSuccess]
```

This pattern gives full control over storage, avoids any third-party hosted service, and is compatible with Dataverse's native file attachment capabilities.

---

## Blocking Issues and Risks

| Issue | Severity | Detail |
|-------|----------|--------|
| Fluent UI v9 + Refine — no official adapter | Medium | Refine headless mode mitigates; team must build Fluent UI navigation shell; estimate 3–5 days |
| expo-notifications requires dev build (SDK 53+) | Medium | Expo Go cannot test push notifications; EAS Build or local prebuild required from day one; add to mobile ADR |
| Tiptap v3 breaking changes (issue #7529) | Low | `editor` nullable type change — guard with `editor?.` in all render paths; documented |
| Quill BSD-3 license | N/A | Quill was rejected; not an issue |
| next-auth v5 still has "beta" tag | Low | v5 is production-ready but tagged beta; pin exact version; monitor nextauthjs releases |
| uploadthing service dependency | N/A | Rejected; not an issue |

---

## Suggested Next Steps for Architect

1. Confirm Refine headless + Fluent UI v9 shell approach — architect to produce ADR-PORT-001 (Refine adoption with headless mode)
2. Confirm Auth.js v5 + MSAL pairing pattern — architect to produce ADR-PORT-002 (dual-library auth strategy)
3. Confirm next-intl as the i18n library — document Arabic (ar) and English (en) as initial locales
4. Confirm Tiptap as the RTE — note the `tiptap-text-direction` extension requirement for RTL content editing
5. Mobile ADR must note SDK 53 dev build requirement for push notifications
6. File upload architecture must be defined (Azure Blob SAS vs Dataverse file column) before backend implementation

---

## Reference Links

- Auth.js: https://github.com/nextauthjs/next-auth
- MSAL.js: https://github.com/AzureAD/microsoft-authentication-library-for-js
- Tiptap: https://github.com/ueberdosis/tiptap
- tiptap-text-direction: https://github.com/amirhhashemi/tiptap-text-direction
- Lexical: https://github.com/facebook/lexical
- Slate: https://github.com/ianstormtaylor/slate
- next-intl: https://github.com/amannn/next-intl
- react-i18next: https://github.com/i18next/react-i18next
- react-grid-layout: https://github.com/react-grid-layout/react-grid-layout
- gridstack.js: https://github.com/gridstack/gridstack.js
- Refine: https://github.com/refinedev/refine
- Tremor: https://github.com/tremorlabs/tremor
- microsoft/fluentui: https://github.com/microsoft/fluentui
- expo/expo: https://github.com/expo/expo
- TanStack Query: https://github.com/TanStack/query
- SWR: https://github.com/vercel/swr
- Socket.io: https://github.com/socketio/socket.io
- react-dropzone: https://github.com/react-dropzone/react-dropzone
- uploadthing: https://github.com/pingdotgg/uploadthing
- AdminJS: https://github.com/SoftwareBrothers/adminjs
- better-auth: https://github.com/better-auth/better-auth
