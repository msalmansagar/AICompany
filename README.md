# MSS Technologies

**An AI-native enterprise software company where 19 specialist Claude Code agents design, build, test, and ship production software — directed by a single CEO.**

MSS Technologies is not a framework, library, or boilerplate. It is a fully operational software company running inside a git repository. The CEO gives a business objective. The Orchestrator routes it through a mandatory 7-phase delivery pipeline. Specialist agents — Business Analyst, Architect, Backend Engineer, Frontend Engineer, CRM Developer, and 12 others — execute those phases across a multi-domain portfolio covering web, mobile, Dynamics CRM, Power Platform, F&O ERP, and AI agents.

The result: **production-ready deliverables governed by a clean-code constitution, enforced quality gates, and a BRD-first process** — where nothing gets designed or built without CEO-approved requirements.

---

## How It Works

```
User instruction
      │
      ▼
┌─────────────┐
│ Orchestrator │  ← entry point for ALL instructions
└──────┬──────┘
       │  enforces mandatory sequence
       ▼
┌──────────────────────────────────────────────────────────┐
│  Phase 1 ── CEO         Business objective + success KPIs │
│  Phase 2 ── BA          BRD (17-section, CEO must approve)│
│  Phase 3 ── Architect   Solution architecture + ADRs      │
│  Phase 4 ── Build       Tech specialists (parallel)       │
│               ├── Backend / Frontend / Middleware         │
│               ├── CRM On-Prem / Power Platform / F&O     │
│               ├── Mobile / AI Agent Developer             │
│               └── DevOps                                 │
│  Phase 5 ── QA          Test strategy + E2E cases         │
│  Phase 6 ── Auditor     Security + governance review      │
│  Phase 7 ── CEO         Final approve / reject / ship     │
└──────────────────────────────────────────────────────────┘
       │
       ▼
 Code Reviewer  ← automatically called after every code-producing agent
```

No phase may be skipped. The BRD is the entry gate. Nothing gets designed or built without an approved BRD.

---

## Agent Roster (19 Specialists)

### Strategy & Requirements
| Agent | Role |
|---|---|
| `ceo` | Business objectives, ROI alignment, phase approvals, final ship/no-ship |
| `ba` | BRD production — 17-section document, CEO approval gate, traceability matrix |
| `orchestrator` | Entry point for all instructions; routes and sequences every phase |

### Design & Architecture
| Agent | Role |
|---|---|
| `architect` | End-to-end solution design, system boundaries, ADRs, integration patterns |
| `ui-ux-designer` | Information architecture, user flows, component specs, accessibility, Arabic/RTL — runs before frontend |

### Implementation
| Agent | Role |
|---|---|
| `backend` | Node.js + TypeScript + Fastify + Prisma APIs |
| `frontend` | Next.js, Power Pages, PCF controls, model-driven forms, Power BI |
| `middleware` | API contracts, message queues, orchestration, service-to-service |
| `crm-onprem` | Dynamics CRM on-premise: C# plugins, entity schema, Org Service SDK |
| `power-platform` | Dataverse cloud: Web API, Power Automate, PAC CLI, Power Pages |
| `fo-developer` | Dynamics 365 F&O: X++ extensions, AOT, LCS, Electronic Reporting |
| `mobile` | React Native + Expo for iOS and Android |
| `agent-developer` | Copilot Studio, Claude API, MCP servers, Azure AI Foundry |
| `devops` | Docker, GitHub Actions, Azure DevOps, CI/CD pipelines |

### Quality & Security
| Agent | Role |
|---|---|
| `github-researcher` | Searches GitHub before any build — adopt over build (1000+ stars threshold) |
| `code-reviewer` | Clean code review on every agent output — non-negotiable |
| `qa` | TDD strategy, test cases, E2E, performance benchmarks |
| `security-engineer` | Threat models, authn/authz, injection, secrets, dependency and licence risk |
| `auditor` | Compliance, governance gaps, data residency, audit trail, regulatory review |

---

## Workflows

Not every instruction needs a BRD. The orchestrator classifies the work first,
then runs the matching workflow.

| Work type | Workflow | Gate |
|---|---|---|
| New product, system, or client engagement | `new-project` | BRD, CEO-approved |
| Capability that changes what the system promises | `new-feature` | BRD, CEO-approved |
| Refinement within the approved contract | `enhancement` | change note |
| Specified behaviour that does not work | `bug-fix` | defect record |
| Shipping approved work to an environment | `release` | CEO ship decision |

The test is **the contract, not the diff size**. Definitions:
[`.claude/workflows/`](.claude/workflows/README.md)

---

## Company Memory

Agents do not start cold. Every agent reads its own experience file and the
shared knowledge base before producing anything:

```
.claude/memory/
├── company-knowledge.json     gotchas, patterns, anti-patterns, environments
├── decision-log.json          decisions with lasting consequence, and why
└── agent-experiences/*.json   per-agent learned patterns and past mistakes
```

Seeded from delivery on regulated-client engagements — solution-packaging rules, plugin
framework targeting, option-set encoding, cache and bundle behaviour. Each
entry was paid for once already. See
[`.claude/memory/memory-system.md`](.claude/memory/memory-system.md).

---

## Verification

No agent may report a task complete without executing a proving command,
reading its real output, and including that output in its completion report.

A green test suite is necessary and **never sufficient** for work that
reaches CRM — the cache path, the security stripper, the deployed bundle and
the live-metadata path all diverge, and each has hidden a defect behind
passing tests. Protocol:
[`.claude/protocols/verification-before-completion.md`](.claude/protocols/verification-before-completion.md)

---

## Service Lines

| Service Line | Technology |
|---|---|
| Backend APIs | Node.js · TypeScript · Fastify · Prisma · PostgreSQL |
| Frontend Web | Next.js · TypeScript · Tailwind CSS · React Query |
| Portal | Power Pages (React/Vue/Astro) · Next.js |
| Mobile | React Native · TypeScript · Expo |
| Dynamics CRM On-Premise | C# · Organization Service SDK · SQL Server |
| Dynamics CRM Cloud | Dataverse Web API · PAC CLI · Power Automate |
| Power Platform | PCF Controls · Code Apps · Model-driven apps · Power BI |
| ERP | Dynamics 365 F&O · X++ · AOT · LCS · Azure DevOps |
| AI Agents | Copilot Studio · Claude API · MCP Servers · Azure AI Foundry |
| Integrations | REST · Service Bus · Event Grid · Middleware orchestration |

---

## Active Projects

| Project | Type | Phase | Stack | Status |
|---|---|---|---|---|
| `email-editor-pcf` | Power Platform | Build | React + TypeScript + PCF + Dataverse Web API | In Progress |
| `crm-js-migration` | CRM On-Premise | Delivered | JavaScript · Dynamics CRM v9.1 · OData v4 | Delivered |
| `demo-unified-design` | Frontend | Build | Next.js · TypeScript · Tailwind | In Progress |

Track live status: [`projects/state.yml`](projects/state.yml)

---

## Technology Defaults

> Deviation from any default requires an Architecture Decision Record (ADR).

```
Backend API     Node.js 20+ · TypeScript strict · Fastify · Prisma · PostgreSQL
Frontend Web    Next.js 14+ · TypeScript · Tailwind CSS · React Query · Zustand
Portal          Power Pages (React/Vue/Astro) — NOT Next.js/Nuxt (unsupported)
Mobile          React Native · TypeScript · Expo
CRM On-Prem     Dynamics CRM · C# · Organization Service SDK · SQL Server
CRM Cloud       Dataverse Web API v9.2 · PAC CLI · TypeScript
ERP             Dynamics 365 F&O · X++ · Azure DevOps · LCS
AI Agents       Copilot Studio / Claude API · MCP · Azure AI Foundry
DevOps          Docker · GitHub Actions / Azure DevOps
Testing         Vitest · Playwright · Supertest
```

---

## Quality Gates

Every engagement passes through 7 phases. Each phase has a named agent and a specific exit condition.

| Gate | Phase | Agent | Exit Condition |
|---|---|---|---|
| G0 | Business Objective | CEO | Success KPIs defined, scope bounded |
| G1 | BRD | BA → CEO approval | All FRs testable, no open ambiguities |
| G2 | Architecture | Architect | ADRs written, no unresolved risks |
| G3 | Build | Tech specialists + Code Reviewer | Code passes clean-code review |
| G4 | QA | QA | 80% coverage, E2E green, edge cases documented |
| G5 | Audit | Auditor | No critical security findings, compliance signed off |
| G6 | Ship | CEO | Final approve/reject/revise decision |

---

## Clean Code Constitution

All agents follow a non-negotiable constitution enforced on every output.

**Naming** — intent-revealing names, no abbreviations, consistent vocabulary.  
**Functions** — one responsibility, 20-line max, 3-parameter max, no boolean flags, CQS.  
**Classes** — SOLID principles, no god classes, composition over inheritance.  
**Error handling** — never swallow exceptions, `Result<T>` over null, fail fast.  
**Comments** — explain WHY not WHAT; no commented-out code; no stale comments.  
**Structure** — DI everywhere, repository pattern, service layer owns logic.  
**Testing** — TDD (Red → Green → Refactor), AAA pattern, 80% coverage minimum.  
**Security** — no `eval()`, no string SQL, no secrets in code, input validated at every boundary.  
**TypeScript** — `strict: true`, no `any`, Zod at all runtime boundaries.  
**DRY** — three-strikes rule; github-researcher checks for existing libraries before building.

Full standards: [`.claude/rules/common.md`](.claude/rules/common.md)

---

## Repository Structure

```
AICompany/
├── CLAUDE.md                        ← company instructions (loaded every session)
├── projects/
│   ├── state.yml                    ← live project status tracker
│   ├── repo-history.md              ← log of every external repo adopted
│   ├── email-editor-pcf/            ← PCF email template editor (React + Dataverse)
│   ├── crm-js-migration/            ← Dynamics CRM JS web resource migration
│   └── demo-unified-design/         ← Next.js design system demo
└── .claude/
    ├── agents/                      ← 17 specialist agent definitions
    │   ├── orchestrator.md
    │   ├── ceo.md
    │   ├── ba.md
    │   ├── architect.md
    │   ├── backend.md
    │   ├── frontend.md
    │   ├── middleware.md
    │   ├── crm-onprem.md
    │   ├── power-platform.md
    │   ├── fo-developer.md
    │   ├── mobile.md
    │   ├── agent-developer.md
    │   ├── devops.md
    │   ├── github-researcher.md
    │   ├── code-reviewer.md
    │   ├── qa.md
    │   └── auditor.md
    ├── skills/
    │   ├── caveman/                 ← 75% token compression skill (38k ★)
    │   └── crm-js-migration/        ← CRM JS migration patterns skill
    ├── rules/
    │   └── common.md                ← always-on coding standards
    ├── constitution.md              ← technology constitution
    ├── hooks/                       ← session start and stop hooks
    └── sessions/                    ← session logs
```

---

## BRD Pipeline

Every new feature or project enters through the BA agent and cannot skip to build.

```
User: "Build a loan calculator"
        │
        ▼
BA asks clarifying questions (max 3 at a time)
        │
        ▼
BA produces 17-section BRD:
  1. Executive Summary       10. Assumptions
  2. Business Objectives     11. Constraints
  3. Stakeholders            12. Risks & Open Questions
  4. Scope (In/Out)          13. Glossary
  5. Functional Requirements 14. Requirements Traceability Matrix
  6. Non-Functional Reqs     15. Approval (CEO pending)
  7. Business Rules          16. Data Requirements
  8. User Stories            17. Integration Dependencies
  9. (reserved)
        │
        ▼
CEO approves / revises / rejects
        │  (only on APPROVED)
        ▼
GitHub Researcher checks for existing libraries
        │
        ▼
Architect designs solution
        │
        ▼
Tech agents build in parallel
        │
        ▼
Code Reviewer checks every output
        │
        ▼
QA writes test strategy
        │
        ▼
Auditor reviews security + compliance
        │
        ▼
CEO final decision: SHIP / HOLD / REVISE
```

---

## Installed Skills

| Skill | Source | Purpose |
|---|---|---|
| `caveman` | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) ★38k | Compresses output ~75% — activate with `/caveman` |
| `crm-js-migration` | Internal | CRM JavaScript migration patterns for Dynamics 365 UCI |

---

## Adopted Open Source Libraries

Full history with stars, license, and rationale: [`projects/repo-history.md`](projects/repo-history.md)

| Library | Stars | License | Used In |
|---|---|---|---|
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | 38,344 | MIT | Claude Code skill — token compression |

---

## CEO Commands

```
"Build [product]"              → full 7-phase pipeline
"Add feature: [description]"  → BA → build → ship
"Fix: [bug description]"       → architect → backend → QA
"Review [project]"             → auditor + code-reviewer
"Status"                       → orchestrator reads state.yml
"Ship [project]"               → CEO gate + devops deployment
```

---

## Inspiration

This company structure was inspired by:

- **[Tamoura/Claude-Code-creates-the-SW-company](https://github.com/Tamoura/Claude-Code-creates-the-SW-company)** — ConnectSW: 18-agent AI software company with spec-kit pipeline, 14 products, 60+ reusable components
- **[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)** — Token compression skill integrated as a Claude Code skill

---

## License

Proprietary — MSS Technologies
