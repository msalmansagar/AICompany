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

## Article XIV — Observability Standards
- Structured logging required in all services: pino for Node.js,
  ITracingService for CRM plugins, structured logger for all others
- Every log entry must carry: correlation_id, timestamp, service_name, operation
- No `console.log` in production code — use structured logger only
- Health check endpoint on every service: GET /health → { status, version, timestamp }
- Correlation IDs propagated across all service-to-service calls
- Metrics defined per service before deployment: request count, error rate, p95 latency
- Alerting thresholds must be defined and tested before go-live — not after an incident

## Article XV — Traceability
Every requirement carries a permanent ID minted in the BRD (`FR-nnn`,
`NFR-nnn`, `US-nn`, `AC-n`). A shipped ID is never renumbered.

Going forward, that ID appears in:
- the commit subject that implements it — `feat(forms): add filter [FR-014]`
- the name of each test that proves it
- a header comment on the entry point that satisfies it
- the PR description under an `## Implements` section

Exempt commit types: docs, chore, ci, style, build, test, refactor.

Existing artifacts are not retrofitted. The gap closes forward.
`.claude/scripts/traceability-gate.sh` reports how many defined requirements
are linked to code, tests, or commits. An unlinked requirement is a question
to answer at the CEO gate — deferred, out of scope, or forgotten — not
automatically a defect.

Enforcement is warn-only at adoption. Detail: `.claude/protocols/traceability.md`

## Article XVI — Gates Are Executable
A rule that nothing can check is a preference, not a standard.

Quality gates live in `.claude/scripts/gate-*.sh` and report PASS, FAIL, or
SKIP with the evidence for each check. They are invoked, not automatic, and
they modify nothing.

A gate that cannot run on a project reports SKIP with the reason. It never
reports PASS by default — silence is not evidence, and a gate that passes
because it checked nothing is worse than no gate, because it manufactures
confidence.

Detail: `.claude/quality-gates/README.md`

## Article XVII — Reuse Before Rebuild
Before building any shared-shaped component — a Dataverse client, a
translation resolver, a lookup or file service, an auth flow, a solution
packager — check `.claude/COMPONENT-REGISTRY.md` first.

- If a **Production** or **Solid** entry covers the need, copy and adapt it,
  and note the reuse in the plan.
- If the entry is **Divergent**, read its reconciliation note before choosing
  an implementation. Do not silently prefer one copy over another.
- If nothing fits and the thing is genuinely reusable, build it and add a
  registry row so the next project finds it.
- If it is single-use, build it plainly. Reuse machinery for a component with
  one caller is YAGNI.

This does not mandate a shared-package monorepo. Maqsad AI projects build and
deploy independently, and extracting shared code across that boundary is its
own scoped engagement with a live-org reverify per project — never a side
effect of ordinary work. The registry captures the reuse *decision*;
physical extraction is a separate, deliberate act.

Warn-only at adoption. The registry is a required read, not an enforced gate.

## Article XVIII — Requirements Are Unit-Tested
A BRD is code written in English and is held to the same standard: it must be
complete, unambiguous, consistent, and testable before anything is built from it.

- User stories are prioritized, independently-testable MVP slices (P1/P2/P3),
  not a flat list. P1 is the shippable minimum.
- Every uncertainty is written into the BRD as `[NEEDS CLARIFICATION: <question>]`
  and resolved before approval — never guessed.
- Every BRD ends with a Requirements Quality Checklist: yes/no questions about
  the requirements, not the implementation.
- `.claude/scripts/gate-brd.sh` checks these mechanically. An unresolved
  `[NEEDS CLARIFICATION]` marker is a hard block on CEO approval; the rest are
  warn-only craft smells.

Adopted from GitHub Spec-Kit. Detail: `.claude/protocols/requirements-quality.md`
