# QDB CMS Engine — decision session

Ready to send. Copy the invite text below; attach or link
[`client-actions-required.md`](client-actions-required.md) as the pre-read.

---

## Invite

**Subject:** QDB CMS Engine — architecture complete, 30-minute review

**Body:**

> The architecture for the Content Management Engine is **complete** — all nine
> sections decided. Your answers on 11 August closed the last of it.
>
> This session is a demonstration and a short set of confirmations, not a
> decision meeting. **Nothing is blocked.**
>
> One item does have a deadline: we need to confirm a naming prefix is unused in
> your environments *before* we create the first table, because it cannot be
> changed afterwards. Two minutes for whoever administers the environment.
>
> **The agenda is timeboxed by area, so you only need to stay for your part.**

| Time | Who | Purpose |
|---|---|---|
| **0:00 – 0:12** | Everyone | Prototype demonstration + what the architecture landed on |
| **0:12 – 0:20** | **IT** | **Q1 the `msst` prefix check** *(deadline)* · Q2 the File-column check |
| **0:20 – 0:25** | **Brand** | Q3 font licence · Q6 multi-colour icons |
| **0:25 – 0:30** | **Compliance + Digital** | Q4 PDPPL · Q5 Arabic addresses |

> Full detail and our recommendation on each is in the attached document.

---

## Notes for whoever runs it

**Thirty minutes, and it is no longer a decision session.** This started at ten
questions and ninety minutes. Rich text is decided, the question depending on it
fell away, QDB answered four on 11 August, and we withdrew one that we should
never have asked. **Legal and Communications do not need to be in the room.**

**Lead with the architecture being complete.** That is the news. The nine sections
are decided and the build is ready to start on their go-ahead.

**Q1 is the only thing with a deadline.** The `msst` prefix cannot be changed once
records exist, so it must be confirmed before provisioning. It is a two-minute
check and the last thing that could force rework.

**The File-column check has been deliberately downgraded, and say so.** It was the
most urgent question in the previous pack. It now affects image storage only,
because their "both on-premise and cloud" requirement made us re-examine the
design and page content moved to a large text column on both platforms. If anyone
remembers it being critical, that is the honest explanation: **they gave us a
requirement and it made one of our own questions cheap.**

**If they raise the withdrawn question, do not defend it.** We asked what should
happen to content in the existing portal CMS. The answer was *"this is a new
project — what content?"* They were right. It was answerable from two of our own
documents, and it sat on the blocking list regardless. Own it plainly; it costs
nothing now and buys credibility for the questions that are real.

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
| **Q1** `msst` prefix | **Schema provisioning** — the only hard gate left |
| **Q2** File column | Image storage in §7. Fallback is note attachments; either answer works. |
| Q3 · Q4 | Conditions C-6 · C-5, at the Phase 6 and Phase 7 gates |
| Q5 · Q6 | Build-time detail, needed as Phase A reaches them |

**Phase 3 is closed.** What remains is sequencing, not blocking: executive review
of the architecture, then their go-ahead to provision, then a three-to-four month
Phase A build.
