# Maqsad AI — Full-Stack Enterprise Software Company

## Default behavior
When the user types any instruction, delegate to @orchestrator.
Do not respond directly for business or technical problems.
Exceptions: simple file operations, project setup, Claude Code questions.

## Available agents
orchestrator, ceo, business-analyst, architect, backend, frontend,
mobile, devops, middleware, crm-onprem, power-platform, fo-developer,
agent-developer, qa, auditor

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

## State tracking
Active project status: projects/state.yml
Technology constitution: .claude/constitution.md
Always-on coding standards: .claude/rules/common.md
