# CMS Engine — Summary for QDB, and what we need from you

**Engagement:** CMS-ENG-001 · **Date:** 2026-08-10 · **Prepared by:** MSS Technologies
**Status:** Business case approved with conditions. Architecture authorised. Build not yet approved.

---

## 1. In one paragraph

Portal content at QDB currently lives in application code, so changing a heading
needs a developer, a release and a deployment window. We propose a content
management engine that **runs inside Dynamics** — no new servers, no externally
hosted service, nothing outside your environment. Business users compose pages
from approved building blocks, in English and Arabic, and publish them under
approval. Developers stop being in the path of routine content work.

We have built a working proof and a clickable prototype. **We are not asking you
to approve a build yet.** We are asking for answers to ten questions that
determine what the build actually is.

---

## 2. Where the engagement stands

| Stage | Status |
|---|---|
| Business requirements | Written — 72 requirements |
| Executive review | **Approved with conditions** |
| Technical proof | Complete |
| Component research | Complete |
| Architecture | Authorised, **blocked on your answers** |
| Build | **Not approved** |

Nothing has been written to a live QDB environment. No database changes have been
made.

---

## 3. What we proved before asking you to commit

Rather than assert these, we measured them.

| Question | Answer |
|---|---|
| Does Arabic right-to-left actually work in a page builder? | **Yes** — verified by dragging blocks in Arabic and confirming they land correctly, not mirrored |
| Will a page fit in a Dynamics database column? | **Yes** — a page of 2,000 blocks uses 0.9% of the limit, roughly a hundredfold margin |
| Can we adopt existing software instead of building an editor? | **Yes** — one open-source editor adopted; two others rejected on evidence, one of which had not been updated in 18 months |
| Can business users create new page components without a developer? | **Yes**, for roughly 95% of cases |
| Does this need any new servers or hosting? | **No** — it runs inside Dynamics |

We also found and closed three technical risks your executive review raised —
including one security question where the obvious industry-standard tool turned
out not to be safe for our specific use, so we changed the design rather than
accept it.

---

## 4. What we recommend

**Build it in three phases, and approve only the first now.**

| Phase | What business users get |
|---|---|
| **A — approved** | Create and publish pages, in both languages · media library · translations · approval before publish · version history and rollback · full audit trail |
| **B — later gate** | Manage brand colours and fonts · manage the component catalogue · manage site navigation |
| **C — later gate** | Business users build their own new components · upload their own icons · edit the page header and footer |

Phase A is where nearly all the value sits — it is what your teams wait on
developers for today. Phase C is the most interesting and the least useful until
Phase A is live and the safety controls have been seen working with real authors.

**The safety controls are not optional.** Approval before publish, version
rollback, and an audit trail must ship *in Phase A*, not be added later. Without
all three, giving business users this much control means anyone can break the
public site.

---

## 5. What we need from you

Ten questions. Each blocks something specific. Where we have a recommendation,
it is stated — you are welcome to overrule it.

### 🔴 Blocking architecture — needed first

---

#### Q1 · Do authors need rich text formatting?

Can an author write a paragraph with **bold**, bullet lists and inline links —
or is plain text with headings, images and buttons enough?

**Why it matters more than it sounds.** It changes the page size limits, the
editor's toolset, and the security surface. It also decides Q2 below.

**Our recommendation:** yes, include it. Your portal already has it today, and
removing it would be a step backwards.

*Owner: QDB Digital*

---

#### Q2 · If not, do you accept losing a capability you have today?

Your current portal lets authors write rich text on CMS pages. If Q1 is answered
"no", the new system would be **less capable than the one it replaces** for that
one thing.

We flag this because it was not obvious and would otherwise be discovered
mid-build.

**Only needs answering if Q1 is "no".**

*Owner: QDB Digital*

---

#### Q3 · Who approves content before it goes live?

Not just names — **how many different approval routes do you need?**

Our concern: a single approval queue for everything will be routed around. If a
legal page and a news item both wait behind the same lawyer, someone will find a
way to skip the queue.

**Our recommendation:** at least two routes — one for regulated content (legal,
terms, privacy, anything with a compliance obligation) and one for everything
else.

*Owner: QDB Legal and Communications*

---

#### Q4 · Which version of Dynamics on-premise, and does it support two specific features?

We need to confirm your on-premise environment supports **Custom API** and **File
columns**. Older versions handle these differently, and the answer changes how we
build the publishing mechanism.

If you can give us the exact version number, we can verify the rest ourselves.

*Owner: QDB IT*

---

#### Q5 · Should the authoring screens themselves be in Arabic?

Two different things:

- **Arabic content** — pages read by citizens in Arabic. **Confirmed working.**
- **Arabic interface** — the buttons and menus your *authors* use.

The editor we adopted has an English-only interface. Translating it is real
additional work. It affects only staff, never citizens.

**Our recommendation:** English interface for Phase A, revisit if authors ask.

*Owner: QDB Digital*

---

### 🟡 Needed before content goes live

---

#### Q6 · What happens to content already in the current portal CMS?

Your existing portal stores CMS content in a different format from the new
system. Retiring the old editor without moving that content would strand it.

**We need to know:** how many pages, and does it need migrating or can it be
re-authored?

*Owner: QDB Digital*

---

#### Q7 · Is the GE Dinar font licensed for web use?

GE Dinar is commercial software owned by Boutros International. **A desktop or
print licence does not permit serving it on a website** — that is a separate,
usually traffic-based licence.

We need: confirmation the web licence exists, which domains it covers, and any
page-view limit.

**If it does not exist**, there are free alternatives (IBM Plex Sans Arabic, Noto
Sans Arabic) that are professionally appropriate. That is a brand decision, not a
technical one.

*Owner: QDB Brand and Legal*

---

#### Q8 · Confirmation on data protection

Written confirmation that page content is not personal data under PDPPL — or, if
it is, the controls required.

This has gated previous QDB engagements at the same point, so raising it early.

*Owner: QDB Compliance*

---

### 🟢 Smaller decisions, but cheap now and expensive later

---

#### Q9 · What should Arabic page addresses look like?

For a page titled **عن ريادة**, the web address can be either:

| Option | Address | Trade-off |
|---|---|---|
| Keep Arabic | `qdb.qa/عن-ريادة` | Readable and shareable for Arabic speakers; looks messy in emails and logs |
| Convert to Latin | `qdb.qa/an-ryad` | Works everywhere cleanly; meaningless to an Arabic reader |

**Our recommendation:** keep Arabic. It is your audience's language.

*Owner: QDB Digital*

---

#### Q10 · Do you need multi-colour icons?

For security reasons we store icons as pure shapes, which means they take their
colour from your brand palette. **A single icon cannot have two colours.**

This is deliberate: it is what makes uploaded icons safe, and it also stops an
icon smuggling an off-brand colour onto a page.

Multi-colour artwork — a two-colour logo, an illustration — still works: it goes
in the image library instead, and keeps its colours.

**We need to know:** does anything in your icon set specifically require more
than one colour?

*Owner: QDB Brand*

---

## 6. What happens once we have answers

1. We complete the architecture — roughly two to three weeks after answers
2. Executive review of the architecture
3. Build Phase A
4. Testing, security audit, and a final go-live decision

**Nothing proceeds without Q1 to Q5.** Those five determine what we are building;
starting without them would mean building the wrong thing and reworking it.

---

## 7. What we would like from this

A short working session with the right people in the room. Most of these
questions take minutes to answer with the right person present, and weeks to
answer by email.

**Suggested attendees:** QDB Digital (Q1, Q2, Q5, Q6, Q9), Legal and
Communications (Q3), IT (Q4), Brand (Q7, Q10), Compliance (Q8).

We can demonstrate the working prototype in the same session, which usually makes
several of these questions answer themselves.
