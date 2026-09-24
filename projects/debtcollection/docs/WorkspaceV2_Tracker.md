# Workspace V2 — tracker

Branch `feat/dcp-workspace-v2` · base `cf4e7642` · **start 2026-09-24 13:03:04 +03 (Asia/Qatar)** ·
plan `docs/WorkspaceV2_Plan.md`.

| | |
|---|---|
| Baseline | **51.00 effective hours** (AI-assisted estimate) — not rewritten |
| Revised forecast | **52.00 h** — +1.00 h: second reference reviewed (13:15 +03), see plan §1b |
| Expected completion | 2026-09-26 18:00 +03 |
| Effective time | measured from session transcripts, gaps under 15 minutes counted |
| Idle / blocked | recorded separately |

**Status:** V1 is the default and is protected. V2 is parallel, behind the switch. Not a PR, not
merged, V2 not default. Phase 10 not started.

### Checkpoint — 2026-09-24 18:35 +03

| | |
|---|---|
| Effective, measured | **1.43 h** since 13:03 (transcript steps, gaps under 15 minutes) |
| Non-working | **4.10 h**: a 3.5 h pause 14:39 → 18:09 (a quick file read returned 3.5 h later — the session was suspended; the cause is not visible in the transcript), plus 21 and 15 minute waits |
| Delivered, at estimate | WP1–WP9, WP11, WP13, WP14 ≈ 30.5 h of the 52.0 h forecast |
| Web tests | 796 (627 at base) |
| Forecast | 2026-09-26 18:00 +03 — unchanged |

| WP | Est. h | State | Commit(s) |
|---|---|---|---|
| WP1 Analysis + inventory (+ second reference) | 1.50 (+1.00) | Done | `6bbbe8fc`, `1c7af34f` |
| WP2 Version resolver + switch | 2.00 | Done | `141cc251` |
| WP3 Tokens + isolation | 2.50 | Done | `141cc251` |
| WP4 Shell + navigation | 3.00 | Done | `21aae852` |
| WP5 Home | 2.00 | Done | `a4b02a12` |
| WP6 Work Queue | 2.50 | Done | `663ec974` |
| WP7 Cases | 2.00 | Done | `1400a07c` |
| WP8 Case Workspace | 5.00 | Done | `e3d53180`, `fd8455f0` |
| WP9 Customer 360 | 2.50 | Done | `da8cbc53` |
| WP10 Action Plan + Activities | 2.50 | Activities done in the case; global Action Plan still V1 content in the V2 frame | `e3d53180` |
| WP11 PTP | 1.50 | Done | `e04a3907` |
| WP12 Communications + bulk | 2.50 | — | |
| WP13 Advanced processes | 1.50 | Done — queues and the case's Workout & Legal tab | `663ec974`, `e3d53180` |
| WP14 Reusable primitives | 2.50 | Done | `c91e8f25` |
| WP15 Remaining screens | 3.00 | — | |
| WP16 A11y / responsive / perf | 2.50 | — | |
| WP17 Regression + tests | 3.00 | — | |
| WP18 Cloud + browser QA | 4.00 | — | |
| WP19 Docs + closure | 2.00 | — | |
| Debugging allowance | 3.00 | | |
