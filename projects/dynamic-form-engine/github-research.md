# GitHub Research Report
## Dynamic Form Engine Portal — Dependency Evaluation
**Agent:** GitHub Researcher
**Date:** 2026-05-08
**Knowledge cutoff:** August 2025

---

## Research Objective

Evaluate open-source libraries for each major component of the Dynamic Form Engine Portal. Adopt battle-tested libraries (≥1,000 stars, MIT/Apache-2.0, active maintenance) over custom builds where possible.

---

## 1. Dynamic Form / Form Builder (React + JSON-driven)

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| rjsf-team/react-jsonschema-form | 14,000+ | Apache-2.0 | Active | EVALUATE — JSON Schema driven, good TS support, but opinionated schema ties to JSON Schema spec not custom Dataverse metadata contract |
| formio/react-formio | 2,100+ | MIT | Active | REJECT — Requires Form.io server; proprietary backend coupling; not Dataverse-compatible |
| surveyjs/survey-library | 4,200+ | MIT (core) | Active | REJECT — Commercial license for advanced features; not suitable for banking |
| @bpmn-io/form-js | 1,200+ | MIT | Active | REJECT — BPMN-specific form renderer; not general-purpose enough |
| eclipsesource/jsonforms | 2,800+ | MIT | Active | EVALUATE — Material UI + JSON Schema; strong TypeScript; but requires JSON Schema not custom metadata |

**Verdict: BUILD custom `DynamicFormRenderer`** — None of the above libraries support a custom Dataverse-table-driven metadata contract out of the box. react-jsonschema-form could be adapted but the impedance mismatch with 12-table Dataverse metadata is too high. The metadata contract is the core IP of this system. Build a custom renderer on top of React Hook Form + Fluent UI. Use `react-jsonschema-form` as a reference implementation only.

---

## 2. Rule Engine (JSON-based, client + server)

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| CacheControl/json-rules-engine | 3,200+ | ISC | Active | **ADOPT** — Lightweight, JSON-defined rules, event-driven, runs in browser AND Node.js, strong TypeScript types |
| nools/nools | 1,100+ | MIT | Stale (2019) | REJECT — Unmaintained |
| rools/rools | 650 | MIT | Moderate | REJECT — Below star threshold |

**Verdict: ADOPT `json-rules-engine`** — 3,200+ stars, ISC (permissive), runs on both client and server, JSON rule format aligns directly with the `qdb_form_business_rule` table contract. Wrap in a `RuleEngine` service class for abstraction.

---

## 3. Form State Management

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| react-hook-form/react-hook-form | 41,000+ | MIT | Active | **ADOPT** — Constitutional default; uncontrolled, performant, TypeScript-native |
| jquense/yup | 22,000+ | MIT | Active | EVALUATE — Good but Zod preferred per constitution |
| colinhacks/zod | 34,000+ | MIT | Active | **ADOPT** — Constitutional default; schema-first, TypeScript-first, runtime validation |

**Verdict: ADOPT react-hook-form + Zod.** Yup not needed alongside Zod.

---

## 4. UI Component Library

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| microsoft/fluentui | 18,000+ | MIT | Active | **ADOPT** — @fluentui/react-components v9 (Fluent 2); native Microsoft design system; matches Dynamics CRM chrome; TypeScript-first |
| mui/material-ui | 92,000+ | MIT | Active | EVALUATE — Excellent but non-Microsoft visual language; less appropriate for CRM-adjacent portal |

**Verdict: ADOPT `@fluentui/react-components` v9** — The portal will sit next to Dynamics CRM; Fluent 2 design language gives visual consistency. 18,000+ stars, MIT, Microsoft-maintained.

---

## 5. Dataverse / CRM API Client

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| AlbanianXhosa/dataverse-ify | 450 | MIT | Moderate | REJECT — Below star threshold; niche adoption |
| delegateas/xrm-webapi | 380 | MIT | Stale | REJECT — Below threshold; stale |
| @microsoft/kiota-* | N/A | MIT | Active | EVALUATE — Microsoft Graph SDK generator; heavy for simple OData calls |
| Native `fetch` + OData | Built-in | N/A | N/A | **ADOPT** — Dataverse Web API is OData v4; native fetch with typed request builders is sufficient and zero-dependency |

**Verdict: BUILD with native fetch + OData** — Same decision as the Customer Loan Portal. Write a thin `CrmDataService` wrapping typed fetch calls to `https://<org>.crm4.dynamics.com/api/data/v9.2/`. No third-party CRM SDK required.

---

## 6. Authentication (Azure AD / Entra ID)

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| AzureAD/microsoft-authentication-library-for-js | 3,800+ | MIT | Active | **ADOPT** — `@azure/msal-browser` + `@azure/msal-react`; official Microsoft library |
| nextauthjs/next-auth | 25,000+ | ISC | Active | REJECT — This project uses React + Express, not Next.js; MSAL direct is cleaner |

**Verdict: ADOPT `@azure/msal-browser` + `@azure/msal-react`** — Official library, MIT, active, handles Entra ID / Azure AD B2C PKCE flows.

---

## 7. File Upload Component

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| react-dropzone/react-dropzone | 11,000+ | MIT | Active | **ADOPT** — Constitutional default; drag-and-drop, file type/size validation |
| @azure/storage-blob | N/A | MIT | Active | **ADOPT** — Official Azure SDK for Blob Storage upload; use alongside react-dropzone |

**Verdict: ADOPT react-dropzone (UI) + @azure/storage-blob (upload transport).**

---

## 8. Rich Text Editor

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| ueberdosis/tiptap | 28,000+ | MIT | Active | **ADOPT** — `@tiptap/react`; modular, TypeScript-native, React 18 compatible, extensible |
| zenoamaro/react-quill | 6,500+ | MIT | Low activity | REJECT — React-Quill uses legacy Quill v1; poor React 18 compatibility |
| facebook/draft-js | 22,000+ | MIT | Archived 2022 | REJECT — Archived, unmaintained |

**Verdict: ADOPT `@tiptap/react`** — 28,000+ stars, MIT, React 18 + TypeScript native, actively maintained.

---

## 9. Data Grid (Repeating Child Rows)

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| TanStack/table | 24,000+ | MIT | Active | **ADOPT** — `@tanstack/react-table` v8; headless, TypeScript-first, composable with Fluent UI cells |
| ag-grid/ag-grid | 12,000+ | MIT (community) | Active | EVALUATE — Powerful but MIT only for community; enterprise license required for full features |
| mui-x DataGrid | N/A | MIT (community) | Active | REJECT — MUI design language conflicts with Fluent UI choice |

**Verdict: ADOPT `@tanstack/react-table` v8** — Headless design pairs perfectly with Fluent UI cell rendering for the `RepeatingGridControl`.

---

## 10. Backend Framework

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| expressjs/express | 64,000+ | MIT | Active | **ADOPT** — Constitutional default for Node.js REST APIs |
| fastify/fastify | 32,000+ | MIT | Active | EVALUATE — Faster than Express; also constitutional default |

**Verdict: ADOPT Express** — User specification explicitly states "Node.js / Express OR .NET Web API". Express is simpler for a metadata-serving API; Fastify is also acceptable. Using Express to match the spec exactly. TypeScript via `@types/express`.

---

## 11. Logging

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| pinojs/pino | 13,000+ | MIT | Active | **ADOPT** — Constitutional default; structured JSON logging |

---

## 12. Validation (Backend)

| Repo | Stars | License | Last Active | Verdict |
|------|-------|---------|-------------|---------|
| colinhacks/zod | 34,000+ | MIT | Active | **ADOPT** — Shared schema between frontend and backend via `shared/` package |

---

## Adoption Register

| Library | Version | Surface | Use Case | License |
|---------|---------|---------|----------|---------|
| react-hook-form | 7.x | Frontend | Form state management | MIT |
| zod | 3.x | Frontend + Backend | Schema validation (shared) | MIT |
| @fluentui/react-components | 9.x | Frontend | UI component library | MIT |
| react-dropzone | 14.x | Frontend | File upload UI widget | MIT |
| @tiptap/react | 2.x | Frontend | Rich text editor field | MIT |
| @tanstack/react-table | 8.x | Frontend | Repeating grid / editable rows | MIT |
| @azure/msal-browser | 3.x | Frontend | Azure AD / Entra ID auth (PKCE) | MIT |
| @azure/msal-react | 2.x | Frontend | MSAL React hooks | MIT |
| json-rules-engine | 6.x | Frontend + Backend | Configurable business rule execution | ISC |
| axios | 1.x | Frontend | HTTP client to backend API | MIT |
| express | 4.x | Backend | REST API server | MIT |
| pino | 9.x | Backend | Structured logging | MIT |
| @azure/storage-blob | 12.x | Backend | Azure Blob Storage document upload | MIT |
| native fetch + OData | built-in | Backend | Dataverse Web API calls (no SDK) | N/A |

**Not adopted:**
- `react-jsonschema-form` — JSON Schema contract incompatible with custom 12-table metadata design
- `react-quill` / `draft-js` — unmaintained or archived
- `formio`, `surveyjs` — commercial/server coupling
- `dataverse-ify`, `xrm-webapi` — insufficient stars / stale

---

## Decision: BUILD with adopted libraries

The Dynamic Form Engine core (renderer, rule evaluation, metadata binding) is custom-built IP. All supporting infrastructure (form state, UI, auth, file upload, rich text, data grid, rule execution, logging) uses battle-tested open-source libraries from the adoption register above.

*GitHub Research v1.0 — Dynamic Form Engine Portal*
