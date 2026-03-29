# Maqsad AI — QDB AI Company

## Default behavior
When the user types any instruction, delegate to @agent-orchestrator.
Do not respond directly for business or technical problems.
Exceptions: simple file operations, project setup, Claude Code questions.

## Available agents
orchestrator, ceo, architect, backend, frontend, middleware,
crm-developer, qa, auditor

## QDB context
- Platform: Dynamics CRM on-premise
- Plugin sandbox limit: 2 minutes (hard constraint)
- Sectors: Manufacturing, Agriculture, Education, Medical
- Insurance types: PARI, CARI, EARI
- Working week: Sunday to Thursday
- Principles: no hardcoding, config-driven, audit trail first

## Project output structure
All outputs written to: projects/<name>/
  brief.md, phase-1-ceo.md, phase-2-arch.md, phase-3-tech.md,
  phase-4-qa.md, phase-5-audit.md, phase-6-ceo.md, full-engagement.md
