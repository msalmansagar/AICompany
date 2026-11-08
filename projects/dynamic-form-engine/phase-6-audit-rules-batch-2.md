# DFE-RULES-002 — Phase 6 Audit (Business Rules Batch 2)

Auditor: MSS Technologies — Governance & Audit
Date: 2026-09-30
Scope delivered this engagement: **Item 1** (grid-column rules), **Item 2** (conditions on the
record selected in a lookup — CEO reading "C"), **Item 7** (rating render style).
Inputs: `brd-rules-batch-2.md`, `brd-rules-batch-2-approval.md`, `phase-3-arch-rules-batch-2.md`.
Branch `feat/dfe-rules-batch-2`. **Audited against the working tree at `3f670468`** — one commit
past the requested tip `ed10d9d7`; `3f670468` ("announce the rating value and log rules aimed at
missing grid columns") closes the NFR-004 accessibility and FR-008 logging items, so it is audited
as part of the delivery.

Confidence is stated per finding. Only findings at >80% confidence are recorded as risks.

> **Addendum (orchestrator, 2026-09-30, after this audit was written)**
> - The cloud Rating option is **already provisioned**: option 100000002 was added to
>   `qdb_radio_render_style` on org5869857f with the CEO's go-ahead, and read back. The
>   cloud half of the rating precondition is closed; the on-prem manual step (COND-4) stands.
> - **COND-2 addressed in code.** Every successful portal related-record read now logs
>   `related_record_read` with the user's object id, correlation id, form, lookup field,
>   record id and the column names, never the values. Retention depends on where the
>   backend's logs are shipped, which is a deployment setting, so COND-2 is closed for code
>   and still open for retention.
> - COND-1, COND-3, COND-4 and COND-5 are unchanged.

---

## 1. Executive summary — go-live posture

Items 1 and 7 are low-risk: grid-column rules add no data egress, and the rating control adopts an
already-licensed Fluent component. **Item 2 is where the governance weight sits** — it is the first
DFE feature that reads arbitrary CRM columns of a *different* record and returns them to a portal
user's browser. The architecture's own security review (§2.2) hardened the new route well, but it
explicitly handed two items to this audit, and both are real.

Recommendation to the CEO: **APPROVE WITH CONDITIONS.** Cleared for the **cloud dev/test** org.
**Not cleared for production, and not cleared for on-prem**, until the numbered conditions in §9 are
closed — principally a **governance control over which columns a related condition may expose**
(COND-1), a **personal-data access log** (COND-2), and the **on-prem release preconditions +
live-org verification** (COND-4). None of the conditions require a code change to items 1/2/7 as
built; COND-1/2 add a control layer, COND-4 is deployment discipline.

---

## 2. Security Risk Register

### SEC-01 — Unfiltered lookup exposes rule-named columns of any record to any signed-in portal user
- **Description:** `GET /api/related-records/:formCode/:field/:recordId` reads, **as the service
  principal**, the columns that the form's own published rules name for a lookup, and returns them to
  the caller's browser (`RelatedRecordService.readRuleAttributes`, `related-records.routes.ts:20-26`).
  SEC-RR-001 was fixed by scoping the read to the lookup's own `filterExpression`
  (`RelatedRecordService.ts:62-66`). **A lookup configured with no `filterExpression` has no such
  scope** — the `idClause` alone lets any signed-in portal user read the rule-named columns of **any
  record of that entity** by GUID. A maker may point a related condition at **any scalar column**,
  including personal data (name, email, phone, national ID, salary); the designer picker offers
  scalar columns with no sensitivity filter, and `collectRelatedAttributes` (shared) will allow-list
  whatever the saved rule names. The only stated mitigation is written guidance ("makers must not
  point related conditions at personal-data columns of an unfiltered lookup") — **no technical
  control enforces it.**
- **Compounding factor (portal vs. CRM security):** the portal runtime always reads through the
  service-principal route (`FormContext.tsx:136-146` wires `lookupApi.getRelatedRecord`), so the
  returned values are **not** filtered by the *calling user's* CRM row-level security — only by the
  lookup filter. A portal user can therefore obtain column values of records they would not be able
  to read directly in CRM. (The in-CRM path, `webresource/xrm/lookupApi.ts:17-33`, runs
  `Xrm.WebApi.retrieveRecord` as the signed-in user, so CRM security does apply there — see SEC-05.)
- **Likelihood:** Medium (requires a maker to author such a rule; makers are trusted but numerous and
  the guard is procedural). **Impact:** High (unauthorised disclosure of personal data at a regulated
  banking client — PDPPL exposure).
- **Mitigation (specific):** (a) make `filterExpression` **mandatory** whenever a `relatedAttribute`
  is present — reject publish otherwise; or (b) enforce a **sensitive-column deny-list**
  (`emailaddress1`, `telephone*`, national-ID / salary columns) in `resolveAllowedRead`; plus
  (c) a **data-classification + publish-time review gate** for any form whose related conditions read
  personal-data columns. (a) or (b) is the durable control; (c) is the governance backstop.
- **Residual risk after mitigation:** Low. With a mandatory filter or a deny-list plus a review gate,
  exposure is bounded to non-sensitive, lookup-scoped columns.
- **Confidence: 90%.** Ship-blocking for production: **YES** (see COND-1). Not blocking cloud dev/test.

### SEC-02 — No access log for successful personal-data reads (PDPPL traceability)
- **Description:** A successful related-record read leaves **no durable audit record**. On failure the
  service logs a pino `logger.warn` (`RelatedRecordService.ts:73`); on success nothing is written. The
  design-time audit log (`qdb_form_audit_log`) records form design actions, not runtime data access.
  Under PDPPL, access to personal data should be traceable to actor, subject and time.
- **Likelihood:** High that the gap exists (it is by design). **Impact:** Medium (traceability gap,
  not disclosure), rising to High if item 2 carries personal-data columns in production.
- **Mitigation:** Emit a structured access-log entry per successful read — actor `oid`, `formCode`,
  `fieldSchemaName`, `recordId`, the columns served, timestamp — to a retained store, distinct from
  the design-time audit log. Retain per the client's PDPPL retention policy.
- **Residual risk:** Low once implemented.
- **Confidence: 85%.** Ship-blocking for production **if item 2 reads any personal-data column**:
  **YES** (COND-2). Not blocking cloud dev/test or a deployment that only reads non-personal columns.

### SEC-03 — Pre-existing: `CrmBaseService` leaks raw Dataverse error text on every other portal route
- **Description:** `CrmBaseService.crmFetch` throws `CrmApiError` with the **raw Dataverse response
  body** embedded in the message (`CrmBaseService.ts:47-52`). `CrmApiError extends AppError`
  (`errors.ts:13-21`), and `errorMiddleware` returns `error.message` verbatim to the client for any
  `AppError` (`error.middleware.ts:49-60`), with HTTP 502. Every portal route that lets a
  `CrmApiError` propagate therefore discloses Dataverse-internal detail (entity-set names, column
  logical names, and in constraint/duplicate errors sometimes field values) to the authenticated
  caller.
- **This engagement's new route is NOT affected:** `readScopedRecord` catches `CrmApiError` and
  re-throws `NotFoundError` (plain 404) so no Dataverse text reaches the client
  (`RelatedRecordService.ts:70-75`). Confirmed. The leak is pre-existing on the *other* routes.
- **Likelihood:** High (fires on any Dataverse error). **Impact:** Medium (authenticated disclosure,
  predominantly metadata, not row data; recognised weakness — OWASP A05 security misconfiguration /
  improper error handling).
- **Mitigation:** Sanitise `CrmApiError` before the boundary — return a generic message +
  `correlationId` to the client, keep the Dataverse body in server logs only. One change in
  `error.middleware.ts` (special-case `CrmApiError` to a generic body) fixes it platform-wide.
- **Residual risk:** Low once sanitised.
- **Confidence: 95%.** Ship-blocking for **DFE-RULES-002**: **NO** — pre-existing, not introduced
  here, and the new route is already fixed. Must be **tracked as a platform blocker (SEC-CRM-ERRLEAK)
  with a remediation deadline before the next portal release** (COND-3).

### SEC-04 — Rate limiter is per-instance, not global
- **Description:** `PerUserRateLimiter` counts in-memory per backend instance
  (`PerUserRateLimiter.ts:10-21`); a multi-instance deployment multiplies the effective limit. The key
  is `req.user?.oid ?? req.ip ?? 'anonymous'`; because the route sits behind `authMiddleware`
  (`index.ts:229` before `:233`), `oid` is always present, so the `ip`/`anonymous` fallback is not
  reachable here.
- **Likelihood:** Low. **Impact:** Low (enumeration is already bounded by the lookup filter + GUID
  requirement; the limiter is defence-in-depth).
- **Mitigation:** Accept for now; if the backend scales horizontally, move the window to a shared
  store (Redis) so the limit is global. Document the per-instance semantics (the code already does).
- **Residual risk:** Low. **Confidence: 85%.** Ship-blocking: **NO.**

### SEC-05 — In-CRM path ignores the lookup filter; portal path bypasses per-user row security
- **Description:** The two runtimes enforce different access models for the *same* feature. In-CRM
  (`webresource/xrm/lookupApi.ts`) retrieves by GUID as the signed-in user — **CRM row security
  applies, but the lookup `filterExpression` is not applied**. Portal (`RelatedRecordService`) applies
  the filter but reads as the service principal — **the lookup filter applies, but per-user row
  security does not**. Neither path enforces both controls.
- **Likelihood:** Medium. **Impact:** Low–Medium (a governance inconsistency; each path has *a*
  control, but a column classified safe under one model may not be under the other).
- **Mitigation:** Document the intended control model for related reads, and let **column
  data-classification (COND-1) govern both paths** so the weaker of the two is still acceptable.
- **Residual risk:** Low. **Confidence: 85%.** Ship-blocking: **NO** (folded into COND-1).

---

## 3. OWASP Top 10 Assessment (against the item-2 change)

| Category | Applicable? | Mitigated how | Gaps |
|---|---|---|---|
| A01 Broken Access Control | **Yes** | Column allow-list is the form's own published rules, not caller input (`lookupApi.ts` sends no attribute list; `collectRelatedAttributes` derives it). Record scope = lookup `filterExpression`. | **Unfiltered lookups** (SEC-01); portal SP bypasses per-user row security (SEC-05). |
| A02 Cryptographic Failures | No (no new secrets/crypto) | Existing SP token flow unchanged. | — |
| A03 Injection | **Yes** | `recordId` must match a GUID regex (`RelatedRecordService.ts:51`); column + entity names validated by `isLogicalName` (`relatedFacts.ts:22-26`) before being spliced into `$select`/path; `filter` is `encodeURIComponent`-wrapped. | None material. The logical-name regex is the correct guard for OData splicing. |
| A04 Insecure Design | **Yes** | Service-decides-columns pattern; GUID-only addressing; rate limit. | Design relies on procedural "makers must not" for sensitive columns (SEC-01). |
| A05 Security Misconfiguration | **Yes** | New route converts Dataverse errors to 404. | **Pre-existing verbose-error leak on all other routes** (SEC-03). |
| A06 Vulnerable Components | No | No new dependency; Fluent `Rating` already a dep (MIT). | — |
| A07 Auth failures | Partial | Route behind `authMiddleware`. | — |
| A08 Data Integrity | No | Reads only; additive, backward-compatible. | — |
| A09 **Logging & Monitoring** | **Yes** | Failures logged with correlation id. | **Successful personal-data reads are not logged** (SEC-02). |
| A10 SSRF | No | Entity/record resolved from form metadata, not caller URLs. | — |

---

## 4. Compliance Assessment

**PDPPL (Qatar) — item 2 personal-data processing**
- *Requirement:* personal data is processed lawfully, minimally, and access is traceable.
- *How the design meets it:* data minimisation is respected — only the columns a rule names are read,
  only for a record the lookup would offer (when filtered), and values are transient client-side
  (NFR-003). No third-party egress; no persistence of fetched values.
- *Gap / remediation:* (i) minimisation is not enforced against *sensitivity* — a maker can name a
  personal-data column on an unfiltered lookup (SEC-01 → COND-1); (ii) access is not traceable
  (SEC-02 → COND-2). **Remediation:** enforce filter-or-deny-list + classify exposed columns; add the
  read access log.

**PDPPL / CMP-001 — data residency**
- *Requirement:* personal data of a Qatar banking client resides in an approved region (Qatar North /
  UAE North); default EMEA/West-Europe regions are not acceptable (company-knowledge CMP-001).
- *How the design meets it:* item 2 introduces **no new cross-border transfer** — the flow is
  Dataverse → DFE backend → the requesting user's own browser, all within the existing tenant, no new
  processor. The residency question is the **standing** one about `org5869857f` (a `crm4`/EMEA org),
  unchanged by this engagement.
- *Gap / remediation:* item 2 **enlarges the personal-data surface** that the standing residency gate
  governs (CRM column values now reach the browser). Remediation: keep this engagement **behind the
  existing PDPPL/residency go-live gate**; do not treat a green Phase 6 here as clearing that gate.

**Constitution Article V / VI (governance standards)**
- No hardcoded record GUIDs introduced (entity/record resolved at runtime — good; arch §2.1/§2.2).
- Audit-log append-only is **platform-enforced** for the designer role (§6). Meets Article VI, with
  the reservations in §6.

---

## 5. Data Residency Review

- **Physical residence:** unchanged — `org5869857f` (EMEA/`crm4`). All item-2 reads stay within that
  org; the backend is the existing DFE service; the browser is the authenticated user's own device.
- **Cross-border transfer risk from this engagement:** none newly introduced. No external API, no new
  processor, no export.
- **Standing risk:** the org region itself remains the pre-existing CMP-001 hard gate. Because item 2
  now surfaces CRM column values (potentially personal data) to the client, the **volume and
  sensitivity of personal data governed by that gate increases**. Flag as a **dependency** on the
  standing gate, not a new blocker created here.

---

## 6. Audit Trail Validation

**Design-time (rule authoring):**
- `qdb_form_audit_log` is **append-only and platform-enforced**: the `FormDesignerUser` role grants
  only `prvCreate` + `prvRead` on the entity — **no Write, no Delete**
  (`designer/deploy/solution/Roles/FormDesignerUser.xml:122-124`). This is a genuine strength: a
  maker cannot tamper with or erase audit records. `AuditLogService` writes actor id, actor name,
  ISO timestamp, action and a payload JSON (`AuditLogService.ts:39-56`).
- **Rule content is traceable** via `qdb_form_version`: each **PUBLISH** snapshots the entire
  `DesignerState` — which includes the rules / `conditions_json` — into `SNAPSHOT_JSON` with
  `publishedBy` / `publishedOn` (`VersionService.ts:19-40`). A published rule (grid-column action,
  related-attribute condition, or rating style) can be reconstructed exactly, and its chain of custody
  at publish granularity is intact by diffing consecutive version snapshots.

**Gaps (medium/low, not ship-blocking):**
1. The audit-log **payload does not itemise which rules changed** — there is no `RULE_CHANGE` action
   and no per-rule diff (`AuditAction` union, `AuditLogService.ts:11-19`). "Which rule changed, from
   what to what" is answerable only by **diffing version snapshots**, not "from the audit log alone."
   The governance standard ("every decision explainable from the audit log alone") is met only when
   the audit log **and** the version snapshots are read together.
2. **`SAVE_DRAFT` does not create a version.** Only PUBLISH snapshots. Intermediate draft edits between
   publishes are not individually reconstructable. Acceptable for regulatory examination (the
   *published* state is what runs), but state it explicitly.
3. **Native Dataverse table auditing** on `qdb_form_definition` / rule tables is not provisioned by
   any script found, so field-level before/after outside the publish snapshots is not captured. The
   append-only role protects the *app* log, but a system administrator or the service principal can
   still modify records the role cannot — standard Dataverse reality; note it in the examination pack.
4. **Runtime data access (item 2) is not audited at all** — see SEC-02. This is the audit-trail gap
   that matters most for PDPPL, because it concerns access to *personal data*, not form design.

**Verdict:** the design-time trail is **sufficient for a regulatory examination of rule
configuration** (append-only + reconstructable published content + actor/time). It is **not
sufficient for examining who accessed personal data at runtime** until SEC-02/COND-2 is closed.

---

## 7. Service Account Review

| Account | Scope on this feature | Least-privilege assessment |
|---|---|---|
| DFE backend **service principal** (portal path) | Reads the rule-named columns of a lookup's entity, scoped by the lookup filter; also reads `EntityDefinitions` metadata. Broad Dataverse read across DFE. | **Over-broad relative to item 2's need** — the SP can read far more than the allow-list uses, and it bypasses per-user row security (SEC-05). The route-level allow-list + filter are the compensating controls. Acceptable **only** with COND-1 (column classification) in place. No new privilege was granted for this engagement. |
| **Signed-in user** (in-CRM path) | `Xrm.WebApi.retrieveRecord` as the user; CRM security applies. | Correct least-privilege posture. Does not apply the lookup filter, so relies wholly on CRM row security (SEC-05). |
| `FormDesignerUser` role (designer) | Create+Read on audit log; no Write/Delete. | **Correct** — exemplary least-privilege for an audit table. |

No new service account or credential was introduced. No secret is read, logged, or committed by the
new code (checked: `related-records.routes.ts`, `RelatedRecordService.ts`, `CrmBaseService.ts`,
`PerUserRateLimiter.ts`). SEC-01 of the standing register (committed Azure AD secret needing rotation)
is unrelated to this engagement and unchanged.

---

## 8. Governance Gaps (ranked, ship-blocking flag each)

| # | Gap | Risk if unaddressed | Remediation | Ship-block |
|---|---|---|---|---|
| G1 | No technical control stops a maker exposing personal-data columns via an **unfiltered** lookup (SEC-01) | PDPPL breach: personal data of any record disclosed to any signed-in user | Mandatory `filterExpression` when `relatedAttribute` set, **or** sensitive-column deny-list; **plus** column data-classification + publish review gate | **Prod: YES** |
| G2 | No runtime access log for personal-data reads (SEC-02) | PDPPL traceability failure; cannot answer "who read whose data" | Structured per-read access log, retained per policy | **Prod: YES if personal-data columns are read** |
| G3 | On-prem release preconditions + **no on-prem live-org verification** (§10) | Feature silently absent or broken on-prem; parity claim unproven (PAT-002/ANTI-002) | Complete §10 checklist incl. a live-org round trip on the on-prem org | **On-prem: YES** |
| G4 | `CrmBaseService` verbose-error leak on all other routes (SEC-03) | Metadata disclosure to authenticated users platform-wide | Sanitise `CrmApiError` at the middleware boundary | This engagement: **NO**; next portal release: **YES** |
| G5 | Rating cloud option provisioning is a live-org schema change needing explicit go-ahead (§10) | If run without go-ahead → uncontrolled schema change; if skipped → rating render breaks | Run `provision-rating-render-style.mjs` **with** user go-ahead, before deploying rating | **Prod: YES (as a gated step)** |
| G6 | Audit-log payload does not itemise rule changes; drafts not versioned (§6) | Examiner must diff snapshots; extra effort, not a hole | Optional: add a `RULE_CHANGE` payload summary at publish | **NO** |

---

## 9. Go-Live Clearance

**CLEARED WITH CONDITIONS.** Cleared for the **cloud dev/test org**. **Not cleared for production or
on-prem** until the conditions below are met.

- **COND-1 (High, gates production):** Before any form with a related condition is published to a
  user-facing environment, put a governance control over exposed columns in place — **either** make
  `filterExpression` mandatory when `relatedAttribute` is set **or** enforce a sensitive-column
  deny-list in `resolveAllowedRead`, **and** classify every column any related condition reads, with a
  publish-time review for personal-data columns. Owner: Architect + Auditor + IT Ops.
- **COND-2 (Medium–High, gates production if personal-data columns are read):** Add a retained
  access-log entry for each successful related-record read. Owner: Backend.
- **COND-3 (Medium, tracked; gates the next portal release, not this one):** Raise SEC-CRM-ERRLEAK and
  sanitise `CrmApiError` at the error middleware. Owner: Backend.
- **COND-4 (High, gates on-prem):** Complete the §10 on-prem preconditions **and produce a live-org
  round-trip verification** on the on-prem org for items 1, 2 and 7. Owner: DevOps + IT Ops + QA.
- **COND-5 (Medium, gated step):** Run the cloud rating-option provisioning script **with explicit
  user go-ahead** before deploying rating; on-prem, add the option by hand first. Owner: user / DevOps.

COND-1 and COND-2 are control-layer additions — they do not require reworking items 1/2/7 as built.

---

## 10. On-Prem Parity — Release Preconditions (COND-4 / COND-5)

The on-prem org uses a **different code path** from cloud: no client-credentials service principal
exists on-prem, so item 2 runs through the **in-CRM `Xrm.WebApi.retrieveRecord` as the signed-in
user** (`webresource/xrm/lookupApi.ts`). That is a *stronger* privacy posture (CRM row security
applies), but it means the **web-resource runtime bundle must be deployed**, not just the plugin.

Preconditions, in order:
1. **Add the Rating option by hand:** add option **`100000002` "Rating"** to the
   `qdb_radio_render_style` option set in the on-prem solution and **Publish All**, **before**
   importing the new plugin (arch §3; OQ-005). The exact value `100000002` matters — `PicklistMapper`
   maps that code to the string `'rating'`; a different code breaks the mapping.
2. **Build + register the new plugin DLL:** the C# publisher was extended
   (`FieldBuilder.cs:556,587,610`; `FormDefinitionModel.cs:276,293` carry `TargetColumnId` /
   `RelatedAttribute`), so a **new assembly is required** for on-prem render-cache JSON to carry grid-
   column and related-attribute keys. Build at **.NET Framework 4.7.1** (GOT-005); register the
   **merged + signed `dist` assembly**, not `bin/Release` (GOT-006); **re-register (not Update)** if
   the signing token changed.
3. **Deploy the updated web-resource runtime bundle** (item 1 grid-column rendering and item 2 in-CRM
   related reads live in the runtime, not the plugin). If the old bundle/DLL runs, the features are
   **silently absent** on-prem.
4. **Post-deploy:** allow the plugin **sandbox AppDomain to refresh** before verifying — never judge
   on the first post-deploy invocation (GOT-007 / ANTI-004).
5. **Ship the on-prem kit README documenting step 1.** OQ-005's resolution promised the kit README
   "will say so"; the existing `onprem-deploy/…` READMEs (dated 2026-09-16/17) **predate this
   engagement and do not mention Rating** — a README for this release does not yet exist. Produce it.
6. **Live-org verification (hard gate):** verify items 1, 2, 7 by a **round trip on the on-prem org**
   — test-green is necessary, never sufficient for CRM work (PAT-002 / ANTI-002; mirrors the standing
   RESUME-DFE-ONPREM note that on-prem defects were never verified on the on-prem org). Until this is
   produced, on-prem parity is **unproven**.

Cloud counterpart to step 1: run `scripts/provision-rating-render-style.mjs` **with explicit user
go-ahead** (live-org schema change) before deploying rating (COND-5).

---

## VERIFICATION

```
VERIFICATION
  criterion:  Each finding is grounded in the actual code on feat/dfe-rules-batch-2 at the
              audited commit, and the audited tree matches the delivered engagement.
  command:    git rev-parse --short HEAD            -> 3f670468 (one commit past ed10d9d7)
              git log --oneline ed10d9d7..3f670468  -> fix(dfe): announce the rating value and
                                                       log rules aimed at missing grid columns
              git log --oneline 685b4b05..ed10d9d7  -> ed10d9d7 related-record conditions;
                                                       8065cf7c grid-column rules + rating style
              Read: backend/src/routes/related-records.routes.ts,
                    backend/src/services/RelatedRecordService.ts,
                    backend/src/services/CrmBaseService.ts,
                    backend/src/middleware/error.middleware.ts, backend/src/utils/errors.ts,
                    backend/src/utils/PerUserRateLimiter.ts, shared/src/rules/relatedFacts.ts,
                    frontend/src/api/lookupApi.ts, frontend/webresource/xrm/lookupApi.ts,
                    frontend/src/contexts/FormContext.tsx, frontend/src/engine/relatedRecordFacts.ts,
                    designer/src/services/AuditLogService.ts, designer/src/services/VersionService.ts
              grep: backend index.ts route/auth wiring (authMiddleware precedes the route);
                    C# FieldBuilder.cs / FormDefinitionModel.cs passthrough of related keys;
                    FormDesignerUser.xml audit-log privileges (Create+Read only);
                    scripts/provision-rating-render-style.mjs present; onprem-deploy READMEs.
  output:     - New route converts CrmApiError -> NotFoundError(404): confirmed
                (RelatedRecordService.ts:70-75). Item 2 does NOT leak Dataverse error text.
              - CrmBaseService.crmFetch embeds raw response body in CrmApiError.message
                (CrmBaseService.ts:47-52); errorMiddleware returns error.message for AppError
                (error.middleware.ts:49-60) -> verbose leak on every OTHER route. Confirmed.
              - Portal read is service-principal, filter-scoped, NOT per-user-row-security scoped;
                unfiltered lookup => any record of the entity readable (RelatedRecordService.ts:62-66).
                Confirmed. Column allow-list = form's own published rules (relatedFacts.ts:41-50).
              - No access log on successful reads; only logger.warn on failure. Confirmed.
              - Audit log append-only ENFORCED by role (FormDesignerUser.xml:122-124, Create+Read
                only); rule content reconstructable via qdb_form_version snapshot at PUBLISH
                (VersionService.ts:19-40). Confirmed. No RULE_CHANGE action; drafts not versioned.
              - Both publishers carry the new keys (FieldBuilder.cs:556/587/610). On-prem needs a new
                DLL + manual option 100000002 + runtime bundle; no on-prem live-org evidence exists.
              - Commit 3f670468 adds rating value announcement (NFR-004) + missing-grid-column
                logging (FR-008).
  result:     PASS (audit complete; 5 security findings, 6 governance gaps, clearance = APPROVE
              WITH CONDITIONS)
  unverified: - Runtime behaviour of items 1/2/7 on the cloud org and on the on-prem org
                (no live-org round trip run in this audit — QA Phase 5 + COND-4 own that).
              - Whether the seeded demo's rb2_sponsor lookup carries a filterExpression in the live
                org (seed names related_attribute 'address1_country' on account; static read only).
              - Whether qdb_form_definition/rule tables have native Dataverse auditing enabled in the
                org (no provisioning script found; needs an org metadata check).
```

---

## MEMORY-CANDIDATE

```json
{
  "target": "company-knowledge.json",
  "section": "compliance",
  "entry": {
    "id": "CMP-002",
    "title": "A portal route that reads maker-named CRM columns as a service principal needs a column classification gate, not just a filter",
    "domains": ["auditor", "security-engineer", "architect", "backend"],
    "detail": "DFE-RULES-002 item 2: GET /api/related-records reads the columns a form's rules name for a lookup and returns them to the browser as the service principal. Scoping the read by the lookup's filterExpression fixes arbitrary-record reads ONLY for filtered lookups; an unfiltered lookup still exposes any record of the entity, and nothing stops a maker naming a personal-data column. The service-principal path also bypasses per-user CRM row security that the in-CRM (Xrm as signed-in user) path keeps. Controls that actually hold: make filterExpression mandatory when a related attribute is set (or a sensitive-column deny-list), classify every exposed column, and add a per-read access log for PDPPL traceability. A green route-level test proves none of this.",
    "confidence": "high",
    "source": { "project": "dynamic-form-engine", "date": "2026-09-30" }
  }
}
```
