# Quality Gates

Constitution Article XVI: a rule that nothing can check is a preference, not
a standard.

These gates make the constitution executable. They are **invoked, not
automatic**, and they **modify nothing** — no file is written, no dependency
installed, no configuration changed.

---

## The gates

| Gate | Script | Checks |
|---|---|---|
| Preflight | `gate-preflight.sh` | Staged-file safety, branch, typecheck, lint, tests |
| Security | `gate-security.sh` | Article VII — secrets, injection, code execution, logging |
| Coverage | `gate-coverage.sh` | Article IV — which packages are measurable, and their result |
| Traceability | `traceability-gate.sh` | Article XV — requirement IDs linked to code, tests, commits |
| CRM deploy | `gate-crm-deploy.sh` | Solution packaging rules that have caused real import failures |
| All | `gate-all.sh` | Runs the repo-wide gates and summarises |

```bash
.claude/scripts/gate-all.sh                          # summary, ~45s
.claude/scripts/gate-all.sh --verbose                # full output per gate

.claude/scripts/gate-preflight.sh                    # staged changes only
.claude/scripts/gate-preflight.sh dynamic-form-engine/backend
.claude/scripts/gate-security.sh --staged            # staged source only
.claude/scripts/gate-coverage.sh --run               # actually run coverage suites
.claude/scripts/traceability-gate.sh report-engine   # one project
.claude/scripts/gate-crm-deploy.sh path/to/solution  # directory or .zip
```

---

## SKIP is not PASS

A gate that cannot run on a project reports **SKIP with the reason**. It never
reports PASS by default.

This matters more than it sounds. A gate that passes because it checked
nothing manufactures confidence, which is worse than having no gate — you
stop looking. The coverage gate currently reports `measurable: 4 of 24
packages`, and the twenty SKIPs are the honest finding.

---

## Baseline at adoption (2026-07-24)

| Gate | Result | Detail |
|---|---|---|
| Preflight | PASS | — |
| Security | **FAIL** | 1 critical: `new Function` in `RenderCacheStore.ts:64` |
| Coverage | PASS | but only 4 of 24 packages are measurable |
| Traceability | PASS | 47 of 791 requirement IDs linked (6%) |

Known items, none of them regressions:

- **`RenderCacheStore.ts:64`** — `new Function('m','return import(m)')` loads
  `ioredis` as an optional peer dependency at runtime. The argument is a
  hardcoded literal, and the line already carries an `eslint-disable`. Not
  exploitable, but it is the construct Article VII prohibits and deserves one
  explicit decision. Either bless it (below) or replace it with a static
  conditional import.
- **`designer/deploy/solution/`** — the CRM deploy gate reports this checked-in
  artifact as not importable: no GUID on any type-61 RootComponent, no
  `WebResourceId` entries, no leading slash on `FileName`. It appears to
  predate the dynamic `packageSolution.js` manifest generation. Verify it is
  stale before acting; if it is, delete it rather than fix it.

---

## Blessing a finding

The security gate honours an inline marker:

```typescript
// gate-security:allow — optional peer dep loaded from a hardcoded literal
const mod = await (new Function('m', 'return import(m)')(moduleName));
```

Blessing is deliberate, reviewable in a diff, and attached to the line it
excuses. Weakening a pattern to make a finding disappear is none of those
things — do not do it.

---

## What these gates do not do

They are mechanical checks, not a substitute for the QA phase, the auditor, or
the `security-engineer` agent. In particular they do not:

- confirm RootComponent ids match their `WebResourceId` GUIDs pairwise
- confirm a plugin assembly is the merged, signed 4.7.1 build
- verify anything against a live org
- measure coverage on the twenty packages that have no coverage script

The last item is the largest gap and is deliberate. Closing it means adding a
`test:coverage` script and a coverage provider to each package — a change to
project files, and its own piece of work. Do it per project, on purpose, not
as a side effect of installing a gate.

---

## Turning gates up

All gates are advisory at adoption. Each supports stricter operation once the
work has adapted to it:

| Gate | Stricter mode |
|---|---|
| Traceability | `--strict` exits non-zero when any requirement is unlinked |
| Coverage | `--strict` exits non-zero when any package is unmeasurable |
| Commit messages | `MAQSAD_TRACEABILITY=strict` makes the hook block |

Do not enable these globally before the underlying work is consistently
passing. A gate that blocks work people have not yet adapted to gets bypassed,
and a bypassed gate enforces nothing.
