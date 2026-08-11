# CMS Engine — Summary for QDB, and what we need from you

**Engagement:** CMS-ENG-001 · **Updated:** 2026-08-11 · **Prepared by:** MSS Technologies
**Status:** Business case approved with conditions. Architecture seven-ninths complete. Build not yet approved.

---

## 1. In one paragraph

Portal content at QDB currently lives in application code, so changing a heading
needs a developer, a release and a deployment window. We propose a content
management engine that **runs inside Dynamics** — no new servers, no externally
hosted service, nothing outside your environment. Business users compose pages
from approved building blocks, in English and Arabic, and publish them under
approval. Developers stop being in the path of routine content work.

**We are not asking you to approve a build.** We are asking for six answers.
There were ten: we closed two ourselves, and you answered two more on
11 August 2026.

---

## 2. Where the engagement stands

| Stage | Status |
|---|---|
| Business requirements | Written — **43 functional, 9 non-functional** |
| Executive review | **Approved with conditions** — 10 of 13 now closed |
| Technical proof | Complete |
| Architecture | **7 of 9 sections decided.** 2 wait on you. |
| Build | **Not approved** |

Nothing has been written to a live QDB environment. No database changes have
been made.

---

## 3. What is already closed

### Settled without troubling you

| Previously asked | Now |
|---|---|
| **Rich text** — do authors need bold, lists, links? | **Decided: yes.** Your portal has it today and removing it would be a step backwards. We measured the storage cost before committing: a heavy page uses **0.8 %** of the available limit. **Please confirm** rather than answer. |
| **The capability-loss question** that followed it | **Falls away** — nothing is lost. |

### Answered by you on 11 August 2026

| Question | Your answer | What we did with it |
|---|---|---|
| How many approval routes? | **Two** — regulated, and everything else | Approval workflow is now designed. Routes are a configurable table, not code, so a third route later is a data change rather than a release. |
| Arabic authoring screens? | **English for the first phase** | No translation or right-to-left work on the authoring screens. Arabic *content* is unaffected and already works. |
| *(volunteered)* Run on **both** on-premise and cloud | Taken as a requirement | We re-opened the storage design against it. Page content and version history now use **one column type on both platforms** — one code path rather than two, and no behaviour that differs by environment. |

That is why this document is shorter than the one you may have seen.

---

## 4. What we need from you — six questions

### 🔴 These two block us today

---

#### Q1 · Three things from your on-premise environment

You told us the version is **9.1**, and that you want the solution to run on
**both on-premise and cloud**. Both answers landed; here is what is still open.

**1 — Does the environment support Custom API?** *(this is the one that blocks us)*

It was not covered in the version answer. Publishing is built differently
depending on it, and we cannot design that part of the system without knowing.

**2 — Is "File" in the column Data Type list?** *(two minutes, no longer urgent)*

You told us File columns are available. Microsoft's field-type reference for
Dynamics 365 Customer Engagement (on-premises) lists every available data type,
and **File is not in it** — Image is. Both cannot be true as written; most likely
a cumulative update added it and the documentation, which is on a ten-year
revision cycle, never caught up.

Begin creating a new column on any table, open the **Data Type** list, and tell us
whether **File** is there. Please send the **four-part build number** at the same
time — `9.1.0.xxxx`, not "9.1".

> **This used to be our most urgent question and no longer is.** Your
> "both on-premise and cloud" requirement made us re-examine the design, and page
> version history now uses a large text column on both platforms rather than a
> File column. We measured it first: a heavy page uses under 1 % of that column's
> capacity. **So a "no" to File costs nothing now.** We still want the answer,
> because how images are stored is not yet settled.

**3 — Is the prefix `msst` already in use in your environments?** Every table we
create carries it, and it cannot be changed once records exist. A two-minute check
now avoids a migration later.

*Owner: QDB IT* · *Blocks: on-premise design*

---

#### Q2 · What happens to content already in the current portal CMS?

Your existing portal stores CMS content in a different format from the new
system. Retiring the old editor without moving that content would strand it.

**We need to know:** roughly how many pages, and does it need migrating or can it
be re-authored?

*Owner: QDB Digital* · *Blocks: migration design*

---

### 🟡 Needed before content goes live

---

#### Q3 · Is the GE Dinar font licensed for web use?

GE Dinar is commercial software owned by Boutros International. **A desktop or
print licence does not permit serving it on a website** — that is a separate,
usually traffic-based licence.

We need: confirmation the web licence exists, which domains it covers, and any
page-view limit.

**If it does not exist**, there are free alternatives that are professionally
appropriate (IBM Plex Sans Arabic, Noto Sans Arabic). That is a brand decision,
not a technical one.

*Owner: QDB Brand and Legal*

---

#### Q4 · Confirmation on data protection

Written confirmation that page content is not personal data under PDPPL — or, if
it is, the controls required.

This has gated previous QDB engagements at the same point, so we raise it early.

*Owner: QDB Compliance*

---

### 🟢 Smaller, but cheap now and expensive later

---

#### Q5 · What should Arabic page addresses look like?

For a page titled **عن ريادة**:

| Option | Address | Trade-off |
|---|---|---|
| Keep Arabic | `qdb.qa/عن-ريادة` | Readable and shareable for Arabic speakers; looks messy in emails and logs |
| Convert to Latin | `qdb.qa/an-ryad` | Works everywhere cleanly; meaningless to an Arabic reader |

**Our recommendation:** keep Arabic. It is your audience's language.

*Owner: QDB Digital*

---

#### Q6 · Do you need multi-colour icons?

For security reasons we store icons as pure shapes, which means they take their
colour from your brand palette. **A single icon cannot have two colours.**

This is deliberate: it is what makes uploaded icons safe, and it also stops an
icon smuggling an off-brand colour onto a page.

Multi-colour artwork still works — a two-colour logo or an illustration goes in
the image library instead and keeps its colours.

**We need to know:** does anything in your icon set specifically require more
than one colour?

*Owner: QDB Brand*

---

## 5. What we recommend building

**Three phases. We are asking you to approve only the first.**

| Phase | What business users get |
|---|---|
| **A — proposed now** | Create and publish pages in both languages · media library · translations · approval before publish · version history and rollback · full audit trail |
| **B — later** | Manage brand colours and fonts · manage the component catalogue · manage site navigation |
| **C — later** | Business users build their own components · upload their own icons · edit the page header and footer |

Phase A is where nearly all the value sits — it is what your teams wait on
developers for today.

**The safety controls are not optional.** Approval before publish, version
rollback and an audit trail ship *in Phase A*. Without all three, giving business
users this much control means anyone can break the public site.

---

## 6. What happens once we have answers

1. We complete the architecture — roughly two weeks after Q1 and Q2
2. Executive review of the architecture
3. Build Phase A
4. Testing, security audit, and a final go-live decision

**Nothing proceeds without Q1 and Q2.**

---

## 7. What we would like

A short working session with the right people in the room. Most of these take
minutes to answer with the right person present, and weeks by email.

| Area | Questions |
|---|---|
| IT | **Q1** — the File-column check, the build number, Custom API, and the `msst` prefix check |
| QDB Digital | **Q2**, Q5 |
| Brand | Q3, Q6 |
| Compliance | Q4 |

We can demonstrate the working prototype in the same session, which usually makes
several of these answer themselves.
