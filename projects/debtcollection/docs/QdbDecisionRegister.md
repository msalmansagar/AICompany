# QDB decision register — Debt Collection Platform

**As of 2026-09-22, at Phase 8 closure.** For a working session with QDB. Each row is a decision
only QDB can make; the technical detail behind it lives in `Phase8_KIRegister.md` and
`KnownIssues.md`.

**How to read the third column.** *What DCP does today* is always a deliberate choice to do the
safe thing in the absence of an answer — usually to do nothing visible rather than to guess. None
of these is a bug, and none is waiting on development.

---

## 1. Strategy and assignment

| # | What QDB must decide | Why it matters | What DCP does today | If it stays open | Suggested owner |
|---|---|---|---|---|---|
| 1.1 | **Who may be given collection work?** | Dynamics refuses to assign work to anyone lacking collection privileges — and today nobody on the organisation has them, so no officer can hold a single item of work | Assignment is proven with the system account only, and every result says so rather than implying officers were tested | Queues, ownership, escalation and turn-around all rest on this. Nothing can go live to real officers | QDB Security with Collections |
| 1.2 | **Is there a "Smart Assignment" rule, or is manual ownership the model?** | A routing algorithm was referenced in the original requirements; no description of it exists anywhere | Standard Dynamics ownership, which works. No routing algorithm has been invented | Work is assigned by hand. Nothing breaks | Collections |
| 1.3 | **May a completed or cancelled action be raised again in the same delinquency episode?** | A reminder call completed on day 3 — should the next evaluation raise it again on day 30, or is that a different action? | Nothing is regenerated within an episode | Re-evaluation stays conservative — it will never duplicate, and may under-raise | Collections |
| 1.4 | **Should Dynamics' own audit be switched on for collection records?** | It is currently off on the two records the platform writes to most, so there is no history of who changed or reassigned what | Strategy decisions are traced separately, so this phase does not depend on it | No field-level history on collection activity or cases | CRM platform |

---

## 2. Turn-around times and escalation

| # | What QDB must decide | Why it matters | What DCP does today | If it stays open | Suggested owner |
|---|---|---|---|---|---|
| 2.1 | **When does the clock start** — when work is created, assigned, or acknowledged? | It decides who is accountable. Starting at creation means work waiting three days for an owner is already late through nobody's fault | Shows *"Due date not configured"*, and does not offer **Due soon** or **Overdue** queues at all — with the reason on screen | No deadline exists anywhere in the platform, so nothing can be time-managed | Collections |
| 2.2 | **Do the configured hours mean clock hours or working hours?** | QDB operates in Qatar; a wrong working-week assumption shifts every deadline in the portfolio | No calendar is assumed | Same as 2.1 | Collections |
| 2.3 | **What is the escalation policy?** | A complete escalation model is configured in the system and holds **no rules at all**, so nothing escalates | Escalation is shown only where the platform itself records it — never inferred from work being late | The escalation ladder exists on paper and does nothing | Collections |
| 2.4 | **What happens to work nobody ever received?** | Different from an officer missing a deadline, and today it describes *every* item (see 1.1) | It is not reported as an officer running late | Routing failures are invisible, or blamed on a person | Collections |
| 2.5 | **May an officer override a configured follow-up date?** | Either enforcing the window or allowing the override is defensible, and they differ materially | The officer's typed date is kept | Minor. Nothing is lost either way | Collections |
| 2.6 | **What are the promise-to-pay limits?** | Maximum amount, horizon, how many promises at once, tolerance, grace period | No limit is invented; an implausible promise is visible to a supervisor | Officers can record any promise | Collections |

---

## 3. Legal

| # | What QDB must decide | Why it matters | What DCP does today | If it stays open | Suggested owner |
|---|---|---|---|---|---|
| 3.1 | **Which cases qualify to go to Legal, and who approves?** | Sending a customer to litigation is among the most serious actions the platform can take | **Nothing is offered.** There is no enabled *Send to Legal* button anywhere, for anyone | Legal hand-off cannot be switched on. The traceability around it is finished and waiting | Legal with Collections |
| 3.2 | **How does a Housing Loan customer become the BFD account a Litigation Request needs?** | The two systems identify customers by different kinds of number, and nothing links them | HL hand-off is refused rather than guessed | Legal hand-off can work for BFD customers only | Data with Legal |
| 3.3 | **May a Collection Officer see a Litigation Request raised from their own case?** | Today no collection role can read the Legal record at all | Withheld and absent are kept distinct — an officer is never told "there is no litigation" when the truth is "you may not see it" | Officers would see nothing, and would have no way to know why | Security |

---

## 4. Disputes and complaints

| # | What QDB must decide | Why it matters | What DCP does today | If it stays open | Suggested owner |
|---|---|---|---|---|---|
| 4.1 | **What does a dispute do to collection?** | Chasing a customer who is contesting the amount is a conduct risk; pausing collection with no agreed rule is a recovery risk | **Nothing happens.** Recording a dispute changes no collection behaviour, and this is an explicit, tested contract rather than an omission | Disputes are recorded and visible, and influence nothing | Collections with Compliance |
| 4.2 | **Is a collection dispute the same thing as a formal complaint?** | QDB's complaint process is mature and has no category for *"the customer disputes the amount"* | They are kept separate: a dispute is collection work; a complaint is a Case in QDB's own process. Not every dispute becomes a complaint | The distinction holds. One activity type currently labels both | Collections with Complaints |
| 4.3 | **May an officer raise a complaint, or only record the dispute?** | No collection role can currently read or create a Case | Complaint creation is proven under an administrator and reported as such | Officers could neither raise a complaint nor see its outcome | Security with Complaints |
| 4.4 | **What happens to Cases raised before the case-type list was redefined?** | The list was changed in place: the value that used to mean *Problem* now means *Complaint*, and the stored data did not change | The value is resolved by its **label**, read live, never by a fixed number | Every historical Case of that type now reads as a complaint, so any report over history is wrong | CRM platform with Data |

---

## 5. Deceased customers

| # | What QDB must decide | Why it matters | What DCP does today | If it stays open | Suggested owner |
|---|---|---|---|---|---|
| 5.1 | **What does the QCB deceased indication actually mean?** | 724 records carry it. Nothing states whether it is a verified death, a reported one, or an operational marker | It is shown as **"verification required"** — never as a statement that a customer has died | The strongest signal in the portfolio is either ignored or over-read | Collections with Risk |
| 5.2 | **What should happen to collection and to messages while death is being verified?** | This is the most likely conduct failure in the portfolio: contacting a bereaved family | No pause, no message suppression, no legal effect — and the screen says so plainly | Collection continues unchanged against these customers | Collections with Compliance |
| 5.3 | **Is there any credit-life or mortgage-protection insurance for Housing Loan?** | If a policy settles the balance on death, that changes the whole treatment | **No insurance capability was built**, because none was found to build against. The claims processes that exist are a different product family | Nothing to reconcile. Confirmation would close the question | Products |
| 5.4 | **Where do exemption figures come from?** | The fields exist and are empty on every record, so the relief states in the MIS analysis cannot be distinguished | No sub-state is inferred from missing data | Exemption handling cannot be built or reported | MIS |
| 5.5 | **Who may record a deceased review, and where does a death certificate live?** | Verification needs evidence, and document storage is not configured at all | No document capability is claimed | Reviews can be recorded but not evidenced | Security with ECM |

---

## 6. Restructuring — **PARKED**

**Status: Discovery Complete — Downstream Integration Pending QDB Confirmation.** Parked by QDB
sequencing decision, not cancelled. Nothing here was built, and the restart point is recorded in
`Restructuring_Parked_Checkpoint.md`.

| # | What QDB must decide | Why it matters | Suggested owner |
|---|---|---|---|
| 6.1 | How does a collection case's facility number identify the facility a Facility Amendment needs? | The two systems name facilities differently, and none of the existing facility records matches | Lending |
| 6.2 | How should a Facility Amendment point back at the collection case that prompted it? | Without it the chain has no last link, and a retry could duplicate a request | Lending |
| 6.3 | Which role may raise or see a Facility Amendment? | No collection role holds either privilege | Security |

Until then the workspace shows the officer's **recommendation** only, and never a restructuring
status it cannot know.

---

## 7. Security — the one that recurs

**Five capabilities, one question.** Assignment, Legal, Complaints, Deceased and Restructuring each
independently reached the same wall: the process exists, the software works, and **no collection
role holds the privilege**.

This is the single most consequential item in this register, because it is the reason every browser
result so far is *administrator* evidence rather than *officer* evidence.

The full breakdown — table by table, privilege by privilege, with the minimum grant each needs — is
in **`CollectionOfficerSecurityReadiness.md`**. Three of the five need **read access only**.

**The recommendation is not to widen an administrative role.** A separate, additive collection role
carrying the specific reads keeps the grant auditable and reversible.
