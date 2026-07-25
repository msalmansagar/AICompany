---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior — before proposing a fix. Find root cause first; symptom fixes are failure.
---

# Systematic Debugging

Adapted from obra/Superpowers for MSS Technologies.

## The Iron Law

```
NO FIX WITHOUT ROOT-CAUSE INVESTIGATION FIRST.
```

If you haven't finished Phase 1, you cannot propose a fix. This holds *especially*
under time pressure, when "one quick fix" looks obvious, or when a previous fix
didn't work — rushing guarantees rework.

## Phase 0 — Check what we already know (MSS-specific, do this first)

Many bugs here have a **documented cause**. Before investigating, grep the memory:

- `.claude/memory/company-knowledge.json` — 26 gotchas with symptoms and causes.
  White page? `GOT-018` (Vite alias). 500 only on-prem? `GOT-015` (query string on
  a web-resource URL). Plugin fix "not working"? `GOT-007` (sandbox served the old
  AppDomain — re-run once). Schema "missing" tables that exist? `GOT-010` (paginated
  EntityDefinitions scan). Writes 404 while reads succeed? `GOT-017` (bad
  impersonation caller). Lookup cells blank? `GOT-009` (`_value` not remapped).
- The `bug-fix` workflow (`.claude/workflows/bug-fix.md`) has the symptom→cause table.

If the symptom matches a known gotcha, you may already be done. If not, continue.

## The Four Phases (complete each before the next)

### Phase 1 — Root-cause investigation
1. **Read the error completely** — stack trace, line, code (e.g. `0x8004420b` = the
   .NET 4.7.1 plugin ceiling, `GOT-005`; `412` = alternate-key collision, `GOT-024`).
   The message often *is* the answer.
2. **Reproduce reliably** — exact steps, every time? If not reproducible, gather more
   data; do not guess.
3. **Check recent changes** — `git diff`, recent commits, new deps, config/env drift.

### Phase 2 — Instrument multi-path systems (the MSS trap)
CRM work has **parallel paths that diverge**, and the bug usually lives in the gap:
- live-metadata path vs the **render cache** path (the `SecurityStripper` drop bug
  passed every test because tests hit live metadata; the runtime reads the cache).
- the **deployed bundle** vs the source (browser serves the old bundle — hard refresh).
- the **plugin sandbox** vs your local build (old AppDomain for ~60s after a PATCH).
- Web API (`_x_value`) vs Org Service SDK (logical names) — `GOT-008`/`GOT-009`.

Instrument each boundary — log what enters and exits each path — run once to see
**where** it breaks, *then* investigate that path. Do not fix the path you assume.

### Phase 3 — Fix the cause, not the symptom
The smallest change that addresses the root cause. If the fix is "make the symptom
go away" while the cause remains, you have not fixed it.

### Phase 4 — Verify (see verification-before-completion)
Prove it on the path the runtime actually uses — for CRM, a **live-org round trip**,
not a green suite. Hard-refresh a bundle; re-run a plugin once. Paste the evidence.

## After a non-obvious fix
If the root cause was surprising, emit a `MEMORY-CANDIDATE` so it becomes a
documented gotcha — the next person greps it in Phase 0 instead of re-paying the cost.
