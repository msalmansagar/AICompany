# Maqsad AI — Technology Constitution v1.0

## Article I — Spec First
No design or code begins until the Business Analyst has produced a
requirements report and all ambiguities are resolved.
Order: BA report → architect reviews → clarification round → design.

## Article II — Default Stack
These are the defaults. Any deviation requires an Architecture Decision
Record (ADR) written by the Architect and approved by CEO.

| Layer            | Default                                      |
|------------------|----------------------------------------------|
| Backend API      | Node.js + TypeScript + Fastify + Prisma      |
| Frontend web     | Next.js + TypeScript + Tailwind CSS          |
| Mobile           | React Native + TypeScript + Expo             |
| Database (cloud) | PostgreSQL                                   |
| Database (on-prem)| SQL Server                                  |
| CRM              | Dynamics CRM on-premise, C#, Org Service SDK |
| DevOps           | Docker + GitHub Actions                      |
| Testing          | Vitest + Playwright + Supertest              |
| Auth             | JWT + refresh tokens / Azure AD for enterprise|
| API style        | REST (OpenAPI 3.0 spec required)             |

## Article III — TypeScript Everywhere
All JavaScript code is TypeScript with strict mode enabled.
No `any` types. Zod for runtime validation at all system boundaries.

## Article IV — Test-Driven Development
Red → Green → Refactor. No exceptions.
- Unit tests: Vitest, minimum 80% coverage
- Integration tests: real database, no mocks for external services
- E2E tests: Playwright for web, Detox for mobile
- API tests: Supertest against running server

## Article V — No Hardcoding
All business rules, thresholds, rates, and configuration values
loaded from database or environment at runtime.
Never in source code. Never in build artifacts.

## Article VI — Audit Trail First
Every entity carries: created_by, created_on, modified_by, modified_on.
Audit log tables are append-only. No UPDATE or DELETE on audit records.
Every state transition is logged with actor, timestamp, and reason.

## Article VII — Security by Default
- OWASP Top 10 checked before every release
- Input validation at every API boundary (Zod schemas)
- Parameterized queries only — no string concatenation in SQL
- Secrets in environment variables only — never in code or logs
- Service accounts follow least-privilege principle

## Article VIII — CEO Checkpoints (hard stops)
Orchestrator must pause and get explicit CEO approval before:
1. Moving from Phase 2 (BA) → Phase 3 (Architecture)
2. Moving from Phase 3 (Architecture) → Phase 4 (Build)
3. Any scope change after Phase 3 is approved
4. Final delivery (Phase 7)

## Article IX — Git Safety
- Never `git add .` — stage specific files only
- Commit messages reference phase and feature
- Feature branches per engagement: feature/<project>/<phase>
- No force push to main

## Article X — CRM Constraints (QDB specific)
- Plugin sandbox: 2-minute hard limit — always async handoff
- No direct network calls from CRM plugins
- Organization Service SDK only (not Dataverse Web API)
- Managed solutions, publisher prefix: qdb_
- ILMerge or NuGet package deployment for dependencies
