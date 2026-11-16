# ADR-009 — Audience filter stored on the trigger, built with the CRM condition page

**Project:** CSE-ENG-001 — Customer Survey Engine
**Status:** Proposed
**Date:** 2026-11-16
**Requirements:** FR-CSE-089..091, NFR-CSE-017/018 (BRD Addendum D); CEO answer OQ-D2

## Context

General one-time surveys need an audience chosen with an Advanced Find-style filter. The CEO chose to store the
filter **on the survey trigger** as FetchXML, edited by a web resource on the trigger form, reusing the pattern
already proven in the Process Engine: `qdb_AdvanceFindFilter.html` + `qdb_AdvanceFindJs.js`, which host CRM's
`/SFA/goal/ParticipatingQueryCondition.aspx` in an iframe and read/write its control
(`advFind.parentElement.children.advFind.control.get_fetchXml / set_fetchXml`). That page is undocumented.

## Options

1. **Reference the Process Engine resources directly.** No new code, but the script is hard-wired to the
   `qdb_filter` column and to `alert()` / `debugger`, and the SurveyEngine solution would depend on another
   product's components on every org.
2. **Re-implement the same technique under the survey's own web resource**, with the survey column, metadata-
   resolved ObjectTypeCode, bounded retries, form notifications and a FetchXML text-box fallback.
3. Build a custom query builder. Weeks of work; the CEO rejected it (OQ-D2).

## Decision

**Option 2.** `qdb_/survey/trigger-audience.html` re-implements the proven technique for
`qdb_audience_fetchxml`. The server never trusts the stored FetchXML: `AudienceQuery` validates it (single
entity = the org's customer table, no aggregate) and rewrites it (keep filters and link-entities, drop
attributes/order/top/count/page, distinct, id only, cookie paging) at save time and again at send time.
Only Survey Admin / System Administrator may save a One-time trigger.

## Consequences

- Same UX as the Process Engine; no cross-product dependency in the kit.
- The undocumented page is a risk on 9.1: preflight P15 checks it before go-live; the text-box fallback
  (paste FetchXML downloaded from Advanced Find) works on every org.
- Filters are re-evaluated at send time (BR-AUD-01); the trigger records counts, not the list of recipients.
