# Maqsad AI — Technology Constitution v2.0

## Article I — Spec First
No design or code begins until the Business Analyst has produced a
requirements report and all ambiguities are resolved.
Order: BA report → architect reviews → clarification round → design.

## Article II — Default Stack
These are the defaults. Any deviation requires an Architecture Decision
Record (ADR) written by the Architect and approved by CEO.

| Layer                | Default                                         |
|----------------------|-------------------------------------------------|
| Backend API          | Node.js + TypeScript + Fastify + Prisma         |
| Frontend web         | Next.js + TypeScript + Tailwind CSS             |
| Portal               | Power Pages (React/Vue/Astro) or Next.js        |
| Mobile               | React Native + TypeScript + Expo                |
| Database (cloud)     | PostgreSQL                                      |
| Database (on-prem)   | SQL Server                                      |
| CRM on-premise       | Dynamics CRM, C#, Organization Service SDK      |
| CRM cloud            | Dataverse Web API v9.2, PAC CLI, TypeScript     |
| Power Platform       | Power Automate, PCF, Power Pages, PAC CLI       |
| ERP                  | Dynamics 365 F&O, X++, Azure DevOps, LCS        |
| AI Agents            | Copilot Studio / Claude API + MCP servers       |
| DevOps (cloud)       | Docker + GitHub Actions                         |
| DevOps (on-prem)     | Azure DevOps + Windows Server + IIS             |
| Testing              | Vitest + Playwright + Supertest                 |
| Auth                 | JWT + refresh tokens / Azure AD / Entra ID      |
| API style            | REST (OpenAPI 3.0 spec required)                |

## Article III — TypeScript Everywhere
All JavaScript/TypeScript code uses strict mode.
No `any` types. Zod for runtime validation at all system boundaries.

## Article IV — Test-Driven Development
Red → Green → Refactor. No exceptions.
- Unit tests: Vitest, minimum 80% coverage
- Integration tests: real database, no mocks for external services
- E2E tests: Playwright for web/portal, Detox for mobile
- API tests: Supertest against running server
- X++ tests: SysTest framework for F&O

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
- Entra ID / Azure AD for enterprise SSO where available

## Article VIII — CEO Checkpoints (hard stops)
Orchestrator must pause and get explicit CEO approval before:
1. Moving from Phase 2 (BA) → Phase 3 (Architecture)
2. Moving from Phase 3 (Architecture) → Phase 4 (Build)
3. Any scope change after Phase 3 is approved
4. Final delivery (Phase 7)

## Article IX — Git Safety
- Never `git add .` — stage specific files only
- Commit messages: `<type>(<scope>): <description>`
- Feature branches per engagement: feature/<project>/<phase>
- No force push to main

## Article X — CRM On-Premise Constraints
- Plugin sandbox: 2-minute hard limit — always async handoff
- No direct network calls from CRM plugins
- Organization Service SDK only (not Dataverse Web API)
- Managed solutions, publisher prefix per client
- ILMerge or NuGet for dependencies

## Article XI — Dataverse Cloud Constraints
- Always include MSCRM.SolutionUniqueName header on all creates
- Never create components in the Default Solution (Active layer)
- Data types, table logical names, and ownership type are permanent
- PAC CLI for all deployments — never manual portal changes in production
- Publish customizations after every form/view/sitemap change

## Article XII — F&O Constraints
- All customizations in separate extension models — never modify base
- X++ best practice: no direct SQL, use query framework or data entities
- LCS for all environment deployments — no manual package installs
- Business events for async integration — no tight coupling to F&O internals
- Data entities for all external integrations (OData or batch)

## Article XIII — AI Agent Constraints
- No hardcoded prompts with business rules — load from configuration
- All agent actions must be auditable — log every tool call and decision
- Human-in-the-loop gates for irreversible actions
- MCP servers scoped to least-privilege access
- Never expose raw database credentials to agent tools
