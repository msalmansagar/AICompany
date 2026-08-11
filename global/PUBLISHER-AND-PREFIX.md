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

> **One publisher record per product. Its customization prefix is the product
> code. Every component of that product — tables, columns, web resources,
> plugins, Custom APIs, the solution itself — sits on that one prefix.**

A publisher carries exactly **one** customization prefix, so per-product prefixes
require per-product publishers. That is the standard ISV pattern, not a
workaround.

### Why not one MSS publisher with an `mss` prefix

Because every product would then share a namespace and collide on the generic
names each of them wants: `mss_page`, `mss_field`, `mss_version`, `mss_template`.
The CMS Engine and the Dynamic Form Engine both want `mss_field`. Only one can
have it.

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
| **Owned** — tables, columns, web resources, plugins, Custom APIs the product creates | **product prefix** | `cms_pageversion` |
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
| **CMS Engine** (CMS-ENG-001) | *nothing yet* | **`cms`** | `msstechnologies_cmsengine` | ✅ **Adopted and binding — no components exist** |
| **Report Engine** (RPT-ENG-001) | `qdb` | **`rpt`** | `msstechnologies_reportengine` | ⚠️ **Live on `qdb`.** Reserved for a productised build only. |
| **CRM Workflow Designer** (CWFD-001) | `qdb` | **`cwf`** | `msstechnologies_workflowdesigner` | ⚠️ **Live on `qdb`.** Reserved for a productised build only. |
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
| **Prefix** | 2–8 chars, lowercase, the product code. No client name. No company name. |
| **Publisher unique name** | `msstechnologies_<product>` — one record, never a second spelling |
| **Display name** | `MSS Technologies` — identical across every product |
| **Option value prefix** | 5 digits, 10000–99999, **unique per publisher.** Record it here when assigned; two publishers sharing one causes option-set value collisions on import. |

---

## Before the first table exists

- [ ] Prefix is recorded in the registry above
- [ ] **The prefix is verified unused in every target environment** — generic
      codes like `cms` may already be held by another vendor
- [ ] Publisher unique name, display name and option value prefix are fixed
- [ ] The solution manifest and every component use that one prefix — no
      second prefix for web resources

The second box is the one that needs someone with organisation access. It cannot
be answered from this repository.
