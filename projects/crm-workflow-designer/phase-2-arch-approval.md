═══════════════════════════════════════════════════════════════════════
CEO BUILD APPROVAL — PHASE 3 ARCHITECTURE REVIEW
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer
Document:       phase-2-arch-approval.md
Reviewed By:    CEO — Maqsad AI
Date:           2026-06-01
Architecture Version Under Review: phase-3-arch.md v1.0
Project Code:   CWFD-001
BRD Version:    1.0
Phase 1 Decision: APPROVED WITH CONDITIONS (5 conditions)
═══════════════════════════════════════════════════════════════════════


---

## 1. Architecture Review

This section assesses each major architectural decision on its technical
soundness, alignment with business objectives, and risk posture. The CEO
does not redesign architecture; this review confirms that decisions are
defensible from a business and delivery risk perspective.

---

### 1.1 Adapter Pattern (ADR-002)

Decision: ICrmAdapter as the sole API boundary between all application logic
and CRM. DataverseAdapter wraps Xrm.WebApi for Online. ODataAdapter wraps
fetch() with credentials:include for On-Premise 9.x. No service, hook, or
component may import a concrete adapter class directly.

Assessment: Sound. This is the load-bearing architectural decision for the
dual-environment constraint. The interface contract is fully specified with
typed request and response models for all four entities. The adapter is
provisioned via React context (CrmAdapterContext) and constructor-injected
into all services, which correctly honours the Dependency Inversion principle.
The retry policy (3 attempts, exponential backoff at 500ms / 1000ms / 2000ms)
is proportionate to enterprise CRM network conditions. The OData $batch
fallback to sequential writes on HTTP 400 is the correct response for
On-Prem 9.0 environments where $batch support is inconsistent.

Business risk: None beyond what was accepted in Phase 1. The adapter boundary
will be non-bypassable by build team constraint (see Section 6).

---

### 1.2 React Flow Canvas (ADR-001)

Decision: @xyflow/react v12.x (MIT, 27,000+ GitHub stars). Unidirectional
data flow from Zustand store to canvas via selectors; React Flow events
dispatch mutations back to the store; canvas never writes directly to the
store. Four node types (Start, Step, Outcome, End) and two edge types
(StepToOutcome, Route) map cleanly to the four CRM entity model.

Assessment: Sound. The choice is justified by community adoption, React 19
compatibility confirmation, MIT license, and purpose-fit for workflow graph
rendering. The unidirectional data flow principle is correctly enforced: the
store is the single source of truth, selectors derive the nodes and edges
arrays, and React Flow events are treated as user intent signals rather than
state mutations. The onNodeDragStop exception (writing final position to
nodePositions) is the correct and minimal exception — position is layout
metadata, not domain data.

The store-to-canvas sync on connection validation failure (Skeptic Challenge 4)
is correctly addressed: onConnectEnd handles speculative edge removal. This is
an implementation detail the build team must implement correctly from the
outset, not a design flaw.

Business risk: Low. React Flow performance at 200+ nodes (NFR-01b, 30fps) is
flagged as a QA benchmark requirement. This is the correct deferral point.

---

### 1.3 Flat-Map Zustand Store (ADR-003)

Decision: Zustand v5 + Immer v10 + Zundo v2. State structured as flat
Record<string, T> maps for steps, outcomes, and routes (O(1) lookup by CRM ID).
Ordering arrays (stepOrder, outcomeOrder, routeOrder) maintain visual sequence.
Zundo temporal middleware captures 50 undo states over domain data only;
UI flags excluded.

Assessment: Sound. The O(1) lookup characteristic is important for a 200-node
workflow where nested tree traversal would produce visible latency on every
render cycle. The separation between domain maps and ordering arrays is a
deliberate design that matches the CRM data model (entities have sequence
number fields independently of their data). The partialize configuration
correctly excludes transient UI state (selectedId, isPublishing, etc.) from
undo history.

The flat-map consistency risk (Skeptic Challenge 6) — a developer adding a
step to the map without updating stepOrder — is mitigated by the development-mode
invariant check after every mutation. This invariant check must be implemented
before any node creation code is written (mandatory Sprint 1 action, see
Section 5).

The zundo abandonment risk (below 1,000-star threshold) is documented with a
30-line custom fallback. This is acceptable risk management.

Memory estimate for undo history (5 MB at 200 nodes x 50 states) is within
desktop browser limits; Immer structural sharing will reduce this materially
in practice. QA must measure and report.

Business risk: Low.

---

### 1.4 Auto-Layout Engine — ELK Primary + Dagre Fallback (ADR-004)

Decision: elkjs v0.9.x (EPL-2.0) running in a Web Worker for the primary
layered algorithm. @dagrejs/dagre (MIT, pinned to 0.8.5) as synchronous
fallback when Worker construction throws (On-Prem sandbox restrictions).
Worker support detected at startup; result cached.

Assessment: Sound. Running ELK in a Web Worker is the correct choice to
prevent UI freeze on large workflow layouts. The fallback to Dagre is
well-designed: it is a synchronous execution path with a progress indicator,
not a silent degradation. Pinning the Dagre version to 0.8.5 prevents
unexpected regressions from upstream changes, which is appropriate for a
fallback path that cannot be automatically exercised in CI without an
On-Prem environment.

The EPL-2.0 license for elkjs is the only non-MIT license in the dependency
set. EPL-2.0 permits commercial use without requiring the consuming application
to be open-sourced (it is not a strong copyleft license for consumption use
cases). The attribution requirement is documented and must be placed in
NOTICES.md before Phase 4. Client legal confirmation remains an outstanding
gate item (COND-05).

Business risk: Low, conditional on EPL-2.0 legal confirmation.

---

### 1.5 FetchXML Two-Path Builder (ADR-005)

Decision: Path A loads the undocumented CRM Advanced Filter Page
(/SFA/goal/ParticipatingQueryCondition.aspx) in a sandboxed iframe inside a
Fluent UI Dialog. A 3-second probe via hidden iframe detects availability.
postMessage origin validation is mandatory before payload parsing. If Path A
is unavailable, Path B activates automatically: react-querybuilder v8 with a
custom FetchXML formatter. Both paths produce identical FetchXML output stored
in qdb_filter. Route records are path-agnostic.

Assessment: Sound and materially stronger than what Phase 1 required. The
CEO's original position (SR-01, COND-03) demanded that the fallback be a
"first-class path, not an afterthought." ADR-005 delivers exactly this: Path B
is a complete, independently testable implementation, not a stub or a raw text
editor.

The postMessage security posture is correct. Origin validation executes before
payload parsing; messages from unrecognised origins are silently dropped. The
iframe sandbox attributes (allow-same-origin, allow-scripts, allow-forms) are
the minimum necessary; allow-top-navigation and allow-popups are correctly
excluded.

The 5-second message timeout with automatic Path B degradation handles the
case where Microsoft silently changes the postMessage contract in a future CRM
release. This is the highest architectural risk item (Rank 1 in Section 22 of
the architecture document) and the two-path design addresses it at the
architectural level rather than deferred to the build team.

The probe-adds-CRM-server-log-entry observation (Skeptic Challenge 5) is
correctly classified as a low-risk known side-effect and must be documented
in the client handoff materials.

Business risk: Medium-residual. The postMessage contract is undocumented.
Microsoft may change it without notice. The automatic silent fallback to
Path B is the correct control. This risk cannot be further reduced without
Microsoft publishing a formal SDK contract, which is outside our control.

---

### 1.6 Versioning Engine (ADR-006)

Decision: Four mandatory fields added to qdb_work_item_record_type
(qdb_version_major, qdb_version_minor, qdb_workflow_state, qdb_workflow_snapshot)
plus two optional fields (qdb_published_on, qdb_cloned_from). A Global Option
Set (qdb_workflowstate) defines the Draft / Published / Archived states.
One Published record per process at any time. Breaking change detection
compares prior Published snapshot to current state by step ID set, outcome ID
set, sequence numbers, and entity bindings. Graceful degradation to in-memory
versioning when fields are absent at runtime.

Assessment: Sound. The schema delta is precise and minimal: five to six fields
on one entity, no structural changes to existing entities, no changes to
existing forms, views, or security roles. This is the narrowest possible
footprint for the feature.

The state machine is explicit and correct: Draft is the only writable state;
Published is immutable; Archived is read-only. The one-Published-per-process
invariant is a business control that prevents ambiguity in impact analysis and
version history queries.

The publish atomicity analysis is honest and appropriately scoped. True
atomicity without a server component is not achievable in a CRM web resource
context; the three-retry backoff on the archive step plus the Repair Publish
action is the maximum achievable without introducing a backend (which is out
of scope per C-01). This limitation must be disclosed to the client.

The qdb_workflow_snapshot Memo field size concern (up to 1 MB for very large
workflows) is flagged and mitigated by LZ-String compression as a contingency.
VersioningService must monitor serialised payload size before write and warn
at 750 KB.

Business risk: Medium on the atomicity limitation. Client must acknowledge that
publish is best-effort-atomic in a web resource context and that the Repair
Publish action exists as a manual recovery path.

---

### 1.7 Bundle Strategy (ADR-007)

Decision: Vite 5 with manual Rollup manualChunks. Eight vendor chunks plus
one application chunk loaded eagerly at 532 KB gzipped. Three lazy chunks
(ELK, html-to-image, jsPDF) for a peak of 797 KB gzipped against a 5,120 KB
absolute budget. CI gate at 4,500 KB. ESLint rule enforcing named imports from
@fluentui/react-components.

Assessment: Sound. The headroom is very substantial: 4,323 KB of the 5,120 KB
budget remains unused. Even if the Fluent UI chunk measurement (Skeptic
Challenge 7) doubles the estimate from 190 KB to 380 KB, the total remains
well under the CI gate. The CI gate at 4,500 KB (leaving 620 KB as a safety
margin) is an appropriate engineering control.

The Fluent UI 190 KB estimate is explicitly flagged as unverified against an
actual Vite build. This must be measured in Sprint 1 (mandatory Sprint 1
action, see Section 5). If the measured size exceeds 250 KB, the CI gate must
be recalibrated, but this does not endanger the 5 MB ceiling.

The solution XML generation automation (packageSolution.js) correctly applies
the RootComponent-per-file pattern established in FDWR-001. This is the only
approach that has been proven to work for CRM web resource deployment of
multi-chunk Vite builds. No wildcard entries.

Business risk: None. The headroom is sufficient to absorb dependency growth,
developer error on imports, and measurement variance without approaching the
ceiling.

---

## 2. CEO Conditions Clearance

The following assessment applies to each of the five conditions stated in the
Phase 1 approval decision (phase-1-ceo.md Section 8).

---

### COND-01 — Four CRM entities confirmed as pre-deployment assumption

Status: CONDITIONALLY CLEARED

The architect has correctly documented this as Assumption A-01 (Section 21 of
the architecture document). The condition is satisfied at the architecture
level: the assumption is explicit, the risk of absent entities is documented
in the risk register, and the build team cannot begin entity-dependent code
without entity access. The outstanding action is written client confirmation
before Sprint 1 begins. This is a hard gate on Sprint 1 start, not on build
authorization in principle.

---

### COND-02 — Versioning schema delta and client sign-off

Status: CONDITIONALLY CLEARED

ADR-006 and Section 10 of the architecture document specify the exact delta:
four primary fields plus two optional fields on qdb_work_item_record_type, and
one Global Option Set (qdb_workflowstate). The graceful degradation path for
environments where fields are absent is fully designed and testable
independently of field deployment. The outstanding action is written client
approval before the versioning engine code is merged to the main branch. This
is a Sprint 1 build constraint, not a block on beginning other components.

---

### COND-03 — FetchXML Advanced Filter Page viability confirmed or fallback documented

Status: CLEARED

ADR-005 fully satisfies this condition. The postMessage contract is documented
with origin validation, sandbox attributes, pre-population behaviour, timeout
handling, and automatic Path B fallback. Path B (react-querybuilder with custom
FetchXML formatter) is a complete implementation with operator mappings, XML
validation, and the same output format as Path A. The condition required a
fallback that is a "first-class path, not an afterthought." ADR-005 delivers
exactly that.

---

### COND-04 — Bundle size budget confirmed under 5 MB gzipped

Status: CLEARED

ADR-007 and Section 13 of the architecture document confirm 532 KB eager load
and 797 KB peak load against a 5,120 KB ceiling. The CI gate at 4,500 KB will
catch any regression before it can threaten the ceiling. The Fluent UI 190 KB
estimate is flagged as an estimate pending Sprint 1 measurement; even if it is
materially higher, the headroom is sufficient. The condition asked for
confirmation that 5 MB is achievable — this is confirmed with very high
confidence.

---

### COND-05 — License clearance for all dependencies

Status: CONDITIONALLY CLEARED

Twelve of thirteen packages are MIT. elkjs is EPL-2.0, which permits commercial
use and consumption without open-sourcing the consuming application. The
attribution requirement is documented with exact NOTICES.md text. The
outstanding action is written client legal team confirmation before Phase 4
code that incorporates elkjs is merged. The architect has done everything that
can be done at architecture phase to resolve this condition. The residual
action is a client deliverable.

---

## 3. Pre-Build Challenge Assessment

The architect flagged three of ten Skeptic Review challenges as requiring
architectural resolution before Phase 4 begins. The assessment of each follows.

---

### Challenge 1 — Sovereign Cloud Detection

Description: CrmEnvironmentService uses a .dynamics.com URL heuristic to
classify Online vs On-Prem. GCC High (high.dynamics.com), GCC (*.dynamics.com
variant), Microsoft 365 GCC, and European/APAC sovereign cloud domains will be
misclassified as On-Prem, causing the wrong adapter to be selected and all
Xrm.WebApi calls to fail silently.

Assessment: Build Blocker.

This is not an edge case. GCC High is a common deployment target for US
Government and US Defence contractor organisations. Misclassification would
cause the DataverseAdapter to not be selected, forcing the ODataAdapter to
attempt NTLM authentication against a Dataverse cloud endpoint, which will
fail immediately. The designer would be non-functional for any GCC High tenant.

Resolution required before Sprint 1 code is merged: the build team must
implement a multi-signal detection algorithm. Acceptable approaches include:
(a) enumerate known sovereign cloud domain patterns (high.dynamics.com,
dynamics.cn, dynamics.de, dynamics.com.br) as constants alongside .dynamics.com;
(b) provide a URL parameter override mechanism (e.g., ?envType=online) for
environments that cannot be auto-detected; or (c) use a secondary signal such
as the presence of Xrm.WebApi.online as confirmation of Online mode regardless
of URL pattern. The architect's recommendation of getVersion() API level as an
additional signal is noted but may not be sufficient alone, since On-Prem 9.x
also reports version strings. The build team must implement and document the
chosen approach before any adapter-dependent code is merged.

---

### Challenge 2 — Broken Publish Recovery (Background Integrity Check)

Description: If a publish operation fails after successfully updating the new
record to Published but before archiving the previous Published record, two
records are in Published state. The current design requires the user to notice
the error and trigger the manual "Repair Publish" action. If the user closes
the designer, the data is permanently inconsistent until someone runs the repair.

Assessment: Sprint 1 First-Class Design Decision — Not a build blocker for
the overall Phase 4 authorization, but a design decision that must be
implemented before the publish pipeline is coded.

The architect's recommendation — a background integrity check on designer open
that queries for multiple Published records per process ID and auto-repairs
them — is the correct approach. This is a one-time query on open with no
blocking UI interaction. The repair action (archive all Published records
except the one with the highest version numbers) is already designed for the
manual path; the automatic version requires the same logic triggered
transparently on designer load.

The build team must not write the publish pipeline code until this automatic
integrity check is designed and included in the VersioningService interface.
The check must be logged to AuditService with a correlation ID so that the
client's CRM audit team has a record of automatic repairs.

---

### Challenge 3 — Fluent UI Chunk Measurement

Description: The 190 KB gzip estimate for vendor-fluent is based on
bundlephobia data, not an actual Vite build measurement with the specific
CWFD-001 Fluent UI component set (Button, Dialog, Input, Combobox, Select,
Spinner, Badge, Tooltip, DataGrid).

Assessment: Sprint 1 Action Item — Not a build blocker.

The bundle headroom (4,323 KB) is large enough that even a 3x measurement
variance on Fluent UI (from 190 KB to 570 KB) would not threaten the 5 MB
ceiling. However, the measurement must be taken in Sprint 1 before further
dependencies are added, so that the CI gate threshold can be set against
measured actuals rather than estimates. If the measured size exceeds 250 KB,
the CI gate threshold must be recalibrated and the ADR-007 consequences table
must be updated.

---

## 4. Build Authorization

PHASE 4 BUILD AUTHORIZED WITH CONDITIONS

The architecture for CWFD-001 is internally consistent, technically defensible,
and complete for all Phase 1 success criteria. All five CEO conditions have
been cleared or conditionally cleared at the architecture level. The seven ADRs
document every significant technology decision with alternatives considered,
consequences acknowledged, and risks ranked.

Authorization is granted subject to the conditions in Section 5 below.
Authorization does not lapse if client confirmations (A-01, A-02, A-03) are
delayed, provided that build team work is sequenced to avoid code that depends
on unconfirmed client decisions until those decisions are received in writing.

---

## 5. Sprint 1 Mandatory Actions

The following actions must be completed, verified, and committed before any
Sprint 1 code that depends on them is merged to the main branch. The tech lead
is accountable for each action. No action may be marked complete without a
linked commit or written confirmation in the project log.

1. Sovereign cloud detection implementation. Implement the multi-signal
   environment type detection in CrmEnvironmentService before any adapter
   selection code is run in a real environment. Document the chosen approach
   in a CrmEnvironmentService design note appended to ADR-002. This is a
   hard gate on all adapter-dependent code.

2. Automatic publish integrity check. Design and implement the background
   integrity check on designer open in VersioningService before the publish
   pipeline is coded. The check must query for multiple Published records per
   process, auto-repair by archiving non-maximum-version Published records,
   and log all auto-repair actions to AuditService with a correlation ID.
   Update the architecture document Section 10 to reflect this addition.

3. Flat-map invariant check. Implement the development-mode store invariant
   check (every ID in stepOrder exists in steps; every ID in outcomeOrder[stepId]
   exists in outcomes; etc.) before any node creation code is written. This check
   must throw in development mode and emit a structured warning in production.

4. Fluent UI chunk measurement. Run a Vite production build with the specific
   CWFD-001 Fluent UI component set (Button, Dialog, Input, Combobox, Select,
   Spinner, Badge, Tooltip, DataGrid) and record the actual vendor-fluent chunk
   gzip size. If the measured size exceeds 250 KB, update the CI gate threshold
   in scripts/checkBundleSize.js and update the ADR-007 chunk allocation table
   with the measured value.

5. NOTICES.md creation. Create NOTICES.md in the project root with the elkjs
   EPL-2.0 attribution text specified in ADR-007 Section 14 before any ELK
   code is integrated into the build. This file must be included in the CRM
   solution package.

6. Obtain written client confirmations. Before Sprint 1 entity-dependent code
   is merged:
   a. A-01: Written confirmation from client CRM platform team that the four
      qdb_* entities are deployed and accessible in all target environments.
   b. A-02: Written approval from client CRM platform team for the six versioning
      field additions to qdb_work_item_record_type.
   c. A-03: Written confirmation from client legal team that EPL-2.0 is
      acceptable for enterprise deployment.

7. ESLint named-import rule for Fluent UI. Add the ESLint rule enforcing named
   imports from @fluentui/react-components before any Fluent UI usage is
   committed. Barrel imports must produce a lint error, not a warning.

8. assertGuid validation. Implement guid.ts with an assertGuid() function that
   validates GUID format before any ID is interpolated into an OData URL path
   or $filter string. All adapter methods that accept ID parameters must call
   assertGuid() at entry. This must be implemented before any CRM API call
   code is written.

---

## 6. Build Team Constraints

The following constraints are non-negotiable and apply for the entire Phase 4
build. Any pull request that violates these constraints must be rejected in
code review regardless of feature completeness.

1. The ICrmAdapter interface must not be bypassed. No service, hook, component,
   or utility may import DataverseAdapter or ODataAdapter directly. All CRM
   communication flows through the adapter, accessed via useCrmAdapter() from
   the React context. Violations are a blocking code review finding.

2. assertGuid validation on all CRM IDs. Every ID passed to an OData URL path
   segment or $filter string must be validated by assertGuid() before
   interpolation. No exceptions, including IDs received from the store that
   appear to be valid. Trust the validator, not the origin.

3. No console.log in committed code. The codebase uses AuditService for
   structured logging. console.log, console.warn, console.info, and
   console.error are all prohibited in production code. console.debug is
   permitted in development builds only, gated by an if (import.meta.env.DEV)
   guard. ESLint must enforce this; any bypass requires tech lead approval.

4. The publish gate is non-bypassable. No code path may call the publish
   operation without first completing the full ValidationService check.
   No user role, URL parameter, feature flag, or developer back-door may
   bypass the validation engine. This is C-CEO-01 from Phase 1 and it is
   unconditional.

5. All CRM entity IDs must be maintained in node metadata. The React Flow
   node data payload for every StepNode, OutcomeNode, and RouteEdge must
   carry the CRM record ID at all times. The canvas must never derive a
   CRM ID by position or label. IDs from the Zustand store are the single
   source of truth; React Flow node data is a derived view.

6. Audit log on every state-changing operation. AuditService must be called
   on every save, publish, clone, and delete action. Each log entry must
   include the operation name, correlation ID, process ID, actor user ID,
   and UTC timestamp. Partial or missing audit entries are a blocking code
   review finding.

7. TypeScript strict mode without exception. tsconfig.json has "strict": true.
   No any types. No type assertions (as SomeType) without a type guard. No
   @ts-ignore comments. Violations are a blocking code review finding.

8. FetchXML treated as untrusted input. FetchXML received from Path A
   (postMessage) and FetchXML produced by Path B (react-querybuilder) must
   both pass DOMParser well-formedness validation before being written to
   the store or to CRM. This is a security control, not an optional
   quality check.

---

## 7. Residual Risks Accepted at CEO Level

The following risks have been reviewed and are accepted for v1 delivery. They
are not grounds for blocking the build or for requesting architecture revision.

R-A: Publish atomicity is best-effort in a web resource context. The
three-retry backoff plus the automatic integrity check on designer open
(Sprint 1 Mandatory Action 2) is the maximum achievable without a server
component. The client must be informed of this limitation in the deployment
handoff documentation.

R-B: The CRM Advanced Filter Page postMessage contract carries no Microsoft
SDK guarantee. The automatic silent fallback to Path B on 5-second timeout
is the correct and sufficient mitigation for v1.

R-C: The qdb_workflow_snapshot Memo field may approach its 1 MB limit for
very large workflows (200+ steps). VersioningService must warn at 750 KB
of serialised payload and provide LZ-String compression if needed. This
is a build-phase implementation detail, not an architectural revision.

R-D: The sessionStorage autosave (queueMicrotask) is synchronous on the
main thread for the actual write. The 2-second debounce limits write
frequency sufficiently for v1. If user testing reveals visible pauses,
a Web Worker solution is already documented in the architecture as the
escalation path.

---

## 8. CEO Decision

DECISION: PHASE 4 BUILD AUTHORIZED WITH CONDITIONS

The architecture for CWFD-001 CRM Visual Workflow Designer is approved to
proceed to Phase 4 (Technical Build).

The architect has produced a rigorous, complete, and internally consistent
architecture document. All five Phase 1 CEO conditions are resolved or
conditionally resolved at the architecture level. Seven ADRs justify every
significant technology selection. The bundle strategy provides substantial
headroom. The FetchXML two-path design elevates what was a high-severity
risk in Phase 1 to a managed, mitigated risk with a complete fallback path.
The versioning schema delta is precise and client-actionable.

Authorization is subject to the eight Sprint 1 Mandatory Actions in Section 5
and the six Build Team Constraints in Section 6. These are not suggestions.
The tech lead is responsible for verifying that Sprint 1 Mandatory Actions 1
through 5 are complete before the first feature branch is merged.

Outstanding client confirmations (A-01, A-02, A-03) are the client's
responsibility. The build team may proceed on components that do not depend
on client-confirmed decisions, sequenced to avoid blocked code paths.

The next step is Phase 4 (Technical Build), beginning with Sprint 1.

---

*CEO Decision Complete — CWFD-001 | 2026-06-01*
*Decision: PHASE 4 BUILD AUTHORIZED WITH CONDITIONS*
*Next Step: Phase 4 Technical Build — Sprint 1*

═══════════════════════════════════════════════════════════════════════
END OF DOCUMENT — CWFD-001 Phase 3 Architecture CEO Review
Reviewed by: CEO — Maqsad AI | 2026-06-01
Status: BUILD AUTHORIZED WITH CONDITIONS
═══════════════════════════════════════════════════════════════════════
