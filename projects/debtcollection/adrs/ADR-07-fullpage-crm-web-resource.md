# ADR-DCP-07 — ONE React Collection Workspace as a full-page CRM web resource

**Status:** Proposed (Phase 0, awaiting review) · 2026-09-17 · **Deciders:** architect, ceo (pending)
**Drives:** Master Prompt §10–13, §45, §53–54; Correction Prompt §1, §5. **Supersedes:** ADR-DCP-02;
ADR-DCP-03 in part.

## Context
The approved UX architecture is one React + TypeScript codebase deployable into HL CRM, BFD CRM and any
future Dataverse tenant, opened from CRM navigation or a direct authorised URL, under the CRM session. A
standalone Next.js portal needs a Node host, its own sign-in, hosting and a bank security review, and
cannot be a web resource. The house already ships single-file web-resource bundles (Form Engine
`qdb_form_runtime.html`, Report Engine designer), so the pattern is proven on the cloud org and packaged
for on-prem.

## Decision
1. **One React workspace, one bundle** (`qdb_dcp_workspace.html` + assets declared individually in
   `solution.xml`), registered as a **full-page web resource** reachable from the sitemap and by direct
   URL. **Not** an iframe inside an entity form or dashboard; no iframe dependency for the main workspace.
2. **Startup sequence:** resolve runtime context from `Xrm.Utility.getGlobalContext()` (org URL, user, roles,
   platform version → Web API version) → load `qdb_platformconfiguration` + `qdb_platformmapping` → initialise
   adapters (`ICrmAdapter` over `Xrm.WebApi`, engine facades, `IMisDelinquencyService` client) → start the same
   application. After initialisation no component knows which platform or organisation is underneath.
3. **Canonical abstractions only** in components: `getCustomer()`, `getFacility()`, Collection Case/Activity
   models — never `getContact()` / `getAccount()`; no `if org == HL` in UI code.
4. **Form Engine** (`IFormEngine`) renders activity-type-specific forms (PTP, field visit, restructuring,
   legal, deceased/insurance, dispute); React hard-codes only the workspace shell and list/detail views.
5. Security: the web resource runs under the CRM session, every data call is a CRM call, so a direct URL
   cannot bypass CRM authorisation; role-aware navigation is presentation only (Layer 3).
6. No hard-coded hostnames, org paths, absolute CRM URLs, domains or auth endpoints anywhere in the bundle.

## Consequences
**Positive:** no separate hosting/sign-in; CRM security authoritative by construction; identical bundle on
both orgs and both platforms; reuse of the existing bundling/packaging know-how.
**Negative:** web-resource size limits (on-prem default 5 MB); no server-side rendering or route handlers;
cross-org Customer 360 and MIS still need the Integration Service (ADR-DCP-09) reached with a user token
(`IAuthAdapter` browser side — AD FS or Entra ID; Windows-integrated on-prem `TBD — Requires QDB Confirmation`).
**Neutral:** the prototype (22 mock screens) is reference material only; nothing of it is "implemented".

## Alternatives considered
| Option | Rejected because |
|---|---|
| Standalone Next.js portal (ADR-02) | Cannot be a web resource; extra hosting, sign-in, security review; violates MP §10–11 |
| Web resource embedded in an entity form/dashboard iframe | Master Prompt §11 forbids an iframe-dependent main workspace |
| Separate on-prem and cloud React builds | Violates the single-codebase rule; platform differences are configuration/adapters only |
