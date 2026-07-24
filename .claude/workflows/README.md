# Maqsad AI — Workflow Selection

The orchestrator classifies every instruction into exactly one workflow before
delegating anything. Running a full seven-phase engagement for a one-line fix
is waste; skipping the BRD on a genuine new feature is how scope arrives
undocumented at the audit gate.

Previously there was one pipeline for everything, which meant small work
either carried ceremony it did not need or quietly bypassed the process
entirely. These workflows make the fast paths **official and bounded** rather
than undocumented exceptions.

---

## Choosing

| If the instruction… | Workflow | Gate |
|---|---|---|
| starts a new product, system or client engagement | [new-project.md](new-project.md) | BRD, CEO-approved |
| adds capability that changes the contract — new entity, endpoint, screen, or user-visible behaviour | [new-feature.md](new-feature.md) | BRD, CEO-approved |
| refines something that already exists, within its approved contract | [enhancement.md](enhancement.md) | Change note, no BRD |
| repairs behaviour that is already specified and does not work | [bug-fix.md](bug-fix.md) | Defect record, no BRD |
| ships approved work to an environment | [release.md](release.md) | CEO ship decision |

If the classification is genuinely unclear, **ask the user**. Do not default
to the cheapest path.

---

## The rule that does not bend

The distinction is **the contract**, not the size of the diff.

- Changes what the system promises → BRD. Even if it is ten lines.
- Delivers what was already promised → no BRD. Even if it is a thousand.

A one-field addition that a user can see and depend on is a feature.
A large internal refactor that changes nothing observable is an enhancement.

## What never bends, in any workflow

1. `.claude/protocols/verification-before-completion.md` — every task, every
   workflow, no exceptions.
2. `code-reviewer` runs after every code-producing agent.
3. Constitution Articles V (no hardcoding), VI (audit trail), VII (security),
   IX (git safety) apply everywhere.
4. `projects/state.yml` is updated at the end of every workflow.
5. Live-org schema provisioning requires an explicit user go-ahead, every time.
6. Every agent reads its memory before starting — see
   `.claude/memory/memory-system.md`.

## Escalation

A workflow escalates upward the moment its assumption breaks, and the
orchestrator says so plainly rather than continuing on the cheaper path:

```
bug-fix → enhancement    the fix requires changing agreed behaviour
enhancement → new-feature the change alters the contract or adds surface
new-feature → new-project the work needs its own architecture and lifecycle
```

Escalation is never silent. State the reason, then re-enter at the correct
gate.
