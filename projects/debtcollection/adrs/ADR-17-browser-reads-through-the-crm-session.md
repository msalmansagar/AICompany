# ADR-DCP-17 — The workspace reads through the signed-in CRM session, and decides nothing

**Status:** Accepted (Phase 5) · **Date:** 2026-09-18 · **Deciders:** user (Phase 5 authorisation), architect
**Relates to:** ADR-DCP-07 (full-page web resource), ADR-DCP-10 (dual-platform single codebase), ADR-DCP-13 (Rule Engine facade), ADR-DCP-16 (paging as a platform contract), KI-09, KI-44, KI-52, KI-53.

## Context

Phase 5 converted the approved prototype into a production React workspace. Three questions had to be
settled before twenty-one views were built on top of an assumption.

**Where do reads go?** The workspace runs inside Dynamics as a full-page web resource. It could call
the Integration Service over HTTP, or it could call CRM directly through `Xrm.WebApi` in the session
that already exists.

**What may the browser decide?** The prototype computed things: it derived buckets, showed SLA states
and totalled portfolio figures from its mock arrays. Every one of those is a business rule that now
exists, server-side, in `@dcp/domain`.

**What evidence counts?** KI-52 was a Dataverse lookup selected by its storage column instead of its
`_value` form. It returned nothing, every strategy resolved with zero actions, and **every unit test
stayed green** — because the in-memory adapter answered exactly what the code asked for. A frontend
built the same way would reproduce the same class of defect at twenty-one times the surface area.

## Decision

### 1. Reads go through `Xrm.WebApi`, in the signed-in user's session

`XrmCrmAdapter` implements the **existing** `ICrmAdapter` that Phases 2–4 already proved service-side.
Two differences from the service adapter are real, and both were verified against the platform rather
than assumed:

* `Xrm.WebApi` takes an entity **logical** name; OData takes the entity **set** name. `qdb_crmlogs`
  is served at `qdb_crmlogses`, which the naive plural rule gets wrong. Known exceptions are listed,
  not derived.
* Paging is `maxPageSize` plus a returned `nextLink`, not a `Prefer` header the caller sets. The link
  stays opaque and is followed verbatim, wrapped in the Phase 4 `ContinuationToken`.

The consequence that matters: **CRM's own role-based security is authoritative.** Every read is made
as the signed-in user and succeeds or fails on their privileges. React's role gating hides navigation
entries and nothing more; a user who reaches a hidden view by URL sees whatever CRM allows, which is
the correct outcome rather than a hole.

### 2. `execute` refuses, so decisions stay server-side

`XrmCrmAdapter.execute` throws with a named reason. `Xrm.WebApi.execute` requires a request object
carrying per-parameter metadata that this seam does not carry, and half-working would be worse than
refusing. Engine operations — eligibility, strategy resolution, assignment, contact hold — are
reached through the Integration Service, which keeps the decision where ADR-DCP-13 put it.

### 3. The browser shapes and narrows; it never derives

Query modules compose `$filter`, `$orderby` and the source's own search and send them to the
platform. They map rows to view models. They do not compare a DPD against a threshold, derive a
bucket, decide eligibility or resolve a strategy — and a test greps the source to keep it that way.

Two consequences are visible on screen and are deliberate:

* **A KPI is a platform count or an em dash.** `$count` answers "how many" without sending the rows.
  A figure the Web API cannot compute — overdue balance across a portfolio, a kept rate, an SLA
  breach count — shows `—` and names the phase that will supply it. Dataverse's 5,000 cap is reported
  as `5,000+`, because "5,000" and "at least 5,000" are different claims.
* **Aggregation is arithmetic over rows already read, and says when it is partial.** Customer 360
  sums the exposure of the cases it retrieved. Where more cases exist than one page holds, the totals
  are labelled partial rather than presented as the customer's position.

### 4. One registry names every column, and the organisation is asked whether it is right

`apps/web/src/data/schema.ts` holds every `qdb_` entity set and column the browser reads. Views never
see a `qdb_` name. `verify-view-columns.mts` reads that same constant and checks each attribute
against live metadata; `smoke-qdb-phase5.mts` runs the query modules themselves against seeded rows
and asserts the values arrive in the shape the screens render.

Choice labels are hard-coded **only** where the option values are already proven by the service layer
and its live smokes. Elsewhere the platform's own formatted value is used, and an unknown value
renders as an em dash. No option value is guessed.

### 5. Nothing is faked to make the workspace look finished

A view a later phase owns keeps its navigation entry, its place and its layout, and states which
phase will make it work. No data is shown there, because none would be real. An approved column with
no canonical field behind it is preserved and marked *not yet sourced*. A cached or stored figure is
never rendered as current live MIS.

## Consequences

**Good.** One source tree serves Housing Loan and BFD on both platforms, because nothing branches on
an organisation name. Security is the platform's. The Phase 4 paging contract carried over unchanged,
which is why the largest single package landed in a fraction of its estimate. Every list is bounded
by construction rather than by care.

**Costs, accepted.** The workspace cannot call a server-side operation, so anything that must decide
waits for an Integration Service route. There is no standalone mode: without a CRM session the
workspace refuses, by design. And the evidence this phase can produce stops short of runtime —
proving that the adapter, the queries and the artefact are right is not the same as proving the page
runs inside Dynamics, which needs an authenticated interactive session and is reported as pending
rather than assumed.

**Rejected alternatives.** Calling the Integration Service over HTTP from the browser would have
needed a second authentication path on the on-premises estate (still `TBD — Requires QDB
Confirmation`) and would have put DCP's own service in front of CRM security. Embedding the existing
HTML in an iframe was explicitly excluded by the Phase 5 authorisation. Re-implementing the rules in
JavaScript "just for display" is the duplication this ADR exists to prevent.
