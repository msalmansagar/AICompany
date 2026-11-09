# Second-opinion prompt — DFE vs Customer Survey Engine relationship (2026-11-08)

Neutral review prompt for an independent Claude session. It deliberately does not state which option the team
leans to. User has chosen Option E (separate copy) pending this review.

````text
I need an independent architecture review. Challenge the options below; do not assume any of them is right.

## Context
A consultancy builds a "Dynamic Form Engine" (DFE) for a bank (Qatar Development Bank) on Microsoft Dynamics CRM.
It must run on two on-premise orgs (Dynamics CRM 9.1) and one Dataverse cloud org. The bank now wants a
"Customer Survey Engine". The question is how the survey engine should relate to the DFE.

### What the DFE is today
- Designer: React 18 + Fluent UI v9 + zustand, about 28k lines, deployed as a CRM web resource.
  Hierarchy: form → tab (can display as wizard steps) → section → field. It has 23 field types,
  business rules (show/hide, required, set value), validation, translation (Arabic/English, RTL) and versioning.
- Runtime: a React SPA built two ways, as a portal app and as a single 2 MB CRM web resource
  (qdb_form_runtime.html).
- CRM side: about 40 tables with the prefix qdb_ (qdb_form_definition, qdb_form_tab, qdb_form_section, qdb_form_field,
  qdb_form_option_value, qdb_translation, qdb_form_version, qdb_form_render_cache, ...). There is a C# plugin
  assembly (.NET 4.6.2, sandbox) with the Custom APIs qdb_PublishForm (async; writes a gzip+base64 render cache per
  form/version/language) and qdb_GetPublishedFormJson. There is also a Node/Express backend that is Azure-AD-only and
  has no on-prem path.
- Tests: about 2,050 automated tests, all green.
- History: until today the DFE lived on about 37 feature branches; it was just merged to main and tagged as a
  baseline. It changes often.
- Known open defects:
  - The designer drops several field properties on Save, including the Rating display style.
  - Fields made required by a business rule are not enforced at Submit.
  - There are tab-index bugs in navigation.
  - One rule type (Conditional Required) is broken on the org.

### What a survey engine needs that the DFE does not have
- survey question types: NPS, Likert/matrix, ranking, slider, CSAT/CES;
- a survey lifecycle, with each survey fixed to one published version;
- invitations with token links, SMS/email, reminders and expiry;
- triggers from CRM business events;
- response storage (answers as JSON plus one row per question for reporting);
- scoring and analytics (Power BI);
- possibly anonymous public access through a DMZ gateway.

Survey content needs much of what the DFE already does: questions, conditional logic, multi-page navigation,
Arabic/RTL, versioning and publishing.

### The options
**Option B: survey module on the shared DFE core.**
- One designer and one renderer, with a "Survey" form type and new question controls added as new cases.
- Additive schema only (qdb_form_definition.qdb_form_kind, qdb_form_option_value.qdb_score).
- The survey domain lives in a separate CRM solution with its own tables.
- Consequence: survey work changes DFE code, so the DFE must be re-released and redeployed. Survey and form
  releases must be coordinated, and a regression check (re-publish every form, compare render-cache hashes) gates
  every DFE deploy.
- Estimate: about 145–210 dev-days.

**Option E: a separate copy of the DFE for the survey product.**
- Copy the DFE at the tagged baseline into a new project.
- Rename every CRM component, because both products install into the same orgs and identical names would
  overwrite the live DFE. That covers about 40 tables, the Custom APIs, the plugin assembly and the web resources.
- Strip the features surveys do not need (CRM field mapping, grids, lookups, info cards), then evolve it
  independently.
- Consequences:
  - zero release coupling and zero risk to existing forms;
  - about +15–25 dev-days for the rename and strip;
  - every shared defect has to be fixed twice;
  - the two products drift apart, and admins learn two designers.

**Option F: extract a shared library.**
- Move the reusable parts (renderer core, rule/expression engine, validation, translation, publish/render-cache
  logic) into a versioned shared package.
- The DFE and a new Survey product both depend on it, with separate CRM components and releases.
- The company's own architecture rules prefer this ("cross-cutting capabilities live once in a shared library").
- Consequences:
  - highest upfront cost and refactoring risk to the live DFE;
  - the cleanest long-term structure.

## What I want from you
1. Your verdict: which option you would choose for this situation, and why, in one paragraph.
2. The strongest argument against your own choice.
3. For Option E specifically:
   - what can go wrong when two products with near-identical code and renamed components live in the same
     Dynamics orgs (solution layering, plugin registration, web-resource caching, shared publisher, upgrade
     order, on-prem 9.1 quirks);
   - how you would make the rename provably complete.
4. What fraction of the DFE's open defects a survey product would inherit. Would you fix them before copying, or
   after?
5. Any option I have not listed that beats these three (for example, start with a copy and converge to a shared
   library later; or build survey content as plain DFE forms plus a thin survey layer).
6. The conditions under which your answer would flip (team size, expected lifetime of both products, how fast
   the DFE changes, whether the survey needs anonymous public access).
7. Anything above that you think is factually doubtful or under-specified. List it; don't assume it.

Be concrete and blunt. If one option is clearly wrong for this context, say so.
````
