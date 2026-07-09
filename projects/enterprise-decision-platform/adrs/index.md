# EDP-BRE-001 — Architecture Decision Record Index

**Engagement:** Enterprise Decision Platform — Business Rules Engine
**Maintained by:** Maqsad AI — Solution Architect
**Last updated:** 2026-07-06

All ADRs are produced in `phase-3-arch.md` (Section 18). This index is the registry.
Changes to any ADR require a new ADR that explicitly supersedes the named decision.

| ADR | Title | Status | Date | Decided by |
|-----|-------|--------|------|------------|
| ADR-01 | GoRules Designer-Only — ZEN Runtime Excluded | Accepted | 2026-07-03 | Architect |
| ADR-02 | Native C# Runtime — Build, Not Adopt | Accepted | 2026-07-03 | Architect |
| ADR-03 | Platform Canonical Rule Model Over Raw JDM Storage | Accepted | 2026-07-03 | Architect |
| ADR-04 | Metadata-Driven Authoring — Business Terms Over Schema Names | Accepted | 2026-07-03 | Architect |
| ADR-05 | CRM-Native — Zero External Infrastructure | Accepted | 2026-07-03 | Architect |
| ADR-06 | Single Runtime — No Per-Channel Evaluators | Accepted | 2026-07-03 | Architect |
| ADR-07 | React Web Resource — Deviation from Next.js Default | Accepted | 2026-07-03 | Architect |
| ADR-08 | Platform Independence — PCRM Over Vendor Formats | Accepted | 2026-07-03 | Architect |
| ADR-09 | Governance-Justified Version Pinning in Production (C-006) | Accepted | 2026-07-03 | Architect (CEO-mandated) |
| ADR-10 | Designer Host — WASM Degraded Mode Accepted (P2-OI-001) | Accepted | 2026-07-03 | Architect |
| ADR-11 | Expression Engine — NCalc Selected Over DynamicExpresso (P2-OI-002) | Accepted | 2026-07-03 | Architect |
| ADR-12 | Defense-in-Depth Enforcement of Version-Pin Governance (P3-R-8, Challenge 6) | Accepted | 2026-07-03 | Architect (mandated by user) |
| ADR-13 | Two-Tier Write Path — Durable Audit vs. Async Sampled Trace (triage W5) | Accepted | 2026-07-04 | Architect |
| ADR-EDS-01 | Enterprise Decision Service is a Logical Façade, Not a New Engine | Accepted | 2026-07-06 | Architect |
| ADR-EDS-02 | Web API Gateway is Transport-Only (never executes rules) | Accepted | 2026-07-06 | Architect |
| ADR-EDS-03 | Command–Query Split Maps to Custom API Action vs Function | Accepted | 2026-07-06 | Architect |
| ADR-EDS-04 | Canonical Decision Envelope with Correlation/Request/Execution IDs | Accepted | 2026-07-06 | Architect |
| ADR-EDS-05 | Async/Batch Uses a Dataverse-Native Request Entity, No External Queue for Core | Accepted | 2026-07-06 | Architect |
| ADR-EDS-06 | Offline Mobile Never Executes Rules Locally | Accepted | 2026-07-06 | Architect |
| ADR-EDS-07 | CRM Field Write-Back is Opt-In, Governed, Consumer-Performed | Accepted | 2026-07-06 | Architect |
| ADR-EDS-08 | Locale Affects Interpretation/Formatting Only, Never Determinism | Accepted | 2026-07-06 | Architect |
| ADR-EDS-09 | SDKs are Envelope Builders Only | Accepted | 2026-07-06 | Architect |
| ADR-EDS-10 | In-Process In-Proc, Remote via Surface — Same Runtime Assembly | Accepted | 2026-07-06 | Architect |
| ADR-AI-01 | AI Cannot Publish Directly; Every AI Artifact is a Draft | Accepted | 2026-07-06 | Architect |
| ADR-AI-02 | Analytics Are Historical, Not In-Path | Accepted | 2026-07-06 | Architect |
| ADR-AI-03 | Prompts and Responses Are Audited | Accepted | 2026-07-06 | Architect |
| ADR-AI-04 | AI Suggestions Require Human Approval | Accepted | 2026-07-06 | Architect |
| ADR-AI-05 | Explainability Is Mandatory and Grounded | Accepted | 2026-07-06 | Architect |
| ADR-AI-06 | Pluggable AI Provider Abstraction | Accepted | 2026-07-06 | Architect |
| ADR-AI-07 | AI/ML Is Never in the Evaluation Path (reaffirms Phase-0) | Accepted | 2026-07-06 | Architect |
| ADR-AI-08 | PII/Sensitive-Data Redaction at the Egress Boundary | Accepted | 2026-07-06 | Architect |
| ADR-AI-09 | Snapshot-Based Analytics Storage Tiering | Accepted | 2026-07-06 | Architect |

Status values: Proposed | Accepted | Deprecated | Superseded

Designer-specific ADRs (ADR-D01…D05) live in `phase-4-visual-rule-designer.md` §27.
Runtime-specific ADRs (ADR-R01…R05) live in `phase-4-native-runtime.md` §20.
Enterprise Decision Service ADRs (ADR-EDS-01…EDS-10) live in `phase-5-enterprise-decision-service.md` §21.
Decision Intelligence / AI ADRs (ADR-AI-01…AI-09) live in `phase-6-decision-intelligence.md` §22.
Cross-entity N:1 field navigation (CEN-001) — contract + design in `design-cross-entity-navigation.md` (Accepted 2026-07-09).
