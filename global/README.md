# MSS Technologies — Global Shared Library

The canonical, client-agnostic building blocks every project inherits instead
of re-implementing. Created because an audit found the twelve projects share
**nothing**: five separate Dataverse metadata services, multiple lookup
services, and the provision-schema framework copy-pasted three times.

This directory is the single source of truth for those cross-cutting concerns.
A new project does not write its own metadata or lookup service — it inherits
the one here.

---

## What lives here

```
global/
├── packages/
│   ├── dataverse-metadata/   entity schema + field metadata extraction (TS)
│   ├── dataverse-lookup/     lookup + option-set resolution (TS)
│   ├── dataverse-dotnet/     Mss.Dataverse — metadata for the .NET runtime (C#)
│   └── ui-theme/             look-and-feel tokens (the shared visual baseline)
├── templates/
│   └── project-base/         the scaffold a new project is generated from
└── README.md                 this file
```

## The three-runtime rule (non-negotiable)

Dataverse is reached from three runtimes. A browser cannot hold a client secret,
and .NET is a different language — none can share one client:

| Runtime | Auth | Used by |
|---|---|---|
| **Node / server** (TS) | client-credentials → bearer token | backend APIs, provisioning scripts |
| **Browser / web resource** (TS) | `Xrm.WebApi` session, or a dev proxy | designers, in-CRM runtimes, portals |
| **.NET / C#** | client-credentials (middle-tier) or Org Service SDK (plugins) | report-engine middle-tier, CRM plugins |

Each shared concern ships a runtime-agnostic **contract** plus an implementation
per runtime it serves. The TS packages carry `node/` (and, in time, `browser/`);
the .NET runtime has its own canonical, `packages/dataverse-dotnet`
(`Mss.Dataverse`), a C# sibling of `dataverse-metadata`. A project depends on
the contract and picks the implementation for its runtime.

## How a project inherits (no monorepo)

Projects build and deploy independently — there is no root workspace. Inheritance
is by **scaffold, then track upstream**, not by a live package link:

1. **Scaffold** — a new project is generated from `templates/project-base/`,
   which wires in the shared packages and the look-and-feel baseline. The project
   starts with the canonical services already in place.
2. **Reference** — the shared packages are copied in under a stable path
   (`src/global/`), carrying a `GLOBAL-VERSION` marker recording which revision
   of `global/` they came from.
3. **Update** — when `global/` improves, a project re-syncs the packages and
   bumps its `GLOBAL-VERSION`. A drift check (see `templates/project-base/`)
   reports when a project's copy has fallen behind.

This gives inheritance without the monorepo/deploy-script rewrite that
independent projects can't absorb — the trade-off recorded in
`.claude/architecture/component-reuse-plan.md`.

## The rule for new work (Constitution Article XX)

Before building anything metadata-, lookup-, schema-provisioning-, or
theme-shaped, a project uses the `global/` package. Building a fifth copy of a
service that already lives here is a review rejection, not a choice. If the
shared package is missing something, the fix is to extend it here — so every
project gets the improvement — not to fork it locally.

## Migration status

The canonical packages are the starting source of truth, adapted from the most
mature existing implementation (DFE's metadata and lookup services). Existing
projects are migrated onto them **one at a time, with a live-org reverify each**
— never in a big bang, because these touch a deployed bank system. Track per
project in `.claude/COMPONENT-REGISTRY.md`.

| Concern | Canonical source | Duplicates to retire |
|---|---|---|
| metadata | DFE `CrmMetadataService` | EDP, email-editor-pcf, CWFD, report-engine |
| lookup | DFE `CrmLookupService` + `ApiLookupService` | LookupConfigService, optionsApi |
| provisioning | dxp-p1-001 `provision-schema` | dxp-p1-003, portal-shell |
