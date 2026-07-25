# {{PROJECT_NAME}}

Scaffolded from `global/templates/project-base` on `{{SCAFFOLD_DATE}}`.

## What this project inherited from `global/`

| Inherited | Where | Source |
|---|---|---|
| Dataverse metadata + lookup services | `src/global/` | `@mss/dataverse-metadata`, `@mss/dataverse-lookup` |
| Look-and-feel design tokens | `src/theme/tokens.ts` | `global/templates/project-base` |
| Strict TypeScript config | `tsconfig.json` | the global baseline |
| A wired Dataverse client example | `src/dataverse.ts` | composition of the two services |

## The inheritance contract

- **Do not re-implement** metadata, lookup, or option-set resolution — use the
  inherited services in `src/global/` (Constitution Article XX).
- The inherited packages are **vendored** (copied), not linked, because projects
  build and deploy independently. `GLOBAL-VERSION` records which revision of
  `global/` they came from.
- When `global/` improves, re-sync with `node global/scripts/scaffold-project.mjs
  --resync {{PROJECT_NAME}}` and the version bumps. `node
  global/scripts/check-global-drift.mjs {{PROJECT_NAME}}` reports when this
  project has fallen behind.
- If an inherited service is missing something, **extend it in `global/`** so
  every project gains it — never fork the vendored copy locally.

## Wiring

`src/dataverse.ts` shows the canonical composition: a Node token provider →
`CrmMetadataService` → `CrmLookupService` (lookup delegates option-sets to
metadata). Supply your own `TokenProvider` (your project's auth) and the two
services are ready.
