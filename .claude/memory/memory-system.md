# MSS Technologies — Agent Memory System

Agents learn from delivery and carry that knowledge forward. Without this,
every subagent starts cold and re-pays for knowledge the company already owns.

## Why this exists

MSS Technologies delivers into a single live client environment across engagements that share one tenant, one Dataverse org, and one set of platform constraints
across twelve projects that share one tenant, one Dataverse org, and one set
of platform constraints. The same class of problem recurs across engagements:
solution packaging rules, plugin framework targeting, option-set encoding,
web-resource caching. Each one cost hours to diagnose the first time.

Knowledge that lives only in a session transcript dies with the session.
Knowledge that lives here is versioned, reviewable in a PR, and — critically —
**read by the agent that needs it, before it starts work**.

## Layout

```
.claude/memory/
├── memory-system.md              # this document
├── company-knowledge.json        # cross-project patterns, gotchas, anti-patterns
├── decision-log.json             # why significant decisions were made
└── agent-experiences/
    ├── <agent-name>.json         # one per agent in .claude/agents/
    └── ...
```

## Read protocol (mandatory)

Every agent reads, before producing any output:

1. `.claude/memory/agent-experiences/<own-name>.json` — its own learned
   patterns, past mistakes, and preferred approaches.
2. `.claude/memory/company-knowledge.json` — the entries whose `domains`
   field includes the agent's domain.
3. The active project's own docs (`projects/<name>/`).

This directive is embedded at the top of every agent definition. It is not
optional and it is not a suggestion.

## Application rules

| `confidence` | What the agent does |
|---|---|
| `high` | Apply automatically. Deviating requires a stated reason in the output. |
| `medium` | Consider and apply if it fits. Document any deviation. |
| `low` | Treat as a hypothesis. Verify before relying on it. |

A `common_mistakes` entry is stronger than a pattern: its `prevention` field
is a hard constraint. An agent that trips a documented mistake has failed the
task, not merely produced a suboptimal result.

## Write protocol

Memory is written **after verified delivery**, never speculatively.

An agent that discovers something durable ends its completion report with:

```
MEMORY-CANDIDATE
  target: company-knowledge.json | agent-experiences/<agent>.json
  type:   pattern | gotcha | anti-pattern | mistake
  entry:  { ... }
```

The orchestrator persists candidates once the work is verified. Nothing is
written from an unverified claim — see
`.claude/protocols/verification-before-completion.md`.

## What belongs here

**Yes** — non-obvious platform behaviour, failure modes with a known
prevention, decisions with lasting consequence, environment facts that scripts
depend on.

**No** — anything the code already states, restatements of the constitution,
project status (that is `projects/state.yml`), or session narration
(that is `.claude/sessions/log.md`).

## Maintenance

- An entry proven wrong is **deleted**, not annotated. Stale memory is worse
  than no memory, because agents trust it.
- `times_applied` and `success_rate` are updated when an entry is actually used.
- Entries carry a `source` naming the project and date that produced them, so
  a reader can judge whether the entry still applies.
- Secrets never appear here. Reference the `.env` variable name, never a value.

## Relationship to `projects/state.yml`

`state.yml` answers *"where is this engagement?"* — phase, approvals, blockers.
Memory answers *"what have we learned?"* — durable across all engagements.
They are separate files because they have different lifetimes: state is
overwritten every phase; memory only grows.
