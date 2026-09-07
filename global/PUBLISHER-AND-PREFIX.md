# Dataverse publisher and prefix convention

**Status:** Adopted 2026-08-11 · **Applies to:** every MSS Dataverse product

A Dataverse **publisher prefix cannot be changed once components exist against
it.** Changing it means recreating every table and migrating every row, in every
customer environment. It is among the few decisions in a Dataverse product that
is effectively permanent, and it is made in the first hour of work — usually
without discussion.

This document exists because the estate already shows what that costs.

---

## The rule

> **One company publisher, `MSST`, prefix `msst`. Entities and Custom APIs carry
> a product segment; columns do not.**

**Revised 2026-08-11.** This document originally specified *one publisher per
product, prefix = product code*. That was overruled in favour of a single
company publisher, and the rule below is what makes that safe.

### Why the product segment is mandatory

A shared prefix means every MSS product draws from one namespace. Without a
segment the CMS Engine and the Dynamic Form Engine both want `msst_page` and
`msst_field`, and only one can have either.

| Kind | Name | Segment needed? |
|---|---|---|
| **Entity** | `msst_cmspage`, `msst_dfeformdefinition` | **Yes** — entity logical names are org-wide |
| **Custom API** | `msst_CmsPublishPage` | **Yes** — same namespace |
| **Web resource** | `msst_cms_designer.html` | **Yes** — flat namespace |
| **Column** | `msst_slug`, `msst_versionnumber` | **No** — scoped to their entity, so `msst_slug` on two different tables cannot clash |

Getting this wrong does not fail loudly. It fails when a second product tries to
import into an org that already holds the name.

### Option values are shared, but that matters less than it sounds

One publisher means one option-value block — `46327` for `MSST`. A choice option
gets its number from that base: `463270000`, `463270001`, and so on. Every MSS
product now draws from the same pool.

**This is mostly harmless, and an earlier version of this document overstated
it** by requiring each product to reserve a sub-range.

| Choice field | Does a duplicate number matter? |
|---|---|
| **Local** — a dropdown on one table | **No.** The value need only be unique *within that option set*. Two products may both use `463270000` on different tables. |
| **Global** — shared across tables | The collision risk is the **name**, which is org-wide. The value is not the problem. |

So the protection is the **product segment on names**, which the rule above
already requires: a global choice is `msst_cmsstatus`, never `msst_status`.
Reserving numeric sub-ranges is optional tidiness, not a correctness
requirement — record one if it helps humans read the values, but nothing breaks
without it.

### Why not the client's prefix

Because a product sold to a second customer cannot ship tables branded for the
first. `qdb_cmspage` is not something a second bank imports.

**The client is the first customer, never the namespace owner.**

---

## What the estate looks like today

Recorded as observed in solution manifests in this repository. Not verified
against live organisations.

| Publisher unique name | Display | Prefix | Used by |
|---|---|---|---|
| `qdb` | Maqsad AI | `qdb` | most solutions |
| `maqsad_ai` | Maqsad AI | `dfe` | Dynamic Form Engine tables |
| `maqsadai` | Maqsad AI | `qdb` | DFE designer web resource |
| `PowerAppsToolsPublisher_qdb` | *(tooling)* | — | PCF tooling, not ours |

Three publisher records, two display names for one company, and **two prefixes
inside a single product**.

### What that produced

The Dynamic Form Engine is one product split across two namespaces: its tables
are `dfe_*`, its designer web resource is `qdb_*`. It also declares two different
publisher unique names, which in Dataverse are two different publisher records
each owning a different subset of the same product.

The display name is still **"Maqsad AI"** after the rebrand to MSS Technologies —
and a publisher's unique name and prefix cannot be corrected after import.

**None of this was a bad decision. It was an absent one.** That is what this
document is for.

---

## What a product owns, and what it only reads

The rule above applies to components a product **creates**. It does not, and
cannot, apply to a client's existing schema that the product merely reads.

The CRM Workflow Designer makes this concrete. It reads `qdb_action`,
`qdb_department`, `qdb_assigned`, `qdb_callworkflowontaskcompletion` and a long
tail of similar columns. **Those are QDB's own process-engine schema, not the
designer's.** They can never move to a product prefix, because they are not ours
to rename — a second customer would have their own equivalents under their own
prefix.

So every product has two categories:

| Category | Prefix | Example |
|---|---|---|
| **Owned** — tables, columns, web resources, plugins, Custom APIs the product creates | **product prefix** | `msst_cmspageversion` |
| **Read** — the client's existing schema the product configures or queries | **client's prefix, unchanged** | `qdb_department` |

A product that reads a lot of client schema is not thereby a client engagement.
It means its **configuration must map client field names**, rather than assuming
them — which is a design requirement, not a naming one.

---

## Registry

Each product records its values here **before its first table is created**. For
products already provisioned, the row records reality rather than an intention.

| Product | Deployed on | Reserved prefix | Publisher unique name | Status |
|---|---|---|---|---|
| **CMS Engine** (CMS-ENG-001) | *nothing yet* | **`msst`** + segment `cms` | `MSST` | ✅ **Adopted and binding — no components exist** |
| **Report Engine** (RPT-ENG-001) | `qdb` | `msst` + segment `rpt` | `MSST` | ⚠️ **Live on `qdb`.** Reserved for a productised build only. |
| **CRM Workflow Designer** (CWFD-001) | `qdb` | `msst` + segment `cwf` | `MSST` | ⚠️ **Live on `qdb`.** Reserved for a productised build only. |
| Dynamic Form Engine | `dfe` + `qdb` | — | `maqsad_ai` / `maqsadai` | ⚠️ Split across two prefixes and two publishers. Live — not correctable. |
| Enterprise Decision Platform | `qdb_edp_` | — | — | ⚠️ Client-prefixed. Review if sold on. |

**Only the CMS row is binding.** The other four are records of what exists.

> ### ⚠️ Reserved ≠ rename
>
> Report Engine and CRM Workflow Designer were listed here as *"assign before
> provisioning"*. **That was wrong — both are already provisioned on `qdb`.**
>
> Report Engine's own tables (`qdb_reportdefinition`, `qdb_reportversion` …) were
> *"created additively in solution `qdb_reportengine`, verified via direct"* query
> against a live organisation. The CRM Workflow Designer provisions its SOP tables
> and reads a large amount of QDB's existing process-engine schema.
>
> So `rpt` and `cwf` are **reserved names for a future productised build**, not
> instructions to rename anything. Adopting one means recreating every table and
> migrating every row — the exact cost this document exists to avoid incurring by
> accident. It is a decision to take deliberately, if and when either product is
> sold to a second client, and it needs its own business case.

Products already live are recorded as they are. **This convention is not a
mandate to migrate them** — the cost is the whole point of the document. It binds
new products and any product not yet provisioned.

### If either is productised

| | Report Engine | CRM Workflow Designer |
|---|---|---|
| Owned components to move | Report definitions, versions, run log, the designer web resource and solution | SOP/step config tables, the designer web resource |
| Client schema that **stays** on the client prefix | Whatever entities a report reads | **Large** — `qdb_action`, `qdb_department`, `qdb_assigned`, the process-engine columns |
| Consequence | A contained migration | Migration **plus** replacing hardcoded `qdb_` field references with configuration, since a second client's schema differs |

The designer is the harder of the two, and the reason is not the prefix — it is
that reading another organisation's schema by hardcoded name does not survive a
second customer regardless of what the tables are called.

---

## Choosing values

| Field | Rule |
|---|---|
| **Prefix** | `msst` for every product. The **product segment** on entities/APIs is what separates them. |
| **Publisher unique name** | `MSST` — one record for every MSS product, never a second spelling |
| **Display name** | **"MSS Technologies"** — corrected 2026-08-11 from "Muhammad Salman Sagar Technologies", a personal name on a publisher that ships to clients. This is the **only** publisher field still editable after a first import, so it is the only one a mistake can be walked back on. |
| **Option value prefix** | 5 digits, 10000–99999, **unique per publisher.** Record it here when assigned; two publishers sharing one causes option-set value collisions on import. |

---

## Before the first table exists

- [ ] Product **segment** recorded in the registry above (the prefix is always `msst`)
- [ ] **`msst` verified unused in every target environment** — confirmed present
      and ours on `org5869857f`; unverified elsewhere
- [ ] Publisher display name corrected
- [ ] The solution manifest and every component use `msst`, and **every entity,
      Custom API and web resource carries its product segment**

The second box is the one that needs someone with organisation access. It cannot
be answered from this repository.
