# ADR-DCP-08 — Communications through the existing fax / email entities and one Communication Service

**Status:** Proposed (Phase 0, awaiting review) · 2026-09-17 · **Deciders:** architect, ceo (pending)
**Drives:** Master Prompt §32–40; Correction Prompt §40. **Amends:** ADR-DCP-01 (second half).

## Context
QDB already sends SMS and WhatsApp through the Dynamics **fax** entity and email through the **email**
entity in both CRMs. The repository built a custom `msst_dcpcommunication` activity plus a `nodemailer`
email adapter and a bespoke `ISmsGateway`, duplicating transactions QDB already records. Officers must not
leave the workspace to communicate, and automated sends must obey the same rules as manual ones.

## Decision
1. **Transaction entities:** SMS → `fax`, WhatsApp → `fax`, Email → `email`. No custom communication
   entity; `msst_dcpcommunication` retires. `qdb_` columns on fax/email (channel SMS vs WhatsApp, template
   code, block reason, delivery status) only if QDB's existing mechanism lacks them — `TBD`.
2. **One Communication Service** (shared implementation; callable from React via the Integration Service or
   in-CRM operation, and from background jobs) exposing `sendCommunication / sendSms / sendWhatsApp /
   sendEmail / getAvailableTemplates / validateCommunication / previewTemplate / getCommunicationHistory`.
   React contains no provider logic.
3. **Validation chain before any send, manual or automatic:** customer · recipient · stop-contact ·
   deceased restrictions · channel availability · consent (where required) · approved-template requirement ·
   free-text privilege · approval requirement · applicable business rules (Rule Engine) · security
   authorisation. Background processes cannot bypass it; a refused send is logged with its reason.
4. **Templates:** `qdb_communicationtemplate` (EN/AR, `{{placeholders}}`, approval, versioning, effective
   dates) unless QDB's EmailEditor engine already covers SMS/WhatsApp templates — `TBD — Requires QDB
   Confirmation`. `liquidjs` remains the rendering library.
5. **Communication Center** in React: channel, recipient, language, template, subject, message,
   attachments, preview, send, cancel. **Unified Timeline** aggregates `qdb_collectionactivity` + fax +
   email + process events; no duplicate activity per send unless a business requirement demands it.
6. **The existing fax-to-SMS/WhatsApp trigger mechanism is `TBD — Requires QDB Confirmation`** and is not
   invented; Phase 7 design is blocked on that answer, Phase 0–6 are not.
7. `nodemailer` and the bespoke `ISmsGateway` adoptions in `dependencies.md` are **withdrawn**.

## Consequences
**Positive:** reuses working QDB mechanisms; one rule set for manual and automated sends; native Timeline
support; retires 6 plugin steps and a whole entity.
**Negative:** fax/email may lack Collection-specific fields (block reason, template, channel) — resolved by
`qdb_` extensions or the technical log (`qdb_crmlogs`) once the trigger mechanism is known; delivery-status tracking depends on
what the existing gateway reports.
**Neutral:** official letters stay Phase 2 (deck) and follow the same service contract.

**Consequence carried from the consolidated activity table (KI-35):** with actions, promises and
communications on one table, send rights can no longer be expressed as an entity privilege. Send
authorisation is enforced by the Communication Service against privilege on the native fax/email
activity plus the Contact Hold ruleset — see CommunicationArchitecture §2a and SecurityModel §5a.
A Create privilege on qdb_collectionactivity permits recording collection work, never contacting a
customer.

## Alternatives considered
| Option | Rejected because |
|---|---|
| Keep `msst_dcpcommunication` as the single audit record | Duplicates fax/email transactions; MP §32 forbids |
| Separate manual and background send paths | MP §36 forbids; validation bypass risk |
| Direct gateway adapters (nodemailer, SMS HTTP) from the service | Bypasses QDB's existing, audited mechanisms |
