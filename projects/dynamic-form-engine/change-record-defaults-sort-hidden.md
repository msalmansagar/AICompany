# Change and Defect Record — choice-field defaults, grid lookup sort, hidden-field publishing, triggerless rules

**Record id:** DFE-CR-2026-09
**Date raised:** 2026-09-06 · **Date closed:** 2026-09-07
**Engagement:** Dynamic Form Engine
**Workflows:** `enhancement.md` (CHG-001, CHG-002) and `bug-fix.md` (DEF-001, DEF-002)
**Branch:** `feat/dfe-six-point-batch` · **Commits:** `4b6d1015`, `3af0be15`, `539f5f71`
**Environment:** org5869857f (Dataverse cloud)
**Gate:** change note + defect record. No BRD required — see *Contract boundary* below.

---

## 1. Contract boundary

`enhancement.md` requires escalation to `new-feature.md` the moment a user can observe
new behaviour and depend on it. Both enhancements were tested against that boundary:

| Item | Assessment |
|---|---|
| CHG-001 default values | The Default Value property already existed and was already published for every field type. Only its editor and its runtime coercion were wrong. No new field, entity or permission. |
| CHG-002 lookup sort | Adds an optional key inside an existing configuration column. Absent behaves exactly as before. No schema change. |
| DEF-001, DEF-002 | Specified behaviour that did not work. Bug-fix path by definition. |

No new Dataverse column, entity, endpoint or permission was created. **No schema
provisioning was performed and none was required.**

---

## 2. Change note — CHG-001: default values for dropdown and multi-select fields

**What changes.** Choice fields choose their default from their own options instead of
accepting free text. One codec encodes and decodes the stored value so the designer, the
designer preview and the runtime read it identically.

**Why.** The Default Value control was a plain text box for every field type. A dropdown
default therefore worked only if the maker happened to type an option's stored value
exactly, and a multi-select default was discarded outright: the control reads a list while
`qdb_default_value` holds a single string. The reporter's summary, "default only available
for text field", was accurate about the observable behaviour.

**What must not regress.**
- A text, number, date or currency default keeps working unchanged.
- Forms with no default keep publishing byte-identically.
- A stored default that no longer matches any option must not be silently discarded.

**How it is verified.** Unit tests over the codec, plus a live publish showing both values
in the published JSON. See §6.

**Scope note.** A checkbox default was stored as the string `'false'`, which is truthy, so
a checkbox explicitly defaulted to unchecked rendered **checked**. This is the same
coercion defect in the same code path and was fixed with it. Repeating-grid rows seeded new
rows from the raw stored default and had the same fault; also fixed.

---

## 3. Change note — CHG-002: sort option for lookup columns in the grid column config

**What changes.** A lookup grid column can order its option list by its display attribute.
The direction travels in the column's existing options JSON and reaches the query as an
OData `$orderby`.

**Requested shape**, honoured as proposed:

```json
{"v":2,"filterType":"lookup","lookupTargetEntity":"qdb_year","lookupDisplayAttribute":"qdb_name","lookupValueAttribute":"qdb_yearid","sort":"asc"}
```

**Naming decision.** The designer writes the key as `lookupSort`, because a bare `sort` on
a column reads as "sort the grid's rows by this column", which is not what it does. Every
reader accepts **both** `lookupSort` and `sort`, so the JSON exactly as proposed works.

**What must not regress.**
- A column with no sort is left unordered, exactly as before.
- The portal path keeps its existing ascending default.
- An unrecognised direction publishes as absent rather than as a value the runtime cannot honour.

**How it is verified.** Round-trip tests in the designer service, query-construction tests
for the in-CRM path, publisher tests in C#, and a live publish. See §6.

---

## 4. Defect record — DEF-001: a hidden field does not appear in the published JSON

| | |
|---|---|
| **Symptom as reported** | Setting Is Hidden = Yes on a field inside the summary tab removes it from the JSON. |
| **Reproduction** | Publish a form containing a hidden field that no other field's configuration references, then read `qdb_form_render_cache`. The field is absent. |
| **Expected** | The field is published and marked not visible. Hidden means *not drawn*, not *not published*. |
| **Requirement violated** | The published form is the form the maker authored. BR-002 governs hidden *values*, not hidden *definitions*. |

**Root cause.** Not summary-tab specific. `SecurityStripper` deleted **every** field with
`qdb_is_hidden` from the published model unless `FieldReferenceCollector` found another
field's configuration naming it: a utilisation-bar source, a data-bound label source, a
grid depends-on list, a rule condition, or a rule target. A field hidden on a review or
summary tab is named by none of those, so it was always deleted. The behaviour was global;
the summary tab is simply where the exemption never applied.

The Node live-assembly path never stripped, so the two publish paths disagreed about the
same form.

**Fix.** The stripping stage was removed rather than reconfigured. Once hidden fields are
kept, `Strip` only rebuilds the model property by property, and that rebuild is a known
defect source in its own right: `verification-before-completion.md` already records
`SecurityStripper.Strip` dropping `Design` and the scoped tab and section buttons, and
`brd-apilookup.md` records it dropping `lookupConfig`. Deleting the stage removes that
whole class of silent loss along with the reported defect.

Removed: `SecurityStripper`, `ISecurityStripper`, `FieldReferenceCollector`,
`IFieldReferenceCollector` and their three test files. `PublishOrchestrator` now serialises
the generated model directly.

**Why this does not weaken security.** The runtime already refuses to render a hidden field
and already removes its value from the submission payload, which is where BR-002 is
enforced. The published JSON carries definitions, never record data. The largest active
render cache is about 9 KB against a guard near 707 KB, so the extra fields cost nothing.

---

## 5. Defect record — DEF-002: a business rule on a section under the summary tab does not fire

| | |
|---|---|
| **Symptom as reported** | A rule hiding a section on the summary tab, driven by a lookup value, does nothing. |
| **Reproduction** | Read the published JSON for `rule-visibility-demo`. The form carries four active rules, one of them a section-hide, and **zero** appear in the published JSON. |
| **Expected** | An active rule reaches the runtime and is evaluated. |
| **Requirement violated** | Authored business rules execute at runtime. |

**Root cause, two compounding faults.**

1. **A rule is published on the field that triggers it.** `AppendDesignerRules` attaches a
   rule to the field whose schema name matches `trigger_field_code`, and the runtime
   collects rules by walking fields. So DEF-001 also destroyed rules: a rule triggered by a
   hidden field was deleted along with that field. The exemption list protected a rule's
   *condition* fields and its *target* field, never its own trigger.

2. **The designer let a rule be saved with no trigger at all.** The Trigger Field control
   was a native select with no empty option, while a new rule's `trigger_field_code`
   defaults to `""`. A select whose value matches no option displays the **first** option,
   so the maker saw a real field name while the rule stored nothing. Such a rule attaches to
   no field, never reaches the JSON, and never fires. Nothing reported it, because the
   linter only looked for codes that were *wrong*, not codes that were *empty*.

**Fix.**
- DEF-001's removal of the stripping stage rescues rules attached to hidden trigger fields.
- The trigger picker now carries an explicit empty option, and a trigger that names a field
  the form no longer has is shown as missing rather than silently replaced.
- Saving a rule without a trigger field is blocked.
- Lint rule **L005** now reports an existing rule that has no trigger field.

---

## 6. VERIFICATION

Per `verification-before-completion.md`: identified, executed, read, compared, claimed
with output. All evidence is from org5869857f, not from the test suite.

**DEF-001 — hidden fields now publish.** `rule-visibility-demo`, before and after:

```
before: [en] 6 fields   (rvd_other_reason and rvd_orphan_note absent)
after:  [en] 8 fields
   rvd_other_reason hidden=true visible=false
   rvd_orphan_note  hidden=true visible=false
```

**DEF-002 — a rule triggered by a hidden field, hiding a section, reaches the JSON.** A
temporary rule was created, published, observed, then deleted and the form republished:

```
ZZ verification — hidden trigger hides a section
   trigger=rvd_orphan_note hidden=true | action=hideSection targetSection=43b711c4-…
```

**CHG-001 — choice defaults publish.** Values set temporarily on `fbe-allfields`, observed,
then restored:

```
qdb_all_dropdown    defaultValue="b"
qdb_all_multiselect defaultValue="[\"a\",\"c\"]"
```

**CHG-002 — lookup sort publishes.** Set temporarily on `grid-lookup-valattr-demo`,
observed, then restored:

```
grid column "Company" lookupSort="desc" target=account display=name
```

**Org left clean.** Every temporary record and value was reverted and both forms
republished; a follow-up read confirmed the original values and zero leftover records.

**Test suites**, each run standalone:

| Suite | Result |
|---|---|
| Designer | 725 passed |
| Frontend | 552 passed |
| Backend | 423 passed |
| C# plugin | 92 passed |

**Deployment.** Plugin assembly, in-CRM runtime web resource and the designer web
resources were all deployed to org5869857f and published.

---

## 7. Data remediation performed

Seven rules in org5869857f had been left with a blank trigger by the historical
legacy-overwrite bug and therefore published to nothing. Each was repaired from evidence
that survived on the record itself: the action option-set code, the target lookup, and the
condition value named in the rule's own title, matched against the trigger field's real
options. Anything that did not resolve to exactly one option aborted the run rather than
being guessed.

| Form | Rules repaired |
|---|---|
| `rule-visibility-demo` | 4 (hide section, hide tab, show field, hide field) |
| `loan-application-legacy` | 3 (show, hide and require `qdb_cr_number` by customer type) |

All seven now appear in the published JSON with the correct trigger, condition and target,
and six tests drive the four demo rules through the rule engine to prove they act, not
merely that they are present.

**Not repaired:** `e2e_qa_test` carries a rule named "probe rule" with a show-field action
and no target of any kind. There is nothing to derive. It appears to be a test artefact and
awaits a decision to delete it.

---

## 8. Open items

These were found during the work, are outside this record's scope, and are not fixed.

- **The per-option "Set as default" flag is dead.** `qdb_is_default` is authored in the
  Option Set Editor, persisted and published, and no runtime reads it. With CHG-001 in
  place, two controls now claim to set a dropdown default and one does nothing. Wiring it
  would change behaviour on existing live forms, so it needs a decision rather than a patch.
- **Tab header and footer fields never reach the render cache.** The C# `TabDefinition` has
  no `headerFields` or `footerFields`, so any DFE-TABZONE-001 placement is absent from the
  in-CRM path while the Node path and the runtime both support it.
- **BR-002 is enforced in the browser, not on the server.** `stripHiddenFieldValues` removes
  hidden values before submit; `CrmSubmissionService.buildPayload` writes whatever arrives
  for a mapped field. Unchanged by this work, but worth an explicit decision.

---

## 9. Lessons — MEMORY-CANDIDATE

- **A publish stage that deletes data is a defect generator.** The removed stripper required
  every new property to be taught to it or be silently dropped, and had already lost
  `Design`, the scoped buttons and `lookupConfig`.
- **A native select with no empty option lies.** It displays its first option while storing
  the empty value, which is how four rules were saved that could never run. Any picker whose
  bound value can legitimately be empty needs an option of its own for that state.
- **A deploy's exit code is not evidence.** All three deploys uploaded successfully and then
  failed `PublishAllXml` with `ECONNRESET`; the designer deploy still exited zero. Always
  re-run the publish with retries and read its status.
- **The org is the only honest check.** Two demo forms carried hidden fields that never
  reached the published JSON, and roughly 1,700 tests never noticed.
