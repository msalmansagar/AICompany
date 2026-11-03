# Collection Officer UX Acceptance + Release Readiness

Branch `feat/dcp-officer-navigation` · code `a1c49d1b` · deployed to the cloud sandbox org5869857f (11/11
byte-for-byte) · measured live in Dynamics as **System Administrator**, role picker = Collection Officer, V2.
No live writes or sends were made (shared sandbox; none authorised). Feature freeze held: only defects fixed.

**Definitions.**
- *Click* = one pointer or Enter activation; form fields are listed separately.
- *Page navigation* = a change of screen (route view). Tab changes within a case are not counted.
- *Context reselection* = finding the same case, unit or activity again in another list or tab.

**Before** figures are the WP1 audit's recorded walk-throughs (V1 / V2). **After** figures were measured on the
implemented application.

## 1. WP1 vs final click comparison

| # | Journey | Clicks before | Clicks after | Navigations before | Navigations after | Reselections before | Reselections after |
|---|---|---|---|---|---|---|---|
| A | Complete overdue follow-up (My Day) | 6 / 6 | **2** (Complete → Complete activity) | 1 / 1 | **0** (pane over My Day) | 1 / 1 (re-find the row) | **0** |
| B | SMS from My Day | ≥5 + search / 4 | **4** (row → Contact → SMS → Send) | 2 / 1 | **1** | 1 / 0 | **0** |
| B′ | Call | not possible | **3** (row → Contact → Call) | – | **1** | – | **0** |
| C | Log action (My Day) | 5 / 4 | **3** (row → Log action → Save) | 1 / 1 | **1** | 0 / 0 (V1 lands on Summary, +tab) | **0** |
| D | Capture PTP (My Day) | 5 / 4 | **3** | 1 / 1 | **1** | 0 / 0 | **0** |
| E | Review existing PTP | 5 / 4 | **2** (row → View on the PTP panel) | 2 / 2 | **1** | 1 / 1 | **0** |
| F | Customer 360 from the case, and back | 1 + browser Back | **1 + 1** | 2 / 2 | **2** | 1 / 1 (wrong unit) | **0** (unit carried; "Back to case DEMO-HL-1001") |
| G | Communication history (from the case) | 3 + search / 1 | **0** (timeline on the case surface) · 1 for the full tab | 1 / 0 | **0** | 1 / 0 | **0** |
| H | Complaint, HL (from the case) | 4 + field | **3** (More → Raise complaint → Create) | 0 | **0** | 0 | **0** |
| I | Legal hand-off | not possible | **not possible** — status shown read-only ("Awaiting QDB decision", KI-109) | – | 0 | – | – |
| J | Start deceased review | 2 | **3** (More → Resolution → Record) | 0 | **0** | 0 | **0** |
| K | Completed item → next item | ≥3 + re-find / ≥2–3 | **1** (Next) · **0 extra** (Complete & Next) | ≥2 / 1 | **1** (case to case) | 1 / 1 | **0** |
| L | Find a case by search | V1 dead · V2 2 + typing | **2** + typing (both) | – / 1 | **1** | – | **0** |

**Totals across A–H and K–L, with V2 as the better baseline:**
- Clicks: 30 → 21 (A–H, K, L, counting F as 2).
- Page navigations: 10 → 8.
- Context reselections: 5 → **0**.

The one regression is J: deceased review is now under More → Resolution, deliberately moved off the top level.

## 2. Golden journey: My Day → overdue follow-up → case → contact → log → PTP → complete → Complete & Next → next

Recorded live in this order. **The left navigation was used 0 times.**

| Step | Interaction | Result (live) |
|---|---|---|
| 1 | My Day › Overdue follow-ups row DEMO-HL-1001 (1 click) | Case Workspace: header in **1.17 s**, Action Plan in **1.48 s**; shows "1 of 5 · Overdue follow-ups"; Back reads "← Back to Overdue follow-ups" |
| 2 | Contact ▾ (1) | Call Mobile, Call Phone, Log the call…, SMS…, Email… — only usable channels |
| 3 | SMS… (1) | "Send an SMS" pane over the case in 1.3 s; route unchanged; no Letter/Fax wording. **Send not pressed** (no real communication) |
| 4 | Log action (1) | Pane in 1.6 s naming "Loan Account DEMO-HL-4402 · DEMO-HL-1001"; fields Activity type, Subject, When, Follow-up, Notes. Save not pressed |
| 5 | Capture PTP (1) | Pane in 1.6 s; Subject, Promised amount, Promised for, Promise type, Notes. Save not pressed |
| 6 | Complete follow-up (1) | Pane in 1.9 s: **"Completion unavailable — no outcomes are configured for this activity type."** (KI-131) |
| 7 | Complete & Next (1) | Opens the same completion pane, with the same refusal |
| 8 | Next (1) | **"2 of 5"**, DEMO-BFD-1001 (Facility DEMO-BFD-8802) in **1.8 s**. Previous back to "1 of 5" in 0.75 s |

**Result:**
- **Navigation objective PASS.** Every step stays on the case; nothing needs the menu.
- **End-to-end completion is not provable live on this sandbox.** All 5 overdue items are Promise-to-pay activities with **no configured outcomes** (KI-131, QDB configuration).
- The save, complete and Complete & Next behaviour is covered by the automated suite: `caseWorkspace.test.tsx`, `workContext.test.ts` (skip item completed elsewhere, stale items, bounded checks) and `phase6Forms`.
- **Must be repeated live** once outcomes exist, with an authorised test write.

## 3. Five primary operations from the Case Workspace

| Operation | Live result | Full-page navigation |
|---|---|---|
| Contact Customer | Contact ▾ → Call (tel link) / Log the call / SMS / Email panes | **None** (route unchanged) |
| Log Action | Pane over the case, context named | **None** |
| Capture PTP | Pane over the case, context named | **None** |
| Complete Follow-up | Pane over the case; refused only by KI-131 configuration | **None** |
| Open Customer 360 | Customer name → C360 in **1.0 s** at `#customer/<id>/<case>`; "← Back to case DEMO-HL-1001" returns to the case at "1 of 5" | One there, one back (by design) |

## 4. Secondary operations (contextual, no officer menu entry)

| Operation | Where | Live result |
|---|---|---|
| Complaint | More ▾ → Raise complaint, **HL only** ("In Case Management"); BFD menu omits it | Menu verified on DEMO-HL-1000 / DEMO-BFD-1000; not submitted, because it would create a BFD Case Management record |
| Dispute | More ▾ → Record a dispute ("As a collection action") | Present on HL and BFD |
| Legal hand-off | More ▾ → Resolution → Legal rows | "Record a Legal recommendation — Available"; "Hand off to Legal — Awaiting QDB decision"; "Follow the Legal request — Read-only". Lifecycle untouched |
| Deceased / Insurance | Resolution tab | Review recordable; never concludes (KI-131), no insurance claimed (KI-125). Lifecycle untouched |
| Work lists for these | Work Queues buckets: Legal 1 · Disputes 1 · Complaints 0 · Deceased review 1 | Reachable |

## 5. Final Collection Officer navigation (live)

My Day · Work Queues · Collection Cases · Customers · Dashboards. **Legal Officer:** the same.

## 6. Manager and administrator navigation (live)

- **Collection Manager:** the officer's five, plus Approvals · Portfolio & Strategy · Action Plan · Communications · Audit Trail, plus **Administration**: Delinquency Intake · Strategy Rules · Configuration.
- **Relationship Manager:** the officer's five, plus Approvals · Portfolio & Strategy · Action Plan.
- **Administrator:** there is no separate working role. Administration appears in the Manager presentation.
- **Every route resolves for every role by URL.** Navigation is presentation only, and CRM security decides every read and write.
- **Not validated with a non-admin account** (see §20).

## 7. Context preservation (live)

| Path | Result |
|---|---|
| My Day → case → Back | Returns to My Day with **Overdue still selected**, 5 rows |
| Queue → case → Back | Queue "My work" with search **"Promise"** and the **selected row** restored; case showed "1 of 4 · Work Queue · My work" and "← Back to Work Queue · My work" |
| Case → Customer 360 → case | Same case, same position "1 of 5" |
| Previous / Next | 1 ↔ 2 of 5, across HL and BFD items |
| Complete & Next | Opens completion for the current item (completion blocked by KI-131); skip-on-stale proven in tests |
| Browser Back / deep link | Back leaves a case in one step after tab changes; `#case/<id>/ptp` opens Promises (WP6) |

## 8. HL validation (cloud sandbox, DEMO-HL cases)

- **Terminology:**
  - Header: "Individual · Loan Account DEMO-HL-4401 · Case DEMO-HL-1000 · HL".
  - Customer 360: "Housing Loan · Contact", QID.
  - **No "Facility" anywhere** on the HL case page.
- **No BFD data** appeared on HL pages.
- **Messaging:**
  - The SMS pane names no table. **No "Letter" or "Fax"** appears anywhere on screen.
  - The channel table comes only from `qdb_platformconfiguration.qdb_smsentity` plus the Communication mappings (`letter` on HL). The code has **no** hard-coded `fax`.
  - **WhatsApp is not offered on HL.** It needs `vrp_type` values and a template column, which are not in the schema evidence.
- **Raise complaint** is offered on HL only.
- **Not validated on the HL on-prem org.** The kit there predates WP2–WP6.

## 9. QDB1 (BFD) validation (cloud sandbox, DEMO-BFD cases)

- **Terminology:**
  - Header: "SME · Facility DEMO-BFD-8801 · Case DEMO-BFD-1000 · BFD".
  - Customer 360: "BFD · Account", CR number.
  - **No "Loan Account"** on BFD pages, and no HL data.
- **Messaging:** BFD uses `fax` via configuration (`qdb_smsentity` / `qdb_whatsappentity` = fax, mappings `faxnumber` and `qdb_message_body`). The SMS pane shows no Fax wording.
- **Not compared against QDB1's own mechanism.** Delivery is an on-prem dispatcher (KI-83, unproven), and QDB1 has not been imported.

## 10. Communication architecture findings

- **Correct by design:**
  - One adapter. The table is chosen per organisation from configuration, columns from mappings.
  - An unconfigured channel is **refused, never defaulted**. Zero or several active config rows make the channel unavailable.
- **Fixed in this exercise:** `ConfigurationGuide.md` §4 still said "SMS/WhatsApp → fax | fax", and a domain comment said the same. Both now state HL = `letter`, BFD = `fax`.
- **Still required before any send:** `qdb_featureflags.contactHoldPolicy` (KI-79). Without it, sending fails closed.
- **Integration Service token is never wired.** `integrationServiceToken` is declared but nothing assigns it, so complaint and Legal status say "Sign-in not set up". This blocks the HL complaint test.

## 11. Performance (live, cloud sandbox)

Counts are Dataverse data requests across all frames, excluding the 5 Xrm-internal metadata calls.

| Screen / action | Time | Requests | DOM | Notes |
|---|---|---|---|---|
| My Day | 0.52 s | 17 | 244 | 1 list + 16 **count-only** (`$top=1`, `$count`) — fixed per tile/bucket, not per row |
| Collection Cases | 0.41 s | 6 | 431 | server paged, 19 rows |
| Case Workspace | 1.17 s header · 1.48 s plan | 12 | 409 | catalogue cached; delinquency deferred |
| Customer 360 | 1.0 s | 21 | 453 | set-based: one activity query covers all the customer's cases (`or` over case ids) — **no N+1** |
| SMS / Log / PTP / Complete pane open | 1.3 / 1.6 / 1.6 / 1.9 s | ~9 for SMS | – | pane re-reads case, customer and configuration the page already holds (debt U-3) |
| Next / Previous | 1.8 / 0.75 s | – | – | one revalidation per step (≤10) |

- **No N+1 anywhere.**
- **No full refresh:** panes close and re-read only their own sections.
- **No client-side processing of large datasets.** Lists are server-paged, and the work context is capped at 200 ids.
- **Stale requests:** guarded (sequence/latest-only) and covered by tests.

## 12. Failure states

**Live injection:** strategy-action, letter and email reads were forced to fail on DEMO-HL-1000.
- The **header and all 5 actions stayed usable**.
- Action Plan, history, Promises and Resolution each showed their own error with **Retry** (4 Retry buttons).
- **Missing case** (`#case/<unknown id>`) showed "No collection case with id … could be read in this CRM session", with navigation intact.

| State | Evidence |
|---|---|
| Loading | per-section skeletons (live) |
| Empty: no Action Plan / no PTP / no communication history / no snapshots | `cw-plan-empty`, `cw-ptp-none`, timeline and snapshot empty states (tests) |
| Partial / API failure | live injection above; `SectionBoundary` tests |
| Stale item / concurrent completion / reassignment | `workContext.test.ts`: "skips an item completed elsewhere…", "steps over stale items…", "never lands on an item it could not read" |
| Missing customer | Customer 360 "No linked CRM record"; "returns no profile when no case carries a resolved customer lookup" |
| Missing financial unit / no active case | C360 "says so when the customer has no case"; "selects a unit with no case…" |

## 13. Responsive and accessibility

- **Desktop 1,426 px:** OK.
- **Tablet 820 px:** no horizontal scroll; all 5 actions visible.
- **Narrow 400 px:** no horizontal scroll; the action bar is fixed to the bottom with all 5 actions in reach.
- **200 % zoom** (≈640–713 px CSS width): the narrow layout applies at ≤640 px and the one-column layout at ≤1,080 px.
- **Keyboard:**
  - Menus: arrow keys and Escape (WP4).
  - **Panes fixed (A11Y-1):** they now focus their first field on open, close on Escape and return focus to the opener. Verified live and in 3 new tests.
- **Screen-reader labels:** `role=dialog` with `aria-label`, `aria-current` on navigation, `aria-live` work position, `role=search` header search.
- **Contrast:** 222 text elements checked live. **5 failed (muted status pills, 2.26:1). Fixed (A11Y-2):** they now use secondary text at 4.9:1.
- **Not done:**
  - Touch targets are 30 px high. That passes WCAG 2.2 (24 px minimum) but not the 44 px recommendation.
  - V1's rail is not phone-responsive.
  - No automated axe or screen-reader run.

## 14. Capability preservation

**The full pre-WP1 operation matrix is in `UX_WP6_FinalReport.md` §10:** 20 operations, each with where it is now and the test that proves it.

**Re-verified live in this exercise:**
- My Day tiles, queues and follow-ups.
- All 10 queue buckets.
- Case search and open.
- Log, PTP, complete (pane), SMS and Email panes, Call.
- Plan, timeline, Promises and Resolution tabs.
- Customer 360.
- Complaint (HL), dispute, Legal status and deceased review.
- Manager pages and Administration pages present.

**Nothing has been lost.** Two deliberate scope changes:
- The portfolio Action Plan list is Manager/RM-only.
- The empty Documents placeholder tab was removed.

## 15. Defects found

| Id | Defect | Severity |
|---|---|---|
| A11Y-1 | Action panes declared `aria-modal` but left focus behind the scrim; no Escape; focus not returned | High (keyboard) |
| A11Y-2 | Muted status pills at 2.26:1 contrast (disabled colour used for real statuses) | Medium |
| TXT-1 | "Actions tab" (retired) still named in the Resolution tab ×2, the "showing most recent" notice and the Action Plan page summary | Medium |
| DOC-1 | ConfigurationGuide said HL SMS/WhatsApp use `fax`; a domain comment said the same | Medium (misconfiguration risk) |
| DOC-2 | On-prem kit README still said "nothing imported anywhere" after the HL import | Low |
| INT-1 | Integration Service bearer token declared but never assigned | High for the complaint test; **not fixed** (needs an auth decision, not a UX defect) |

## 16. Defects fixed

A11Y-1, A11Y-2 and TXT-1 are fixed in `a1c49d1b`, deployed and live-verified. DOC-1 and DOC-2 are fixed in `f6d67f3d`.

## 17. Remaining UX debt (not fixed under the freeze)

- U-1: Queue "Search this list" matches the activity subject only. A case number finds nothing.
- U-2: One failed strategy-action read takes down Plan, PTP and Resolution together (a shared read), although the workspace survives.
- U-3: Panes re-read case, customer and configuration (≈9 requests, 1.3–1.9 s to open).
- U-4: Role comes from the header picker, not from CRM security roles (needs a mapping decision).
- U-5: "My" follow-ups have no owner clause.
- U-6: Next follows loaded rows only.
- U-7: Customer is not linkable on queue rows.
- U-8: Touch targets are 30 px; V1's rail is not responsive.
- U-9: Deceased review is now one click deeper (J).

## 18. UX freeze decision

**Collection Officer UX Baseline — ACCEPTED.**
- The navigation objective is met: the core loop runs without the menu, and context is never reselected.
- Every capability is reachable, and the failure states are contained.
- The three acceptance defects are fixed.

**Two acceptance proofs carry forward to UAT because they are not UX defects:**
1. A live completion and Complete & Next once QDB configures outcomes (KI-131).
2. The same journey under a real **Collection Officer** account.

**Recommendation:** freeze structural UX changes until Collection Officer UAT. Only defects should change it.

## 19. Blockers to package build

None are defects. They are prerequisites:
1. The sandbox must hold the current branch build before export. Done: `a1c49d1b`.
2. Microsoft's 9.0.0.2090 schema directory for the XSD validation step.

**No schema change since the 10-04 kit**, so re-running `export-dcp-solution.mjs` and then `build-onprem-package.mjs` is enough.

## 20. Blockers to HL runtime testing (blocks a particular feature test)

**Imported already.** For WP2–WP6 on HL, import a rebuilt kit (needs your approval).

- **All screens:**
  - One active `qdb_platformconfiguration` row for HL (code 100000140, contact).
  - DCP case data. The seed and loader scripts refuse any org but the sandbox.
- **SMS:** `qdb_smsentity=letter`; mappings `vrp_address` / `vrp_description`; the `contactHoldPolicy` flag; a template. Letter→case Regarding is not yet verified.
- **WhatsApp:** `vrp_type` values plus a template column. Not available.
- **Activity completion:** the outcome catalogue (KI-131/66).
- **Officer testing:**
  - A non-admin account.
  - The package's "QDB DCP Collection Officer" role lacks activity, contact, letter and configuration read. Add base roles (KI-100).
- **Dashboards:** no Report Engine evidence on HL; DCP report definitions not provisioned.
- **Complaints:** Integration Service hosting, the token wiring (INT-1), the Non Customer account id, and decision D6.
- **Legal status:** `qdb_qdblegal` presence on HL is not evidenced.

## 21. Blockers to QDB1 runtime testing

- **Preflight** (`package-preflight-QDB2-2026-10-04.json`): `readyForImport: true`, no collisions. It must be re-run for the rebuilt kit.
- **Import** needs your approval.
- **After import:**
  - A config row (code 100000141, account) with fax mappings and reference data.
  - The `contactHoldPolicy` flag.
  - The outcome catalogue.
  - Roles, as for HL.
- **Messaging:** D6 (QDB1's own Case automation SMSes HL complaint customers) is a decision for the complaint test, not for import.

## 22. Blockers to production only

- KI-79 Contact Hold policy.
- KI-83 delivery proof.
- KI-100/111/116/120/128 security.
- KI-49 numbering.
- KI-108/109 Legal hand-off rule.
- KI-124–127 deceased policy.
- MIS API contract and facility TBDs.
- KI-09 smart assignment.
- D6.
- HL Arabic labels.
- U-4 role mapping.

## 23. Common on-prem package readiness

- **Status: On-Prem Compatible by Design — Runtime Test Pending.**
- The 10-04 kit is **Prepared / Preflight Validated** for both orgs and imported to HL (16/16 post-import). It **does not contain WP2–WP6**.
- **For the accepted UX, the common package needs a rebuild:** export, then build, then preflight both orgs. Until then it is not "Prepared".

## 24. Recommended next deployment action

1. Rebuild the common kit from the sandbox (current build `a1c49d1b`).
2. Re-run preflight on HL and QDB1.
3. With your approval, import into **HL CRM test** first. Then create the HL configuration row and mappings, and test the officer journey with a non-admin account.
4. QDB1 follows its own approval.

**No production deployment.**

## 25. Automated tests

- **2,841 passing, 0 failing, type-check clean:** web 1,521, domain 855, api 412, dataverse-client 39, auth 14.
- The tooling package (25) has no change since WP6 and was not re-run.
- New: `dialogFocus.test.tsx` (3). Updated: `caseCardLimits.test.tsx`.

## 26. Files changed

- `apps/web/src/components/forms.tsx`
- `apps/web/src/styles/components.css`
- `apps/web/src/shell/routes.ts`
- `apps/web/src/views/{moreOnActionsNotice.tsx,index.tsx}`
- `apps/web/src/v2/V2Workspace.tsx`
- `packages/domain/src/{advancedProcessState.ts,communicationHistory.ts}`
- tests `dialogFocus.test.tsx`, `caseCardLimits.test.tsx`
- `docs/ConfigurationGuide.md`
- `onprem-deploy/2026-10-04/README-onprem-deploy.md`
- this report

## 27. Commits

- `a1c49d1b` fix(dcp-web): acceptance defects
- `f6d67f3d` docs(dcp): HL SMS table and kit status
- this report's commit

## 28. Time (Asia/Qatar)

Start 2026-10-06 20:51 · end 2026-10-06 21:12 · effective ≈ 21 min (continuous session; background review in parallel).

## 29. Final status

**Collection Officer UX Baseline — ACCEPTED** (cloud sandbox, administrator evidence). Structural UX is frozen pending UAT.
**On-Prem: Compatible by Design — Runtime Test Pending.** The common package must be rebuilt for the accepted UX before import.
