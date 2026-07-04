═══════════════════════════════════════════════════════════════════════
CEO BRD APPROVAL DECISION
═══════════════════════════════════════════════════════════════════════
Project:         DFE-STYLE-001 — Advanced Visual Styling & Full CSS
                 Control for the Dynamic Form Engine
Client:          Qatar Development Bank (QDB)
Reviewed by:     CEO, Maqsad AI
Date:            2026-06-28
BRD Version:     1.0 (Draft — Pending CEO Approval)
Prior phases:    DFE-ADD-001/002 (APPROVED WITH CONDITIONS)
                 DFE-RC-001 (DELIVERED)
                 DFE-i18n-001 (CEO APPROVED WITH CONDITIONS)
═══════════════════════════════════════════════════════════════════════


DECISION: APPROVED WITH CONDITIONS
───────────────────────────────────────────────────────────────────────

Architecture (Phase 3) is authorised to begin subject to the six
conditions below. Conditions C-001, C-002, and C-003 are HARD GATES:
architecture work on the sections they govern may not begin until the
condition is resolved. Conditions C-004, C-005, and C-006 must be
satisfied as deliverables within the Phase 3 output before that phase
is submitted for approval.


JUSTIFICATION
───────────────────────────────────────────────────────────────────────

1. THE BUSINESS CASE IS CREDIBLE AND WELL-TIMED

   QDB has already committed capital to DFE-ADD-001/002, DFE-RC-001,
   and DFE-i18n-001. Each prior engagement extended the engine's
   capability without closing the loop between what the runtime can
   render and what a form admin can configure. This engagement closes
   that loop entirely and is the natural completion of the investment
   QDB has already made.

   I reviewed design.types.ts directly. The runtime type contract is
   real, complete, and well-structured: ThemeDefinition carries 22
   fields, FormDesign carries 13, SectionDesign carries 10, FieldDesign
   carries 13, ButtonDesign carries 10, and LayoutGrid is fully typed.
   The StyleEngine already resolves DesignPayload into CSSProperties.
   The BRD's central premise — that the designer exposes only 12
   controls while the runtime supports a full design system — is
   confirmed by code inspection.

2. THE DESIGNERSTYLEMODEL DEPRECATION IS ESSENTIAL, NOT OPTIONAL

   I inspected DesignerStyleModel.ts. The divergence between that type
   and the shared contract is not superficial. Field names differ
   (accentColor vs secondaryColor), value types differ (borderRadius:
   number vs string, fontSizeBase: number vs baseFontSize: string), and
   enumerated values differ (navStyle: tabs|stepper vs TabStyleType).
   Leaving DesignerStyleModel in place while adding 50+ new design
   properties to the Zustand store would produce two competing type
   contracts within a single component. That is an architect's failure
   waiting to happen. The decision to include deprecation in this
   engagement is correct. The BA is right to make it in-scope.

   NOTE: BO-006 is stated as a business objective. It is in reality a
   technical housekeeping objective with business consequence. It
   belongs in the scope section as a technical requirement, not in the
   business objectives list. The BA should reclassify it in future BRD
   versions. This does not block approval.

3. BUSINESS OBJECTIVES ARE MEASURABLE AND TRACEABLE

   BO-001 through BO-005 map cleanly to quantifiable success metrics
   (SM-001 through SM-008). The success criterion of "from brand update
   to re-styled published form in under one working day" (BO-001, SM-001
   30-minute admin styling benchmark) is verifiable in UAT. BO-004
   (portal + on-prem parity) and BO-005 (WCAG at authoring time) are
   particularly strong, as they address real operational failure modes
   from prior phases: on-prem lag and post-publication accessibility
   remediation.

4. SCOPE BOUNDARY IS CORRECTLY DRAWN

   Tier 3 deferrals (conditional styling, named presets, DXP token
   integration, Brand Kit) are appropriate. All four are blocked on
   open questions that cannot be answered within this engagement's
   timeline. No Tier 3 item should be pulled forward. The engagement
   is already large and the Dataverse schema work alone (50+ new
   attributes, one new entity) will consume significant QDB IT sign-off
   cycles.

5. RISK REGISTER IS MOSTLY SOUND

   Ten risks are identified with mitigations. R-001 (JSON size), R-002
   (CSS injection), R-007 (RTL logical property on-prem), and R-009
   (async cache regeneration) are the most credible threats and are
   correctly rated. Two risks are absent from the register — see
   Condition C-004 below.

6. BACKWARD COMPATIBILITY STRATEGY IS SOUND

   FR-093 through FR-095 correctly specify optional fields, null-to-
   default inference in StyleEngine, no modification on open, and PATCH
   semantics. Given that design.types.ts already marks most extension
   fields as optional, the backward compat argument is structurally
   sound. The cache default path (FR-082: default payload for forms
   without qdb_form_design) is correctly included.


CONDITIONS (all six must be met before Phase 3 is approved)
───────────────────────────────────────────────────────────────────────

CONDITION C-001 — RENDER CACHE JSON SIZE (HARD GATE)
Owner: Maqsad AI CRM Developer + QDB IT
Gate: Architecture may not begin until this is resolved.

OQ-008 (current render cache JSON size per form) must be answered
before Phase 3 begins. R-001 is rated High/Medium and this is the
correct rating. The 512KB cap in NFR-004 was set without knowledge of
the current baseline. If existing cache entries already consume 200KB+
for a mid-complexity form, adding a full DesignPayload (50+ new
attributes) could push the total past the Dataverse column limit for
nvarchar(MAX) practical serialization, or past Dynamics on-prem record
size limits.

The CRM Developer must pull the actual JSON size from a representative
set of existing published forms (minimum 5, spanning simple/medium/
complex) and report the results to the architect. If any existing form
exceeds 300KB after caching, the architect must evaluate separate blob
storage (Azure Blob or Dataverse file column) for the DesignPayload
before designing the Phase 3 schema.

This is not BA over-caution. This is a foundational architectural
input that determines whether the entire schema approach is viable.

CONDITION C-002 — LIVE PREVIEW AMBIGUITY (HARD GATE)
Owner: Maqsad AI BA + QDB Form Admin lead
Gate: Frontend architecture for the designer may not begin until
resolved.

FR-023 states "live preview updates without save." The out-of-scope
list explicitly excludes "live preview iframe." These two statements
are in conflict.

The only interpretation that is consistent with the out-of-scope
declaration is that FR-023 means: CSS custom property values (--qdb-*)
are updated in real time on the designer's own canvas as the admin
changes controls, not via a sandboxed iframe rendering the actual
published form. If that is the intended interpretation, the BRD must
say so explicitly before architecture begins. If QDB's expectation is
a live preview that renders the form as end users will see it, that
requires an iframe (or equivalent sandboxed rendering), which is
explicitly out of scope and cannot be delivered in this engagement.

The BA must obtain QDB's confirmation of which interpretation is
correct, document it in a BRD amendment, and deliver it to the
architect before the designer component architecture is designed. A
misaligned expectation on live preview will surface as a UAT rejection
at the worst possible time.

CONDITION C-003 — WCAG STATE STYLE SCOPE (HARD GATE)
Owner: QDB Compliance Team
Gate: WCAG architecture (Groups B and D) may not be designed until
resolved.

OQ-009 (does WCAG contrast enforcement apply to state-specific colour
properties — focusStyle, errorStyle, disabledStyle, placeholderStyle,
tooltipStyle?) must be answered by QDB Compliance before Phase 3
begins. This is not BA over-caution.

The implementation difference is substantial:
- If WCAG enforcement applies only to primary colour pairs (background
  + text, background + border), the contrast checker is straightforward.
- If it applies to all state style colour properties, there are
  potentially 8-12 independent colour pairs requiring real-time contrast
  calculation per field, which changes the implementation surface of
  FR-025 through FR-030 significantly.

The architect cannot design the WCAG enforcement architecture until
this boundary is defined. The BA must obtain a written response from
QDB Compliance and document it in a BRD amendment before Phase 3.

CONDITION C-004 — MISSING RISKS MUST BE ADDED TO RISK REGISTER
Owner: BA (BRD amendment) + Architect (mitigation design in Phase 3)
Gate: Phase 3 must include mitigations for both risks below.

Two material risks are absent from the BRD. Both must be added to the
risk register in a BRD amendment and addressed by the architect.

MISSING RISK A — DATAVERSE SCHEMA DEPLOYMENT SEQUENCING (Medium/High)
The engagement adds 50+ new Dataverse attributes and one new entity.
If the managed solution is deployed to QDB's environment after the
new application code is already deployed, the code will attempt to
read attributes that do not yet exist and could corrupt existing
cache entries or crash on-prem runtime sessions during the gap window.
Conversely, if schema deploys before code, old code reading new schema
columns is safe (nulls) — but the window still requires a coordinated
deployment procedure. The architecture must define the deployment
sequence (schema first, then backend, then frontend, then cache
invalidation), a rollback procedure if schema deployment fails, and a
maintenance window recommendation to QDB IT.

MISSING RISK B — DESIGNER PERFORMANCE UNDER LARGE PROPERTY COUNT
(Medium/Medium)
The designer will now render per-field style tabs with up to 15
controls each. A form with 20 fields and 5 sections yields potentially
350+ Fluent UI v9 controls in the property panel tree simultaneously.
NFR-002 (200ms initial render for a style panel) addresses single-panel
render time but does not address cumulative DOM weight or re-render
cascades when a ThemeDefinition change invalidates all field/section
panels simultaneously. The architect must assess whether virtual-
rendering or lazy-mount strategies are needed for large forms.

CONDITION C-005 — CSS SANITIZATION ARCHITECTURE MUST BE EXPLICIT
Owner: Architect (Phase 3 deliverable)
Gate: Phase 3 output must include this design. It does not block
starting architecture but must be present before Phase 3 is approved.

R-002 (CSS injection) is acknowledged but the mitigation stated in the
BRD ("strict CSS sanitization at save + runtime; Phase 6 audit test")
is underspecified at two points:

POINT 1 — The url() allowlist in customCss. NFR-008 defines the fontUrl
allowlist as a Dataverse config record. NFR-005 blocks url() from non-
allowlisted domains in customCss. But these are two different
mechanisms — fontUrl is a dedicated field with its own validator, while
url() in the CSS textarea is blocked by a content sanitizer. Is the
same allowlist used for both? If not, an admin can embed an approved
fontUrl as a url() value in the CSS textarea and bypass the textarea
validator. The architecture must clarify this and define a single
allowlist source for both paths.

POINT 2 — On-prem runtime cache trust model. FR-089 specifies that
the on-prem qdb_form_runtime.html applies the customCss scoped block
from the cache. Does the on-prem runtime re-sanitize CSS on read, or
does it trust cache integrity? If the cache endpoint is compromised or
the Dataverse record is tampered with, the on-prem runtime could render
malicious CSS without any defence layer. The architecture must specify
whether the on-prem runtime is a trusting consumer of the cache or
applies its own sanitization pass on the customCss block before
injection into the DOM.

Both points must be answered in the Phase 3 architecture output. Phase
6 audit must test both, and this must be an explicit audit test case
in Phase 5 QA.

CONDITION C-006 — OQ-006 OWNERSHIP CORRECTION
Owner: BA (BRD amendment, immediate)
Gate: Does not block starting architecture, but must be corrected
before Phase 3 is submitted for approval.

OQ-006 (DesignerStyleModel deprecation scope confirmation) lists "QDB
IT Director" as a required approver. This is incorrect. The
DesignerStyleModel is an internal TypeScript type within the Maqsad AI-
authored designer web resource. Its deprecation scope — which modules
reference it, what the migration surface is — is a Maqsad AI internal
determination. QDB IT Director has no basis to make or block this
decision.

The BA must amend OQ-006 to have owner: "Maqsad AI PM + Architect" and
resolve it immediately before Phase 3 begins. The resolution should
confirm: (a) the complete list of files that reference DesignerStyleModel
beyond DesignerStyleModel.ts itself, (b) whether any references exist
outside the designer web resource, and (c) if so, whether those are in
scope for this engagement. The Maqsad AI architect must receive this
list before designing the Zustand store migration.

I note from code inspection that DesignerStyleModel.ts is at:
  projects/dynamic-form-engine/designer/src/state/models/DesignerStyleModel.ts
The scope of the migration is bounded to the designer web resource.
This can be confirmed with a single grep and resolved in hours. It
should not be presented to QDB IT as an open question.


WHAT IS AUTHORISED TO BEGIN NOW
───────────────────────────────────────────────────────────────────────
The following architecture work may begin immediately without waiting
for the conditions above:

- Dataverse managed solution structure and deployment sequencing design
  (addresses C-004 Missing Risk A before it becomes a build problem)
- StyleEngine memoization design (NFR-096 to NFR-098 — no OQ dependency)
- Type consolidation architecture: DesignerStyleModel migration plan
  (after C-006 is resolved, which the architect can do same day)
- Fluent UI v9 component selection for each design control group
- Zod schema extension design for DesignPayload validation
- LayoutGrid entity and relationship design (qdb_layout_grid)
- RTL logical property substitution table formalisation (FR-090 to
  FR-092 — no OQ dependency)
- attributeNames.ts registry design for all new Dataverse attributes

The following architecture work must wait for conditions to be met:

- WCAG enforcement architecture (Groups B and D): wait for C-003
- Designer live preview component design: wait for C-002
- Render cache JSON schema and DesignPayload size strategy: wait for C-001
- CSS sanitization mechanism design: may begin but must complete C-005
  before Phase 3 is submitted


WHAT MUST NOT BEGIN UNTIL ALL CONDITIONS ARE MET
───────────────────────────────────────────────────────────────────────
No Phase 4 build work (backend, frontend, CRM, or middleware) may begin
until Phase 3 Architecture is approved. Phase 3 approval requires all
six conditions above to be resolved.

Specifically:
- No Dataverse attribute deployment scripts may be written until C-001
  (render cache size) is answered and the storage strategy is confirmed
- No designer frontend code may be written until C-002 (live preview
  interpretation) is confirmed in writing from QDB
- No WCAG implementation may be written until C-003 (WCAG state style
  scope) is answered by QDB Compliance


ADDITIONAL NOTES FOR THE ARCHITECT
───────────────────────────────────────────────────────────────────────
These are not blocking conditions but must be addressed in Phase 3:

1. CSS AUTOCOMPLETE COMPLEXITY (FR-068 to FR-071)
   The BRD describes CSS autocomplete for cssClassName and --qdb-*
   vars as though it is a minor feature. It is not. Autocomplete
   requires token analysis of the current ThemeDefinition to generate
   the --qdb-* var list, and a CSS identifier validator to enforce
   NFR-006. The architect should evaluate whether a mature Fluent UI
   v9 Monaco editor integration or a simpler datalist-based suggestion
   mechanism meets the requirement — the former is significantly more
   complex to integrate and maintain. Scope this explicitly in Phase 3
   and document the adoption decision per the dependency policy.

2. EXISTING CACHE ENTRIES WITHOUT NEW DESIGNPAYLOAD FIELDS
   The BRD (FR-082) covers forms without any qdb_form_design record.
   But it does not explicitly address existing cache entries that have
   a qdb_form_design record in the OLD format (before this engagement's
   schema additions). The architect must confirm that the StyleEngine's
   null-to-default inference handles partial DesignPayload objects
   (missing new optional fields) without error, and define whether a
   cache invalidation sweep of all existing published forms is needed
   post-deployment or whether lazy rehydration on next publish is
   sufficient.

3. CONTENT SECURITY POLICY
   The BRD does not mention CSP headers as a defence layer against CSS
   injection. The architect should evaluate whether the portal Next.js
   app and the on-prem CRM page enforce CSP headers that would limit
   the damage of any CSS injection that bypasses sanitization. This
   is defence-in-depth and should be documented even if existing CSP
   headers already cover it.


SUCCESS CRITERIA FOR PHASE 7 FINAL APPROVAL
───────────────────────────────────────────────────────────────────────
At engagement close, all eight success metrics from the BRD (SM-001
through SM-008) must be verified. In addition, the following criteria
will be assessed at Phase 7:

1. OQ-009 WCAG scope answer must be reflected in the delivered
   implementation — if QDB Compliance included state styles, every
   colour property in focusStyle, errorStyle, and placeholderStyle
   must have a live contrast indicator in the designer.

2. DesignerStyleModel must be unreferenced across the entire codebase
   at engagement close. A TypeScript build that fails on any import
   of DesignerStyleModel in new code is the verification mechanism.

3. The deployment sequencing procedure (C-004) must be executed in
   staging and confirmed before production deployment. A staging sign-
   off document must be included in the Phase 7 package.

4. The CSS injection Phase 6 audit must include explicit test cases
   for: (a) malicious url() in customCss textarea, (b) expression()
   in customCss, (c) cssClassName with injected attribute syntax,
   (d) on-prem runtime behaviour when a tampered cache entry is served.
   All four must produce zero successful injections.

5. RTL regression tests must run on both the portal (Next.js) and the
   on-prem runtime (qdb_form_runtime.html) and confirm visual parity
   in Arabic form rendering after all styling changes are applied.


═══════════════════════════════════════════════════════════════════════
SIGNED OFF
Role:      CEO, Maqsad AI
Decision:  APPROVED WITH CONDITIONS (6 conditions, see above)
Date:      2026-06-28
Engagement: DFE-STYLE-001
═══════════════════════════════════════════════════════════════════════
