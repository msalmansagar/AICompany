# Workflow — Bug Fix

Behaviour that is already specified and does not work.

**Entry gate:** a defect record. No BRD.
**Output:** appended to the parent engagement's documents.

---

## Steps

1. **Reproduce** — before any diagnosis. Record the exact input and the
   observed wrong output. A bug that cannot be reproduced is investigated,
   not fixed.
2. **Record** — number the defect (`DEF-nnn`) with: symptom, reproduction,
   expected behaviour, and the requirement it violates.
3. **Failing test first** — write the test that fails for this defect.
   Red before green, per Constitution Article IV.
4. **Diagnose** — root cause, not symptom. Check
   `.claude/memory/company-knowledge.json` first: many recurring CRM
   symptoms are already documented with their cause.
5. **Fix** — the smallest change that makes the failing test pass.
6. **Review** — `code-reviewer`, always.
7. **Verify** — `VERIFICATION` block. For CRM work this means a live-org
   round trip, not a green suite.
8. **Record the lesson** — if the root cause was non-obvious, emit a
   `MEMORY-CANDIDATE`. Bugs that took hours to find are exactly what
   `company-knowledge.json` exists to hold.

No BA phase. No architecture phase. No CEO gate.

---

## Check memory before diagnosing

These symptoms already have documented causes. Reading them first has a real
chance of ending the investigation immediately:

| Symptom | Entry |
|---|---|
| White page, bundle downloads but never runs | `GOT-018` — missing Vite alias |
| Works on cloud, 500s on-premise | `GOT-015` — query string on a web-resource URL |
| Lookup grid cells blank | `GOT-009` — `_<attr>_value` not remapped |
| Plugin fix appears not to work | `GOT-007` — sandbox served the old AppDomain |
| Schema check says tables are missing that exist | `GOT-010` — paginated EntityDefinitions scan |
| Writes 404 while reads succeed | `GOT-017` — invalid impersonation caller id |
| Option-set values map to wrong labels | `GOT-011` — codes are 100000000-based |
| Republished bundle shows old behaviour | `GOT-016` — browser cache, hard refresh |

## Do not

- Fix a symptom to close a ticket while the cause remains.
- Widen the fix into surrounding cleanup — that is a separate enhancement.
- Skip the failing test because the fix "obviously works". Every entry in the
  table above was obvious to someone.

## Escalation

If the correct fix requires changing agreed behaviour, this is no longer a
bug fix. Stop, say so, and escalate to `enhancement.md` or `new-feature.md`
depending on whether the contract changes.
