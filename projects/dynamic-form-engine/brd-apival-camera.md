═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-APIVAL-CAM-001 — API validation rule type + camera-only file fields
Prepared by:    MSS Technologies — Orchestrator (BA phase)
Date:           2026-10-01
Version:        1.0
Status:         DRAFT — Pending CEO Approval
Requested by:   Client developer (two requests, answers received 2026-10-01)
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
───────────────────────────────────────────────────
Two small capabilities. (A) A validation rule type that calls no API itself: it tells the
front end to run an external check, such as IBAN validation, and passes a key saying which
check. (B) A file field setting that opens the phone camera instead of the file picker on
mobile browsers. Both are sized S. Together they need one new choice option and one new
column on existing tables.


2. DEVELOPER ANSWERS THIS BRD IS BUILT ON
───────────────────────────────────────────────────
| Question | Answer (2026-10-01) | Consequence |
|---|---|---|
| Where does the API check run; must the server repeat it? | The rule only gives a trigger flag; the front end calls the IBAN API. | The engine calls nothing. No server re-check (see RISK-1). |
| API unavailable: block or allow submit? | The front end handles it. | The engine waits for the front end's answer and applies it. |
| Camera-only on desktop? | Only for mobile. | Desktop keeps the normal file picker. |
| Entry Grid file columns? | Not needed for now. | Out of scope. |


3. SCOPE
───────────────────────────────────────────────────
In scope: form fields in the portal runtime and the in-CRM runtime; the designer; both
publishers (Node backend, C# plugin); cloud schema; the on-prem manual schema step.

Out of scope: any server-side re-check of API rules; Entry Grid file columns; restricting
desktop browsers; choosing front versus rear camera; the React Native mobile app (it has no
file upload code yet); a built-in IBAN checksum rule (offered, not requested).


4. FUNCTIONAL REQUIREMENTS
───────────────────────────────────────────────────

Group A — API validation rule type

FR-A1: The designer's validation rule list shall offer "API Validation" with one required
       input, "Validation key" (free text, e.g. IBAN).
FR-A2: The rule shall be stored on qdb_form_validation_rule with qdb_rule_type = 100000014
       and the key in qdb_rule_json as {"schemaVersion":2,"type":"api_validation","key":"IBAN"}.
       qdb_error_message stays the fallback message. No new column.
FR-A3: Both publishers shall publish it as ruleType "apiValidation" with validationKey.
FR-A4: The runtime shall call no API. It shall hand the field's value, the key and the form's
       values to a handler the front end registers for that key, and show the handler's
       message when it reports the value invalid.
FR-A5: The check shall run when the user leaves the field and again before submit; submit
       waits for the answer. While it runs, the field shows a "checking" state.
FR-A6: An empty field is not sent for checking; "Required" stays a separate rule.
FR-A7: When no handler is registered for the key, the rule passes and a warning is logged
       with the form, field and key.

Group B — Camera-only file fields

FR-B1: qdb_form_field shall gain a choice column "File Capture Mode"
       (qdb_file_capture_mode): Any (100000000, default) and Camera only (100000001).
FR-B2: Both publishers shall publish fileUploadConfig.captureMode = "any" | "camera";
       an empty column publishes as "any", so every existing field is unchanged.
FR-B3: With "camera", the upload control's file input shall carry capture="environment" and
       accept only the image types the field already allows. On a phone the camera opens
       directly; desktop browsers ignore capture and show the normal picker.
FR-B4: The designer's file field panel shall offer the setting, and warn when Camera only is
       chosen but the field allows no image type (it could then accept nothing).


5. DATA MODEL IMPACT
───────────────────────────────────────────────────
| Table | Change | Cloud | On-prem |
|---|---|---|---|
| qdb_form_validation_rule | New option 100000014 "API Validation" on qdb_rule_type | Script, with CEO go-ahead | By hand, exact value |
| qdb_form_field | New choice column qdb_file_capture_mode (Any, Camera only) | Script, with CEO go-ahead | By hand, exact values |

Value 100000013 on qdb_rule_type is skipped on purpose; see section 9.


6. ACCEPTANCE CRITERIA
───────────────────────────────────────────────────
AC-1: An IBAN field with an API Validation rule, key IBAN, calls the registered handler once
      on leaving the field and once on submit, and shows its message when invalid.
AC-2: Submit is held until the handler answers, and blocked when it reports invalid.
AC-3: With no handler registered, the form submits and one warning is logged.
AC-4: A Camera only field opens the rear camera on Android Chrome and iOS Safari, and the
      normal file picker on desktop Chrome and Edge.
AC-5: Existing validation rules and file fields publish byte-identical JSON.
AC-6: Each new value is mapped in both publishers, with a test on each side.


7. RISKS
───────────────────────────────────────────────────
RISK-1 (accepted by the developer): the backend does not re-run any validation on submit, so
  an API rule can be bypassed by a modified client. This is true of every rule today.
RISK-2: capture support inside the Dynamics 365 mobile app's embedded browser is unverified;
  test before promising it there.
RISK-3: on iOS, camera photos may arrive as HEIC unless the input asks for image types; the
  allowed-types list must include the type the device sends. The portal backend's upload
  allowlist has no HEIC or WebP. Confirm on a real iPhone.
RISK-4 (security review, 2026-10-01; CEO decision needed): photos can carry GPS location in
  their EXIF metadata, and nothing strips it before the file is stored as a CRM note. This
  predates camera mode (any image upload is affected) but camera mode makes photos the norm.
  Location is personal data under PDPPL. Stripping needs server-side image processing in the
  portal and client-side re-encoding in the in-CRM runtime, which uploads directly; both are
  outside this BRD.
RISK-5 (security review): handlers receive every form value. Mitigated by documentation
  (DEVELOPER-GUIDE-api-validation.md, "Rules for handlers"); not enforced in code.


8. OPEN QUESTIONS
───────────────────────────────────────────────────
OQ-1: If the front end's handler fails with an error instead of answering, should the field
      pass or fail? Recommended: fail with the rule's own error message, so a broken
      integration is visible rather than silent.
OQ-2: Should the validation key be free text, or a fixed list? Recommended: free text, since
      the front end owns the list of checks.


9. EXISTING DEFECT FOUND DURING ANALYSIS (not part of this scope)
───────────────────────────────────────────────────
The designer saves "Conditional Required" rules as qdb_rule_type = 100000013, but the cloud
org's choice stops at 100000012, and neither publisher maps 100000013. Such a rule likely
fails to save, or would publish as a plain "required". Recommended: a separate bug-fix.


10. SIZING
───────────────────────────────────────────────────
| Item | Size | Layers |
|---|---|---|
| A — API validation rule | S | shared types, runtime, designer, both publishers, 1 option |
| B — Camera-only file field | S | shared types, upload control, designer, both publishers, 1 column |


11. APPROVAL
───────────────────────────────────────────────────
| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | User | **APPROVED** with OQ-1 (handler error → fail with the rule's message) and OQ-2 (free-text key) | 2026-10-01 |
