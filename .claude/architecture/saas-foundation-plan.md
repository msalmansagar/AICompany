# SaaS Foundation — Plan (not yet built)

Tracking doc for the general-purpose (web / mobile / SaaS / portal) half of the
`global/` shared library. MSS Technologies is chartered to build any kind of
system, not only Dynamics. The `global/` library today has only the **CRM
foundation** (`@mss/dataverse-*`, `Mss.Dataverse[.Sdk]`); this is the plan for
the **SaaS foundation** that mirrors it.

**Status: sketch only. Nothing built. Gated on a real driver — the first
serious web/mobile/SaaS engagement.** Recorded so it isn't re-derived later.

Modelled on the shared packages in Tamoura/Claude-Code-creates-the-SW-company
(`auth`, `billing`, `notifications`, `observability`, `webhooks`, `audit`, `ui`),
adapted to MSS's constitution and enterprise reality.

---

## Principle — same model as the Dataverse foundation

1. **Contract + per-runtime impl.** Runtime-agnostic contract plus an
   implementation per runtime served — here **Node** (backend), **browser**
   (web/portal), **mobile** (React Native).
2. **Inject dependencies, hold no secrets** — as the Dataverse token providers do.
3. **Governed by Article XX + scaffold/vendor + `GLOBAL-VERSION` drift.** A new
   SaaS product scaffolds from `project-base` with these wired in.

Most of these packages **operationalise a constitution article** — they make an
existing mandate reusable rather than re-implemented per product. That is the
justification for each, not "add a feature".

---

## Package set

| Package | Operationalises | Runtimes | Priority |
|---|---|---|---|
| `@mss/observability` | Art. XIV — pino logging, correlation IDs, `/health`, p95 metrics | node (+ browser client) | 1 — always |
| `@mss/api-kit` | the rules — Fastify baseline, RFC-7807 errors, Zod at the boundary, correlation middleware | node | 1 — always |
| `@mss/auth` | Art. VII + Entra reality — Entra ID / Azure AD SSO **and** JWT/refresh, API keys, protected routes | node + browser + mobile | 2 — most products |
| `@mss/audit` | Art. VI — append-only trail, `created_by/on`, residency-aware (PDPPL) | node | 2 — regulated/most |
| `@mss/ui` | shared components + the 3-layer design tokens (already built) | browser (+ RN variant) | 2 — web/mobile |
| `@mss/notifications` | email / push / in-app behind one channel contract | node (+ mobile push) | 3 — when needed |
| `@mss/webhooks` | inbound HMAC verify + outbound delivery (retry, circuit breaker) | node | 3 — on integration |
| `@mss/billing` | subscriptions, usage metering, tier-gating (provider-agnostic) | node + browser | 3 — only if it bills |

## What makes it MSS's, not a copy

- **Enterprise auth first** — `@mss/auth` leads with Entra ID / Azure AD SSO
  (clients skew enterprise/on-prem), JWT as fallback. Not consumer-JWT-first.
- **Residency-aware audit** — `@mss/audit` bakes in the PDPPL / data-residency
  discipline that has been a release gate, not an afterthought.
- **Plugs into the constitution** — each package cites the article it implements.

---

## Build order — YAGNI-gated

1. `@mss/observability` + `@mss/api-kit` — every Node product re-writes these;
   small, near-zero risk (no external services). Build first.
2. `@mss/auth` — the big, high-value one. Build when the **first real
   web/mobile engagement lands**, not speculatively.
3. `@mss/ui` — pair with `auth` for that first engagement; tokens already done.
4. `billing` / `notifications` / `webhooks` — build **only when a product needs
   them**. No `@mss/billing` until something bills.

## Do not

- Don't copy the upstream `saas-kit` wholesale — the `project-base` template is
  our scaffold.
- Don't build the full set up front — a package earns its existence from a
  **second consumer**, not a diagram. One product proves each before it's canon.
- Don't force a monorepo — vendored-source + `GLOBAL-VERSION`, as the Dataverse
  packages do.

---

## Related
- `component-reuse-plan.md` — the reuse doctrine this follows.
- `dataverse-client-reconciliation.md` — the CRM-foundation counterpart.
- `global/README.md` — the runtime rule and inheritance mechanism.
