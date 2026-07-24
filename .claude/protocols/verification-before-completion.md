# Verification Before Completion

**Status: mandatory for every agent, on every task.**

This is not a milestone gate. It runs at each individual task, before any
agent reports that anything is done.

---

## The problem this exists to solve

MSS Technologies has repeatedly produced work that was reported complete, passed its
test suite, and did not work in the live environment:

- `SecurityStripper.Strip` dropped `Design` and the scoped tab and section
  buttons. Every test passed. The feature was invisible in CRM for weeks
  because the tests exercised the live-metadata path while the runtime reads
  the cache.
- `FindActiveCache` matched the published version exactly, so the documented
  "version 0 means latest" contract never matched and **every** form load
  failed — after the change was reported complete.
- A designer bundle was reported deployed while the browser served the
  previous cached bundle, so the verification result described old code.
- A plugin fix was judged not to work because the sandbox served the previous
  AppDomain on the first invocation after deployment.

Each of these was reported as done by an agent that had genuine reasons to
believe it. The failure is not dishonesty. It is **predicting** an outcome
instead of **observing** one.

---

## The five steps

Before marking any task complete, every agent performs all five, in order:

1. **Identify** — name the command, query, or interaction that would prove
   this works. Decide this before running anything, so the bar is not moved
   afterwards.
2. **Execute** — run it. Do not reason about what it would return.
3. **Read** — read the actual output in full. Not the exit code alone, not a
   skim of the first lines.
4. **Compare** — check the output against the task's acceptance criteria,
   item by item.
5. **Claim** — report completion **with the output included**.

A completion report missing any of the five is not a completion report.

---

## Completion report format

Every agent ends a task with this block:

```
VERIFICATION
  criterion:  <the acceptance criterion being proven>
  command:    <exact command or interaction run>
  output:     <actual output, trimmed to the relevant lines — not paraphrased>
  result:     PASS | FAIL | PARTIAL
  unverified: <anything claimed but not proven, or "none">
```

The `unverified` field is required and may not be omitted. Work that could
not be verified is reported as unverified — that is an acceptable outcome.
Silently presenting it as verified is not.

---

## What counts as evidence

| Kind of work | Acceptable evidence |
|---|---|
| Backend logic | Test run output; a real request and its response body |
| Dataverse or CRM change | A live round trip — write a record, read it back through the path the runtime actually uses, then clean up |
| Plugin change | Deploy, wait 30–60s, **re-run once**, then read the resulting record or cache entry |
| Web resource or bundle | Republish, **hard refresh (Ctrl+F5)**, then observe the rendered result |
| Frontend behaviour | Browser interaction driven by element ref, with page text or a screenshot of the result |
| Schema | Direct `EntityDefinitions(LogicalName='x')` lookups — never a filtered scan, which is silently paginated |
| Documentation | Not applicable — documentation tasks state `result: N/A` and skip to `unverified` |

**A green test suite is necessary and never sufficient for anything that
reaches CRM.** See `PAT-002` and `ANTI-002` in
`.claude/memory/company-knowledge.json`.

---

## Anti-rationalisation

These are the sentences that precede a false completion claim. Each one is a
signal to stop and run the command instead.

| The thought | What it actually means |
|---|---|
| "This is a trivial change, it obviously works." | The Vite alias was one line. It blanked the entire bundle for days. |
| "The tests pass, so it works." | The SecurityStripper bug passed every test for weeks. |
| "It worked when I did the same thing on the other project." | Section GUIDs, option-set codes and solution layers differ per org. |
| "The build succeeded." | A build proves compilation, not behaviour. |
| "I'll verify it in the next step." | The next step inherits the unverified assumption and compounds it. |
| "The user can check it." | Verification is the agent's job. Handing an unverified claim to the user transfers the cost without the context. |
| "It's probably the environment." | Probably is not a verification result. Determine which. |

If a verification cannot be run — no credentials, an org gate, an environment
that is not up — the agent reports `result: BLOCKED`, names precisely what is
missing, and **does not** report the task complete.

---

## Enforcement

- **Every agent definition** carries this directive in its opening section.
- **`code-reviewer`** rejects any handoff whose completion report lacks a
  `VERIFICATION` block or whose `output` field is paraphrased rather than
  actual.
- **`qa`** treats an unverified claim as a defect against the agent that made
  it, and numbers it like any other defect.
- **`orchestrator`** does not advance a phase on an unverified completion, and
  does not write a `MEMORY-CANDIDATE` from one.
- **`ceo`** may issue APPROVED WITH CONDITIONS over unverified items only when
  each is named as a numbered blocker in `projects/state.yml`.

---

## Relationship to the constitution

This protocol implements Article VIII (CEO checkpoints) at task granularity,
and is the mechanism behind Article IV's claim that tests are run rather than
assumed. Where this protocol and an agent's own instinct to move fast
conflict, this protocol wins.
