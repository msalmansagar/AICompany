# Developer guide — API validation rules and camera-only file fields

Engagement DFE-APIVAL-CAM-001. Requirements: `brd-apival-camera.md`.

## 1. API validation rules

An **API Validation** rule asks the front end to check a field's value with an external API,
for example an IBAN service. The form engine calls no API itself. It hands the value to a
handler that your front end registers for the rule's **validation key**.

One handler per key covers every form that uses that key. A new API tomorrow needs only a new
key in the designer and a new handler; the form engine, plugin and CRM schema do not change.

### Configure the rule (designer)

1. Select the field, open **Validation Rules**, choose **Add Rule**.
2. Rule Type: **API Validation**.
3. Validation key: the name your handler is registered under, for example `IBAN`.
4. Error message: shown when your handler reports the value invalid without its own message,
   and when your handler fails with an error.

### The handler contract

```ts
interface ApiValidationRequest {
  key: string;              // the rule's validation key, e.g. "IBAN"
  value: unknown;           // the field's current value (never empty: empty values are not sent)
  fieldSchemaName: string;  // the field being checked
  formCode: string;         // the form being filled in
  values: Record<string, unknown>; // every field's current value, for multi-field checks
}

interface ApiValidationResult {
  isValid: boolean;
  message?: string;         // shown when isValid is false; omit to use the rule's message
}

type ApiValidator = (request: ApiValidationRequest) => Promise<ApiValidationResult>;
```

### When the handler runs

| Moment | What happens |
|---|---|
| The user changes the field, then focus leaves it | Your handler runs; the field shows "Checking…" until it answers |
| The user submits | Every visible API-validated field is checked again; submit waits for all answers |
| The value is empty | Nothing is sent; use a separate **Required** rule if the field is mandatory |
| An answer arrives for a value the user has since changed | It is ignored |
| No handler is registered for the key | The rule passes; a warning `api_validator_missing` is logged |
| Your handler throws or rejects | The field fails with the rule's own error message (`api_validator_failed` is logged) |
| Your handler has not answered after 15 seconds | Treated as a failure: the field shows the rule's own message, so the form never hangs |
| A rule hides the field | It is not checked, and any earlier result is not shown while it is hidden |
| Your API is down | Your handler decides: resolve `isValid: true` to let the user continue, or `isValid: false` with a message to block |

Answer well within 15 seconds; set your own shorter timeout on the API call and decide there
what an unavailable API means for the user.

### Rules for handlers (privacy)

- **Send the API only what it needs.** `values` holds every field on the form, including
  personal and financial data, so a multi-field check can read what it needs. An IBAN check
  needs only `value`. Never post the whole request or `values` to an external service.
- **Keep values out of thrown errors.** A thrown error's message is logged (first 200
  characters). Throw `new Error('IBAN service timed out')`, not a message containing the IBAN.
- **Register once, at start-up.** Registering a second handler for the same key replaces the
  first and logs `api_validator_replaced`. Treat that warning as a sign that another script on
  the page is interfering.

### Register a handler — portal

```ts
import { apiValidatorRegistry } from './engine/apiValidators';

apiValidatorRegistry.register('IBAN', checkIban);
```

Or, from any script on the page, without importing the bundle:

```js
window.DynamicFormEngine.registerApiValidator('IBAN', checkIban);
```

`register` returns a function that unregisters the handler.

### Register a handler — inside CRM

The in-CRM form runs in a web resource frame. From the hosting CRM form's OnLoad script, reach
that frame's window and register there:

```js
function onLoad(executionContext) {
  const formContext = executionContext.getFormContext();
  formContext.getControl('WebResource_dynamic_form').getContentWindow().then((frameWindow) => {
    frameWindow.DynamicFormEngine.registerApiValidator('IBAN', checkIban);
  });
}
```

Replace `WebResource_dynamic_form` with your web resource control's name. Registering after the
form has loaded is fine: checks only run when a user leaves a changed field or submits.

When the form is opened on its own (`main.aspx?pagetype=webresource…`) there is no hosting CRM
form, so there is no OnLoad script to register from. Use a hosting form for API validation.

### Sample IBAN handler

The format and checksum of an IBAN can be checked instantly, without a network call. Call your
API only when that passes.

```js
async function checkIban({ value }) {
  const iban = String(value).replace(/\s+/g, '').toUpperCase();
  if (!hasValidIbanChecksum(iban)) {
    return { isValid: false, message: 'This IBAN is not valid. Check the number and try again.' };
  }
  try {
    const response = await fetch('https://<your-iban-api>/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iban }),
    });
    if (!response.ok) return { isValid: true }; // your choice when the API is unavailable
    const result = await response.json();
    return result.valid ? { isValid: true } : { isValid: false, message: result.reason };
  } catch {
    return { isValid: true }; // your choice when the API cannot be reached
  }
}

// ISO 13616: move the first four characters to the end, letters to numbers, mod 97 must be 1.
function hasValidIbanChecksum(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
```

### What this does not do

- **No server re-check.** The backend does not repeat any validation on submit, so a modified
  browser can skip this check. This was accepted for this release.
- **No auto-fill.** A handler answers valid or invalid. Filling other fields from the API's
  response (for example a bank name) is not supported.

## 2. Camera-only file fields

In the designer, select a file field and set **File Capture Mode** to **Camera only**.

| Device | What the user gets |
|---|---|
| Android (Chrome) and iPhone (Safari) | The rear camera opens directly |
| Desktop browsers | The normal file picker, limited to image types |

- The field must allow at least one image type. If it allows none (for example PDF only),
  the camera is not offered and the field keeps its own types.
- Inside the Dynamics 365 mobile app, test on a real device before relying on it.
- Entry Grid file columns are not covered.

## 3. Schema

| Table | Change | Values |
|---|---|---|
| Form Validation Rule (`qdb_form_validation_rule`) | New option on Rule Type (`qdb_rule_type`) | `100000014` API Validation |
| Form Field (`qdb_form_field`) | New choice column File Capture Mode (`qdb_file_capture_mode`) | `100000000` Any, `100000001` Camera only |

Cloud: `scripts/provision-apival-camera-schema.mjs`. On-prem: add both by hand with exactly these
values, then Publish All, before installing the new plugin.
