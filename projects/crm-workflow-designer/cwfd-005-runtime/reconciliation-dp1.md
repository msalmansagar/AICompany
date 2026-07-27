# CWFD-005 — DP-1 Reconciliation

Engagement: CWFD-005 / RT-1 — reconcile the designer with the engine
Date:       2026-07-27
Status:     **Code complete, live-verified. Two org columns pending a deletion decision.**

---

## 1. What changed

DP-1 modelled concurrency as two option sets it invented. The engine models it as a step
hierarchy plus a completion guard. The designer now writes what the engine reads.

| | DP-1 (retired) | Reconciled |
|---|---|---|
| Split | `qdb_splittype = Parallel` on the step | `qdb_parentworkitemstep` — the branch names its parent |
| Join | `qdb_jointype = AndJoin` on a downstream step | `qdb_checkparalleltasks` on the parent's outcome |
| Branch condition | not modelled | `qdb_applyfilter` + `qdb_filter` **on the branch step** |
| Carry-over | not modelled | `qdb_updateparalleltaskref` on the outcome |
| Read by the engine | **nothing** | `OnTaskCreate` and `OnTaskComplete` |

**The publish block is gone.** DP-1 blocked publishing because the designer wrote fields
the platform never read, so a "concurrent" process would have silently run one branch.
These are the fields the engine acts on, so there is nothing left to protect against.
GL-05 is closed — not by a written answer from the platform team, but by reading their
source. That is a stronger answer, and the CEO gate should ratify it as such.

---

## 2. Net effect on the codebase

**−711 lines.** The reconciliation deleted substantially more than it added.

Gone: `controlFlowFields.ts`, `parallelRegions.ts` (graph reachability, Tarjan cycle
detection, hop-distance join matching, region interior computation), `ControlFlowSection`,
`add-controlflow-fields.js`, `controlflow-option-codes.js`, and their four test files.

The engine's model needs none of that machinery. There is no join step to locate, because
the join happens at the parent's own completion — so "which step closes this region?"
stops being a graph search and becomes a field read.

New: `branchFields.ts` (mapping for both adapters), `branchRegions.ts` (six checks),
`BranchSection`, outcome concurrency toggles, synthesised canvas edges, and
`useFetchXmlEntityContext` — extracted because the branch condition needed exactly the
three values `RoutePropertiesPanel` was deriving inline.

---

## 3. Validation — what changed and why

| Check | Severity | Rationale |
|---|---|---|
| `BRANCH_SELF_PARENT` | error | A step cannot run beneath itself |
| `BRANCH_PARENT_CYCLE` | error | Mutually-parented steps never start |
| `BRANCH_PARENT_MISSING` | error | Dangling parent reference |
| `BRANCH_FILTER_MISSING` | error | A conditional branch with no condition never starts — and the engine rejects an empty filter server-side |
| `BRANCH_NO_JOIN_GUARD` | **warning** | The engine tolerates it: the parent simply finishes while branches run. A modelling smell, not a broken process |
| `ORPHAN_JOIN_GUARD` | **warning** | The engine finds no children and passes |

The two warnings are deliberate. DP-1 made every concurrency finding an error because its
model was inert and nothing could be verified. These severities are calibrated to what the
engine actually does.

---

## 4. A bug the reconciliation's own test caught

A branch step has no inbound outcome — the engine creates its task from the parent's — so
`checkOrphanSteps` reported every branch as *"unreachable — no route leads to it"*.

`buildReachableStepIds` now counts a step with a parent as reachable. Worth recording
because it is the class of defect that only appears when a model changes shape underneath
existing checks, and inspection would not have found it.

---

## 5. Live verification — 8/8 on org5869857f

Throwaway parent, branch and outcome, all since deleted:

| Assertion | |
|---|---|
| parent lookup persists on the branch | PASS |
| branch condition flag persists | PASS |
| branch FetchXML persists | PASS |
| join guard persists on the outcome | PASS |
| carry-over flag persists | PASS |
| the engine's own query — children of a parent — finds the branch | PASS |
| parent clears through its nav prop | PASS |
| condition clears with it | PASS |

**No provisioning was required.** Every column already existed; that is the whole point.

### One finding from the gate

Writing `qdb_filter` with a bare `<fetch/>` is rejected: **`0x80040265 Invalid XML`**. The
engine's `ValidateAdvanceFindFilter` plugin is registered on create and update of
`qdb_work_item_steps` and requires a real `<condition>` — the same server-side rule the
designer already pre-empts for route filters. This confirms the step's `qdb_filter` is the
Advanced Find filter, and it is why the branch condition opens the real Advanced Find
builder rather than a text box.

---

## 6. Still open

- **`qdb_splittype` and `qdb_jointype` remain on the org**, now unreferenced by any code.
  Deleting columns is irreversible and needs an explicit decision. They are harmless where
  they are — nothing reads them, and no process has ever been published using them —
  but leaving them keeps the ambiguity the reconciliation exists to remove.
- **DP-2's SLA reconciliation is not started.** The same treatment is owed to the
  `qdb_sla_*` fields, which sit beside the live TAT and escalation model. That is the
  larger of the two: 11 columns, three lookups, and a richer existing model to surface.
- **No end-to-end runtime test.** The columns round-trip and the engine's query finds the
  branch, but no process has been *run* to watch two tasks appear. That needs a real
  process instance and is the natural next verification.
