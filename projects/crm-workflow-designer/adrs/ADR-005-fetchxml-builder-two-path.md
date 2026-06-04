# ADR-005 — FetchXML Builder: Two-Path Design with iframe Primary and react-querybuilder Fallback
**Project:** CWFD-001 — CRM Visual Workflow Designer
**Status:** Accepted
**Date:** 2026-06-01
**Decided by:** Architect — Maqsad AI

---

## Context

FR-12 requires a visual FetchXML condition builder for conditional routes
(`qdb_outcomeworktasks.qdb_filter`). The BRD identifies the CRM Advanced Filter Page
as the primary mechanism:

```
{CRMServerURL}/SFA/goal/ParticipatingQueryCondition.aspx?entitytypecode={ObjectTypeCode}&readonlymode=false
```

CEO Conditions COND-03 and SR-01 require:
1. This page is the Primary Path, with its availability risk documented.
2. A complete fallback (not an afterthought) must be designed.
3. An ADR must document the postMessage contract and detection logic.

The CRM Advanced Filter Page (`/SFA/goal/ParticipatingQueryCondition.aspx`) is an
internal, undocumented CRM page. Key risks:
- Its URL path may differ between CRM Online releases and On-Prem 9.x minor versions.
- Its postMessage contract is not part of any public SDK. The mechanism was confirmed
  via community research on Dynamics CRM developer forums and must be treated as
  best-effort.
- The page may be unavailable if the CRM session has expired, the entity code is
  invalid, or the iframe sandbox policy blocks it.

---

## Decision

Implement a two-path FetchXML builder with automatic detection and switching.

---

### Path A — Primary: CRM Advanced Filter Page (iframe)

The filter page is loaded inside a Fluent UI `<Dialog>` as a sandboxed `<iframe>`:

```typescript
const frameSrc =
  `${clientUrl}/SFA/goal/ParticipatingQueryCondition.aspx` +
  `?entitytypecode=${objectTypeCode}&readonlymode=false`;
```

**Iframe sandbox attributes:**
```html
<iframe
  src={frameSrc}
  sandbox="allow-same-origin allow-scripts allow-forms"
  style={{ width: '100%', height: '500px', border: 'none' }}
/>
```

`allow-same-origin` is required for the CRM page to access its own cookies/session.
`allow-scripts` is required for the page to function. `allow-forms` is required for
the page's internal form submission. `allow-popups` and `allow-top-navigation` are
intentionally omitted for security.

**postMessage contract:**

After the user completes the filter configuration and clicks "OK" within the CRM page,
the page posts a message to the parent frame. The observed contract across CRM Online
versions 9.1+ and On-Prem 9.x is:

Outbound (CRM page → designer):
```javascript
// CRM posts to window.parent
window.parent.postMessage(
  { fetchXml: '<fetch>...</fetch>', entityTypeCode: 12345 },
  targetOrigin  // same as clientUrl
);
```

Inbound (designer → CRM page, to pre-populate existing FetchXML):
```javascript
// Designer posts to iframe.contentWindow after load
iframeElement.contentWindow.postMessage(
  { fetchXml: existingFetchXml },
  clientUrl
);
```

**Message reception in the designer:**
```typescript
function handleFilterPageMessage(event: MessageEvent): void {
  // SECURITY: validate origin against clientUrl before processing
  const expectedOrigin = new URL(environmentService.getClientUrl()).origin;
  if (event.origin !== expectedOrigin) return;

  const payload = event.data as { fetchXml?: string };
  if (!payload?.fetchXml) return;

  const validated = validateFetchXml(payload.fetchXml);
  if (!validated.isValid) {
    notifyUser('FetchXML received from filter page is malformed', 'warning');
    return;
  }
  onFetchXmlConfirmed(validated.fetchXml);
}
```

The `window.addEventListener('message', handleFilterPageMessage)` listener is
registered when the dialog opens and removed when it closes.

**Pre-population:**
```typescript
function prePopulateExistingFilter(
  iframe: HTMLIFrameElement,
  existingFetchXml: string
): void {
  iframe.addEventListener('load', () => {
    const targetOrigin = new URL(environmentService.getClientUrl()).origin;
    iframe.contentWindow?.postMessage({ fetchXml: existingFetchXml }, targetOrigin);
  }, { once: true });
}
```

**Availability detection:**
The filter page URL is tested silently with a hidden iframe before opening the dialog:

```typescript
async function isFilterPageAvailable(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const probe = document.createElement('iframe');
    probe.style.display = 'none';
    probe.src = url;

    const timeout = setTimeout(() => {
      document.body.removeChild(probe);
      resolve(false);
    }, 3000);

    probe.addEventListener('load', () => {
      clearTimeout(timeout);
      document.body.removeChild(probe);
      resolve(true);
    });

    probe.addEventListener('error', () => {
      clearTimeout(timeout);
      document.body.removeChild(probe);
      resolve(false);
    });

    document.body.appendChild(probe);
  });
}
```

If the probe resolves `false`, Path B is activated automatically.
The result is cached per session (the environment does not change mid-session).

---

### Path B — Fallback: react-querybuilder + Custom FetchXML Formatter

When Path A is unavailable, the dialog renders a `react-querybuilder` (v8.x) component
with entity attributes loaded from `getAttributesByEntity()`.

**Custom FetchXML formatter** (`src/utils/fetchXmlFormatter.ts`):
```typescript
import { formatQuery, RuleGroupType } from 'react-querybuilder';

export function formatAsFetchXml(
  query: RuleGroupType,
  entityLogicalName: string
): string {
  return formatQuery(query, {
    format: 'custom',
    ruleProcessor: fetchXmlRuleProcessor,
    valueProcessor: fetchXmlValueProcessor,
  });
}
```

The `fetchXmlRuleProcessor` maps react-querybuilder operators to FetchXML condition
operators:
- `=` → `<condition attribute="{field}" operator="eq" value="{val}"/>`
- `contains` → `<condition attribute="{field}" operator="like" value="%{val}%"/>`
- `beginsWith` → `<condition attribute="{field}" operator="like" value="{val}%"/>`
- `in` → `<condition attribute="{field}" operator="in"><value>{v}</value>...</condition>`
- `between` → `<condition attribute="{field}" operator="between"><value>{v1}</value><value>{v2}</value></condition>`
- `null` → `<condition attribute="{field}" operator="null"/>`
- `notNull` → `<condition attribute="{field}" operator="not-null"/>`

Output is wrapped in:
```xml
<fetch>
  <entity name="{entityLogicalName}">
    <filter type="{and|or}">
      {conditions}
    </filter>
  </entity>
</fetch>
```

The output is validated by `validateFetchXml()` (DOMParser-based XML well-formedness
check) before being stored on the route.

---

### Switching Logic

```typescript
async function openFetchXmlBuilder(params: FetchXmlBuilderParams): Promise<void> {
  const probeUrl =
    `${params.clientUrl}/SFA/goal/ParticipatingQueryCondition.aspx` +
    `?entitytypecode=${params.objectTypeCode}&readonlymode=false`;

  const pathAAvailable = await isFilterPageAvailable(probeUrl);

  if (pathAAvailable) {
    openIframeBuilder(probeUrl, params);
  } else {
    openQueryBuilder(params);
  }
}
```

The user is never asked to choose — the switch is automatic and silent. A non-blocking
info banner appears when Path B is active: "Advanced Filter is unavailable in this
environment. Using built-in condition builder."

---

## Security Constraints

- postMessage origin validation is mandatory and non-optional. Any message from an
  unrecognised origin is silently dropped (see `handleFilterPageMessage` above).
- FetchXML output from both paths is validated as well-formed XML via `DOMParser`
  before storage (NFR-04e, C-CEO-05, non-negotiable per CEO review).
- The `<iframe>` sandbox attribute list is the minimum required. `allow-top-navigation`
  and `allow-popups` are explicitly excluded.
- GUID values interpolated into the `entitytypecode` query parameter are validated
  as numeric integers before use (object type codes are integers, not GUIDs, but
  the same assertSafeParam convention applies).

---

## Consequences

**Positive:**
- COND-03 is fully resolved: Primary Path is designed with explicit risk documentation;
  Fallback Path is a complete implementation, not a stub.
- Users in environments where the CRM filter page works get the full native CRM
  query builder experience.
- Users in restricted environments (On-Prem sandbox, custom headers blocking iframe
  load) get a fully functional built-in query builder.
- Both paths produce the same output format (FetchXML stored in `qdb_filter`).
  The route record is agnostic to which path produced it.

**Negative / Risks:**
- The postMessage contract for Path A is undocumented by Microsoft. If CRM changes
  this contract in a future release, Path A silently fails (no message is received
  within a timeout) and the designer must degrade to Path B. A configurable 5-second
  message timeout with automatic fallback handles this gracefully.
- Path B FetchXML output must be validated against real Dataverse OData queries
  during QA. The custom `ruleProcessor` covers the most common operators but may
  not cover every CRM-specific operator (e.g., `above`, `under`, `eq-userid`).
  Out-of-scope operators fall back to raw FetchXML text entry with XML validation.
- The probe iframe approach adds up to 3 seconds to the first "Add Condition" click
  when Path A is unavailable. This is cached after the first detection. The 3-second
  timeout aligns with NFR-01a (initial load <= 3 seconds) as an acceptable UX cost
  on the first condition build only.
