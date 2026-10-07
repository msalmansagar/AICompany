# Customer 360 — redesign refinement (2026-10-04)

Started 08:29, finished 10:04 Asia/Qatar (1 h 35 min, continuous). The two attached mocks
(`Customer 360 Redesign.html`, `… Notes.html`) were **not found on this machine**; the work follows the
two written briefs. Schema change: **none**. Gate A: **not triggered**.

## Phase 0 — findings and verification

| Item | Finding (file) | Decision |
|---|---|---|
| Strategy source | Persisted lookup `qdb_collectioncase.qdb_strategyid`, set by DCP's own strategy service (`apps/api/.../StrategyService`), shown by its formatted name (`data/collectionQueries.ts`). Not Rule Engine 1.1 decisioning (Rule Engine is not configured or used at runtime). Sandbox: 5 of 4,363 cases carry one; no strategy record is readable. | Kept; shown as the name, or **Not resolved**. |
| Portfolio counts | One bounded server read of the customer's cases (≤ 200) already covers the whole portfolio (`data/customerAggregate.ts`). | Counted from that read **only when it is complete**; otherwise none ("counts not available for a partial portfolio"). |
| History counts | Platform `$count` per category (`data/customerHistoryQueries.ts` `loadHistoryCounts`). | Shown only when every count is exact; one refusal or one capped count → no counts. |
| Log Action context | `ActivityDialog` takes an explicit `caseId`. | Header **+ Log action** kept, with explicit 0 / 1 / ≥2 behaviour. |
| Complaint / Dispute | Cross-org reference is on the activity (`qdb_relatedrecordtype` / `…number`). | Category shown; entries read "Referred to BFD Case Management · External reference … · Lifecycle owned by BFD Case Management". No duplicated status. |
| N+1 | Action plan: 3 reads per open unit (`useNextAction` per card). | Batched: **2 reads** for all open cases (`data/customerNextActions.ts`). |
| Live MIS | No adapter in the workspace (KI-53). | Stored / Not available only; no Retrieve button; Live and Fallback states supported for when an adapter exists. |

## Change list

- **KEEP** shared V1/V2 screen; platform aggregate KPIs; PTP "recorded" semantics; channel preferences as CRM values; stored-position labelling.
- **REFINE** header (chip, type, identifier, mobile / Not available); KPI strip (Worst DPD + bucket, "N / M kept" with caveat); MIS strip (one state, age in days); units (DPD desc → number asc, listbox selection, compact case line, ten at a time, portfolio summary); Collection Summary (selected unit, No Action Plan vs Not configured, Strategy / Not resolved, System owner, open processes, no-case state); History (platform filters + counts, mutually exclusive categories, stale-answer suppression, four-line rows, outcome badge with activity status in detail); Delinquency History (selected unit, 0 / 1 / 2+ / 3+ rules, values table, accessible chart); StatusBadge (six tones, text + border); per-section skeleton, error and Retry.
- **REMOVE** customer-level Capture PTP; the customer-wide snapshot grid (replaced by the selected unit's history).
- **CONDITIONAL** Retrieve MIS (no adapter); history counts (exact or none); portfolio counts (complete read or none); Complaint / Dispute (shown because the reference exists).

## Live validation (org5869857f, System Administrator)

| Viewport | Horizontal scroll | Sticky Summary + Delinquency | Order |
|---|---|---|---|
| 1920 × 1080 | none | sticky | two columns |
| 1440 × 900 | none | sticky | two columns |
| 1366 × 768 | none | normal flow (height < 860) | two columns |
| 900 × 800 | none | normal flow | Units → Summary → History → Preferences → Delinquency |
| 390 × 800 | none | normal flow | same |

All seven history filters load without error; counts (All 8 = Actions 4 + PTP 4) match the rows.
Found live and fixed: the platform reads `not a ne null` as `(not a) ne null` — negations are now
parenthesised. Evidence: `docs/evidence/2026-10-04-customer360-*.jpg`.

## Decisions still open (provisional, to confirm before release)

- Open Deceased / Insurance is shown only and restricts nothing.
- Exposure sums units with an open case.
- MIS age is stated without a stale threshold.
- A cross-source customer gets one combined list.
- The workspace header's CRM selector and V1/V2 toggle were **not** removed — the brief asks to confirm first.
- "Open Action Plan" opens the case (V2: Action Plan tab; V1: Actions tab holds the plan).

## Remaining UX debt

- Mocks not available for pixel comparison.
- No in-page section navigator (decision: revisit with usage data).
- Units render ten at a time over one bounded read (≤ 200 cases), not a server continuation; a customer above 200 cases shows the partial notice.
- Collection-officer (non-administrator) validation pending.
