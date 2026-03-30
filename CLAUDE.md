# Maqsad AI — Full-Stack Enterprise Software Company

## Default behavior
When the user types any instruction, delegate to @orchestrator.
Do not respond directly for business or technical problems.
Exceptions: simple file operations, project setup, Claude Code questions.

## Available agents
orchestrator, ceo, business-analyst, architect, backend, frontend,
mobile, devops, middleware, crm-onprem, power-platform, fo-developer,
agent-developer, qa, auditor, code-reviewer

## Service lines
- Portal development (Power Pages, Next.js, React)
- Mobile development (React Native + Expo)
- Dynamics CRM on-premise (C#, Organization Service SDK)
- Dynamics CRM online / Dataverse cloud (Web API, PAC CLI)
- Power Platform (Power Automate, PCF, Code Apps, Model-driven apps)
- AI Agent development (Copilot Studio, Claude API, MCP servers, Azure AI)
- Dynamics 365 F&O cloud (X++, AOT, LCS, data entities)
- Backend APIs (Node.js + TypeScript + Fastify + Prisma)
- System integrations and middleware
- Governance and compliance reviews

## Technology defaults (deviation requires ADR)
- Backend API: Node.js + TypeScript + Fastify + Prisma
- Frontend web: Next.js + TypeScript + Tailwind CSS
- Portal: Power Pages (React/Vue/Angular/Astro) or Next.js
- Mobile: React Native + TypeScript + Expo
- Database: PostgreSQL (cloud) / SQL Server (on-premise)
- CRM on-premise: Dynamics CRM, C#, Organization Service SDK
- CRM cloud: Dataverse Web API, PAC CLI, TypeScript
- ERP: Dynamics 365 F&O, X++, Azure DevOps, LCS
- AI Agents: Copilot Studio / Claude API + MCP
- DevOps: Docker + GitHub Actions / Azure DevOps
- Testing: Vitest + Playwright + Supertest

## Project output structure
All outputs written to: projects/<name>/
  brief.md, phase-1-ceo.md, phase-2-ba.md, phase-3-arch.md,
  phase-4-tech.md, phase-5-qa.md, phase-6-audit.md,
  phase-7-ceo.md, full-engagement.md

## Clean code standards (mandatory for all agents)

Every agent that produces code must follow these principles.
These are non-negotiable. No agent may skip or abbreviate them.

### Naming
- Classes: PascalCase nouns (RuleEvaluator, AuditLogWriter)
- Methods: camelCase verbs (evaluateDocument, writeAuditEntry)
- Variables: camelCase, intention-revealing (rulesetVersion NOT rv)
- Constants: UPPER_SNAKE_CASE (MAX_RETRY_COUNT)
- No abbreviations unless universally known (id, url, dto are fine)
- Names must answer WHY it exists, WHAT it does, HOW it is used

### Functions and methods
- One function = one responsibility, no exceptions
- Maximum 20 lines per function — if longer, extract
- Maximum 3 parameters — use a parameter object beyond that
- No boolean flags as parameters (create two named methods instead)
- Functions either DO something or ANSWER something, never both
- No side effects — a function that reads must not write

### Classes
- Single Responsibility Principle: one reason to change
- Open/Closed: open for extension, closed for modification
- No god classes — if it does everything, split it
- Prefer composition over inheritance
- Depend on abstractions (interfaces), not concretions

### Error handling
- Never swallow exceptions silently
- Never return null — use Result<T> pattern or throw
- Validate at the boundary (entry point), trust inside
- Specific exceptions over generic Exception catch blocks
- Log the full exception context, not just the message

### Comments
- Code must be self-documenting — if you need a comment to explain
  WHAT, the code should be rewritten
- Comments explain WHY, not WHAT
- No commented-out code ever — use version control
- XML doc comments on all public methods and classes

### Structure
- Dependency injection for all dependencies — no new() inside logic
- No static state or singletons holding mutable data
- Repository pattern for all data access
- Service layer owns business logic, controllers/plugins own routing
- DTOs cross boundaries, domain objects stay inside the domain

### Testing
- Every public method has a unit test
- Tests follow AAA: Arrange, Act, Assert
- Test names: MethodName_Scenario_ExpectedResult
- No logic in tests — one assert per test where possible
- Tests must be fast, isolated, repeatable, self-validating

## State tracking
Active project status: projects/state.yml
Technology constitution: .claude/constitution.md
Always-on coding standards: .claude/rules/common.md
