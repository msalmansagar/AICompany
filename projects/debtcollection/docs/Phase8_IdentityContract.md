# Phase 8 — the idempotency contract, and why `rulesetVersion` is not part of it

**Analysed before freezing, 2026-09-21.** WP4.

The WP3 draft identity was:

```
uuidv5( caseId | episodeNumber | strategyActionId | rulesetVersion )
```

That is wrong, and the fault is exactly the one the authorisation names: **republishing
configuration would duplicate work**. A ruleset version is not a property of the work an officer has
to do — it is a property of the decision that asked for it. Bundling the two means every
configuration publish mid-episode raises a second copy of every outstanding action, with no business
event behind it.

## The contract

```
work identity      = uuidv5( caseId | episodeNumber | strategyActionId )
evaluation evidence = strategy, action, ruleset version, episode, decided-at, resulting activity
```

**Identity answers "what work is intended".** Evidence answers **"why, and under which rules"**.
They are recorded in different places precisely so a change to one cannot manufacture the other.

`EvaluationContext.rulesetVersion` is retained and still travels with every evaluation — it is
simply not hashed. It is written to the trace, where an auditor can read it.

---

## The ten scenarios, against the contract

| # | Scenario | Behaviour | Why that is right |
|---|---|---|---|
| 1 | Same case + episode + action + same ruleset | **Same id** | The intent is the same, so it is the same work |
| 2 | Concurrent evaluation | **One activity** | Both workers derive the same id; the platform accepts one create and refuses the other with `412` |
| 3 | Retry after an uncertain Create | **No duplicate** | The id is already taken; `created: false` is success, not an error |
| 4 | DPD/bucket changed, action still applicable | **Existing work remains authoritative** | The action was already raised for this episode. Raising it again because a number moved would flood the officer with copies of work they already hold |
| 5 | Ruleset republished, action semantically unchanged | **No duplicate** | The fix. Version is no longer in the identity |
| 6 | A strategy action's configuration materially changes and genuinely needs new work | **A new action record is the representation** | Editing an action changes *how* that action is described; it does not create a second obligation on a case that already has its work. Where QDB genuinely intends new work, the modelling act is a **new `qdb_strategyaction`** — which yields a new id for free. Stated as a contract rather than inferred silently |
| 7 | Completed action becomes applicable again, same episode | **Not regenerated — and this is a policy question, not a technical one.** See KI-98 | |
| 8 | Cancelled action, then re-evaluation | **Not regenerated.** See KI-98 | A cancelled activity is an officer's decision. Silently re-creating it overrides a human judgement with a scheduler |
| 9 | Strategy A → B, both holding actions of the same Activity Type | **Distinct** | Different action ids give different work ids, and the provenance lookup keeps them distinguishable afterwards. This is the defect KI-71 existed for |
| 10 | A → B → A within one episode | **Deterministic, no regeneration** | Returning to A reaches A's original ids, which are taken. Nothing is created and nothing is duplicated |

### What was deliberately not done

Timestamps and random ids would "solve" 7 and 8 by destroying idempotency — every evaluation would
mint new work and scenarios 1–5 would all regress. An evaluation counter in the id has the same
effect one step removed. Neither is used.

---

## KI-98 — a policy question, isolated

Scenarios 7 and 8 are not technical. They ask **whether a completed or cancelled strategy action may
be raised again within the same delinquency episode**, and the answer changes what officers see:

- a reminder call completed on day 3 — should the same configured action produce a second call on
  day 30 of the same episode, or is that a *different* action in configuration?
- a cancelled field visit — does re-evaluation reinstate it, or did the officer's cancellation settle
  the matter for this episode?

Both readings are defensible and they differ materially. **Phase 8 does not regenerate**, which is
the conservative direction: it neither duplicates work nor overrides an officer's decision, and it
is the one that can be relaxed later without having already produced records nobody asked for.

**Only that behaviour is held.** Everything else in WP4 proceeds.

---

## The evaluation trace — no new entity

§23 of the authorisation forbids a second generic log, and discovery confirms none is needed:

| Trace question | Answered by | Status |
|---|---|---|
| Which strategy was evaluated? | activity → `qdb_strategyactionid` → action → `qdb_strategyid` | already available |
| Which Strategy Action applied? | `qdb_collectionactivity.qdb_strategyactionid` | provisioned in WP2 |
| Which episode was evaluated? | `qdb_collectioncase.qdb_episodenumber` | already available, and part of the identity |
| Which Collection Activity resulted? | the activity itself | already available |
| **Which ruleset/version produced the decision?** | **not on any record** | written to `qdb_crmlogs` |

Only the last was missing, and `qdb_crmlogs` is the approved technical/integration log DCP is
already a co-tenant of. It carries no correlation column, so — exactly as the MIS pipeline already
does — the evaluation is written as a JSON diagnostic block in `description`, with `qdb_source` and
`qdb_type` naming it.

**No new entity is created.** A strategy evaluation is diagnostics of an automated run; the
*business* trace of which action produced which activity lives on the activity, which is what WP2
provisioned it for.

### Designed audit mechanism vs. currently enabled runtime coverage

These are **not the same thing**, and Phase 8 must not let one be read as the other.

| | |
|---|---|
| **Designed business audit mechanism** | Native Dynamics Audit, as §23 of the authorisation specifies. Unchanged, and not replaced |
| **Currently enabled runtime coverage** | **None on `qdb_collectionactivity` or `qdb_collectioncase`** — `IsAuditEnabled = false` on both, verified 2026-09-21 |
| **What Phase 8 therefore claims** | Only its own technical evaluation trace in `qdb_crmlogs`. **No business audit coverage is claimed for these entities**, because there is none to claim |

So: field-level history — who changed a status, who reassigned, who cancelled an activity — is
**not being captured today** on the two entities Phase 8 writes to most. That is a configuration
gap, recorded as **KI-99** and left for QDB, because enabling entity auditing affects storage,
retention, performance and governance across a shared organisation and is not a build's decision.

**It is also not compensated for.** No custom business-audit entity is created to fill the gap —
that would be the duplicate log §23 forbids, and it would quietly become the thing everyone relies
on instead of the mechanism QDB actually chose. Phase 8's trace stays what it is: diagnostics of an
automated run, in the approved technical log.
