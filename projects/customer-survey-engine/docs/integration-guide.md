# Customer Survey Engine — Integration Guide

**For:** QDB portal, backend and mobile teams  
**From:** MSS Technologies (CSE-ENG-001, FR-CSE-051 to 055)  
**Version:** 1.0, 2026-11-11 · verified against the cloud test org `org5869857f`

This guide explains how the QDB customer portal and mobile app show surveys to customers and send their answers back to CRM. CRM decides **who** gets a survey and **when**. Your apps decide **how it looks**. Everything between the two goes through four CRM APIs.

---

## 1. The big picture

```
 CRM (Dynamics)                                   QDB backend                     Portal / app
 ─────────────                                    ───────────                     ────────────
 A request completes ─► invitation created  ◄──── ListPendingSurveys ◄──────────  customer signs in
 (trigger rules,         (Pending, pinned         GetSurvey          ◄──────────  customer opens survey
  fatigue, priority)      form version)           SubmitResponse     ◄──────────  customer submits
                         response + answers ───►  (score if weighted)
```

- **One invitation = one survey for one customer.** It has an id, an expiry date, and a pinned form version, so the questions never change under the customer.
- **Portal delivery:** the invitation just waits. Your app asks for the customer's pending surveys, for example on sign-in, and shows them as a popup or a notification item. CRM sends no push for these.
- **Secure-link delivery:** CRM sends the customer an SMS and an email with a link to a page in your portal. The link carries a one-time token instead of a sign-in. **This channel is switched off in every org until its security review is signed off** (NFR-CSE-009). Build it, but expect `survey_forbidden` until then.

**Never call the CRM APIs from the browser or the mobile app.** Your backend calls them with its own service identity (section 2), after it has authenticated the customer itself.

---

## 2. Authentication and permissions

| | Cloud org | On-prem CRM 9.1 (HL, BFD/QDB1) |
|---|---|---|
| Who calls | Your backend, as a CRM **application user** (OAuth client credentials, Azure AD app registration) | Your backend, as an **AD service account** that is a CRM user |
| Endpoint | `https://<org>.crm4.dynamics.com/api/data/v9.2/<api>` | `https://<crm-host>/<org>/api/data/v9.0/<api>` (Windows/IFD authentication) |
| CRM role needed | **Survey Integration** | **Survey Integration** |

- The **Survey Integration** role grants exactly what the APIs need, and nothing about other customers' data beyond that. A caller without it gets HTTP **403** from CRM itself, before any survey code runs.
- **The customer is identified by your backend, not by CRM.** You pass the authenticated customer's CRM account id as `CallerCustomerId`. The API refuses an invitation that belongs to anyone else (`survey_forbidden`). Never take this id from the browser or the app without checking it against your own session.

---

## 3. The four APIs

All four are **unbound actions**: `POST` a JSON body to `/api/data/v9.x/<name>`. Every input is a **string**. GUIDs are plain strings without braces. Headers: `Content-Type: application/json`, `OData-MaxVersion: 4.0`, `OData-Version: 4.0`, `Accept: application/json`.

### 3.1 `qdb_srv_ListPendingSurveys` — what surveys does this customer have?

Use it on sign-in, or when the notification area opens.

**Request**
```json
{ "CustomerId": "672a604a-0ddd-f111-84e8-70a8a55bc6a5", "Language": "en" }
```
`Language` is optional: `en` or `ar`. If it's empty, the org's default language is used.

**Response** (real output from the test org)
```json
{
  "SurveysJson": "[{\"invitationId\":\"2a884449-0ddd-f111-84e8-000d3abcf32d\", ... }]"
}
```
`SurveysJson` is a JSON array as a string. Parse it:
```json
[
  {
    "invitationId": "2a884449-0ddd-f111-84e8-000d3abcf32d",
    "setupId": "dd69711d-0ddd-f111-84e8-70a8a55bc6a5",
    "formCode": "srv-customer-feedback-demo",
    "title": "How did we do?",
    "message": "Please take two minutes to rate your recent experience with QDB.",
    "pinnedVersion": 1,
    "language": "en",
    "expiresOn": "2026-11-24T13:47:42.0000000Z",
    "channel": "Portal"
  }
]
```
- Only **open** invitations are listed: Pending and not expired. Submitted, expired and never-sent ones are left out.
- `title` and `message` come in the requested language. If that wording is empty in CRM, the other language is used.
- An empty array means no surveys. That isn't an error.

### 3.2 `qdb_srv_GetSurvey` — the survey to show

**Request**, signed-in customer:
```json
{ "InvitationId": "2a884449-0ddd-f111-84e8-000d3abcf32d", "CallerCustomerId": "672a604a-0ddd-f111-84e8-70a8a55bc6a5", "Language": "ar" }
```
**Request**, secure link (no sign-in):
```json
{ "Token": "<token from the link>", "Language": "ar" }
```

**Response**
```json
{ "FormCode": "srv-customer-feedback-demo", "Version": 1, "RenderedLanguage": "en", "RuntimeJson": "{\"tabs\":[...]}" }
```
- `RuntimeJson` is the published survey (section 4), as a string. Parse it.
- It's always the invitation's **pinned** version, even if the survey was edited and republished since.
- `RenderedLanguage` tells you which language you actually got. If the requested language wasn't published for that version, you get the invitation's own language. Show the survey in `RenderedLanguage`.

### 3.3 `qdb_srv_SubmitResponse` — send the answers

**Request**
```json
{
  "InvitationId": "2a884449-0ddd-f111-84e8-000d3abcf32d",
  "CallerCustomerId": "672a604a-0ddd-f111-84e8-70a8a55bc6a5",
  "AnswersJson": "[{\"questionCode\":\"srv_demo_overall\",\"value\":\"5\"},{\"questionCode\":\"srv_demo_well\",\"value\":\"Quick approval\"}]"
}
```
(or `Token` instead of `InvitationId` + `CallerCustomerId`)

**Response**
```json
{ "ResponseId": "a78f293d-d5dd-f111-84ea-000d3abd8313", "Status": "submitted" }
```

**`AnswersJson`** is a JSON array **as a string**: one item per answered question.

| Field | Meaning |
|---|---|
| `questionCode` | The field's `schemaName` from `RuntimeJson`. |
| `value` | **Always a string.** For choice, radio and star-rating questions: the option's `value`, not its label (`"5"`, `"y"`). For several choices: values joined by commas (`"1,3"`). For text: the text. For numbers: invariant format (`"12.5"`). |

- Leave out unanswered questions; don't send empty strings.
- An answer to a code that isn't in the pinned form is refused (`survey_bad_request`), and nothing is saved.
- Required-question checks belong in your UI, using `isRequired` in `RuntimeJson`.
- On success CRM stores one response, one answer row per question (with labels), and your `AnswersJson` exactly as sent. It closes the invitation in the same transaction, so a refusal saves nothing.
- **Weighted surveys** (Addendum A): CRM also stores the score, maximum and percentage on the response. You don't send or compute anything extra.
- Submitting twice gives `survey_already_submitted`. Treat that as "already done", not as a failure to show the customer.

### 3.4 `qdb_srv_ValidateLinkToken` — check a secure link before showing it

**Request**
```json
{ "Token": "<token from the link>" }
```
**Response**
```json
{ "Valid": true, "Reason": "", "InvitationId": "…", "SetupId": "…", "FormCode": "srv-…", "Language": "en" }
```
or, when the link can't be used:
```json
{ "Valid": false, "Reason": "used" }      // or "expired" or "unknown"
```
Use it to choose the page: show the survey, or "this survey has already been answered", "this link has expired", or "this link is not valid". If the whole channel is still disabled, the call fails with `survey_forbidden`.

---

## 4. The survey content (`RuntimeJson`)

The survey is a Form Engine form. The parts you need:

```json
{
  "formCode": "srv-customer-feedback-demo",
  "title": "Customer feedback (demo survey)",
  "tabs": [                                    // pages, in displayOrder
    {
      "label": "Your experience", "displayOrder": 1, "isVisible": true,
      "sections": [                            // groups, in displayOrder
        {
          "label": "How did we do?", "displayOrder": 1,
          "fields": [                          // questions, in displayOrder
            {
              "schemaName": "srv_demo_overall",          // → questionCode
              "label": "Overall, how satisfied are you with QDB?",
              "fieldType": "radio",
              "radioRenderStyle": "rating",              // list | cards | rating (stars)
              "isRequired": true,
              "isVisible": true, "isHidden": false,
              "options": [ { "value": "1", "label": "Very poor" }, { "value": "2", "label": "Poor" } ]
            }
          ]
        }
      ]
    }
  ]
}
```

| `fieldType` | Show as | Answer `value` |
|---|---|---|
| `radio` | Radio list; cards if `radioRenderStyle` = `cards`; **stars** if `rating` (option 1 = one star) | option `value` |
| `dropdown` | Dropdown; stars if `radioRenderStyle` = `rating` | option `value` |
| `multi_select` | Checkboxes | option values, comma-separated |
| `text`, `textarea` | Text box / multi-line | the text |
| `number`, `decimal`, `currency` | Number box | the number as text |
| `date` | Date picker | `yyyy-MM-dd` |
| `label`, `info-card` | Static text only | no answer |

- Show only fields with `isVisible: true` and `isHidden: false`. Labels arrive already translated to `RenderedLanguage`.
- Some surveys also carry `businessRules`, which show or hide questions depending on other answers. The Form Engine renderer applies them for you (section 5). A native app that ignores them simply shows all visible questions.
- Weighted surveys carry `scoringMode`, `scoreWeight` and `scorePoints`. You can ignore these; CRM scores on submit.

---

## 5. Rendering options

| Option | Who | How |
|---|---|---|
| **A. Reuse the Form Engine renderer (recommended for the web portal)** | Portal team (React) | Use `DynamicFormRenderer` from the Form Engine frontend. Give it a `formApi` adapter whose `getMetadata` returns your backend's `GetSurvey` result and whose `submit` posts `buildSurveyAnswers(form, values)` to your backend's `SubmitResponse`. That's exactly what the in-CRM page does: see `dynamic-form-engine/frontend/webresource/xrm/surveyApi.ts` and `src/engine/surveySubmission.ts`. Stars, cards, Arabic/RTL, validation and business rules come for free. Render it with `isSingleSubmission` so the confirmation screen offers no "Submit another". |
| **B. Native mobile screens** | Mobile team | Render from `RuntimeJson` with the table in section 4, then build `AnswersJson` by the rules in 3.3. |
| **C. Inside CRM** (staff testing, demos) | — | `…/main.aspx?pagetype=webresource&webresourceName=qdb_form_runtime.html&data=<url-encoded "invitationId=<id>&customerId=<id>">` |

---

## 6. Errors

A refusal comes back as **HTTP 400**. The message **starts with a code**, then a readable reason:

```json
{ "error": { "code": "0x80040265", "message": "survey_forbidden: This survey invitation belongs to another customer." } }
```
(real output)

| Code | Meaning | What your app should do |
|---|---|---|
| `survey_bad_request` | Missing or malformed input: not a GUID, AnswersJson not valid, unknown question code | Fix the request; this is a bug on the calling side |
| `survey_forbidden` | The invitation belongs to another customer, or secure links are disabled | Don't show the survey; log it |
| `survey_not_found` | No such invitation, or one that was never sent; unknown link; pinned version missing | "This survey is not available" |
| `survey_expired` | The invitation's expiry date has passed | "This survey has closed" |
| `survey_already_submitted` | Already answered | "Thank you, you have already answered this survey" |

HTTP **403** with a CRM privilege message means the calling account lacks the **Survey Integration** role. HTTP **401** means your token or credentials are wrong. Both are deployment problems, not customer problems.

---

## 7. Security checklist for your teams

- [ ] The customer id passed to CRM comes from **your** authenticated session, never from the client.
- [ ] CRM credentials and tokens live only on your backend.
- [ ] Secure-link tokens are **never logged**: not in web server logs, analytics or error reports. Put the token in the page fragment or strip it from logs.
- [ ] Rate-limit `ValidateLinkToken` and token-based `GetSurvey` per client IP (part of the NFR-CSE-009 security review).
- [ ] Use HTTPS end to end.

---

## 8. Trying it on the cloud test org

The cloud org `org5869857f` has open test data your teams can use with a Survey Integration test user (ask MSS):

| What | Value |
|---|---|
| Demo survey (normal) | `srv-customer-feedback-demo`: 2 pages, 6 questions, 2 star ratings |
| Demo survey (weighted) | `srv-weighted-demo` |
| Open demo invitation | customer `672a604a-0ddd-f111-84e8-70a8a55bc6a5`, invitation `2a884449-0ddd-f111-84e8-000d3abcf32d` |

Ask MSS for more test invitations; each one can be submitted once.
