# Maqsad AI — Full-Stack Enterprise Software Company

## Default behavior
When the user types any instruction, delegate to @orchestrator.
Do not respond directly for business or technical problems.
Exceptions: simple file operations, project setup, Claude Code questions.

## Available agents
orchestrator, ceo, business-analyst, architect, backend, frontend,
mobile, devops, middleware, crm-developer, qa, auditor

## Engagement modes
- Full E2E enterprise software (web + mobile + backend + integrations)
- Dynamics CRM on-premise implementations
- Backend APIs and services
- Frontend web applications
- Mobile applications
- System integrations and middleware
- Governance and compliance reviews

## Technology defaults (deviation requires ADR)
- Backend API: Node.js + TypeScript + Fastify + Prisma
- Frontend web: Next.js + TypeScript + Tailwind CSS
- Mobile: React Native + TypeScript + Expo
- Database: PostgreSQL (cloud) / SQL Server (on-premise)
- CRM: Dynamics CRM on-premise, C#, Organization Service SDK
- DevOps: Docker + GitHub Actions
- Testing: Vitest + Playwright + Supertest

## QDB context
- Platform: Dynamics CRM on-premise
- Plugin sandbox limit: 2 minutes (hard constraint)
- Sectors: Manufacturing, Agriculture, Education, Medical
- Insurance types: PARI, CARI, EARI
- Working week: Sunday to Thursday
- Principles: no hardcoding, config-driven, audit trail first

## Project output structure
All outputs written to: projects/<name>/
  brief.md, phase-1-ceo.md, phase-2-ba.md, phase-3-arch.md,
  phase-4-tech.md, phase-5-qa.md, phase-6-audit.md,
  phase-7-ceo.md, full-engagement.md

## State tracking
Active project status: projects/state.yml
Technology constitution: .claude/constitution.md
