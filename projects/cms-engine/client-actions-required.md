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

**We are not asking you to approve a build.** There were ten questions. **Nothing
is blocking us any more** — you answered four, we closed three ourselves, and the
three that remain are needed before go-live rather than before design.

**The architecture is complete.**

---

## 2. Where the engagement stands

| Stage | Status |
|---|---|
| Business requirements | Written — **43 functional, 9 non-functional** |
| Executive review | **Approved with conditions** — 11 of 13 now closed |
| Technical proof | Complete |
| Architecture | ✅ **Complete — all 9 sections decided** |
| Build | **Not approved** — awaiting your go-ahead |

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
| Does the environment support Custom API? | **Cloud yes; on-premise uses a plugin/action** | Correct, and it costs nothing. We name the on-premise action identically, so the same code calls it on both platforms — the difference exists only in how the solution is packaged. Page-serving speed is unaffected: that path does not go through the action at all. |
| What happens to existing portal content? | *"I don't understand — it is a new project"* | **A fair challenge, and you were right.** We withdrew the question; see below. |

That is why this document is shorter than the one you may have seen.

---

### A question we withdrew

We asked *"what happens to the content already in the current portal CMS?"* and
the answer that came back was, in substance, **"this is a new project — what
content?"**

That was the right response. **We should not have asked it.** The question was
about a content table inside a platform component from an earlier engagement, and
that component has never run in production, so it holds nothing. It was also
already settled at the business-case gate, where migrating existing pages was put
out of scope as a separate engagement.

Two documents of ours answered it. It reached you anyway, and it sat on the
blocking list for weeks. That is our process failing, not your understanding.

---

## 4. What we still need — six questions, none of them blocking design

**Sequenced by when we need them, not by importance.** Only the first has a hard
deadline, and it is a two-minute check.

### 🔵 Before we create anything in your environment

---

#### Q1 · Is the prefix `msst` already used in your environments?

**This is the only one with a deadline attached.** Every table we create carries
the prefix `msst`, and **a Dataverse publisher prefix cannot be changed once
records exist.** If something else already uses it, we need to know before we
create the first table — afterwards it is a migration.

A two-minute check for whoever administers the environment.

*Owner: QDB IT* · *Needed: before provisioning*

---

#### Q2 · Is "File" in the column Data Type list?

You told us File columns are available. Microsoft's field-type reference for
Dynamics 365 Customer Engagement (on-premises) lists every available data type,
and **File is not in it** — Image is. Both cannot be true as written; most likely
a cumulative update added it and the documentation, which is on a ten-year
revision cycle, never caught up.

Begin creating a new column on any table, open the **Data Type** list, and tell us
whether **File** is there. Please send the **four-part build number** at the same
time — `9.1.0.xxxx`, not "9.1".

> **This was our most urgent question three weeks ago. It now affects one thing:
> how uploaded images are stored.** Your "both on-premise and cloud" requirement
> made us re-examine the design, and page content and version history moved to a
> large text column on both platforms — a heavy page uses under 1 % of its
> capacity. If File columns turn out to be unavailable, images use note
> attachments instead, which every version of CRM has. **Either answer works.**

*Owner: QDB IT* · *Needed: before media upload is built*

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

1. ~~We complete the architecture~~ ✅ **Done — all nine sections decided**
2. Executive review of the architecture
3. **Your go-ahead to create tables in the environment** — needs Q1 first
4. Build Phase A
5. Testing, security audit, and a final go-live decision

**Nothing is waiting on you to unblock design.** Q1 gates provisioning, and the
rest are needed as the build reaches them.

---

## 7. What we would like

A short working session with the right people in the room. Most of these take
minutes to answer with the right person present, and weeks by email.

| Area | Questions |
|---|---|
| IT | **Q1** the `msst` prefix check *(the only one with a deadline)* · Q2 the File-column check |
| Brand | Q3 font licence · Q6 multi-colour icons |
| Compliance | Q4 PDPPL |
| QDB Digital | Q5 Arabic addresses |

We can demonstrate the working prototype in the same session, which usually makes
several of these answer themselves.
