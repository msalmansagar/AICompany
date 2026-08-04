═══════════════════════════════════════════════════
CEO BRD APPROVAL — DFE-INFOLIST-001
Configurable List Styles in the Inline Info-Card Field
Date: 2026-07-20
Authority: Maqsad AI CEO
═══════════════════════════════════════════════════


DECISION: APPROVE WITH CONDITIONS
───────────────────────────────────────────────────


BUSINESS OBJECTIVE
───────────────────────────────────────────────────
QDB form makers currently cannot present sequential instructions or
bulleted guidance inside a single info-card field without resorting to
wall-of-text workarounds or multiple disconnected fields. This feature
adds two designer-configurable properties (list type and marker shape)
to the existing info-card field, enabling structured instructional
content — including QDB's branded circled-numeral style — to be
authored and rendered without data migration, schema breaking changes,
or loss of backward compatibility for any published form.


JUSTIFICATION
───────────────────────────────────────────────────
The BRD is complete, internally consistent, and well-scoped. Business
value is clear: structured lists reduce end-user error rates on
multi-step guidance and eliminate workarounds that fragment form
authoring. Risk is low — the feature is purely additive (two nullable
Picklist columns, no new entities, no new API surfaces), and the
backward-compatibility rule (BR-001 through BR-007) is explicit and
testable. The two-generator constraint is correctly identified as the
highest-severity deployment risk (RISK-001) and is adequately mitigated
by treating both generators as a single release unit. ROI is high
relative to build cost: this is a small, contained enhancement to an
already-shipped field type with an active user base.

The BRD fully satisfies the Phase 1 criteria: measurable objectives,
identified stakeholders, explicit constraints, and a traceability
matrix linking user stories to functional requirements.


OQ RULINGS
───────────────────────────────────────────────────

OQ-001 — Item delimiter: NEWLINE ('\n') — RULED

Decision: Newline ('\n') is the v1 delimiter. Use it.

Rationale: The list type is opt-in and off by default (BR-002). A
maker must actively select a list type to enter the newline-split path,
so existing bodies that happen to contain embedded newlines are
unaffected unless the maker deliberately enables a list type on that
field. If a maker enables list type on a field whose body already
contains embedded newlines, the split behavior is the expected and
correct outcome — body content becomes list items. The alternative
delimiter ('|||') imposes a non-standard authoring syntax, increases
the learning curve, and is inconsistent with how every other text input
in the designer works. The hint text (FR-017: "Each line of text
becomes one list item") is sufficient disclosure. '|||' is deferred
indefinitely — it solves a theoretical problem that is unlikely to
arise in practice given the opt-in gate.

OQ-003 — Mobile circled-marker at launch: MUST HAVE — RULED

Decision: The circled-marker on mobile is a Must Have at v1 launch.
Do not defer.

Rationale: QDB's design reference explicitly uses the circled-numeral
treatment as a branded visual pattern. Shipping web support without
mobile parity creates a visible inconsistency that QDB accessibility
officers will flag and that undermines the feature's value on mobile.
The React Native implementation is straightforward (View with
borderRadius + inline Roman-numeral utility capped at 50 items per
A-003/A-005). The complexity is bounded and well-understood. Deferral
would require a follow-up engagement and a second C# + Node + mobile
release cycle for a visual feature that should ship complete.

OQ-005 — 'None' marker with a list type: ALLOW — RULED

Decision: The combination "list type = bullet/numbered, marker = none"
is a supported use case. Do not block it in the designer.

Rationale: Indented content with no visible marker is a legitimate
typographic choice for visual hierarchy in instructional content.
Blocking it constrains makers unnecessarily. The default marker when
list type is set must remain 'plain' (BR-006 already mandates this),
so makers must make an explicit choice to suppress markers. That
explicit opt-in is sufficient. No designer validation rule is needed.

OQ-002 and OQ-004 are below CEO authority and are delegated to the
implementation phase: OQ-002 (circle fill color) to the frontend
implementer; OQ-004 (item-count warning) to the implementer's
discretion, with a recommendation to add a soft warning at 20 lines.

No items require ESCALATE-TO-USER.


ACCEPTANCE CRITERIA
───────────────────────────────────────────────────
The following criteria must all be met before the feature is considered
complete. These replace the formal QA/Audit/CEO-final phases for this
engagement.

AC-001 (List Type Rendering — Web)
  Given an info-card field with infoCardListType = 'numbered-roman' and
  three body lines, the frontend renders a semantic <ol> with
  list-style-type: upper-roman containing exactly three <li> elements.
  Verified by unit test.

AC-002 (Circled Marker — Web)
  Given infoCardListType = 'numbered-roman' and infoCardListMarker =
  'circle', each <li> marker is visually enclosed in a filled circle
  whose color derives from the card's existing style color token. No
  external library is used. Verified by unit test and visual inspection
  in the designer preview.

AC-003 (Mobile Rendering)
  Given infoCardListType = 'numbered-roman' and infoCardListMarker =
  'circle' on mobile, each item renders as a horizontal row with the
  computed Roman numeral prefix inside a styled circle View. Screen
  readers on iOS and Android announce the prefix + item text via
  accessibilityLabel. Verified by unit test.

AC-004 (Backward Compatibility — Web and Mobile)
  Given an existing info-card field record with no value for
  qdb_info_card_list_type, after deployment the rendered output is
  identical to the pre-deployment output. No new column value is written
  to the existing record. Verified by an automated test that explicitly
  asserts the existing parseInfoCardContent path is taken and no list
  container is rendered.

AC-005 (C# Plugin Parity)
  Given a field record with qdb_info_card_list_type = numbered-roman and
  qdb_info_card_list_marker = circle, the C# FormJsonGenerator produces
  JSON with infoCardListType = 'numbered-roman' and infoCardListMarker =
  'circle'. Given a field record with no value for either column, the
  C# plugin produces JSON with neither key present (NullValueHandling.Ignore
  confirmed). Verified by C# unit test on FieldBuilder + PicklistMapper.

AC-006 (Shared-Type Parity)
  The CI parity check (check-shared-type-sync.mjs) passes on the final
  PR branch, confirming infoCardListType and infoCardListMarker are
  present with identical signatures in both form.types.ts and form.ts.

AC-007 (Dataverse Provisioning)
  The provisioning script (provision-infolist.mjs) runs idempotently
  against org5869857f: a first run creates both columns; a second
  run produces no error and no duplicate columns.

AC-008 (Solution XML)
  Both qdb_info_card_list_type and qdb_info_card_list_marker are
  declared as individual RootComponent entries in solution.xml. No
  folder-level wildcard is used.

AC-009 (Bullet and Marker=None)
  Given infoCardListType = 'bullet' and infoCardListMarker = 'none',
  the rendered web output is an unordered list with no visible bullet
  marker but with the indented block layout preserved. Verified by
  unit test.

AC-010 (Empty Body Guard)
  Given infoCardListType = 'bullet' and infoCardBody = '' (empty or
  whitespace only), no list container (<ul> or <ol>) is rendered.
  Verified by unit test.


CONDITIONS BEFORE BUILD BEGINS
───────────────────────────────────────────────────
C-GO-001 (Dual-Generator Lockstep — Hard Gate)
  The Node backend (CrmMetadataService.ts) and the C# plugin
  (FieldBuilder.cs, PicklistMapper.cs, FormDefinitionModel.cs) must
  be updated, reviewed, and deployed in a single, coordinated release.
  No partial deployment is permitted under any circumstance. The
  implementer must flag this explicitly in the commit message and
  deployment checklist. A frontend-only or backend-only deploy is a
  release blocker.

C-GO-002 (Shared-Type Parity — Hard Gate)
  The CI parity check (check-shared-type-sync.mjs) must pass on every
  commit that touches either form.types.ts or form.ts. The implementer
  must confirm the parity check is active in the current CI pipeline
  before writing the first line of type code (see RISK-002).

C-GO-003 (Backward-Compat Test — Hard Gate)
  A unit test explicitly asserting the backward-compatibility guarantee
  (AC-004) must exist in the PR. This test must fail if the existing
  parseInfoCardContent code path is accidentally entered for a
  list-typed field, or if a list container is rendered for a field
  with no list type. No PR may be merged without this test green.

C-GO-004 (Provisioning Before Plugin Deploy)
  The provisioning script (provision-infolist.mjs) must be run against
  org5869857f and both columns confirmed present before the C# plugin
  is deployed. Deploying the plugin before the columns exist will
  cause a schema read error on the first plugin execution.

C-GO-005 (No New Dependencies)
  No new external npm packages or NuGet packages are introduced.
  Roman numeral computation and CSS circled-marker styling are
  implemented inline per C-005 in the BRD.

C-GO-006 (Streamlined Process — Agreed)
  This engagement runs on the streamlined track: BA analysis complete,
  CEO approval granted here. The formal Phase 3 (Architecture), Phase 4
  (build review), Phase 5 (QA agent), Phase 6 (Audit agent), and
  Phase 7 (CEO final) are waived. In their place: unit tests covering
  all AC items above are mandatory, and the implementer self-reviews
  against the clean code standards in .claude/rules/common.md before
  the PR is raised. No exceptions.


APPROVAL BLOCK
───────────────────────────────────────────────────
| Role      | Name             | Decision                  | Date       |
|-----------|------------------|---------------------------|------------|
| CEO       | Maqsad AI CEO    | APPROVE WITH CONDITIONS   | 2026-07-20 |
| Requestor | Pending          | PENDING                   |            |

═══════════════════════════════════════════════════
END OF APPROVAL DOCUMENT
═══════════════════════════════════════════════════
