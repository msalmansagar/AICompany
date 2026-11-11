# B9 item 2 — On-prem readiness review (CSE-ENG-001)

| | |
|---|---|
| Date | 2026-11-11 |
| Scope | Everything built in B0–B8 and Addendum A, checked against the two on-prem CRM 9.1 orgs: **HL CRM** (individual customers) and **BFD CRM / QDB1** (corporate/SME customers) |
| Method | Code and design review against what 9.1 supports, plus what earlier QDB on-prem work learned (Form Engine on-prem kits, Debt Collection two-org deployment). I cannot reach either on-prem org, so anything only an on-prem org can answer is turned into a **preflight check** for the runbook. |

## Summary

| Severity | Count | Meaning |
|---|---|---|
| **Critical** | 1 | Would make the engine fail on one org. Needs a design decision before the kits are built. |
| **High** | 3 | Would fail the import or the first run if not handled. Each has a known fix. |
| **Medium** | 6 | Configuration or packaging work for the kits and runbook. |
| **Low** | 4 | Confirmed fine; recorded so nobody re-checks them. |

## Findings

| # | Severity | Finding | Evidence | Action |
|---|---|---|---|---|
| F1 | **Critical** | **The engine assumes every customer is an `account`, but HL CRM's customers are `contact`s (individuals).** Every customer link points at account: invitation, response and suppression lookups; the source's customer field is read as an account; `ListPendingSurveys` takes an account id; email is addressed to the account; the SMS customer link is an account; "all active customers" counts accounts; the language and mobile fields are read from account. On HL, the first trigger would fail to create its invitation, because a contact id written into an account lookup is rejected. | B1 decision "Customer lookup = account" (phase-3-arch, decisions B1) was made on the cloud org, where all sources point at account. Debt Collection memory: HL CRM = individuals = contacts; BFD/QDB1 = corporates = accounts. | **Decision needed.** Recommended: make the customer table a **per-org setting** (`account` or `contact`) with a second lookup column for contact on invitation, response and suppression log. The code then follows the setting everywhere it touches the customer. Cloud and BFD stay on account; HL uses contact. See "Fix options for F1" below. |
| F2 | High | **Custom APIs on 9.1 are assumed, not yet proven on QDB's orgs.** All seven survey APIs and the Form Engine's own `qdb_PublishForm` / `qdb_GetPublishedFormJson` are Custom APIs. The Form Engine kit notes say "Custom APIs require 9.0+" but no on-prem run is recorded as verified. | `dynamic-form-engine/onprem-deploy/README-onprem-deploy.md`; DFE on-prem memory: "not yet verified on the on-prem org". The 2026-10-19 on-prem report shows the Form Engine runtime calling the Web API there, so the Form Engine is installed. | **Preflight check 1:** QDB IT confirms the `customapi` table exists (`/api/data/v9.0/customapis?$top=1`), and that `qdb_GetPublishedFormJson` answers. If Custom APIs are absent, every API needs a custom-action fallback: a large change, to raise before the import. |
| F3 | High | **Solution package version.** A solution exported from the cloud org is stamped 9.2; on-prem 9.1 can refuse it as "exported from a newer version". | Form Engine on-prem kit, known risk. | Kit build down-levels `solution.xml` to 9.1 and repacks (Form Engine precedent). |
| F4 | High | **The six trigger steps registered on the cloud org name the cloud's request tables** (`qdb_loan_application`, `qdb_payment_authorization_ticket`, `qdb_cheque_clearing`). If they ship in the solution, the import fails on any org without those exact tables (missing dependency), and HL certainly differs. | B2 registration; HL and BFD are separate QDB builds (Debt Collection memory). | Kit **excludes** the trigger steps. On-prem, each source's steps are created by `qdb_srv_ActivateSource` when an administrator activates it; B4 already does this for sources added later. The two dispatch steps are on the survey's own invitation table, so they ship. |
| F5 | Medium | **Plugin framework.** Both `Qdb.SurveyEngine` and `Qdb.FormEngine.Plugins` target .NET 4.7.1. | csproj files. | **Preflight check 2:** the CRM and async servers have .NET Framework 4.7.1 or later. The Form Engine plugin, same target, already runs there, so this is likely satisfied. |
| F6 | Medium | **Async and sandbox services.** Triggers and dispatch are async plugins; all plugins run in the sandbox. | Architecture section 6. | **Preflight check 3:** Asynchronous Processing Service and Sandbox Processing Service are running on both orgs. |
| F7 | Medium | **Per-org request tables and fields.** Each org's sources (table, customer field, status field and values, type field, Digital/Legacy field) differ. | FR-CSE-006; OQ-A2(b)(d). | B9 item 4: `config/HL.json`, `config/BFD.json`, with every unknown marked TO-CONFIRM. Seeded only after QDB confirms the values. |
| F8 | Medium | **SMS hand-off per org.** HL sends SMS through `letter` (recipient `vrp_address`, text `vrp_description`); BFD/QDB1 through `fax` (text `qdb_message_body`). The engine's per-org SMS configuration fits both. The customer link on HL must be a contact (F1). | Debt Collection memory, SMS per org. | Config templates (item 4); confirm HL's exact column spelling (`vrp_description` vs `vrp_descriptions`) on HL itself. |
| F9 | Medium | **Email on-prem.** Delivery goes through Email Router or server-side sync with on-prem Exchange. The sender queue must have an approved, enabled mailbox. The cloud test showed that a queue with no address makes every send fail ("Could not find email address for recipient of type 'Queue'"). | B7 live test. | Runbook: QDB IT names and approves a sender queue per org before secure links are switched on. |
| F10 | Medium | **The app icon uses a platform web resource id** (`953b9fac-…`, the default app icon). If that id is missing on 9.1, the app import fails on a missing dependency. | `provisioning/lib/ui-steps.mjs`. | Kit uses the survey's own icon web resource (`qdb_icon_survey_setup`) as the app icon, and the cloud app is updated to match, so the solution carries no outside dependency. |
| F11 | Low | **Web API versions.** On-prem 9.1 serves `v9.0`/`v9.1`, not `v9.2`. The scheduler script and the integration guide use `v9.0`. The runtime and designer call through `Xrm.WebApi` with no version in the path (the 2026-10-19 Form Engine fix). | `scheduler/Invoke-RunDueSurveys.ps1`; DFE APIVAL memory. | None. |
| F12 | Low | **SDK features used by the plugins** all exist in 9.1: optimistic concurrency (`UpdateRequest` with row version, since 7.1), `SetStateRequest`, `SendEmailRequest`, `RetrieveAttributeRequest`, FetchXML aggregates and paging, `DataContractJsonSerializer`. | Code review. | None. |
| F13 | Low | **Render cache** is a memo column, not a file column, so it works on 9.1 unchanged; the survey APIs read it the same way. | Form Engine `RenderCacheRepository`. | None. |
| F14 | Low | **Provisioning and E2E scripts are cloud-only** (client-credentials sign-in). On-prem gets the schema from the solution, and the checks from a Windows-auth PowerShell smoke test (item 6). | Scripts. | Covered by items 3 and 6. |

## Form Engine changes the on-prem orgs also need

The surveys depend on Form Engine changes made in this project that no on-prem Form Engine kit carries yet:

| Change | Phase |
|---|---|
| `qdb_form_type` column (Standard/Survey), survey code prefix, Save-defect fix, Is Editable fix | B0 |
| Survey branch in the runtime (`qdb_form_runtime.html`), and no "Submit another" on surveys | B6, B9 |
| Scoring columns, designer boxes, publish rules PV-015..018, publisher emitting scoring values, option points read with all columns | Addendum A |

The latest on-prem Form Engine kit (`onprem-deploy/2026-10-19`, 1.4.1) predates all of these. The B9 kit therefore carries a **Form Engine update**. Its regression gate must use the **safe re-publish** rule: never re-publish a form whose definition **or child rows** are ahead of its live version (`republish-safe.mjs`). On-prem, QDB IT runs that check by hand or with a Windows-auth variant.

## Fix options for F1 (customer table)

| Option | What changes | Effort | Recommendation |
|---|---|---|---|
| **A. Per-org customer table** | One setting `qdb_customer_table` (`account`/`contact`) on Survey Settings. Add a contact lookup beside each account lookup (invitation, response, suppression log); the code writes whichever the setting names. APIs accept the customer id and check it against the column in use. Email and SMS address the right table; "all active customers" reads the right table; language and mobile fields are read from it. | ~3–4 dev-days + cloud re-test of B2–B8 | **Recommended**: works on all three orgs with one codebase, and the existing account data stays as it is. |
| B. Polymorphic Customer lookup | Replace the account lookups with Dataverse "Customer" lookups (account or contact). | Similar, but **existing lookup columns cannot change type**: new columns, data migration on the cloud org, and every query and view changes | Not recommended. |
| C. HL out of scope for release 1 | Ship to BFD/QDB1 only; HL later. | None now | Only if QDB agrees HL surveys can wait. |
