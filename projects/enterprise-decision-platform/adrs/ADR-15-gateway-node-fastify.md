# ADR-15: Decision Gateway is Node + TypeScript + Fastify

**Status:** Accepted
**Date:** 2026-07-22
**Decided by:** Solution Architect. Refines ADR-EDS-02 (transport-only gateway); companion to ADR-05, ADR-EDS-09.

---

## Context

Phase 5 (Enterprise Decision Service) named the optional transport tier "EDP.Gateway" and
sketched it in ASP.NET Core. That naming was illustrative — ADR-EDS-02 fixes only the
*behaviour* (transport-only, never executes rules), not the implementation stack.

Two facts push the actual choice:
1. The Maqsad backend-API default (CLAUDE.md technology constitution) is **Node.js + TypeScript
   + Fastify**. A deviation from a default requires an ADR — hence this record.
2. The gateway is a **logic-free proxy**: it validates a canonical envelope, authenticates the
   caller, and forwards to the Dataverse Custom API over HTTP. It has **no dependency on the
   .NET runtime assembly** — that runs inside Dataverse. The client **SDK is TypeScript**
   (ADR-EDS-09).

## Decision

Implement the Decision Gateway in **Node.js + TypeScript + Fastify**, with **Zod** for
boundary validation and **Vitest** for tests — matching the company default and keeping the
gateway, the SDK, and the designer in one language and toolchain.

## Consequences

- One language across gateway + SDK + designer; no second runtime to build, secure, or staff.
- Transport mapping is unit-tested against a `DecisionRuntime` interface (fake in tests, Dataverse
  in prod) — the gateway stays provably logic-free (ADR-EDS-02).
- **Supersedes the "ASP.NET" naming** in the Phase-5 doc. The behavioural contract (envelope,
  transport-only, CQS surface) is unchanged.
- **Zero-infra core intact (ADR-05):** the gateway is the accepted *optional* tier; rules and the
  runtime remain inside Dataverse. Adopting the gateway is opt-in and does not change how the
  core solution ships.
- New operational surface (a hosted Node service) needs standard hardening before production:
  TLS, rate limiting, secret management for the service principal, and container/host runbook —
  tracked as gateway follow-ups, not part of this MVP.

## Alternatives considered

- **ASP.NET Core (as sketched).** Rejected: introduces a second language/runtime and CI target
  for a proxy that shares no code with the .NET runtime, against no benefit. If a future
  requirement co-locates the gateway with the runtime assembly, revisit.

## Registry

Add to `adrs/index.md`:
`| ADR-15 | Decision Gateway is Node + TypeScript + Fastify (refines ADR-EDS-02) | Accepted | 2026-07-22 | Architect |`
