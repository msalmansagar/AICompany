# GitHub Research Report
## Customer Loan Portal & RM Workspace
**Agent:** GitHub Researcher
**Date:** 2026-05-06
**Version:** 1.1 — CRM-side research revised for Dynamics CRM on-premise (no Dataverse / PCF / Power Automate)

---

## Research Objective

Search for existing open-source repositories that could be adopted or adapted for any major component of this engagement, avoiding redundant build work per the Dependency Adoption principle.

---

## Components Researched

### 1. Loan Origination System (Full)

| Repo | Stars | License | Verdict |
|------|-------|---------|---------|
| apache/fineract | 1,200+ | Apache 2.0 | REJECT — Java-based, designed for microfinance, not commercial banking multi-facility model |
| openMF/ph-ee-engine | 800 | MPL 2.0 | REJECT — Payment hub, not LOS |
| open-banking-platform repos | Various | Various | REJECT — Open Banking API specs, not an LOS |

**Verdict: BUILD** — No open-source solution matches the multi-request bundle / merge-split / Dataverse-integrated pattern.

---

### 2. Multi-Step Form / Application Wizard (React / Next.js)

| Repo | Stars | License | Verdict |
|------|-------|---------|---------|
| react-hook-form/react-hook-form | 41,000+ | MIT | ADOPT — Best-in-class form state management; eliminates custom form logic |
| jquense/yup | 22,000+ | MIT | ADOPT — Schema validation, pairs perfectly with react-hook-form |
| shadcn/ui | 75,000+ | MIT | ADOPT — Tailwind-based component library; stepper, cards, dialogs all available |
| dndkit/dnd-kit | 13,000+ | MIT | EVALUATE — Drag-and-drop for document upload reorder; consider for Phase 2 |

**Verdict: ADOPT** react-hook-form + yup + shadcn/ui for portal UI.

---

### 3. Document Upload Component

| Repo | Stars | License | Verdict |
|------|-------|---------|---------|
| react-dropzone/react-dropzone | 11,000+ | MIT | ADOPT — Drag-and-drop file upload, file type/size validation, widely used in enterprise |
| uploadthing/uploadthing | 4,200+ | MIT | EVALUATE — Opinionated upload service; may conflict with Azure Blob requirement |

**Verdict: ADOPT** react-dropzone for the upload UI widget; Azure SDK handles actual upload.

---

### 4. Backend API Framework

| Repo | Stars | License | Verdict |
|------|-------|---------|---------|
| fastify/fastify | 32,000+ | MIT | ADOPT — Constitutional default; best TypeScript support, fastest Node.js framework |
| prisma/prisma | 40,000+ | Apache 2.0 | ADOPT — Constitutional default; type-safe ORM for PostgreSQL |
| colinhacks/zod | 34,000+ | MIT | ADOPT — Constitutional requirement for all runtime validation |

**Verdict: ADOPT** — Constitutional stack confirmed.

---

### 5. Workflow Engine

| Repo | Stars | License | Verdict |
|------|-------|---------|---------|
| temporalio/temporal | 12,000+ | MIT | REJECT — Overkill; requires its own server cluster |
| processmaker/processmaker | 1,100+ | AGPL | REJECT — AGPL license incompatible with commercial banking use |
| Power Automate (Microsoft) | N/A | Commercial | REJECT — NOT in use; bank is on-premise only |
| Bank Internal BMP Module | N/A | Proprietary | ADOPT — Already operational on Dynamics CRM on-premise; handles all stage transitions, DOA routing, task assignments, and notifications |

**Verdict: USE EXISTING** — The bank's internal BMP module is the workflow engine. No additional library or service is required. Integration is via CRM plugin events that the BMP module already listens to.

---

### 6. Status Timeline / Progress Tracker Component

| Repo | Stars | License | Verdict |
|------|-------|---------|---------|
| shadcn/ui (timeline primitives) | 75,000+ | MIT | ADOPT — Custom timeline built on shadcn primitives; 2 hours not weeks |

**Verdict: BUILD on shadcn** — no standalone timeline library needed.

---

### 7. Notification Service

| Repo | Stars | License | Verdict |
|------|-------|---------|---------|
| nodemailer/nodemailer | 17,000+ | MIT | ADOPT — Email delivery from Node.js backend |
| Azure Communication Services SDK | N/A | Commercial | ADOPT — Enterprise email/SMS with Azure-native integration |

**Verdict: ADOPT** nodemailer (dev/UAT) + Azure Communication Services (production).

---

### 8. Authentication

| Repo | Stars | License | Verdict |
|------|-------|---------|---------|
| AzureAD/microsoft-authentication-library-for-js | 3,800+ | MIT | ADOPT — Official MSAL.js for Azure AD B2C integration in Next.js (portal only) |
| nextauthjs/next-auth | 25,000+ | ISC | EVALUATE — Consider as wrapper over MSAL for cleaner Next.js integration |

**Verdict: ADOPT** MSAL.js (official) with NextAuth.js as session management wrapper — for the customer portal only. CRM on-premise users authenticate via on-premise Active Directory / Windows Authentication; no additional library required on that side.

---

### 9. Dynamics CRM On-Premise Integration (Revised — replaces Dataverse Web API)

| Repo / Library | Stars | License | Verdict |
|----------------|-------|---------|---------|
| microsoft/xrm-tooling-connector | N/A | MIT | EVALUATE — .NET SDK; only relevant if backend is C#. Not applicable for Node.js. |
| OData fetch (native) to CRM on-prem Web API | N/A | N/A | ADOPT — Dynamics CRM on-prem exposes an OData v4 Web API endpoint. The Fastify backend uses native fetch with OData query syntax. No third-party library needed; same pattern as the former Dataverse repository but pointed at the on-prem endpoint. |
| Xrm object model (browser) | N/A | Microsoft | ADOPT — For all JavaScript web resources inside CRM forms. Xrm.WebApi, Xrm.Navigation, Xrm.Page are the standard on-prem CRM JS extension APIs. |

**Verdict: BUILD with native OData fetch** (Node.js backend) + **Xrm object model** (CRM web resources). No third-party CRM SDK required for either surface.

---

## Adoption Register

| Library | Version | Surface | Use Case | License |
|---------|---------|---------|----------|---------|
| react-hook-form | 7.x | Portal | Form state management | MIT |
| yup | 1.x | Portal | Form schema validation | MIT |
| @shadcn/ui | latest | Portal | UI components (stepper, cards, dialogs) | MIT |
| react-dropzone | 14.x | Portal | Document upload UI | MIT |
| fastify | 5.x | API | Backend API server | MIT |
| @prisma/client | 5.x | API | ORM for PostgreSQL draft state | Apache 2.0 |
| zod | 3.x | API | Runtime API boundary validation | MIT |
| @azure/storage-blob | 12.x | API | Azure Blob Storage upload | MIT |
| @azure/msal-browser | 3.x | Portal | Azure AD B2C authentication | MIT |
| next-auth | 5.x | Portal | Session management wrapper | ISC |
| pino | 9.x | API | Structured logging | MIT |
| native fetch + OData | built-in | API | CRM on-premise Web API integration (no third-party SDK) | N/A |
| Xrm object model | CRM built-in | CRM JS | Web resource form logic, navigation, API calls inside CRM | Microsoft |

**Removed from register:** nodemailer (bank uses its own email relay via BMP module); Power Automate SDK (not applicable on-prem); Dataverse SDK (replaced by on-prem OData).

---

## Decision: BUILD (with adopted libraries)

No single open-source repository covers the full scope of this engagement. The solution is built from scratch using the constitutional stack. CRM on-premise integration uses native OData fetch — no third-party CRM SDK is required.

*GitHub Research v1.1 — Revised for on-prem CRM.*
