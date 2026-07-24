# Traceability

Every implementation artifact traces back to a requirement. Every requirement
traces forward to the code and tests that satisfy it.

For a bank client under PDPPL this is not process decoration. "Prove FR-014
is implemented and tested" is a question an auditor will ask, and the answer
should be a command, not an afternoon.

---

## Current state

At adoption (2026-07-24) the repository defined **791 requirement IDs across
11 projects**, of which **47 were linked** to code, tests, or commits — 6%.

That number is not a failure. The BA and architect have been writing IDs
correctly for months; nothing downstream was carrying them. This protocol
connects the two ends. The gap closes going forward, not by retrofitting.

Run `.claude/scripts/traceability-gate.sh` for the current figure.

---

## ID conventions

Requirement IDs are minted in the BRD and never renumbered — a shipped ID is
permanent, because commits and tests already reference it.

| Prefix | Meaning | Example |
|---|---|---|
| `FR-nnn` | Functional requirement | `FR-014` |
| `NFR-nnn` | Non-functional requirement | `NFR-003` |
| `US-nn` | User story | `US-07` |
| `AC-n` | Acceptance criterion, scoped to its story | `US-07 / AC-2` |

Related identifiers already in use, and equally valid as commit references:

| Prefix | Meaning |
|---|---|
| `ADR-nnn` | Architecture decision record |
| `DEF-nnn` | Defect found in QA |
| `SEC-nnn` | Security finding |
| `GL-nn`, `B-n`, `C-nnn` | Go-live blockers and CEO conditions |

Zero-pad to a consistent width per project. The current scan shows both
`FR-01` and `FR-010` in one project — that inconsistency makes IDs unmatchable
and is worth fixing when that document is next edited.

---

## Where IDs must appear

Forward-looking. Existing artifacts are **not** retrofitted.

### 1. BRD — the source of truth
Every functional and non-functional requirement carries an ID. Every user
story carries an ID and numbered acceptance criteria. Already standard
practice; keep it.

### 2. Commit subjects
```
feat(forms): add language-aware lookup filter [FR-014]
fix(report-engine): correct option-set code mapping [DEF-031]
feat(auth): enforce guard on catalog route [B1][SEC-004]
```
Exempt types, which legitimately implement no requirement:
`docs`, `chore`, `ci`, `style`, `build`, `test`, `refactor`, and merges,
reverts, fixups and squashes.

Reminded by `.githooks/commit-msg`. **Warn-only — it never blocks a commit.**

### 3. Test names
```typescript
it('[FR-014] resolves lookup options in the active language', async () => {
```
```csharp
[Fact(DisplayName = "[FR-022] SecurityStripper preserves scoped buttons")]
```
New tests only. Do not rewrite existing test names — the churn would touch
hundreds of files across twelve projects and prove nothing.

### 4. Code headers, on entry points only
```typescript
// Implements: FR-014 — language-aware lookup resolution
export async function resolveLookupOptions(...) {
```
Route handlers, plugin `Execute` methods, page components, and public service
methods. Not every function — a header on a private helper is noise, and this
protocol does not licence comment spam. Constitution rules on comments still
apply: explain why, never what.

### 5. PR descriptions
```markdown
## Implements
- [FR-014] Language-aware lookup filtering
- [NFR-003] Response under 400ms at p95
```

---

## The gate

```bash
.claude/scripts/traceability-gate.sh                 # all projects
.claude/scripts/traceability-gate.sh report-engine   # one project
.claude/scripts/traceability-gate.sh --strict        # non-zero exit on gaps
```

Read-only. It modifies nothing and, without `--strict`, always exits 0.

For each project it reports how many defined IDs are referenced by code,
tests, or commits, and lists the ones that are not.

**An unlinked ID is a question, not a defect.** It may be deferred, out of
scope, satisfied by configuration rather than code, or genuinely forgotten.
The gate cannot tell which — it surfaces the question. Answering it is the
CEO's call at the phase gate, and "deferred, tracked as GL-02" is a complete
and acceptable answer.

Run it before a CEO checkpoint and state the number.

---

## Enforcement

Warn-only by design, everywhere, at adoption.

| Point | Behaviour |
|---|---|
| `.githooks/commit-msg` | Prints a reminder. Always exits 0. |
| `traceability-gate.sh` | Reports. Exits 0 unless `--strict`. |
| `ba` | Mints IDs in the BRD. Already standard. |
| `qa` | Names new tests with the ID they prove. |
| `code-reviewer` | Flags a new entry point with no `Implements` header as an observation, not a rejection. |
| `ceo` | May ask for the traceability figure at a phase gate. |

### Turning it up later

The commit hook blocks when `MAQSAD_TRACEABILITY=strict` is set in the
environment. Do not set it globally until new commits are consistently
carrying IDs — a hook that blocks work people have not yet adapted to gets
bypassed, and a bypassed hook enforces nothing.

The gate blocks when invoked with `--strict`. Reasonable per-project once
that project reaches a coverage figure worth defending.

---

## Installing the hook

```bash
git config core.hooksPath .githooks
```

Local to this clone; `.git/hooks` is currently empty so nothing is displaced.
To remove: `git config --unset core.hooksPath`.
