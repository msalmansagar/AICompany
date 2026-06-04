---
description: "Scaffold a new Architecture Decision Record for the active project"
allowed-tools: Read, Write
---

Create a new ADR titled: $ARGUMENTS

1. Read projects/state.yml to find the active (in_progress) project name.
2. Check projects/<project>/adrs/ for existing ADRs to determine the next number.
   If the directory does not exist, this is ADR-01.
3. Create the file projects/<project>/adrs/ADR-<NN>-<slugified-title>.md:

---
# ADR-NN: $ARGUMENTS

**Date**: [today]
**Status**: Proposed
**Deciders**: architect, ceo
**Supersedes**: N/A

## Context
What is the situation or problem that requires a decision?

## Decision
What is the specific decision being made?

## Consequences

**Positive:**
-

**Negative:**
-

**Neutral:**
-

## Alternatives Considered
| Option | Reason not chosen |
|--------|------------------|
|        |                  |
---

4. Update (or create) projects/<project>/adrs/index.md — add a row:
   | ADR-NN | $ARGUMENTS | Proposed | [today] | architect |

5. Confirm: "ADR-NN created at projects/<project>/adrs/ADR-NN-<slug>.md"
