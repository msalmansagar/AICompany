# GITHUB RESEARCH REPORT
## Feature: DXP-P1-001 — Component Registry
**Date:** 2026-06-17
**Researcher:** github-researcher agent

---

## Queries Run

### Search 1 — Zod to JSON Schema
1. `site:github.com zod-to-json-schema stars:>1000`
2. `site:github.com zod json schema converter typescript stars:>500`
3. `zod-to-json-schema npm version 3.23 zod v3 compatibility 2026`

### Search 2 — Component / Plugin Registry Pattern
1. `site:github.com typescript component registry`
2. `site:github.com typescript plugin registry component registry stars:>1000`

### Search 3 — JSON Schema Validation
1. `site:github.com ajv json schema validator typescript stars:>1000`
2. `ajv npm version 8 latest json schema draft-07 ESM node typescript 2025`

---

## SEARCH 1 — ZOD TO JSON SCHEMA

### Repo 1: StefanTerdell/zod-to-json-schema
- **URL:** https://github.com/StefanTerdell/zod-to-json-schema
- **Stars:** ~1,200 (1.2k)
- **Last commit:** February 10, 2026 (v3.20.3 release)
- **License:** ISC (functionally equivalent to MIT — permissive, no GPL risk)
- **npm package:** `zod-to-json-schema`
- **Latest stable version:** 3.20.3
- **Zod v3 compatibility:** Full. The library's major.minor versioning tracks Zod's versioning. v3.x series is explicitly for Zod v3 schemas.
- **Maintenance status:** Entering soft end-of-life. The maintainer announced no further active development as of November 2025, citing Zod v4's native JSON Schema support as the successor path. v3.20.3 was published February 2026 as what appears to be a final patch release.
- **Handles optional fields:** Yes
- **Handles union types:** Yes
- **Handles discriminated unions:** Yes
- **Handles enum fields:** Yes
- **Handles default values:** Yes (via `default` keyword in output schema)
- **Fit assessment:** Directly solves FR-069. The library serialises any `ZodType` instance to a JSON Schema object. Widely adopted across the ecosystem (used by tRPC, Vercel AI SDK, and others). The ISC license is fully permissive.
- **Blocking issues:** Soft end-of-life. No active bug fixes planned. However, for a Zod v3 codebase this is not a practical blocker — the library is feature-complete for v3 and the final release is stable. The portal-shell uses `zod@^3.24.0`, which is within the supported peer dependency range.

### Repo 2: Zod v4 native `.toJSONSchema()`
- **URL:** https://zod.dev/json-schema
- **Relevance:** Zod v4 ships a built-in `.toJSONSchema()` method. This is the long-term successor to the library above.
- **Blocking issue for us:** Portal-shell is pinned to `zod@^3.24.0`. Zod v4 is a breaking change (new import paths, API changes). Migrating to v4 solely to get native JSON Schema output is out of scope for DXP-P1-001.
- **Fit assessment:** Not adoptable now. Relevant for a future Zod v4 upgrade.

### Repo 3: transitive-bullshit/openai-zod-to-json-schema
- **URL:** https://github.com/transitive-bullshit/openai-zod-to-json-schema
- **Stars:** Low (< 200)
- **Fit assessment:** Purpose-built for OpenAI structured output compatibility (strips unsupported keywords). Not a general-purpose Zod-to-JSON-Schema solution. Does not qualify.

**VERDICT: ADOPT**

**Recommendation:** Adopt `zod-to-json-schema@^3.20.3`. It is the canonical, battle-tested solution for Zod v3. ISC license carries no legal risk. Soft end-of-life is not a practical concern — the library is feature-complete for the v3 schema types used in the widget registry. No build-from-scratch is warranted.

---

## SEARCH 2 — COMPONENT / PLUGIN REGISTRY PATTERN

### Findings
No TypeScript library with 1000+ stars was found that implements a named component/plugin registry with typed definition objects, category filtering, and version tracking at the level of specificity required.

Results returned were:
- **typings/registry** — A registry of `.d.ts` type definition files. Not a runtime registry. Irrelevant.
- **OpenComponents (oc)** — A full serverless micro-frontend delivery platform (1.5k stars). Architecturally too heavy. Requires a separate OC registry server. Not adoptable as a library drop-in.
- **devnet-io/react-registry** — A React component registration helper. Low stars (< 100). Not suitable.
- **luiz-c/typescript-service-registry** — A service locator implementation. Low stars, inactive.

The existing `widget-registry` in portal-shell already provides the in-memory registration pattern (`registerWidget()`). The adapter layer (FR-069) only needs to bridge that existing registry to the Dataverse API on first load and on registration — no external registry library adds value here.

**VERDICT: SKIP**

**Recommendation:** Use the existing in-memory `widget-registry`. No external component registry library qualifies or adds value. The adapter code (FR-069) is bespoke glue and should be built to specification.

---

## SEARCH 3 — JSON SCHEMA VALIDATION LIBRARY

### Repo 1: ajv-validator/ajv
- **URL:** https://github.com/ajv-validator/ajv
- **Stars:** 14,715
- **Last commit:** Active in 2025-2026. Security fix for CVE-2025-69873 confirms ongoing maintenance.
- **License:** MIT
- **npm package:** `ajv`
- **Latest stable version:** 8.x (v8 is the current major; v6 is legacy/LTS for draft-04 only)
- **TypeScript support:** Full. Ships its own TypeScript types. Provides `JSONSchemaType<T>` utility for schema-to-type alignment.
- **ESM/CJS compatibility:** Supports both. ESM import via `import Ajv from "ajv"` and CJS via `require("ajv")`. Compatible with Node.js + TypeScript ESM projects.
- **JSON Schema draft support:** draft-04, draft-06, draft-07, draft-2019-09, draft-2020-12, and JSON Type Definition (RFC8927). For our use case (validating that `props_schema` submitted to `POST /versions` is a valid JSON Schema), draft-07 is the natural target — `zod-to-json-schema` outputs draft-07 by default.
- **On-premise fit:** Fully on-premise. No cloud dependency.
- **Open issues:** High count but proportionate to 14k-star project. Core stability is not in question.
- **Fit assessment:** Exactly the right tool for validating that an inbound `props_schema` string is syntactically valid JSON Schema before storing it in Dataverse. AJV compiles a meta-schema validator in milliseconds. This is a one-liner integration at the Fastify route boundary.
- **Blocking issues:** None. MIT license. Actively maintained. Fastify itself uses AJV internally for route schema validation (it is the default Fastify validator), so the dependency is almost certainly already in the dependency tree.

### Repo 2: @cfworker/json-schema
- **URL:** https://github.com/cfworker/cfworker (sub-package)
- **Stars:** ~600
- **Fit assessment:** Does not meet the 1000+ star threshold. AJV is the clear leader. Not evaluated further.

**VERDICT: ADOPT**

**Recommendation:** Adopt `ajv@^8` for JSON Schema meta-validation at the `POST /versions` API boundary. Note that Fastify already bundles AJV as its default schema compiler, so `ajv` is almost certainly a zero-cost transitive dependency in the backend. Confirm with `npm ls ajv` in the backend package before adding an explicit dependency — it may already be available.

---

## ADOPTION DECISIONS

| Concern | Library | npm Package | Version | Verdict | License |
|---|---|---|---|---|---|
| Zod → JSON Schema serialisation (FR-069) | zod-to-json-schema | `zod-to-json-schema` | `^3.20.3` | ADOPT | ISC |
| JSON Schema validation at API boundary | AJV | `ajv` | `^8.17.1` | ADOPT | MIT |
| Component / plugin registry pattern | — | n/a | n/a | SKIP | — |

### Integration notes

**zod-to-json-schema** (FR-069 widget-registry adapter):
```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

const propsSchema = z.object({ title: z.string(), count: z.number().optional() });
const jsonSchema = zodToJsonSchema(propsSchema, { target: "jsonSchema7" });
const propsSchemaString = JSON.stringify(jsonSchema);
// Store propsSchemaString in qdb_props_schema (Dataverse multiline text field)
```

**ajv** (POST /versions route boundary validation):
```typescript
import Ajv from "ajv";

const ajv = new Ajv({ strict: false });

function assertIsValidJsonSchema(candidate: unknown): void {
  const isValid = ajv.validateSchema(candidate as object);
  if (!isValid) {
    throw new ValidationError("props_schema is not valid JSON Schema", ajv.errors);
  }
}
```

### License risk summary
- **ISC** (zod-to-json-schema): Permissive. Functionally equivalent to MIT. No attribution requirement beyond keeping the license file. Zero risk.
- **MIT** (ajv): Permissive. Standard enterprise-safe license. Zero risk.

### Suggested next steps for implementing agents
1. Backend agent: add `ajv@^8` to `dependencies` in the backend package. Confirm whether it is already a transitive dep via `npm ls ajv` first.
2. Middleware/frontend agent (FR-069 adapter): add `zod-to-json-schema@^3.20.3` to `dependencies` of the widget-registry adapter package (or `apps/web` if colocated). Use `zodToJsonSchema(schema, { target: "jsonSchema7" })` — do not use default target as it may produce draft-2020-12 output which is stricter than needed.
3. Document both adoptions in `projects/dxp-p1-001/dependencies.md` with repo URLs, versions, and this rationale per the Maqsad AI dependency adoption standard.
