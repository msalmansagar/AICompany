# QDB CMS Engine — decision session

Ready to send. Copy the invite text below; attach or link
[`client-actions-required.md`](client-actions-required.md) as the pre-read.

---

## Invite

**Subject:** QDB CMS Engine — decision session (60 min)

**Body:**

> We have completed the evaluation, the business case and two-thirds of the
> architecture for the Content Management Engine. **Eight decisions remain, and
> three of them are holding up the rest of the design.**
>
> We will demo the working prototype first — in our experience several of these
> questions answer themselves once people see it.
>
> **The agenda is timeboxed by area, so you only need to stay for your part.**

| Time | Who | Decisions |
|---|---|---|
| **0:00 – 0:10** | Everyone | Prototype demonstration |
| **0:10 – 0:25** | **Legal + Communications** | **Q1 — how many approval routes** |
| **0:25 – 0:40** | **IT** | **Q2 — Dynamics on-prem version**, plus the `msst` prefix check |
| **0:40 – 0:50** | **Digital** | **Q3 — existing content** · Q4 Arabic authoring UI · Q7 Arabic URLs |
| **0:50 – 0:55** | **Brand** | Q5 font licence · Q8 multi-colour icons |
| **0:55 – 1:00** | **Compliance** | Q6 PDPPL |

> Full detail and our recommendation on each is in the attached document.

---

## Notes for whoever runs it

**Sixty minutes, not ninety.** The previous version of this session had ten
questions; rich text is now decided and the question that depended on it has
fallen away.

**Q1 is the one to push on.** *"The Communications lead approves"* is the easy
answer and probably the wrong one. The question is **how many routes**, not who.
A single queue gets routed around the first time a news item waits behind a
lawyer — and at that point the control has stopped being a control. Come away
with a number.

**Q2 carries a hidden deadline.** The `msst` prefix goes on every table we
create and cannot be changed once records exist. It is a two-minute check for
whoever administers the environment, and it is the last thing that could force
rework before provisioning.

**One thing to state, not ask:** rich text is **in**. We measured the storage
cost before committing — a heavy page uses 0.8 % of the limit. Present it as a
decision to confirm, not a question to reopen.

**If a question stalls,** take the recommendation in the pre-read and record it
as an assumption rather than leaving the room without an answer. Both open
design questions are asymmetric — the permissive answer is cheap to build for
and expensive to retrofit — so a recorded assumption keeps architecture moving.

---

## What each answer releases

| Answer | Unblocks |
|---|---|
| **Q1** approval routes | Architecture §5 · condition C-2 |
| **Q2** on-prem version | Architecture §7 · condition C-4 · lets ADR-CMS-001 be accepted |
| **Q3** existing content | Architecture §8 |
| Q4 · Q5 · Q6 | Conditions C-3 · C-6 · C-5 |

**Phase 3 closes on Q1, Q2 and Q3.** Everything downstream — executive review,
schema provisioning, then a three-to-four month build — is sequenced behind
those three.
