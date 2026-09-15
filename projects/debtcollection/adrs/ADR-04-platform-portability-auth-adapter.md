# ADR-DCP-04 — Platform portability and pluggable auth adapter

**Status:** Accepted (2026-09-14) · **Deciders:** architect, ceo
**Drives:** NFR-020, NFR-005; §2, §4.6, §5.2 of `../phase-3-arch.md`.

## Context
Both CRMs are **on-premise D365 CE 9.x today and migrate to Dataverse cloud in ~18 months** (Q-14, closed
2026-09-14). The migration itself is out of DCP-001 scope, but the build must not have to be rewritten for it.
On-prem authenticates via AD FS 2019 / OIDC; cloud via Azure AD (Entra ID) / MSAL. The Node router must run
first on client infrastructure beside the CRMs, then move to Azure unchanged.

## Decision
1. **Router authentication is a pluggable adapter.** Define `IAuthAdapter` in `packages/auth-adapters` (reusing
   the portal-shell shape) with two implementations over **panva/openid-client** (MIT; dependencies §1):
   `AdfsAdapter` now, `AzureAdAdapter` later. The concrete adapter is selected by environment variable at
   Fastify startup. **No business logic is aware of the flavour.** openid-client is chosen over msal-node
   because AD FS 2019 and Entra ID both expose standard OIDC discovery, so one standards-level library covers
   both uniformly.
2. **Both-platform feature set only.** Use only components present on on-prem 9.x **and** Dataverse: plugins,
   custom activity entities, classic workflows, Web API OData v4. **Do not use** Custom APIs, Dataverse elastic
   tables, or Power Automate as a hard dependency. Plugin assemblies target **.NET Framework 4.7.1**, one
   merged+signed artifact valid for both (TSD-002).
3. **The router is containerised** so the same image redeploys from client infrastructure to Azure.
4. **The managed solution must import into Dataverse unchanged** — no on-prem-only components; every web resource
   declared individually in `solution.xml` RootComponents (NFR-017; GOT-001..004).
5. NFR-005 (auth required, 401 otherwise) and NFR-006 (no PII in SSR) hold under both flavours.

## Consequences
**Positive:** the migration becomes a configuration + hosting change, not a rewrite; one auth contract; the
expensive Dataverse client and auth shape are forked, not rebuilt.
**Negative:** `AdfsAdapter` is unproven against real AD FS 2019 — it MUST be proven against a live AD FS endpoint
in build step 1 before anything depends on it (AR-01). On-prem S2S may need a certificate flow the generic OIDC
path does not model; validate early.
**Neutral:** the both-platform constraint forecloses some cloud conveniences (Custom APIs); acceptable at this
scope.

## Alternatives considered
| Option | Rejected because |
|---|---|
| msal-node only | Microsoft-first; adds a layer where a standards-level OIDC library already handles both providers |
| Build now for cloud, port later | Guarantees a rewrite at migration; violates NFR-020 |
| Use Custom APIs / Power Automate for orchestration | Cloud-only or availability-variable; breaks on-prem parity |
