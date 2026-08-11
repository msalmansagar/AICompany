# Q4 — on-premise version, Custom API, and File columns

**Engagement:** CMS-ENG-001 · **Opened:** 2026-08-11 · **Owner of the answer:** QDB IT
**Status:** Half answered from documentation. One half now looks negative.

---

## What Q4 asks

> Confirm the on-premise environment supports **Custom API** and **File columns**, and give
> the exact version. Older versions handle these differently, and the answer changes how we
> build the publishing mechanism.

It gates `ADR-CMS-001` twice — `OQ-3` directly, `OQ-2` indirectly — and it is one of the five
questions that block architecture.

---

## 1. What we already assume internally, without ever having confirmed it

`projects/dynamic-form-engine/ON-PREM-DESIGNER.md` states a minimum of **9.0.0.0** and a
recommendation of **9.1.x**, and pins the solution package deliberately:

> `solution.xml` declares `version="9.0.0.0"` … **Do not raise this to 9.2** — that would
> restrict the solution to environments running CRM 9.2+.

That is a prior engagement betting that QDB on-premise is **9.0 or 9.1**, not 9.2. It is an
assumption, not a confirmation — nobody recorded a build number. But it is the assumption the
Dynamic Form Engine already ships against, so if it is wrong, more than the CMS is wrong.

---

## 2. File columns — they do not exist on 9.0 or 9.1

Microsoft's field-type reference for Dynamics 365 Customer Engagement (on-premises), whose
monikers are exactly `op-9-0` and `op-9-1`, lists every available field data type:

> Single Line of Text · Multiple Lines of Text · Option Set · MultiSelect Option Set ·
> Two Options · Status · Status Reason · Whole Number · Floating Point Number ·
> Decimal Number · Currency · Date and Time · **Image** · Lookup · Owner ·
> Unique Identifier · Customer

**There is no File type.** Image is there; File is not. The File data type is a Dataverse
capability, and the corroborating signal found while checking is that on-premise File and
Image support arrives with **9.2** builds, not 9.1.

### Why this matters more than a missing checkbox

`ADR-CMS-001` chose **File column for the version store**, and rejected chunking across Memo
rows on the grounds that it costs "reassembly logic, partial-write failure modes, and no query
benefit — complexity for a ceiling a File column removes outright."

On 9.0/9.1 that ceiling is **not removed**, because the column type is not there. The ADR's
figures — "32 MB default, configurable to 128 MB" — are cloud figures, which is precisely what
`OQ-3` suspected when it said the maximum "may differ from cloud". The finding is stronger than
the suspicion: it may not differ so much as not exist.

### The number that replaces it

From the same on-premise page, **Multiple Lines of Text holds up to 1,048,576 characters**.
That is the real on-premise ceiling for a stored page version, and it is the figure the storage
design should be re-measured against — *after* Q1, since rich text changes compression by an
order of magnitude.

---

## 3. Custom API — still unresolved

Not established either way. The Dataverse documentation for Custom API makes no statement about
on-premise applicability, and the on-premise developer guide could not be retrieved to confirm
its absence. Custom API is a later construct than custom process actions, which *are*
documented on-premise, so the risk is real but unproven.

**Do not treat this as answered.** If Custom API is unavailable on QDB's build, the fallback is
a custom process action or a plain plug-in, and the publishing mechanism changes shape.

---

## 4. This is not only a CMS question

The Report Engine depends on Custom API too — `scripts/register-customapi.mjs` and
`scripts/register-dashboard-api.mjs` — and `ADR-RPT-010` states the requirement outright:

> **V1 must run on on-premise CRM 9.x as well as Dataverse cloud.**

The designer also tells users so on screen: *"run on Dynamics 365 on-prem 9.x and Dataverse
cloud."* Every verification on record, including `ADR-RPT-010`'s own evidence line, is against
**org5869857f — a Dataverse cloud sandbox**. The on-premise claim has never been exercised on
on-premise.

So one version number from QDB IT closes a CMS architecture question *and* an untested claim
the Report Engine makes to its users. The Report Engine does not use File columns, so only the
Custom API half applies there.

---

## 5. What to ask QDB IT

Three facts, one email:

1. The exact version and build number of the on-premise Dynamics environment.
2. Does that build support **Custom API** (not custom process actions)?
3. Does it support **File columns**, and if so what is the configured maximum?

Question 3 is now largely rhetorical for 9.0/9.1 — ask it anyway, because the answer to
question 1 may surprise us and it costs nothing to include.

---

## 6. What each answer changes

| If the answer is | Then |
|---|---|
| **9.0 or 9.1** (as DFE assumes) | No File columns. `ADR-CMS-001`'s version store must be redesigned against the 1,048,576-character Memo ceiling, or move to annotations. `OQ-2`'s retention figure of 20 versions per page must be re-derived. |
| **9.2 or later** | File columns are available; confirm the configured maximum, and DFE's "do not raise to 9.2" note should be revisited since it was written for a different assumption. |
| **Custom API unavailable** | Publishing moves to a custom process action or plug-in. Report Engine's `qdb_RunReport` and dashboard API are on the same footing and need the same treatment. |
| **Custom API available** | No change to either design. The Report Engine's on-premise claim is still untested, but no longer suspect. |

---

## 7. Status

| Part | State |
|---|---|
| File columns on 9.0/9.1 | **Answered from documentation — not available** |
| Memo ceiling for the fallback | **Answered — 1,048,576 characters** |
| Exact QDB build number | **Open — needs QDB IT** |
| Custom API on that build | **Open — could not be established from documentation** |

Nothing here has been verified against a QDB on-premise environment, because we have no access
to one. It is documentary evidence about the product, not about their installation.

---

## 8. Ready to send — note to QDB IT

Kept to three questions and a place to look for each, so it can be answered in one reply
without research. Everything explanatory is deliberately left out; the reasoning is above, and
sending it would invite a discussion instead of an answer.

> **Subject:** Dynamics on-premise — version number and two capability checks
>
> Hello,
>
> We are completing the architecture for the CMS engine and need three facts about the
> on-premise Dynamics environment. Each should take a moment to look up.
>
> **1. The exact version and build number.**
> Found under **Settings → Customizations → Developer Resources**, or **Settings →
> Administration → About**. The full four-part build number is what we need — for example
> `9.1.0.xxxx` — not just "9.1".
>
> **2. Does the environment support Custom API?**
> Not custom process actions, which are a different and older feature. If **Settings →
> Customizations → Customize the System** lists a **Custom API** component, the answer is yes.
>
> **3. Does it support File columns, and if so what is the configured maximum size?**
> A File column is a field data type, distinct from note attachments. If it is available it
> appears in the field type list when creating a new field, and the maximum is set in
> **System Settings → Email → attachment size**, or by your administrator.
>
> If the answer to 2 or 3 is no, that is a useful answer and not a problem — it changes how we
> build one component, and we would rather know now than after building it.
>
> Thank you,
> MSS Technologies

### Why it is worded this way

- **The build number, not the version.** "9.1" is what people say; the build number is what
  determines whether a capability shipped. Asking for four parts avoids a second round trip.
- **Custom API is distinguished from custom process actions by name.** They are routinely
  conflated, and a "yes" that means the wrong feature is worse than a "no".
- **File columns are distinguished from note attachments.** Same reason.
- **"That is a useful answer and not a problem."** An IT team that suspects the answer creates
  work for them has a reason to be vague. Removing that pressure is worth one sentence.

---

## Sources

- [Types of fields and field data in Dynamics 365 Customer Engagement (on-premises), op-9-1](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/customize/types-of-fields?view=op-9-1)
- [Create and use custom APIs (Microsoft Dataverse)](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api)
- [Supported extensions, Dynamics 365 Customer Engagement (on-premises)](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/supported-extensions?view=op-9-1)
