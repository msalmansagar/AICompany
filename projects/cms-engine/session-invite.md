# QDB CMS Engine — decision session

Ready to send. Copy the invite text below; attach or link
[`client-actions-required.md`](client-actions-required.md) as the pre-read.

---

## Invite

**Subject:** QDB CMS Engine — decision session (45 min)

**Body:**

> We have completed the evaluation, the business case and most of the
> architecture for the Content Management Engine. **Six decisions remain, and
> two of them are holding up the rest of the design.**
>
> We will demo the working prototype first — in our experience several of these
> questions answer themselves once people see it.
>
> **The agenda is timeboxed by area, so you only need to stay for your part.**

| Time | Who | Decisions |
|---|---|---|
| **0:00 – 0:10** | Everyone | Prototype demonstration |
| **0:10 – 0:25** | **IT** | **Q1 — the File-column check and the four-part build number**, Custom API, plus the `msst` prefix check |
| **0:25 – 0:35** | **Digital** | **Q2 — existing content** · Q5 Arabic URLs |
| **0:35 – 0:40** | **Brand** | Q3 font licence · Q6 multi-colour icons |
| **0:40 – 0:45** | **Compliance** | Q4 PDPPL |

> Full detail and our recommendation on each is in the attached document.

---

## Notes for whoever runs it

**Forty-five minutes, not ninety.** This session started at ten questions. Rich
text is decided, the question depending on it fell away, and QDB answered the
approval-routes and Arabic-authoring questions on 11 August. **Legal and
Communications no longer need to be in the room.**

**Q1 is the whole session.** It is not a discussion — it is someone opening the
Data Type list on a new column and telling us whether **File** is in it, then
sending the **four-part build number**. QDB has already told us File columns are
available; Microsoft's on-premise type reference says otherwise. Get it settled
in the room rather than by email, because page version history is designed
against the answer and we will build the wrong thing in one direction or the
other. **Custom API is part of the same question and was never answered.**

**Q1 also carries a hidden deadline.** The `msst` prefix goes on every table we
create and cannot be changed once records exist. It is a two-minute check for
whoever administers the environment, and it is the last thing that could force
rework before provisioning.

**Two things to state, not ask:** rich text is **in** — we measured the storage
cost before committing, and a heavy page uses 0.8 % of the limit. And the
approval design is **done**: two routes, regulated and standard, driven by a
classification the author cannot set. Present both as decisions to confirm, not
questions to reopen.

**If a question stalls,** take the recommendation in the pre-read and record it
as an assumption rather than leaving the room without an answer. Both open
design questions are asymmetric — the permissive answer is cheap to build for
and expensive to retrofit — so a recorded assumption keeps architecture moving.

---

## What each answer releases

| Answer | Unblocks |
|---|---|
| **Q1** File column · build number · Custom API | Architecture §7 · condition C-4 · lets ADR-CMS-001 be accepted |
| **Q2** existing content | Architecture §8 |
| Q3 · Q4 | Conditions C-6 · C-5 |

**Phase 3 closes on Q1 and Q2.** Everything downstream — executive review, schema
provisioning, then a three-to-four month build — is sequenced behind those two.
