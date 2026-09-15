# DCP-001 — Dependencies Decision Record

**Project:** Debt Collection Platform
**Date:** 2026-09-14
**Phase:** 3 — Architecture (pre-build)
**Stack:** Node.js + TypeScript + Fastify + Prisma · Next.js + Tailwind · PostgreSQL · Dynamics 365 CE on-prem 9.x (migrating to Dataverse cloud ~18 months)
**Binding constraints:** AD FS 2019 on-prem / Azure AD cloud; no extra infrastructure unless justified; MIT/Apache/BSD licences; Arabic/English RTL; Qatar PDPPL-regulated.
**Research date:** 2026-09-14 (stars and release dates verified via WebSearch).

---

## 1. Router auth adapter

Repo: [panva/openid-client](https://github.com/panva/openid-client) · Stars: 2 400 · Release: v6.8.5 Aug-2026 · Licence: MIT
Verdict: **ADOPT**

AD FS 2019 and Azure AD both expose standard OIDC discovery endpoints; `openid-client` discovers and speaks OIDC against either one using only the issuer URL, making it the single abstraction the pluggable-adapter requirement (NFR-005/020) demands. `msal-node` is Microsoft-first and adds a dependency layer when a standards-level OIDC library already handles both providers uniformly. Wrap each environment in a thin `AdfsAdapter` / `AzureAdAdapter` class inside the monorepo's `packages/auth-adapters` (the package portal-shell already defines), injected by environment variable.

---

## 2. Dataverse / Dynamics Web API client (Node)

Repo: [AleksandrRogov/DynamicsWebApi](https://github.com/AleksandrRogov/DynamicsWebApi) · Stars: ~299 — below 1 000 threshold · Release: v2.3.0 · Licence: MIT
Verdict: **KEEP-EXISTING** (`packages/dataverse-client` from portal-shell)

`DynamicsWebApi` is the only published TypeScript library explicitly supporting D365 CE on-prem 9.x and Dataverse, and its MIT licence and on-prem fit are correct — but its ~299 stars are below the adopt threshold. The monorepo forks from portal-shell, which already ships a Production-grade `packages/dataverse-client` with bearer injection, typed `CrmApiError`, and 429-retry with jitter (see component registry). Carry that package forward as the monorepo's shared client. Reference `DynamicsWebApi` only as an internal implementation detail if FetchXML query complexity warrants it.

---

## 3. Scheduled MIS ingest job runner

Repo: [timgit/pg-boss](https://github.com/timgit/pg-boss) · Stars: 3 100+ · Release: 2026 · Licence: MIT
Verdict: **ADOPT** (over BullMQ and node-cron)

pg-boss queues jobs inside the project's existing PostgreSQL database using `SELECT … FOR UPDATE SKIP LOCKED`, giving exactly-once delivery and transactional job creation — a job can be enqueued in the same database transaction that writes the MIS ingest record, eliminating the split-brain risk. BullMQ (9 400 stars, MIT, active Sep-2026) is more powerful but requires Redis — a new infrastructure component for what is essentially a nightly batch ingest. node-cron has no persistence or retry semantics; a crash loses the run. pg-boss gives the correct semantics at zero extra infrastructure cost.

---

## 4. SMS / Email gateway abstraction

Email repo: [nodemailer/nodemailer](https://github.com/nodemailer/nodemailer) · Stars: 17 700 · Release: Sep-2026 · Licence: MIT No Attribution
SMS: no qualifying library — BUILD thin adapter
Verdict: **ADOPT** nodemailer for email · **BUILD** `ISmsGateway` adapter for SMS

No provider-agnostic SMS library clears 1 000 stars; the major SDKs (Twilio, Vonage, etc.) are provider-specific. The right design is a thin `ISmsGateway` interface with one concrete implementation for the bank's contracted SMS provider, held in `packages/` alongside nodemailer. nodemailer is an unconditional adopt: MIT, 17 700 stars, active, zero cloud dependency, pluggable SMTP transport. The communication router (FR-122) wraps both behind a single `INotificationService` so future channels slot in without touching callers.

Registry note: `INotificationService` + `ISmsGateway` are new reusable interfaces — add to registry once built.

---

## 5. Arabic / English communication template engine

Repo: [harttle/liquidjs](https://github.com/harttle/liquidjs) · Stars: 1 900 · Release: v10.29.0 Aug-2026 · Licence: MIT
Verdict: **ADOPT**

LiquidJS was designed for customer-facing (Shopify-compatible) templates with an explicit sandboxed execution model: no code evaluation, no prototype access, variable expansion escaped by default — directly addressing the FR-069 approved-templates-only control. handlebars.js (18 700 stars) received three RCE/XSS advisories in March 2026 (GHSA-2qvq-rjwj-gvw9, CVE-2026-33937, GHSA-2w6w-674q-4c4q) covering AST injection and prototype pollution; that is a blocking issue for a regulated outbound-communication system. LiquidJS clears the 1 000-star bar, is MIT, and is actively maintained through 2026.

---

## 6. Server-side PDF generation with RTL Arabic (FR-111)

Repo: [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer) · Stars: 95 600 · Release: 2026 · Licence: Apache 2.0
Verdict: **ADOPT**

pdfmake (12 300 stars, MIT) has open issues for RTL Arabic support dating from 2014–2019 with no resolution (issues #184, #315, #550, #758, #1463, #1496) — a blocking issue given Arabic is a hard Qatar requirement. puppeteer renders HTML/CSS via Chromium, which handles Arabic shaping, BiDi text, and RTL layout natively through HarfBuzz/ICU, producing correct Arabic PDFs without custom font wiring. Serve the evidence pack as an HTML template (using LiquidJS from component 5), then `page.pdf()` in Puppeteer — one template serves both screen preview and PDF export, and no second render path is introduced. Apache 2.0 is acceptable for commercial enterprise use. Runtime dependency: Chromium bundle (~170 MB) or a separately installed Chrome; size this into container specs.

---

## 7. Dashboard charts in the Next.js portal

Repo: [recharts/recharts](https://github.com/recharts/recharts) · Stars: 26 200 · Release: Sep-12-2026 · Licence: MIT
Verdict: **ADOPT**

Recharts renders as declarative SVG React components with no canvas or WebGL dependency, composes directly into Next.js pages without Fluent's CSS resets interfering, and ships individual chart types as separate imports so tree-shaking keeps the bundle lean. 26 000 stars, MIT, Sep-2026 release, and wide Next.js community adoption. @nivo/charts (6 900 stars) and Victory (11 000 stars) are viable alternatives; Recharts is chosen on bundle size and Next.js ecosystem fit.

---

## 8. C# plugin test harness (audit, status-transition, immutability plugins)

Repo (v1): [jordimontana82/fake-xrm-easy](https://github.com/jordimontana82/fake-xrm-easy) · Stars: ~600 · Unmaintained · Licence: MIT (v1 only)
Repo (v2/v3): DynamicsValue/fake-xrm-easy-core · Licence: RPL 1.5 / Modified Polyform NonCommercial — **commercial licence required**
Verdict: **BUILD** — mock `IOrganizationService` directly with Moq

FakeXrmEasy v1 is MIT but effectively unmaintained with partial D365 9.x coverage. FakeXrmEasy v2 and v3 switched to a triple-licence model that requires a paid commercial licence for software-development-company use — a hard blocker for a delivery engagement. No alternative framework clears 1 000 stars with a permissive licence. Use `Moq` (MIT, 5 700+ stars) to mock `IOrganizationService` directly; add a shared `CrmPluginTestBase<T>` helper in the solution to set up the execution context, so each test is short and follows the Arrange–Act–Assert pattern. This is the standard approach for .NET 4.7.1 plugin assemblies (per TSD-002) and carries zero licence risk.

---

## Summary

| # | Component | Verdict | Library / approach |
|---|---|---|---|
| 1 | Router auth adapter | ADOPT | panva/openid-client v6 · MIT |
| 2 | Dataverse / Web API client | KEEP-EXISTING | portal-shell `packages/dataverse-client` |
| 3 | MIS ingest job runner | ADOPT | timgit/pg-boss · MIT |
| 4 | Email gateway | ADOPT | nodemailer/nodemailer · MIT |
| 4 | SMS gateway | BUILD | thin `ISmsGateway` adapter |
| 5 | Template engine | ADOPT | harttle/liquidjs · MIT |
| 6 | PDF generation (RTL) | ADOPT | puppeteer/puppeteer · Apache 2.0 |
| 7 | Dashboard charts | ADOPT | recharts/recharts · MIT |
| 8 | CRM plugin test harness | BUILD | Moq + `IOrganizationService` mocks · MIT |
