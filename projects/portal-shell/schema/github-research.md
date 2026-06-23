# GitHub Research Report — Dataverse Schema Provisioning (TypeScript/Node.js)

**Feature:** Programmatic Dataverse schema provisioning via OData v4 Web API
**Engagement:** DFE-PORT-001 / Portal Shell — Schema Track
**Date:** 2026-06-16
**Researcher:** github-researcher agent

---

## Queries Run

1. `site:github.com dataverse web api typescript client stars:>1000`
2. `site:github.com dynamics 365 web api node javascript client stars:>500`
3. `site:github.com dataverse schema migration entity provisioning typescript`
4. `site:github.com microsoft dataverse powerplatform node sdk typescript`
5. `site:github.com dynamics crm odata typescript entity definitions metadata`
6. Supplementary: npm download rates, last-release dates, metadata API coverage

---

## Results Found

### Repo 1: AleksandrRogov/DynamicsWebApi

- **URL:** https://github.com/AleksandrRogov/DynamicsWebApi
- **npm package:** `dynamics-web-api`
- **Stars:** ~307 (as of mid-2025; most recent confirmed figure)
- **npm weekly downloads:** ~12,000 (active consumer base)
- **Last commit:** May 2025 (wiki updated; v2 active dev branch present)
- **License:** MIT
- **TypeScript support:** Yes — written in TypeScript, ships `.d.ts` type definitions
- **Metadata / schema API support:**
  - Exposes `EntityDefinitions`, `Attributes`, and `GlobalOptionSetDefinitions` endpoints
  - Confirmed support for `useEntityNames` config which fetches `LogicalCollectionName`
    and `LogicalName` from EntityMetadata on first call
  - Covers CRUD operations on metadata entities (create entity, create attribute, etc.)
  - Handles OData batch requests, FetchXML, Actions, and Functions
- **OAuth support:** Yes — supports client credentials flow via configurable `onTokenRefresh`
  callback; compatible with MSAL or any token provider
- **On-premise fit:** Yes — supports both Dataverse online and Dynamics CRM on-premise
- **Fit assessment:** The strongest community-maintained TypeScript client in the Dataverse
  space. Covers data CRUD AND metadata schema operations. MIT license, actively maintained.
  The only blocking issue is star count (307 vs. the 1000+ threshold).
- **Blocking issues:** Star count is 307 — below the 1000+ threshold.
  However, the 12k weekly npm downloads signal significantly higher actual usage than stars
  suggest, which is common in enterprise tooling where devs rarely star repos.

---

### Repo 2: scottdurow/dataverse-ify

- **URL:** https://github.com/scottdurow/dataverse-ify
- **Stars:** ~72
- **Last commit:** 2023 (low recent activity; last release page shows no 2024/2025 releases)
- **License:** MIT
- **TypeScript support:** Yes — TypeScript-native, SDK-style types
- **Metadata / schema API support:** Focused on data CRUD using IOrganizationService
  SDK-style API; no evidence of EntityDefinitions or GlobalOptionSetDefinitions support.
  Primarily designed for web resource and integration-test scenarios.
- **Fit assessment:** Does not fit. Too low stars, showing signs of reduced maintenance,
  and does not cover schema/metadata provisioning operations.
- **Blocking issues:** 72 stars, no schema API support, activity appears stalled.

---

### Repo 3: XRM-OSS/Xrm-WebApi-Client

- **URL:** https://github.com/XRM-OSS/Xrm-WebApi-Client
- **Stars:** ~105
- **Last commit:** May 2023 (last release v4.1.6)
- **License:** MIT
- **TypeScript support:** TypeScript type definitions available (not TypeScript-native)
- **Metadata / schema API support:** Covers standard CRUD Web API requests; metadata
  operations are not a primary design goal. README focuses on record-level operations.
- **Fit assessment:** Does not fit. Star count too low, last commit over 3 years ago
  as of 2026, and no schema/metadata provisioning focus.
- **Blocking issues:** Effectively abandoned (3+ year old last commit), 105 stars,
  no EntityDefinitions/schema operation coverage.

---

### Repo 4: primno/dataverse

- **URL:** https://github.com/primno/dataverse
- **npm package:** `@primno/dataverse-client` + `@primno/dataverse-auth`
- **Stars:** <50 (exact count not confirmed; search results indicate a very small project)
- **Last commit:** Unknown — npm activity visible but GitHub activity low
- **License:** MIT
- **TypeScript support:** Yes — written in TypeScript
- **Metadata / schema API support:** Focuses on `retrieveMultipleRecords` and
  `retrieveRecord` (data CRUD). No evidence of schema/metadata provisioning methods.
- **OAuth support:** Yes — supports `client_credential`, `password`, `device_code` grant
  types via `@primno/dataverse-auth`
- **Fit assessment:** Does not fit for schema provisioning. The OAuth layer is well-designed
  but the data client covers only CRUD, not metadata APIs.
- **Blocking issues:** Sub-50 stars, no schema API support, small community.

---

### Repo 5: microsoft/PowerPlatform-DataverseServiceClient

- **URL:** https://github.com/microsoft/PowerPlatform-DataverseServiceClient
- **Stars:** ~230
- **Last commit:** Actively maintained (Microsoft-owned)
- **License:** MIT
- **TypeScript support:** None — this is a .NET/C# library distributed as a NuGet package
- **Metadata / schema API support:** Full metadata support (it wraps the full Organization
  Service including entity schema operations), but in C# only
- **Fit assessment:** Does not fit. This is the official Microsoft SDK for .NET/C#.
  There is no equivalent official Microsoft npm/Node.js package for Dataverse Web API.
  Microsoft's Node.js Dataverse tooling (`@microsoft/dataverse`) is a CLI/MCP proxy tool,
  not a programmatic API client library.
- **Blocking issues:** Wrong runtime (C#/.NET, not Node.js/TypeScript).

---

### Repo 6: derekfinlinson/xrm-webapi

- **URL:** https://github.com/derekfinlinson/xrm-webapi
- **Stars:** ~50
- **Last commit:** 2022 (inactive)
- **License:** MIT
- **TypeScript support:** Yes — TypeScript module
- **Metadata / schema API support:** Not identified — focuses on Xrm.WebApi browser-context
  calls for web resources
- **Fit assessment:** Does not fit. Abandoned, low stars, browser-context focus.
- **Blocking issues:** Abandoned, ~50 stars, no schema API coverage.

---

## No-Node Microsoft Official Option Confirmed

A specific search for `@microsoft/dataverse` npm package confirms it is a **CLI/MCP proxy
tool** (usage: `npx @microsoft/dataverse mcp https://yourorg.crm.dynamics.com`), not a
TypeScript API client library. Microsoft does not publish an official Node.js SDK for
Dataverse Web API data/schema operations.

---

## Verdict: BUILD

---

## Recommendation

No library in the Node.js/TypeScript ecosystem meets the 1000+ star threshold combined with
active maintenance and schema/metadata API coverage. The strongest candidate,
`DynamicsWebApi` (307 stars, 12k weekly downloads), covers the metadata API surface needed
but falls well below the star threshold.

**The correct approach for a one-shot provisioning script is raw `fetch` calls directly
against the Dataverse OData v4 REST API.** The rationale is:

1. **The API is a standard REST/OData v4 interface.** Every operation — POST to
   `EntityDefinitions`, POST to `GlobalOptionSetDefinitions`, POST to
   `EntityDefinitions({name})/Attributes`, `AddSolutionComponent` action — is a
   straightforward HTTP call with a JSON body. No library abstraction is needed.

2. **A provisioning script runs once.** A heavyweight client library optimised for
   repeated CRUD operations (pagination, retry, FetchXML, batch) adds zero value to
   a one-shot idempotent provisioning script.

3. **Schema/metadata endpoints behave differently from data endpoints.** Most library
   abstractions are designed for data CRUD (`/accounts`, `/contacts`). Metadata endpoints
   use different URL patterns, different response shapes, and different OData annotations.
   Wrapping them in a generic client creates more friction than it removes.

4. **`@azure/msal-node` is the right dependency for OAuth.** Microsoft's official MSAL
   for Node.js (2,200+ stars, actively maintained, MIT) handles the
   `client_credentials` token acquisition against Azure AD reliably. This is the only
   third-party dependency the provisioning script should take.

---

## Suggested Dependency Decision

| Dependency | Purpose | Stars | Verdict |
|---|---|---|---|
| `@azure/msal-node` | OAuth 2.0 client_credentials token acquisition | 2,200+ | ADOPT |
| `dynamics-web-api` | Dataverse Web API client | 307 | DO NOT ADOPT — use raw fetch instead |
| Any other library | Schema provisioning | N/A | BUILD with raw fetch |

---

## Suggested Next Step

Proceed to implementation with raw `fetch` calls. Structure the provisioning script as:

```
scripts/
  provision-schema/
    index.ts              -- entry point, orchestrates steps in order
    auth/
      TokenProvider.ts    -- wraps @azure/msal-node client_credentials flow
    steps/
      01-create-solution.ts
      02-create-option-sets.ts
      03-create-entities.ts
      04-create-attributes.ts
      05-create-relationships.ts
      06-add-solution-components.ts
      07-seed-data.ts
      08-configure-security.ts
    http/
      DataverseClient.ts  -- thin wrapper: base URL, auth header, error handling
    types/
      dataverse-metadata.ts -- TypeScript interfaces for EntityMetadata, AttributeMetadata, etc.
```

`DataverseClient` should be a minimal class (under 80 lines) that:
- Holds the base URL and a `TokenProvider` reference
- Exposes `get<T>`, `post<T>`, `patch<T>`, `delete` methods
- Throws typed errors on non-2xx responses with the full OData error body
- Handles the `Prefer: return=representation` header pattern for metadata POSTs

This structure gives full type safety, zero unnecessary abstraction, and complete control
over the OData headers that metadata operations require.
