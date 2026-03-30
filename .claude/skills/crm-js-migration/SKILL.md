---
name: crm-js-migration
description: >
  Skill for migrating Dynamics CRM on-premise JavaScript web
  resources to Dynamics 365 Cloud and Power Platform UCI
  compatibility. Covers deprecated API replacement, execution
  context patterns, Xrm.WebApi migration, DOM manipulation
  removal, and ES6+ modernization. Load this skill whenever
  working on any CRM JavaScript migration, refactoring, or
  Cloud compatibility task.
triggers:
  - "migrate JS"
  - "refactor web resource"
  - "Xrm.Page"
  - "on-premise to cloud"
  - "UCI compatible"
  - "Power Platform migration"
  - "CRM JavaScript cloud"
  - "deprecated API"
  - "executionContext"
  - "Xrm.WebApi"
agents:
  - crm-developer
---

# CRM JavaScript Migration Skill

## Purpose
This skill equips the crm-developer agent with complete knowledge
to migrate Dynamics CRM on-premise JavaScript to Dynamics 365
Cloud / Power Platform UCI compatibility. Use this skill for
every JS migration, refactoring, or Cloud compatibility task.

## When to load this skill
Load automatically when any of these conditions are true:
- User provides a JS file containing Xrm.Page references
- User asks about Cloud or UCI compatibility of CRM scripts
- User asks to refactor or migrate CRM web resources
- User mentions deprecated CRM client APIs
- Any JS file fails in Cloud that worked on-premise

---

## Part 1 — Deprecated API replacement map

### 1.1 Xrm.Page complete removal map

Every Xrm.Page reference is broken in Cloud UCI.
Replace every instance using this exact map:

| On-premise (broken in Cloud)               | Cloud replacement                                                     |
|--------------------------------------------|-----------------------------------------------------------------------|
| Xrm.Page.getAttribute(x)                  | formContext.getAttribute(x)                                           |
| Xrm.Page.getControl(x)                    | formContext.getControl(x)                                             |
| Xrm.Page.data.entity.getId()              | formContext.data.entity.getId()                                       |
| Xrm.Page.data.entity.getEntityName()      | formContext.data.entity.getEntityName()                               |
| Xrm.Page.data.entity.getEntityReference() | formContext.data.entity.getEntityReference()                          |
| Xrm.Page.data.save()                      | formContext.data.save()                                               |
| Xrm.Page.data.refresh()                   | formContext.data.refresh()                                            |
| Xrm.Page.ui.close()                       | formContext.ui.close()                                                |
| Xrm.Page.ui.tabs.get(x)                   | formContext.ui.tabs.get(x)                                            |
| Xrm.Page.ui.sections.get(x)               | formContext.ui.sections.get(x)                                        |
| Xrm.Page.ui.controls.get()                | formContext.ui.controls.get()                                         |
| Xrm.Page.ui.setFormNotification()         | formContext.ui.setFormNotification()                                  |
| Xrm.Page.ui.clearFormNotification()       | formContext.ui.clearFormNotification()                                |
| Xrm.Page.ui.refreshRibbon()               | formContext.ui.refreshRibbon()                                        |
| Xrm.Page.context.getClientUrl()           | Xrm.Utility.getGlobalContext().getClientUrl()                         |
| Xrm.Page.context.getUserId()              | Xrm.Utility.getGlobalContext().getUserId()                            |
| Xrm.Page.context.getUserName()            | Xrm.Utility.getGlobalContext().getUserName()                          |
| Xrm.Page.context.getUserRoles()           | Xrm.Utility.getGlobalContext().getUserRoles()                         |
| Xrm.Page.context.getOrgName()             | Xrm.Utility.getGlobalContext().getOrganizationSettings().uniqueName   |
| Xrm.Page.context.getOrgLcid()             | Xrm.Utility.getGlobalContext().getOrganizationSettings().languageId   |
| window.parent.Xrm                         | Xrm                                                                   |
| parent.Xrm                                | Xrm                                                                   |

### 1.2 Deprecated Xrm.Utility replacement map

| Deprecated (on-premise)                        | Cloud replacement                                                         |
|------------------------------------------------|---------------------------------------------------------------------------|
| Xrm.Utility.openEntityForm(name, id, params)   | Xrm.Navigation.openForm({entityName, entityId}, params)                   |
| Xrm.Utility.openWebResource(name, opts, data)  | Xrm.Navigation.openWebResource(name, opts, data)                          |
| Xrm.Utility.openUrl(url, options)              | Xrm.Navigation.openUrl(url, options)                                      |
| Xrm.Utility.alertDialog(msg, callback)         | Xrm.Navigation.openAlertDialog({text: msg}).then(callback)                |
| Xrm.Utility.confirmDialog(msg, yes, no)        | Xrm.Navigation.openConfirmDialog({text: msg}).then(r => r.confirmed ? yes() : no()) |
| Xrm.Utility.getBarcodeValue()                  | Xrm.Device.getBarcodeValue()                                              |
| Xrm.Utility.getCurrentPosition()               | Xrm.Device.getCurrentPosition()                                           |

### 1.3 Removed endpoints and auth patterns

| On-premise pattern                             | Cloud replacement                                     |
|------------------------------------------------|-------------------------------------------------------|
| /XRMServices/2011/OrganizationData.svc         | Xrm.WebApi (handles auth automatically)               |
| /XRMServices/2011/Organization.svc (SOAP)      | Xrm.WebApi.online.execute() for actions               |
| ClientGlobalContext.js.aspx                    | Removed — use Xrm.Utility.getGlobalContext()          |
| GenerateAuthenticationHeader()                 | Removed — Xrm.WebApi handles auth                     |
| Synchronous XMLHttpRequest (async: false)      | Xrm.WebApi with async/await                           |
| document.getElementById() on CRM fields        | formContext.getControl(fieldName).getObject()          |

---

## Part 2 — Execution context pattern

### 2.1 The fundamental pattern shift

On-premise allowed global Xrm.Page access from any function.
Cloud requires executionContext passed as first parameter to
every event handler. formContext is always derived from it.

### 2.2 Event handler conversion template

```javascript
// ❌ ON-PREMISE — broken in Cloud UCI
function onLoad() {
  var name = Xrm.Page.getAttribute("name").getValue();
  Xrm.Page.getControl("name").setDisabled(true);
}

// ✅ CLOUD — executionContext always first parameter
function onLoad(executionContext) {
  var formContext = executionContext.getFormContext();
  var name = formContext.getAttribute("name").getValue();
  formContext.getControl("name").setDisabled(true);
}
```

### 2.3 Form registration requirements

Every event handler registered in Cloud must pass executionContext:
- Form OnLoad: check "Pass execution context as first parameter"
- Field OnChange: check "Pass execution context as first parameter"
- Form OnSave: executionContext provides getSaveContext()
- Tab/Section: no executionContext needed

### 2.4 Helper pattern for shared functions

When multiple handlers share logic, pass formContext explicitly:

```javascript
// ✅ Correct pattern for shared helpers
function onLoad(executionContext) {
  var formContext = executionContext.getFormContext();
  applyVisibilityRules(formContext);
  populateDefaults(formContext);
}

// Helper receives formContext — never accesses Xrm.Page globally
function applyVisibilityRules(formContext) {
  var status = formContext.getAttribute("statuscode").getValue();
  formContext.getControl("approval_date").setVisible(status === 100000001);
}

function populateDefaults(formContext) {
  var owner = formContext.getAttribute("ownerid").getValue();
  if (!owner) {
    formContext.getAttribute("ownerid").setValue(
      [{ id: Xrm.Utility.getGlobalContext().getUserId(), name: "Current User", entityType: "systemuser" }]
    );
  }
}
```

### 2.5 OnSave context

```javascript
// ✅ OnSave handler with save context
function onSave(executionContext) {
  var formContext = executionContext.getFormContext();
  var saveContext = executionContext.getEventArgs();

  // Prevent save if validation fails
  var amount = formContext.getAttribute("new_amount").getValue();
  if (amount <= 0) {
    saveContext.preventDefault();
    formContext.ui.setFormNotification(
      "Amount must be greater than zero.",
      "ERROR",
      "amount_validation"
    );
  }
}
```

---

## Part 3 — Xrm.WebApi migration

### 3.1 Replace OData/SOAP calls with Xrm.WebApi

```javascript
// ❌ ON-PREMISE — OData REST endpoint (broken in Cloud)
function getAccountName(accountId) {
  var req = new XMLHttpRequest();
  req.open("GET",
    Xrm.Page.context.getClientUrl() +
    "/XRMServices/2011/OrganizationData.svc/AccountSet(guid'" + accountId + "')",
    false // synchronous — also broken in Cloud
  );
  req.setRequestHeader("Accept", "application/json");
  req.send(null);
  return JSON.parse(req.responseText).d.Name;
}

// ✅ CLOUD — Xrm.WebApi async
async function getAccountName(accountId) {
  var result = await Xrm.WebApi.retrieveRecord(
    "account",
    accountId,
    "?$select=name"
  );
  return result.name;
}
```

### 3.2 Xrm.WebApi CRUD reference

```javascript
// CREATE
var data = { name: "New Account", telephone1: "555-0100" };
var result = await Xrm.WebApi.createRecord("account", data);
var newId = result.id;

// READ single record
var record = await Xrm.WebApi.retrieveRecord(
  "account",
  accountId,
  "?$select=name,telephone1,ownerid"
);

// READ multiple
var results = await Xrm.WebApi.retrieveMultipleRecords(
  "account",
  "?$select=name&$filter=statecode eq 0&$orderby=name asc&$top=50"
);
var records = results.entities;

// UPDATE
await Xrm.WebApi.updateRecord("account", accountId, { telephone1: "555-0200" });

// DELETE
await Xrm.WebApi.deleteRecord("account", accountId);

// EXECUTE action / bound function
var request = {
  getMetadata: () => ({
    boundParameter: null,
    parameterTypes: { Target: { typeName: "mscrm.account", structuralProperty: 5 } },
    operationType: 0,
    operationName: "WinOpportunity"
  })
};
await Xrm.WebApi.online.execute(request);
```

### 3.3 Error handling for WebApi calls

```javascript
// ✅ Always handle WebApi rejections
async function loadRelatedData(formContext, parentId) {
  try {
    var result = await Xrm.WebApi.retrieveRecord(
      "new_loanapplication",
      parentId,
      "?$select=new_amount,new_status"
    );
    formContext.getAttribute("new_parent_amount").setValue(result.new_amount);
  } catch (error) {
    formContext.ui.setFormNotification(
      "Failed to load related data: " + error.message,
      "ERROR",
      "load_error"
    );
    console.error("loadRelatedData failed", { parentId, error });
  }
}
```

---

## Part 4 — DOM manipulation removal

### 4.1 Why DOM manipulation is forbidden in Cloud

UCI renders forms in an iframe sandbox. Direct DOM access via
`document.getElementById`, `document.querySelector`, or
`window.parent.document` does not work and is unsupported.
All field access must go through the Xrm Client API.

### 4.2 DOM-to-Xrm replacement map

```javascript
// ❌ ON-PREMISE DOM patterns — all broken in Cloud
document.getElementById("name").value = "Test";
document.getElementById("name").disabled = true;
document.getElementById("name_d").style.display = "none";
document.querySelector(".ms-crm-Field").style.color = "red";
window.parent.document.getElementById("crmContentPanel");

// ✅ CLOUD Xrm.ClientAPI equivalents
formContext.getAttribute("name").setValue("Test");
formContext.getControl("name").setDisabled(true);
formContext.getControl("name").setVisible(false);
// Note: custom CSS on CRM fields is not supported in UCI.
// Use setNotification or PCF controls for visual indicators.
// UCI panels are not accessible — use Xrm.Navigation instead.
```

### 4.3 Show/hide fields and sections

```javascript
// ✅ Field visibility
formContext.getControl("new_approvaldate").setVisible(false);

// ✅ Section visibility
formContext.ui.tabs.get("general")
  .sections.get("approval_section")
  .setVisible(false);

// ✅ Tab visibility
formContext.ui.tabs.get("history_tab").setVisible(false);
```

### 4.4 Field labels and requirements

```javascript
// ✅ Change field label dynamically
formContext.getControl("new_amount").setLabel("Approved Amount");

// ✅ Set required level
formContext.getAttribute("new_reason").setRequiredLevel("required");  // "none" | "recommended" | "required"

// ✅ Set field notification
formContext.getControl("new_amount").setNotification(
  "Amount exceeds sector limit.", "amount_warning"
);
formContext.getControl("new_amount").clearNotification("amount_warning");
```

---

## Part 5 — ES6+ modernization

Apply these patterns during every migration to modernise the code.

### 5.1 var → const / let

```javascript
// ❌ Old
var formContext = executionContext.getFormContext();
var amount = formContext.getAttribute("new_amount").getValue();

// ✅ Modern
const formContext = executionContext.getFormContext();
const amount = formContext.getAttribute("new_amount").getValue();
```

### 5.2 Callbacks → async/await

```javascript
// ❌ Old callback pattern
Xrm.WebApi.retrieveRecord("account", id, "?$select=name").then(
  function(result) { console.log(result.name); },
  function(error) { console.error(error.message); }
);

// ✅ async/await
async function loadAccount(id) {
  try {
    const result = await Xrm.WebApi.retrieveRecord("account", id, "?$select=name");
    return result.name;
  } catch (error) {
    console.error("loadAccount failed", error);
    throw error;
  }
}
```

### 5.3 String concatenation → template literals

```javascript
// ❌ Old
var msg = "Hello " + userName + ", your loan " + loanId + " is approved.";

// ✅ Modern
const msg = `Hello ${userName}, your loan ${loanId} is approved.`;
```

### 5.4 Namespace pattern (mandatory for all web resources)

Every web resource must be wrapped in a namespace to avoid
global scope collisions with other scripts on the same form.

```javascript
// ✅ Namespace pattern
var Maqsad = Maqsad || {};
Maqsad.LoanForm = Maqsad.LoanForm || {};

Maqsad.LoanForm.onLoad = function(executionContext) {
  const formContext = executionContext.getFormContext();
  Maqsad.LoanForm._applyBusinessRules(formContext);
};

Maqsad.LoanForm.onSave = function(executionContext) {
  const formContext = executionContext.getFormContext();
  const saveArgs = executionContext.getEventArgs();
  Maqsad.LoanForm._validateAmount(formContext, saveArgs);
};

// Private helpers use underscore prefix convention
Maqsad.LoanForm._applyBusinessRules = function(formContext) {
  const status = formContext.getAttribute("statuscode").getValue();
  formContext.getControl("new_approvaldate").setVisible(status === 100000002);
};

Maqsad.LoanForm._validateAmount = function(formContext, saveArgs) {
  const amount = formContext.getAttribute("new_amount").getValue();
  if (amount !== null && amount <= 0) {
    saveArgs.preventDefault();
    formContext.ui.setFormNotification(
      "Amount must be greater than zero.",
      "ERROR",
      "amount_invalid"
    );
  }
};
```

---

## Part 6 — Migration checklist

Run every item before declaring a migration complete.

### 6.1 Pre-migration scan
- [ ] Search entire file for `Xrm.Page` — every hit must be replaced
- [ ] Search for `window.parent` / `parent.Xrm` — remove all
- [ ] Search for `document.getElementById` — replace with Xrm Client API
- [ ] Search for `document.querySelector` — replace with Xrm Client API
- [ ] Search for `async: false` in XMLHttpRequest — replace with WebApi
- [ ] Search for `/XRMServices/` — replace with Xrm.WebApi
- [ ] Search for `GenerateAuthenticationHeader` — remove entirely
- [ ] Search for `ClientGlobalContext` — replace with getGlobalContext()
- [ ] Search for `Xrm.Utility.openEntityForm` — replace with Navigation API
- [ ] Search for `Xrm.Utility.alertDialog` / `confirmDialog` — replace

### 6.2 Post-migration validation
- [ ] Every event handler function signature has `executionContext` as first param
- [ ] Every `formContext` is derived via `executionContext.getFormContext()`
- [ ] No global `formContext` variable — must be local to each function
- [ ] All WebApi calls are async with try/catch error handling
- [ ] File wrapped in namespace (no globals except the namespace object)
- [ ] `var` replaced with `const` / `let` throughout
- [ ] No `console.log` left in production code (use structured logger or remove)
- [ ] Form registration updated — "Pass execution context" checked for all handlers
- [ ] Script tested on a Cloud sandbox environment before release
- [ ] Solution exported as managed before production deployment

### 6.3 Common Cloud breakages to verify manually
- [ ] Lookup fields: `getValue()` returns array `[{id, name, entityType}]` — not a string
- [ ] OptionSet `getValue()` returns integer — not display label
- [ ] Date fields: `getValue()` returns JS Date object
- [ ] Money fields: `getValue()` returns number (not currency string)
- [ ] Multi-select option sets use `getSelectedValues()` on the attribute
- [ ] `getControl()` returns null for controls on inactive tabs — check before calling

---

## Part 7 — Output format for migration tasks

When producing a migration, always output in this structure:

**Migration Analysis**
List every deprecated pattern found in the source file.
| Line | Pattern found | Replacement |

**Migrated Code**
The complete migrated JavaScript file.
Annotate each changed line with `// MIGRATED: <reason>`.

**Breaking Changes**
Any behaviour differences the developer must be aware of.

**Form Registration Changes Required**
List any handler registrations that need updating in the CRM form editor.

**Test Scenarios**
Minimum 3 test scenarios to verify the migration in a Cloud sandbox.
