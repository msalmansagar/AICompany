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

## Registry

Each product records its values here **before its first table is created**.

| Product | Prefix | Publisher unique name | Display name | Status |
|---|---|---|---|---|
| **CMS Engine** (CMS-ENG-001) | `cms` | `msstechnologies_cmsengine` | MSS Technologies | **Adopted — no components yet** |
| Dynamic Form Engine | `dfe` + `qdb` | `maqsad_ai` / `maqsadai` | Maqsad AI | ⚠️ Split, pre-convention. Live — not correctable. |
| Report Engine | *(unassigned)* | — | — | Assign before provisioning |
| Enterprise Decision Platform | `qdb_edp_` | — | — | ⚠️ Client-prefixed. Review if sold on. |
| CRM Workflow Designer | *(unassigned)* | — | — | Assign before provisioning |

Products already live are recorded as they are. **This convention is not a
mandate to migrate them** — the cost is the whole point of the document. It binds
new products and any product not yet provisioned.

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
