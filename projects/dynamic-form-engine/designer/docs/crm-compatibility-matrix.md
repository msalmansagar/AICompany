═══════════════════════════════════════════════════
CRM COMPATIBILITY MATRIX
═══════════════════════════════════════════════════
Project:        FDWR-001 — Form Designer Web Resource
Document Date:  2026-06-01
CEO Condition:  C-003
Status:         TEMPLATE — Must be verified against actual environments before SIT
═══════════════════════════════════════════════════


INSTRUCTIONS FOR CRM ADMINISTRATOR
────────────────────────────────────
Before SIT begins, fill in the "Actual Version" column for each environment
and confirm each API check passes. Sign at the bottom and commit this file.

CEO Condition C-003 requires this matrix to be verified against the actual
version numbers in DEV and PROD before SIT sign-off. Any gap must be
escalated immediately to the project CEO.


TARGET PLATFORM REQUIREMENTS
─────────────────────────────
| Requirement                   | Minimum    | Reason                                 |
|-------------------------------|------------|----------------------------------------|
| Dynamics 365 / CRM version    | 9.2        | Xrm.WebApi stable from v9.2            |
| Xrm.WebApi.createRecord       | v9.1       | Used for all entity writes             |
| Xrm.WebApi.updateRecord       | v9.1       | Used for all entity updates            |
| Xrm.WebApi.deleteRecord       | v9.1       | Used for all entity deletes            |
| Xrm.WebApi.retrieveRecord     | v9.1       | Used for form + version loads          |
| Xrm.WebApi.retrieveMultipleRecords | v9.1  | Used for lists and $filter queries     |
| OData version                 | 4.0        | All $filter/$select/$orderby queries   |
| Web resource iframe support   | UCI (v9.0) | Designer loads inside UCI shell        |
| parent.Xrm access             | UCI        | Adapter reads parent.Xrm.WebApi        |
| EntityDefinitions metadata API| v9.1       | Entity picker in New Form Wizard       |
| Browser: Edge (Chromium)      | v100+      | NFR-002                                |
| Browser: Chrome               | v100+      | NFR-002                                |
| Iframe min width              | 1024px     | NFR-002                                |


ENVIRONMENT MATRIX
──────────────────
| Environment | Type          | CRM Version | Patch Level | Verified By | Date       | Notes |
|-------------|---------------|-------------|-------------|-------------|------------|-------|
| DEV         | On-premise 9.x| [FILL IN]   | [FILL IN]   | [FILL IN]   | [FILL IN]  |       |
| SIT         | On-premise 9.x| [FILL IN]   | [FILL IN]   | [FILL IN]   | [FILL IN]  |       |
| UAT         | [Online/On-p] | [FILL IN]   | [FILL IN]   | [FILL IN]   | [FILL IN]  |       |
| PROD        | [Online/On-p] | [FILL IN]   | [FILL IN]   | [FILL IN]   | [FILL IN]  |       |


API COMPATIBILITY CHECKS (run in each environment's browser console)
──────────────────────────────────────────────────────────────────────
Run these in the CRM browser console from within the web resource iframe context:

```javascript
// Check Xrm.WebApi is available
console.log(typeof parent.Xrm?.WebApi?.createRecord);  // should print 'function'

// Check OData version supported
fetch(Xrm.Utility.getGlobalContext().getClientUrl() + '/api/data/', {
  credentials: 'include', headers: { 'OData-Version': '4.0', Accept: 'application/json' }
}).then(r => console.log('OData:', r.status));           // should print 200

// Check EntityDefinitions endpoint
fetch(Xrm.Utility.getGlobalContext().getClientUrl() +
  '/api/data/v9.1/EntityDefinitions?$select=LogicalName&$top=1',
  { credentials: 'include', headers: { Accept: 'application/json', 'OData-Version': '4.0' } }
).then(r => r.json()).then(d => console.log('EntityDefs:', d.value?.length));  // should print 1
```


KNOWN GAPS / RISKS
──────────────────
| ID    | Risk                                    | Mitigation                              |
|-------|-----------------------------------------|-----------------------------------------|
| CM-001| On-prem patch level may differ DEV/PROD | Verify patch level in both before SIT   |
| CM-002| Xrm.WebApi behaviour differs on-p/online| Test deployment smoke on both types     |
| CM-003| parent.Xrm null in standalone browser   | CrmContextService detects and surfaces  |


SIGN-OFF (REQUIRED TO SATISFY C-003)
──────────────────────────────────────
By signing below, the CRM Administrator confirms that:
1. All environments in the matrix above are at CRM v9.2 or above.
2. All API compatibility checks passed in DEV and PROD.
3. Any gaps identified above have been escalated to the project CEO.

CRM Administrator:   ________________________________
Date:                ________________________________
DEV Version:         ________________________________
PROD Version:        ________________________________
