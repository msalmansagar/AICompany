# Phase 7 — CEO Final Decision
## Dynamic Form Engine — Mobile Rendering Extension (QDB)

**Project:** Dynamic Form Engine — Mobile Rendering Extension
**Client:** Qatar Development Bank (QDB)
**Decision Date:** 2026-05-25
**Deciding Officer:** CEO, Maqsad AI
**Parent Engagement:** Dynamic Form Engine (web) — APPROVED WITH CONDITIONS (10 web Sprint 1 blockers open)

---

## 1. VERDICT

**APPROVED WITH CONDITIONS**

The mobile extension delivers a strategically sound channel expansion for QDB. The shared-engine architecture is the right call — one Dataverse configuration rendering on both web and mobile is a defensible long-term position, and the estimated $71,400/year in avoided form development cost is real and verifiable. However, this engagement cannot proceed to UAT in its current state. The audit has confirmed a critical, non-debatable finding: the app is completely non-functional as built. MCODE-S-01 is not a minor configuration gap — it is a confirmed authentication bug that means every API call returns HTTP 401. No test has ever run end-to-end against a real backend. That is not a delivered mobile app; it is a mobile app scaffold. Beyond the confirmed bug, two inherited architectural gates (GATE-A tenant type, GATE-B data residency) remain unresolved from the parent web engagement and they are prerequisite blockers for this mobile channel as well. The team may proceed with remediation immediately. No UAT activity, no QDB demonstration, and no App Store submission may occur until the conditions in Section 4 are fully satisfied and signed off.

---

## 2. Strategic Assessment

**Business Value**
QDB's customers — bank clients completing loan applications, KYC, and onboarding — expect a mobile-first experience. The web portal alone leaves a significant portion of that customer base underserved. The mobile extension closes that gap without creating a parallel form management workflow. Zero-deployment-per-form on mobile is the headline value: a form configured in Dataverse renders on iOS and Android automatically. At six new forms per year at $11,900 of avoided development cost per form, the ROI case is straightforward and conservative.

**Channel ROI**
The mobile extension is incremental infrastructure. The shared RuleEngine and ValidationEngine packages extracted during this engagement reduce long-term divergence risk between channels. That architecture decision pays dividends beyond the cost savings estimate — it prevents the class of bugs where web and mobile silently evaluate business rules differently.

**Relationship to Web Engagement**
This engagement is downstream of the web engagement and cannot be independent of it. Three of the ten UAT blockers identified here are inherited directly from the web Sprint 1 blocker list. The mobile channel will not reach production before the web channel's six release blockers are resolved. The dependency chain in Section 6 makes this sequencing explicit. The team must not treat this as a parallel track that can leapfrog the web engagement's unresolved conditions.

---

## 3. What is Conditionally Approved

The following work may proceed immediately without additional approval:

- Remediation of all UAT blocker conditions listed in Section 4
- Internal development environment testing (not against QDB production or UAT Dataverse)
- Extraction and packaging of the shared/ engines (RuleEngine, ValidationEngine) as a formal internal package
- Resolution of MCODE-S-01 (the MSAL scope bug) — this fix is a prerequisite for any other testing to be meaningful
- Architecture Decision Record authoring for MADR-006 (Android OAuth redirect URI scheme)
- Submission of QDB written confirmation requests for GATE-A and GATE-B

The following is explicitly not approved until Section 4 conditions are met:

- Any UAT activity with QDB users or QDB test environments
- Any App Store (Apple) or Play Store (Google) submission or TestFlight distribution
- Any demonstration to QDB stakeholders that presents the app as functionally complete
- Any production deployment activity

---

## 4. Conditions Before Mobile UAT

The following conditions must be fully resolved and verified before any UAT activity begins. Each condition requires written sign-off from the responsible owner before the gate is considered closed.

**MUATC-001 — Fix confirmed MSAL scope bug (MCODE-S-01)**
Owner: Mobile Technical Lead
The `MsalProvider.tsx` scope must be corrected to reference `EXPO_PUBLIC_BACKEND_APP_CLIENT_ID` (the backend API client ID), not the mobile app's own Azure AD client ID. This is a confirmed bug, not a theoretical risk. Every API call currently returns HTTP 401. The fix must be deployed to the development environment and a successful authenticated API call must be demonstrated against a real (non-mocked) backend before any other integration testing is meaningful. This is the first fix to execute — nothing else can be validated until authentication works.

**MUATC-002 — Resolve GATE-A: Tenant type written confirmation (inherited)**
Owner: QDB Client Engagement Lead / BA
QDB must provide written confirmation of whether portal users are internal corporate AD users or external bank customers. If external, the entire MSAL single-tenant authentication layer must be rebuilt for Entra External ID before UAT. This gate was open on the web engagement and remains open here. No UAT environment can be provisioned until this is answered in writing. The BA must escalate this to QDB project sponsor level — this is not a technical question, it is a business architecture decision that only QDB can answer.

**MUATC-003 — Resolve GATE-B: Qatar/UAE North Dataverse provisioning (inherited)**
Owner: QDB IT Infrastructure / Maqsad AI Architect
All mobile form submissions contain PII, ID documents, and income data. Routing this data to a West Europe Dataverse instance is a PDPPL cross-border transfer violation from the first day of UAT. A Qatar or UAE North Dataverse organisation must be provisioned and confirmed in writing before the mobile UAT environment is configured. This gate was open on the web engagement. It is a production-equivalent blocker for UAT because PII data entered during UAT is real data subject to PDPPL.

**MUATC-004 — Fix qdb_channel audit field derivation (MSEC-003)**
Owner: Backend Technical Lead
The `qdb_channel` audit field must be derived from the JWT `azp` claim, not from the `X-Client-Platform` HTTP header. A spoofable header is not an acceptable source for a compliance metric that QCB may audit. This is a backend fix that affects both the web and mobile channels. It must be coordinated with the web engagement remediation.

**MUATC-005 — Fix fieldKey sanitisation in GridUnavailableField (MCODE-S-02)**
Owner: Mobile Technical Lead
The `fieldKey` variable must be sanitised before URL construction. A crafted CRM field key can currently cause a path traversal. This is a straightforward input validation fix. It must be applied and verified before UAT because QDB UAT environments connect to real Dataverse instances.

**MUATC-006 — Fix GET /api/forms access control placement (MSEC-007)**
Owner: Backend Technical Lead
The access control logic for GET /api/forms must be moved from the controller into the shared roleMiddleware, consistent with the architectural pattern used across all other endpoints. This must be coordinated with the BLOCKER-4 fix from the web engagement. The two fixes must land in the same architectural pattern — do not patch this independently and create a new inconsistency.

**MUATC-007 — Remove unused biometric permissions from app.json (MSEC-013/017)**
Owner: Mobile Technical Lead
The `NSFaceIDUsageDescription` and `USE_BIOMETRIC` permission declarations must be removed from `app.json` before any build submitted for App Store or Play Store review. Apple and Google will reject the app or require justification for permissions the app does not use. This is a submission gate item but it must be resolved before UAT builds are distributed via TestFlight or internal test tracks, which require a valid app bundle.

**MUATC-008 — Fix MSAL React Native version (MSEC-014)**
Owner: Mobile Technical Lead
The `@azure/msal-react-native` dependency must not be pinned at v0.0.1 pre-release in a banking application. Upgrade to the latest stable release. Pre-release authentication libraries in a financial services context are not acceptable for UAT. Verify the upgrade does not break the MSAL integration after MUATC-001 is resolved.

**MUATC-009 — Fix MSAL initialisation error handling (MCODE-E-01)**
Owner: Mobile Technical Lead
The `initializeMsal()` function must handle failure cases. An unhandled MSAL initialisation error currently leaves the user on an infinite loading state with no recovery path. For UAT, users must receive a clear error message and a retry option. Silent infinite loading in UAT produces invalid test results.

**MUATC-010 — Fix useRuleEngine JSON.stringify undefined value handling (MSEC-015)**
Owner: Shared Package Technical Lead
The `JSON.stringify` call in `useRuleEngine` silently drops `undefined` values. This can cause hidden field clearing via BR-002 to fail silently — a business rule engine that does not execute business rules is not testable. This must be resolved before UAT so that rule-driven form behaviour can be validated.

---

## 5. Conditions Before Production

The following production gate items must be resolved before any production deployment or public App Store/Play Store release. They do not block UAT remediation work but they do block production approval.

**MPROD-001 — Jailbreak and root detection (MSEC-004 / MNFR-008)**
A banking application that runs without restriction on a compromised OS exposes Keychain and Keystore data to extraction via Frida and similar tools. Jailbreak and root detection must be implemented before production. The architecture decision on the detection approach (library choice, detection response policy) must be documented and approved by QDB Security before implementation begins.

**MPROD-002 — Certificate pinning (MSEC-005 / MNFR-009)**
TLS MITM is possible on devices with a rogue CA installed. Certificate pinning must be implemented before production. The pinning strategy (full certificate vs. public key, rotation policy) must be documented in an ADR and approved by QDB Security. Pin rotation procedures must be included in the operational runbook.

**MPROD-003 — Android OAuth redirect URI scheme decision (MSEC-006 / MADR-006)**
The `msauth://` custom URI scheme on Android can be intercepted by any installed application. This is an architectural decision, not a simple fix. MADR-006 must be authored, reviewed, and signed off by QDB Security before the Android authentication flow is finalised. The decision document must evaluate the custom scheme approach against App Links (HTTPS-based verified redirect URIs) and document the accepted residual risk if the custom scheme is retained.

**MPROD-004 — Screenshot prevention (MSEC-010)**
PII is visible in the OS app switcher on both iOS and Android. `FLAG_SECURE` (Android) and screen content hiding on app background (iOS) must be implemented before production. This is a QCB customer data protection expectation and a PDPPL operational control.

**MPROD-005 — Camera EXIF/GPS stripping (MSEC-009)**
All camera-captured document uploads must have EXIF metadata stripped before transmission. GPS coordinates embedded in a bank customer's ID document photo constitute PII under PDPPL Article 11. This must be implemented and tested before production. The stripping must occur on-device before upload, not server-side after receipt.

**MPROD-006 — Resolve all inherited web production blockers**
The mobile channel shares the Dataverse backend, the authentication infrastructure, and the form rendering engine with the web channel. The six production release blockers from the web engagement are production blockers for the mobile channel as well. A mobile production approval cannot be issued while web production blockers remain open.

---

## 6. Dependency Chain

The remediation sequence is not flexible. Work must proceed in this order:

**Layer 1 — External gates (no code work unblocks these; QDB must respond)**
GATE-A (MUATC-002) and GATE-B (MUATC-003) are owned by QDB and are prerequisite to UAT environment provisioning. The BA must obtain written answers before any UAT environment is stood up. These run in parallel with all code remediation work.

**Layer 2 — Authentication foundation (all other testing depends on this)**
MUATC-001 (MSAL scope bug fix) must be the first code change executed. Until authentication works against a real backend, every other integration test produces meaningless results. MUATC-008 (MSAL library version upgrade) must be completed in the same sprint as MUATC-001 — do not fix the scope on a pre-release library.

**Layer 3 — Backend consistency fixes (coordinate with web engagement)**
MUATC-004 (qdb_channel derivation) and MUATC-006 (GET /api/forms access control) are backend changes that affect both channels. These must be coordinated with the web engagement team and landed as part of the web Sprint 1 blocker remediation, not as separate mobile-only patches. Fragmented fixes to shared infrastructure create new inconsistencies.

**Layer 4 — Mobile-specific code fixes (parallel after Layer 2)**
MUATC-005, MUATC-007, MUATC-008, MUATC-009, MUATC-010 can proceed in parallel once Layer 2 is complete. Assign these to mobile developers while Layer 3 backend work is in progress.

**Layer 5 — UAT**
UAT may commence only when all ten MUATC conditions are closed, GATE-A and GATE-B are resolved in writing, and the Dataverse UAT environment is provisioned in the correct geographic region.

**Layer 6 — Production gates**
MPROD-001 through MPROD-006 must be completed after UAT sign-off. MPROD-006 links back to the web engagement's production gate closure. The mobile production approval decision is a separate CEO decision that will be issued after UAT completes and production gate evidence is submitted.

---

## 7. Risk Acceptance Statement

**Risks I accept on behalf of Maqsad AI:**

I accept that the shared-engine architecture introduces a coupling between web and mobile release timelines. This is the correct trade-off. Divergent engines would produce divergent behaviour and divergent maintenance costs. The coupling is a feature, not a liability, provided the dependency chain in Section 6 is respected.

I accept the residual risk of the Android OAuth redirect URI scheme (MSEC-006) during UAT, provided MADR-006 is authored and QDB Security is notified of the risk in writing before UAT begins. UAT environments do not contain production customer data and the risk is bounded.

**Risks I do not accept and will not negotiate:**

I will not accept UAT or production deployment while GATE-B (PDPPL data residency) is unresolved. PII entered by bank customers during UAT is real data. Routing it to West Europe in violation of PDPPL is not a deferred risk — it is a regulatory violation on the first day of UAT. There is no exception to this position.

I will not accept a production deployment without jailbreak/root detection and certificate pinning. A banking application that can be instrumented by Frida on a rooted device, or that can be MITM'd on a device with a rogue CA, is not a banking application. These are non-negotiable production controls for any financial services app delivered by Maqsad AI regardless of client preference or timeline pressure.

I will not accept the confirmed authentication bug (MCODE-S-01) being characterised as a configuration gap or a minor issue. The app does not work. It has never been tested end-to-end. The team must not present this app to QDB in any context — demo, UAT, or otherwise — until MUATC-001 is resolved and a successful authenticated session against a real backend is demonstrated internally.

I will not accept progress on the mobile channel that outpaces the resolution of inherited web blockers. The web engagement's unresolved conditions are not legacy issues — they are active blockers for the mobile channel as well. Treating them as separate concerns would produce a mobile app sitting on a non-compliant, partially-remediated backend.

---

## 8. Sign-Off

**Decision:** APPROVED WITH CONDITIONS

**Issued by:** CEO, Maqsad AI
**Date:** 2026-05-25
**Engagement:** Dynamic Form Engine — Mobile Rendering Extension (QDB)
**Parent Engagement Status:** Dynamic Form Engine (web) — APPROVED WITH CONDITIONS, 10 web Sprint 1 blockers open

**Conditions count:**
- UAT blockers: 10 (MUATC-001 through MUATC-010)
- Production gates: 6 (MPROD-001 through MPROD-006)
- External gates requiring QDB response: 2 (GATE-A, GATE-B)

**Next decision point:** CEO Phase 7 production approval — to be issued after UAT sign-off and production gate evidence package is submitted.

This document is the authoritative CEO decision record for this engagement phase. No team member, project manager, or client stakeholder may authorise UAT or production activity in contradiction of the conditions stated above.
