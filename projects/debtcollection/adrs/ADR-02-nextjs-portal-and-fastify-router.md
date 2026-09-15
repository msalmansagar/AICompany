# ADR-DCP-02 — Standalone Next.js portal + separate Fastify router, one monorepo

**Status:** Accepted (2026-09-14) · **Deciders:** architect, ceo
**Full context, alternatives, and consequences:** `../facts-and-analysis.md` §10 (carried by reference).
**Supersedes:** the §6.2 web-resource recommendation. §6.1 (one codebase) and §6.3 (router is the only
component talking to both orgs) are carried forward as constraints.

## Decision (summary)
Fork the shape of `portal-shell` into one monorepo: `apps/web` (Next.js) + `apps/api` (the CRM Context Router:
Fastify) + `packages/*` (dataverse-client, auth-adapters, i18n, types, ui). The workspace is a **standalone
Next.js portal**, not a CRM web resource — this reverses the web-resource plan and accepts its costs (AAD
registration, hosting, a bank security review, PDPPL exposure on anything server-rendered). The router is a
**separate Fastify service, not Next.js route handlers**, because plugins, the MIS callback, pg-boss, and any
later mobile client call it, and R-03/R-04 enforcement must be unbypassable. **No PII is server-rendered.**
Phase 1 serves Housing Loan only; BFD behind a feature flag. The stack matches the CLAUDE.md defaults, so this
ADR records only the hosting reversal and router placement — not the stack.
