# CMS Engine — Summary for QDB, and what we need from you

**Engagement:** CMS-ENG-001 · **Updated:** 2026-08-11 · **Prepared by:** MSS Technologies
**Status:** Business case approved with conditions. Architecture two-thirds complete. Build not yet approved.

---

## 1. In one paragraph

Portal content at QDB currently lives in application code, so changing a heading
needs a developer, a release and a deployment window. We propose a content
management engine that **runs inside Dynamics** — no new servers, no externally
hosted service, nothing outside your environment. Business users compose pages
from approved building blocks, in English and Arabic, and publish them under
approval. Developers stop being in the path of routine content work.

**We are not asking you to approve a build.** We are asking for eight answers.
There were ten; we have closed two ourselves since the last version of this
document.

---

## 2. Where the engagement stands

| Stage | Status |
|---|---|
| Business requirements | Written — 72 requirements |
| Executive review | **Approved with conditions** — 8 of 13 now closed |
| Technical proof | Complete |
| Architecture | **6 of 9 sections decided.** 3 wait on you. |
| Build | **Not approved** |

Nothing has been written to a live QDB environment. No database changes have
been made.

---

## 3. What we settled without troubling you

| Previously asked | Now |
|---|---|
| **Rich text** — do authors need bold, lists, links? | **Decided: yes.** Your portal has it today and removing it would be a step backwards. We measured the storage cost before committing: a heavy page uses **0.8 %** of the available limit. **Please confirm** rather than answer. |
| **The capability-loss question** that followed it | **Falls away** — nothing is lost. |

That is why this document is shorter than the one you may have seen.

---

## 4. What we need from you — eight questions

### 🔴 These three block us today

---

#### Q1 · How many different approval routes do you need?

Not *who* approves — **how many separate routes**.

Our concern is specific: a single approval queue for everything will be routed
around. If a legal page and a news item both wait behind the same lawyer,
someone will find a way to skip the queue, and the control stops being a control.

**Our recommendation:** at least two — one for regulated content (legal, terms,
privacy, anything carrying a compliance obligation) and one for everything else.

*Owner: QDB Legal and Communications* · *Blocks: approval design*

---

#### Q2 · Which version of Dynamics on-premise, and does it support two features?

We need to confirm your on-premise environment supports **Custom API** and **File
columns**. Older versions handle these differently, and the answer changes how we
build publishing.

**If you can give us the exact version number, we can verify the rest ourselves.**

**While we have you:** is the prefix **`msst`** already in use in your
environments? Every table we create carries it, and it cannot be changed once
records exist. A two-minute check now avoids a migration later.

*Owner: QDB IT* · *Blocks: on-premise design, and one architecture decision*

---

#### Q3 · What happens to content already in the current portal CMS?

Your existing portal stores CMS content in a different format from the new
system. Retiring the old editor without moving that content would strand it.

**We need to know:** roughly how many pages, and does it need migrating or can it
be re-authored?

*Owner: QDB Digital* · *Blocks: migration design*

---

### 🟡 Needed before content goes live

---

#### Q4 · Should the authoring screens themselves be in Arabic?

Two different things:

- **Arabic content** — pages read by citizens in Arabic. **Confirmed working.**
- **Arabic interface** — the buttons and menus your *authors* use.

The editor we adopted has an English-only interface. Translating it is real
additional work, and it affects only staff, never citizens.

**Our recommendation:** English interface for the first phase, revisit if authors
ask.

*Owner: QDB Digital*

---

#### Q5 · Is the GE Dinar font licensed for web use?

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

#### Q6 · Confirmation on data protection

Written confirmation that page content is not personal data under PDPPL — or, if
it is, the controls required.

This has gated previous QDB engagements at the same point, so we raise it early.

*Owner: QDB Compliance*

---

### 🟢 Smaller, but cheap now and expensive later

---

#### Q7 · What should Arabic page addresses look like?

For a page titled **عن ريادة**:

| Option | Address | Trade-off |
|---|---|---|
| Keep Arabic | `qdb.qa/عن-ريادة` | Readable and shareable for Arabic speakers; looks messy in emails and logs |
| Convert to Latin | `qdb.qa/an-ryad` | Works everywhere cleanly; meaningless to an Arabic reader |

**Our recommendation:** keep Arabic. It is your audience's language.

*Owner: QDB Digital*

---

#### Q8 · Do you need multi-colour icons?

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

1. We complete the architecture — roughly two to three weeks after Q1, Q2 and Q3
2. Executive review of the architecture
3. Build Phase A
4. Testing, security audit, and a final go-live decision

**Nothing proceeds without Q1, Q2 and Q3.**

---

## 7. What we would like

A short working session with the right people in the room. Most of these take
minutes to answer with the right person present, and weeks by email.

| Area | Questions |
|---|---|
| QDB Digital | Q3, Q4, Q7 |
| Legal and Communications | **Q1** |
| IT | **Q2** + the `msst` prefix check |
| Brand | Q5, Q8 |
| Compliance | Q6 |

We can demonstrate the working prototype in the same session, which usually makes
several of these answer themselves.
