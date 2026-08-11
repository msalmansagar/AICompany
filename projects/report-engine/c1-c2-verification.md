# C-1 and C-2 — verification against the live org

```
═══════════════════════════════════════════════════
VERIFICATION RECORD
Engagement ID:  RPT-ENG-001
Date:           2026-08-11
Conditions:     C-1 (runtime viewer + exports), C-2 (Arabic)
Environment:    org5869857f.crm4.dynamics.com — SANDBOX
Signed in as:   Mohammad Salman
Result:         C-1 PARTIAL, 2 defects · C-2 FAILS — not implemented
═══════════════════════════════════════════════════
```

## Summary

| Condition | Result |
|---|---|
| **C-1** — verify the runtime viewer and exports | 🟡 **Partial.** Viewer works. Exports could not be exercised. **Two defects found.** |
| **C-2** — render one report in Arabic | 🔴 **Fails.** Arabic is not implemented. The UI claims it is. |

Neither condition can be signed off. C-2 is not a gap in testing — it is a gap in
the product.

---

## C-2 — Arabic is not implemented

The Phase 7 gate assumed *"Two languages are configurable and only English has
ever been seen."* **The first half is not true.**

### What the product claims

The report settings dialog, on its **"Style & language"** tab, states:

> *"Themes give business users a consistent branded look (colours + fonts)
> without touching CSS. **Reports render in multiple languages — Arabic and Urdu
> render right-to-left.**"*

### What is actually there

| Checked | Found |
|---|---|
| Language control on **Style & language** tab | **None.** The tab contains nine theme cards and a Done button. Nothing else. |
| Language control on **Report / Layout / Export** tabs | **None** on any of the three |
| Language column on `qdb_reportdefinition` | **None.** No `lang`, `locale`, `culture`, `direction` or `rtl` column exists. |
| Arabic or RTL handling in the runtime | **None** — see below |

### The runtime carries no Arabic code at all

`qdb_reportengine_core.js` is **132,556 bytes**, and the local
`prototype/report-engine-core.js` is byte-for-byte the same size, so the file
inspected is the file deployed.

```
direction:rtl | dir="rtl" | RTL | arabic | العربية   →  0 matches
"Arabic"  0      "1025" (Arabic LCID)  0      "ar-QA" / "ar-SA"  0
```

A naive grep for `rtl` returns exactly **one** hit. It is a false positive — the
letters inside the entity name `qdb_repo`**`rtl`**`ayout`.

> **There is no field to set a language, no column to store one, and no code to
> render one.** A report cannot be rendered in Arabic because the capability does
> not exist. The claim in the settings dialog is unbacked.

This is the material finding of this session. C-2 was scoped as *hours* of
verification; it is a **build**.

---

## C-1 — the viewer works; two defects block sign-off

### What was verified

The runtime viewer is a separate web resource, **`qdb_reportengine_report.html`**,
opened with `data=reportId=<guid>` — **not** `id=`, which returns *"No report was
requested."*

| Check | Result |
|---|---|
| Runtime viewer loads | ✅ |
| Export controls present | ✅ **CSV, Excel, PDF, PNG** |
| Report renders real data | ✅ — via the designer: 3 rows, live account names and phone numbers |
| Exports actually exercised | ❌ **Blocked** — see Defect 1 |
| Masking on export verified | ❌ **Not verified.** This is the security half of C-1 and it remains untested. |

### Defect 1 — the report owner is refused by his own report's access list

Opening the published report **Test** in the runtime viewer returns:

> *"You do not have permission to run this report. Its access list does not
> include you."*

The signed-in user is **Mohammad Salman**, confirmed via `WhoAmI`, and he is the
report's **Report owner**, confirmed in Report settings.

**The same user, same report, renders fine in the designer** — three rows of real
data. So the two surfaces disagree about whether he may see this data.

| Surface | Outcome for the owner |
|---|---|
| Designer preview | Renders the data |
| Runtime viewer | Refuses on the access list |

One of these is wrong. Either the access check omits the owner, or the designer
preview bypasses a control the runtime enforces. **Until that is settled the
masking behaviour C-1 asks about cannot be tested at all**, because no report can
be run in the surface where export lives.

### Defect 2 — a published report fails silently

Running **"Demo — everything at once"** (Published, v1) produces **no viewer, no
rows, and no error message to the user**. The only evidence is in the console:

```
'Account' entity doesn't contain attribute with Name = 'fullname'
```

The report's column list is `NAME · accountnumber · statecode · fullname ·
emailaddress1 · Account Rating`. **`fullname` is a `contact` attribute; `account`
has `name`.** The report is configured against a column that does not exist on
its own entity — and it is *published*.

Two problems, of which the second is the worse one:

1. A published report references an invalid column.
2. **The failure is invisible.** The user clicks Run and nothing happens. No
   toast, no banner, no empty-state. A silent failure trains users to distrust
   the product without ever producing a report to file a defect against.

---

## What this means for the gate

C-1 and C-2 were listed as *"Owner: engineering. Effort: hours."* That estimate
holds for C-1 only if the two defects are simple. **It does not hold for C-2 at
all** — Arabic rendering has to be built, not verified.

| Condition | Realistic position |
|---|---|
| C-1 | Two defects to fix, then re-run: exports exercised end-to-end and masking confirmed |
| C-2 | **Re-scope.** Language selection, a column to store it, RTL rendering, and Arabic export output. Not hours. |

The merge deviation recorded above this section stands, and C-1/C-2 remain open.
Production was already not approved; nothing here changes that except to make the
distance clearer.

---

## Method

Verified against the live sandbox rather than from source, per the standing rule
that a green test suite is not sufficient for work that reaches CRM.

- **Proved by a change in result, not a single run.** "Demo — everything at once"
  produced nothing; **Test**, run the same way moments later, produced three rows.
  That is what separates "the viewer is broken" from "that report is broken", and
  it is why Defect 2 is scoped to one report rather than the engine.
- Read the **rendered screen** and the **console**, not just return values.
- Drove the designer through the web resource's `contentDocument`, since it runs
  in an iframe and `read_page` sees only the CRM shell.
- Checked Arabic support by **four independent spellings plus the LCID** before
  concluding it was absent, and confirmed the single `rtl` hit was a substring of
  an entity name rather than a control.
