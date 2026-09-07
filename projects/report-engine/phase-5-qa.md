# Phase 5 — QA · Report Engine (RPT-ENG-001)

Date: 2026-07-30 · Branch `feat/report-engine-prototype` · 101 commits ahead of `main`
Org under test: `org5869857f.crm4.dynamics.com` (sandbox)
Architecture under test: ADR-RPT-011 — engine runs **in** CRM (web resource + Dataverse plugin);
no hosted middle tier.

---

## 1. Verdict

**Conditional pass for UAT on a sandbox. Not ready for production.**

The feature set works end to end and is verified against live Dataverse, not mocks. What blocks
production is not a missing feature — it is the **defect discovery rate**, and where those defects
were found.

Nineteen defects were found in the most recent session alone. Every one of them was found by a
person walking a screen, or by running a report and reading the rows. **None were caught by the
automated suite**, which stands at 221 tests and was green throughout. Several had existed for
weeks: joined-entity columns had never worked through the wizard, and every report reading through
the generated query — as opposed to a saved view — failed outright on a row limit the designer
itself set by default.

A suite that stays green while the product cannot return a row is not measuring the product. That is
the finding this phase exists to record.

---

## 2. What was tested, and how

| Layer | Method | Result |
|---|---|---|
| Query building, filters, aggregates, row shaping | 140 automated tests (net8) | green |
| Plugin: execution log, audit, view resolution, failure detail | 81 automated tests (net462) | green |
| Designer — every wizard step | manual, live org, screenshot-verified | 19 defects found, all fixed |
| Report execution | `qdb_RunReport` against live Dataverse, row counts compared to source | pass |
| Access enforcement | ran as a user outside the access list | correctly refused |
| Configuration audit | provoked create/update/delete | all recorded |
| Failure diagnosis | provoked a Dataverse rejection | cause now recorded in `qdb_errordetail` |

**Discriminating tests were used deliberately.** A run that returns rows is not evidence that a
filter works. Each behaviour was proved by a change in result:

- CRM View honoured: `Active Accounts` → 5 rows; `Accounts Being Followed` → 0 rows, same 5 accounts.
- Report filter applied on top of a view: 5 rows → 2, with the view's own `statecode` filter intact.
- Runtime parameter: `"Q"` → 39 rows, `"M"` → 3, unanswered → 60.
- Aggregate: `Count` with no grouping → one row reading 5; grouped by phone → 5 groups of 1.
- Joined columns: 60 rows carrying real contact names and e-mail addresses.
- View scoping: a contact view requested on an account report is refused, not answered.

One test was rejected as non-discriminating and redone: an account/contact linked column returned
all nulls, which was honest — no account in the org has a primary contact — but proved nothing. A
temporary personal view was created to get data that discriminates, then deleted.

---

## 3. Defects found this session

All fixed, deployed and verified. Grouped by what they tell us.

### 3.1 Features that saved and did nothing

| Defect | Consequence |
|---|---|
| Filters and parameters inert on view-backed reports | A report could be narrowed, saved, and return every row. Parameters were worse than inert — filters are their only consumer, so a prompt answered carefully changed nothing. |
| 11 of 21 wizard ETL operations matched no transform type | Choosing "Deduplicate" silently stored a *rename* that renamed nothing. |
| 5 transform types claimed to be implemented; the pipeline ignored them | Configured, saved, no effect. |
| Canvas nodes could be added but not configured | "Add joined entity" dropped an empty box and sent the author elsewhere. |
| Designer's "Display name" discarded on save | Runtime headings showed logical names. |

### 3.2 Silent wrong answers — the most serious class

| Defect | Consequence |
|---|---|
| `top=50000` rejected by Dataverse | **Every report using the generated query failed.** Hidden because everything tested until then read through a saved view, which supplies its own query. |
| Joined columns stored against the primary table | The query asked `account` for `contact.fullname`. Joined-entity columns had never worked through the wizard. |
| Aggregate discarded on a view-backed report | A `Count` returned every underlying row, ungrouped and unlabelled. Not an error — plausible rows where a total was asked for. |
| Saved view matched by name across all tables | "My Connections" exists on account, contact and lead; the wrong table's view could be returned. |
| Filter operator matched by label | The option set says `BeginsWith`, the dropdown says `Begins with`. **Opening a report and saving it untouched rewrote its filters to Equals.** |

### 3.3 Diagnosability

A failed run recorded `unexpected_error` and `outcome=failed; rows=0`, with the reason only in the
plugin trace log — off by default and rolling over. Diagnosing the row-limit failure required
reading the definition back by hand. `qdb_errordetail` existed on the table and had never been
written; it now carries the exception, its cause chain and the Dataverse fault code.

---

## 4. Not verified — the honest list

These are untested, not known-good. Ranked by exposure.

1. **The runtime viewer has not been opened once against this session's changes.** Linked columns,
   display names and aggregates all changed the result contract. The viewer is the surface users
   actually see.
2. **Exports — PDF, Excel, CSV, Word, Image — have not been re-tested** since those changes. Export
   is where masking is applied, so this is a security surface, not only a rendering one.
3. **Arabic RTL has never been rendered.** Two languages are configurable; only English has been seen.
4. **Sub-reports, drilldown and dashboards** were verified in earlier sessions and not re-tested
   after the column and result-contract changes.
5. **Detail tables** are stored and shown in the designer; their rendered output has not been checked.
6. **No automated UI coverage exists.** Every designer defect this session was found by hand. This is
   the root cause of the discovery rate, not a side note.
7. **Scale is untested.** The org holds 5 accounts and ~60 contacts. Nothing here says anything about
   1,000 reports or 300 SSRS replacements.
8. **No paging.** Above 5,000 rows the report returns a page and flags itself truncated. That is
   honest but not sufficient for a reporting product.
9. **Concurrency and the 2-minute plugin ceiling** are unmeasured. One observed run took 104s after an
   assembly reload; that was cold-start, but the ceiling has not been characterised.

---

## 5. Known limitations, by design

- **8 of 11 data source types** are stored and not applied (SQL, REST, Core Banking, MIS, Middleware,
  QueryExpression, Web API, Custom API). The UI says so on each.
- **5 of 18 transform types** are stored and not applied. The UI says so.
- **Aggregating a column a view joined in is refused**, not approximated — the alias is not an
  attribute the root entity can group by.
- **Only `canexecute` is enforced** server-side. Export, edit and approve are stored and displayed;
  the browser already holds the rows by the time it exports, so claiming to enforce export would be
  theatre.
- **`qdb_reportcache` exists and nothing reads or writes it.** Every run goes to source; `CacheHit`
  is recorded as false rather than left blank.

---

## 6. Recommended entry criteria for UAT

1. Open the runtime viewer and confirm a report renders with linked columns and display names.
2. Export one report in each enabled format and confirm masking still applies.
3. Render one report in Arabic and confirm RTL.
4. Re-run one sub-report and one dashboard.
5. Seed an org with realistic volume and measure one report against the plugin's 2-minute ceiling.

Items 1–4 are hours of work. Item 5 is the one that decides whether the architecture holds.

---

## 7. Recommendation to the CEO

Approve for **sandbox UAT** with the five entry criteria above.

Do not approve production. The blocker is not features — it is that the automated suite does not
exercise the surfaces where the defects live, so we cannot yet distinguish "working" from
"not yet found to be broken". Recommend an automated UI pass over the wizard and runtime viewer
before a production gate is even scheduled.
