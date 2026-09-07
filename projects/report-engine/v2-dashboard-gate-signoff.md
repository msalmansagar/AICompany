# RPT-ENG-001 — V2-Dashboard Pre-Build Gate Closure & QDB Sign-off

**Date:** 2026-07-19 · **Status: ALL FOUR PRE-BUILD GATES CLEARED** → ready for CEO Phase-4 build authorization.

The CEO checkpoint (`ceo-checkpoint-dashboard-composer.md`) approved the Dashboard Composer as **V2-Dashboard (Milestone M2.5)** with four hard pre-build gates. All are now closed:

| Gate | Requirement | Status | Basis |
|---|---|---|---|
| **DC-1** | Fan-out/performance spike (per-widget SLA at peak, no CRM throttle, both targets) | ✅ **Cleared (design)** | `dc1-fanout-spike.md` — OBO + semaphore mitigation stack; ADR-RPT-008 Proposed. Residual DC-1a/b/c proven during build. |
| **DC-2** | PDPPL data-residency production sign-off | ✅ **Cleared (QDB)** | QDB: **cloud OK in a permitted region** for the Customer-360 PII. |
| **DC-3** | MIT charting library (1000★+), documented | ✅ **Cleared** | `dependencies.md` Area 10 — Recharts (MIT, 27.4k★). |
| **DC-4** | Dashboard governance model answer | ✅ **Cleared (QDB)** | QDB: **configurable per dashboard**. |

## QDB decisions and their build implications

### DC-2 — Data residency: **Cloud OK in a QDB-permitted region**
- The Customer-360 dashboard **may execute on Dataverse cloud** in an approved Azure region; the on-prem-only constraint is **lifted** for cloud deployments.
- **Simplifies DC-1:** the cloud **OBO delegated-token** execution path (the primary fan-out mitigation) is production-viable — no need to force everything on-prem.
- **Open deployment detail (not a gate):** QDB must **name the specific approved Azure region**, to be pinned in the deployment/hosting plan and the tenant configuration. PDPPL compliance is otherwise satisfied for cloud-in-region.
- On-prem 9.x remains a supported target (impersonation path) for customers who require it.

### DC-4 — Governance model: **Configurable per dashboard**
- Each dashboard carries a **governed on/off flag**. When **on**: draft → publish → approver (≠ author) + immutable version snapshots (mirrors report governance). When **off**: personal/ad-hoc, no approval.
- **Schema:** retains the governance tables (`qdb_dashboardsecurity`, dashboard version history) from the 24-table model; governance is enforced only for dashboards flagged governed. No reduction to the schema.
- **Default:** a new dashboard is **ungoverned by default**, author opts in — consistent with the CEO's stated default, plus explicit per-dashboard control.
- **Build:** implement the governed workflow, gated on the flag (small addition vs. always-on).

## Residual (during Phase-4 build, not blockers)
- **DC-1a** — scenario-3 load test (20 concurrent cold-cache opens, P95 ≤ 4 s, zero 429s) must pass on both targets before M2.5 closes.
- **DC-1b** — confirm record-ownership model for Customer-360 entities before enabling the production cache (cache-key `userId` addition if user-owned).
- **DC-1c** — confirm OBO / impersonation works on the actual on-prem 9.x target during M1 integration.
- **ADR-RPT-008** — must be written and accepted before `DashboardExecutionService` implementation begins.
- **Deployment** — pin the QDB-approved Azure region (DC-2 detail).

## Conclusion
With all four gates cleared, **V2-Dashboard is ready for CEO Phase-4 build authorization.** Per the CEO ruling, build starts after **V1 Milestone M1**, runs parallel to SSRS migration (M3), and does not delay V1.
