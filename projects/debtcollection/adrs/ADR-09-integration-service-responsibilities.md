# ADR-DCP-09 — Integration Service (Fastify) responsibilities after the web-resource decision

**Status:** Proposed (Phase 0, awaiting review) · 2026-09-17 · **Deciders:** architect, ceo (pending)
**Drives:** Master Prompt §19, §60; Correction Prompt §35–36. **Supersedes:** the router placement in
ADR-DCP-02.

## Context
`apps/api` (Fastify) today validates a user JWT and serves ordinary CRM reads (`GET /customers/:qid`,
`GET /identity-exceptions`) with a service token. With the workspace inside CRM (ADR-DCP-07) the user already
holds a CRM session and `Xrm.WebApi`; gatewaying CRM CRUD adds a layer, a second security model and a token
hop for nothing. Yet MIS access needs server-side secrets, rate limiting and monitoring; background
synchronisation needs a scheduler plugins cannot provide; an HL web resource holds no BFD token.

## Decision
The service is renamed in intent to the **Collection Integration Service** and keeps only:
1. **Live MIS proxy** — `GetArrearBreakdown`, `GetArrearDetails`, facility/customer position; read-only, no
   CRM writes (CP §19).
2. **Background MIS synchronisation** — watermark, batch id, idempotency, retry, per-row isolation,
   reconcile → case / snapshot / identity exception writes; pg-boss for **job state only**.
3. **Cross-organisation Customer 360 fan-out** (HL ⇄ BFD) — the one component that talks to both orgs.
4. **System-initiated communication** through the shared Communication Service (ADR-DCP-08).
5. **Integration monitoring** — technical log written to the existing `qdb_crmlogs`, health, freshness metadata.
Ordinary Collection CRUD goes **React → `Xrm.WebApi`**; the two existing data routes **retire** (their
service-layer code is reused inside the sync job). Auth: `IAuthAdapter` for user tokens (AD FS | Entra ID)
and service-to-CRM tokens; Web API version and org URLs from configuration (`DV_API_VERSION` per org —
fixes the hard-coded `9.2`). Same container image for both targets; only network placement and adapter
selection differ.

## Consequences
**Positive:** CRM security stays authoritative; fewer layers on the hot path; the reusable parts
(`DataverseClient`, `buildODataUrl`, retry, `Result`, `DomainError`, auth adapters, correlation id) all
survive; stop-contact enforcement moves to the plugin guard + Communication Service, which are unbypassable.
**Negative:** a second datastore (PostgreSQL for pg-boss) beside CRM — limited to job state; the browser must
obtain a token for the service on both platforms (Windows-integrated vs AD FS bearer on-prem `TBD — Requires
QDB Confirmation`).
**Neutral:** `packages/auth-adapters`, `packages/dataverse-client`, `packages/types` are kept as-is and
retargeted to `qdb_` names in Phase 1.

## Alternatives considered
| Option | Rejected because |
|---|---|
| Route all React → CRM traffic through Fastify | MP §60: unnecessary layer; duplicates CRM security |
| Remove Fastify entirely; do MIS via plugins | Plugins cannot schedule, hold long-running sync state or rate-limit; cross-org fan-out impossible from a web resource |
| Next.js route handlers as the BFF (ADR-02) | Next.js is gone (ADR-DCP-07) |
