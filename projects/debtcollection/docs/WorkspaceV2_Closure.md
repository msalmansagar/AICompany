# DCP Collection Workspace V2 — Closure (for review)

**Workspace V2 — ENGINEERING AND VALIDATION COMPLETE · READY FOR REVIEW.**
**V1 remains the default and is intact. V2 is parallel, behind the switch. Not a PR, not merged, V2 not
default, the switch not removed, Phase 10 not started.**

| | |
|---|---|
| Branch | `feat/dcp-workspace-v2` from `main` @ `cf4e7642` |
| Cloud | **Cloud Runtime Tested** — same web resource, V1 + V2 in one artefact |
| Browser | **System Administrator Runtime Validated · Collection Officer Runtime Validation Pending** |
| On-Prem | **Dynamics 365 CE 9.1 On-Prem — Compatible by Design; Workspace V2 Runtime Validation Pending** |

---

## 1. Architecture as built

```
qdb_dcp_workspace.html — one web resource, one build
  App: one CRM session, adapter, transport; Role and Org providers
    └─ WorkspaceVersionRoot — URL (?ui= or Dynamics' ?data=ui%3D…) → saved preference → V1
         ├─ V1: the existing Workspace, unchanged
         └─ V2 (inside .dcp-v2, behind an error boundary that falls back to V1)
               V2 shell + native pages, or V1's own view inside the V2 frame
         both → the same data/, services/, platform/ and @dcp/domain
```

**V1 edits, all in `App.tsx`:** the version root, one *Workspace V2* command in V1's command bar, and
passing V1's router to V2. Two V1 constants were exported (`workoutQueueView.tsx`) so both workspaces
share one wording. **Shared data layer:** one additive, optional `ptpStatus` filter on `ActivityQuery`
(absent → the same filter as before, asserted). No domain, service, schema, plugin or C# change.

**Isolation:** all V2 CSS under `.dcp-v2`, tokens `--v2-*` never on `:root`, classes `v2-*`; a token
bridge restyles reused V1 components inside `.dcp-v2` only. Guarded by tests, and confirmed live: the
V1 page carries **zero** V2 classes.

## 2. Screen-by-screen completion

| Screen | V2 | Same backend | Notes |
|---|---|---|---|
| Application shell | **Native** | yes | Navy rail from the real route table; collapsible (remembered), drawer under 860px; working search; CRM and role pickers; V1/V2 switch; skip link |
| My Day | **Native** | yes | Real counts only; *What needs you today*; queue load; follow-ups. No SLA, rate or KPI |
| Work Queues | **Native** | yes | Bucket chips with counts; unavailable buckets disabled with the reason; Split (preview) and Grid |
| Collection Cases | **Native** | yes | Source-side filters, search, sort **with a unique tie-breaker**; active-filter count and Clear all |
| Case Workspace | **Native** | yes | Identity, real commands only, position strip + stored-MIS notice; Overview with the next planned action; Activities, Promises, History, Audit native; Action Plan, Communications, Workout & Legal reuse V1 views |
| Customer 360 | **Native** | yes | Across both CRMs; partial totals marked; channel preferences never called a hold |
| Promise to Pay | **Native** | yes | Status chips filter at the source; no rate |
| Disputes / Legal / Deceased Review | **Native** (queue) | yes | Fixed bucket + V1's own statement of what is possible |
| Communications + bulk | V1 view in V2 frame | yes | Carries idempotency and delivery rules — not copied (KI-142) |
| Action Plan · Segmentation · Strategy Rules · Dashboards · Audit Trail · Intake · Configuration | V1 view in V2 frame | yes | Re-skinned (KI-142) |
| Restructuring | V1 parked notice | — | PARKED by QDB |
| Templates · Portfolio MIS · Approvals | V1 pending notice, not in V2 nav | — | Not advertised |

**All 21 routes open in V2** without falling back or reaching the unrouted screen — asserted by test and
swept live.

## 3. Evidence

### Automated — at the closure candidate, nothing skipped

| Suite | Tests |
|---|---|
| domain | **817** |
| web | **852** (627 at base, +225) |
| API | **351** |
| Dataverse client | **32** |
| auth adapters | **14** |
| tooling | **10** |
| C# | **159** |
| **Total** | **2,235** (Phase 9 baseline 2,027) — 0 failed · 0 skipped |

Type-check passes. **30 guards were shown to fail with their defect restored or planted** — 27 in scripted runs and 3 by
hand (the V2 stale-response test against the shared paging hook itself, the skip link, the timeline
date). The contrast test failed on real data rather than a planted defect (§4). Two of my own
guards were vacuous on first run and were fixed rather than loosened (navigation's pending filter; the
coverage test's empty bridged route).

### Cloud — `org5869857f`

Deployed with the existing script to the **same** web resource, 11/11 each time; stored copy
byte-identical to the build; final deploy built from `cb3cd5da`. `main.aspx …&data=ui%3Dv2` passes the
choice through Dynamics without error. **No record was created, changed or deleted by this
workstream.**

### Browser — System Administrator evidence

| Check | Result |
|---|---|
| URL `ui=v1` → V1 · V1 command → V2 (saved) · V2 switch → V1 · reload without a value keeps V2 · invalid `ui=v9` with no saved choice → V1 | **Pass** |
| Every V2 route and case tab: renders, no error state, no fallback, nothing stuck loading | **Pass (23 routes/tabs)** |
| Case Workspace, Work Queue split preview, next planned action from the real plan | **Pass**, screenshots |
| User-chosen icon rail: 64px, labels hidden, remembered; expands back | **Pass** |
| Narrow window (icon rail / drawer by width) | **Not exercised** — host frame and window could not be resized (KI-141) |
| V1 smoke after switching back: 14 routes as V1, no V2 markup, no errors | **Pass** |
| Console | No errors from the point tracking began |

**Found and fixed in browser QA:** the case timeline dated actions by activity date while ordered by
record date; the queue showed recorded times as unlabelled UTC. **Observed, not ours:** a deceased
review on ARR case `ARR-HL-02373` recorded by a person at 13:42 (KI-140) — recorded, not deleted.

## 4. Accessibility, responsive, performance, large data

- **Accessibility:** landmarks (`nav`, `header`, `main`); `aria-current` on the current item; every
  collapsed nav item named; skip link that does not change the route; ARIA tab pattern with arrow keys;
  rows open from the keyboard; statuses as icon + text + colour; **WCAG 2.1 AA contrast computed from the
  tokens** for every text/background pair — three reference bucket colours failed and were darkened.
- **Responsive:** desktop first; rail <1180px, drawer <860px in CSS; live evidence only for the chosen
  icon rail (KI-141).
- **Performance:** bundle **498 → 583 kB** (+17%; gzip 139 → 158 kB); no new runtime dependency; no
  animation library; skeleton animation honours reduced motion. The web resource must stay one file, so
  V2 cannot be code-split.
- **Large data:** every V2 list uses the shared `usePagedQuery` + `VirtualizedRows` — server paging,
  continuation, stale-response suppression, bounded DOM. Search is debounced and still sent to the
  source. No full-portfolio read anywhere.

## 5. Not changed

Business rules, MIS authority, schema, security, roles, the Rule Engine, strategy automation,
assignment, escalation, activities, PTP, communications, idempotency, provenance, the advanced-process
contracts and every fail-closed boundary. Reference features without DCP backing were omitted (plan
§6, §1b): risk, SLA, reassign, refer to legal, propose restructure, flag deceased, contact suppression,
run batch, approvals, management KPIs.

## 6. Known issues

New: KI-138 (V1 search decorative — V1 debt), KI-139 (V1 UTC time — fixed in V2, V1 debt), KI-140
(ARR record — decision), KI-141 (narrow-width live evidence), KI-142 (re-skinned V1 screens — UX debt).
Unchanged and still open: KI-100, 111, 116, 120, 128 (security — administrator evidence only), KI-131,
KI-135, KI-137 and every Phase 9 policy KI.

## 7. Timing

| | |
|---|---|
| Start | 2026-09-24 13:03:04 +03 |
| Engineering complete | 2026-09-24 ~19:05 +03 |
| Baseline | **51.00 h** (revised forecast 52.00 h after the second reference) — not rewritten |
| Effective, measured | **1.93 h** |
| Non-working | **4.10 h** — a 3.5 h suspension (14:39 → 18:09) and two short waits |
| Blocked by QDB | 0.00 h |
| Variance | −49.07 h against the baseline — different units: an effort estimate against measured AI-assisted session time |

## 8. Screen 01 — Portfolio & Strategy (added 2026-09-24)

Built after this closure under a separate authorization; recorded in `docs/WorkspaceV2_Tracker.md`
(Screen 01 section) and design §17. Still not a PR, V2 still not default, V1 untouched. New KIs 143–146.
