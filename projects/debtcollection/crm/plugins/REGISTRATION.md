# DCP-001 Plugin Registration

Assembly: `Msst.DebtCollection.Plugins.dll` (strong-named, net471)
Solution: `msst_debtcollection` · Publisher prefix: `msst`

## 1. Build command

`
dotnet build projects/debtcollection/crm/plugins/Msst.DebtCollection.Plugins/Msst.DebtCollection.Plugins.csproj -c Release
`

Register the output from `bin/Release/net471/Msst.DebtCollection.Plugins.dll`.
No ILMerge step is needed — the assembly carries no non-SDK dependencies.
Register only after the schema agent has provisioned all entities. See §4.

## 2. Plugin steps

Each row: Entity · Message · Stage · Mode · Filtering Attributes · Images

### AuditLogWriterPlugin

| Entity | Message | Stage | Mode | Filter attrs | Images |
|---|---|---|---|---|---|
| msst_dcpcollectioncase | Create | PostOperation (40) | Async | (all) | PreImage: all attrs (Update only) |
| msst_dcpcollectioncase | Update | PostOperation (40) | Async | (all) | PreImage: all attrs |
| msst_dcploanfacility | Create | PostOperation (40) | Async | (all) | PreImage: all attrs (Update only) |
| msst_dcploanfacility | Update | PostOperation (40) | Async | (all) | PreImage: all attrs |
| msst_dcpptprecord | Create | PostOperation (40) | Async | (all) | PreImage: all attrs (Update only) |
| msst_dcpptprecord | Update | PostOperation (40) | Async | (all) | PreImage: all attrs |
| msst_dcpcollectionaction | Create | PostOperation (40) | Async | (all) | none |
| msst_dcpcollectionaction | Update | PostOperation (40) | Async | (all) | PreImage: all attrs |
| msst_dcpcommunication | Create | PostOperation (40) | Async | (all) | none |
| msst_dcpcommunication | Update | PostOperation (40) | Async | (all) | PreImage: all attrs |
| msst_dcpcustomer | Create | PostOperation (40) | Async | (all) | none |
| msst_dcpcustomer | Update | PostOperation (40) | Async | (all) | PreImage: all attrs |
| msst_dcpstrategyconfig | Create | PostOperation (40) | Async | (all) | none |
| msst_dcpstrategyconfig | Update | PostOperation (40) | Async | (all) | PreImage: all attrs |

Pre-image alias: `PreImage`. Image must include all attribute columns.

### StatusTransitionValidatorPlugin

| Entity | Message | Stage | Mode | Filter attrs | Images |
|---|---|---|---|---|---|
| msst_dcpcollectioncase | Update | PreOperation (20) | Sync | statuscode | PreImage: statuscode, msst_customerid |
| msst_dcpptprecord | Update | PreOperation (20) | Sync | statuscode | PreImage: statuscode |

Pre-image alias: `PreImage`.
- Case image columns: `statuscode`, `msst_customerid`.  The stop-contact guard
  reads `msst_customerid` from the pre-image to avoid an extra case Retrieve.
  It then performs one indexed primary-key Retrieve of `msst_dcpcustomer`
  (single column `msst_stopcontact`) inside the synchronous pre-op.  Cost is
  negligible; the lookup is by primary key.
- PTP image column: `statuscode`.

### ImmutabilityGuardPlugin

| Entity | Message | Stage | Mode | Filter attrs | Images |
|---|---|---|---|---|---|
| msst_dcpdelinquencysnapshot | Update | PreValidation (10) | Sync | (all) | none |
| msst_dcpdelinquencysnapshot | Delete | PreValidation (10) | Sync | (all) | none |
| msst_dcpauditlog | Update | PreValidation (10) | Sync | (all) | none |
| msst_dcpauditlog | Delete | PreValidation (10) | Sync | (all) | none |
| msst_dcpcollectionaction | Update | PreValidation (10) | Sync | statecode | PreImage: statecode |
| msst_dcpcollectionaction | Delete | PreValidation (10) | Sync | (all) | PreImage: statecode |
| msst_dcpcommunication | Update | PreValidation (10) | Sync | statecode | PreImage: statecode |
| msst_dcpcommunication | Delete | PreValidation (10) | Sync | (all) | PreImage: statecode |
| msst_dcpcollectioncase | Delete | PreValidation (10) | Sync | (all) | none |

Pre-image alias: `PreImage`. Image column: `statecode`.
The guard does not examine the caller's security role — sysadmin is blocked (AR-04).

### DefaultStatusAssignerPlugin

| Entity | Message | Stage | Mode | Filter attrs | Images |
|---|---|---|---|---|---|
| msst_dcpcollectioncase | Create | PreOperation (20) | Sync | (none) | none |
| msst_dcpptprecord | Create | PreOperation (20) | Sync | (none) | none |

No pre-image is needed — the assigner reads and writes only `InputParameters["Target"]`.

Rationale: the CRM platform assigns `statuscode = 1` on Create when no explicit value
is supplied.  Value 1 is not a node in the transition matrix, causing every first
`StatusTransitionValidator` check to refuse with "Transition from '1' to '...' is not
permitted."  This step runs as PreOperation so the corrected value is persisted with
the record, and the validator's `NormalizeCaseFromStatus` / `NormalizePtpFromStatus`
methods handle any records that were created before this plugin was deployed.

### ActivitySubjectComposerPlugin

| Entity | Message | Stage | Mode | Filter attrs | Images |
|---|---|---|---|---|---|
| msst_dcpcollectionaction | Create | PreOperation (20) | Sync | msst_actiontype | none |
| msst_dcpcommunication | Create | PreOperation (20) | Sync | msst_channel | none |

### StopContactQueueMoverPlugin

| Entity | Message | Stage | Mode | Filter attrs | Images |
|---|---|---|---|---|---|
| msst_dcpcustomer | Update | PostOperation (40) | Async | msst_stopcontact | PreImage: msst_stopcontact |

Pre-image alias: `PreImage`. Image column: `msst_stopcontact`.

## 3. Deployment notes

- Register from `bin/Release/net471/Msst.DebtCollection.Plugins.dll`.
- Changing the strong-name key requires unregister + re-register (CRM-M-001).
- After deploying a fix, the sandbox serves the old AppDomain on the first call.
  Wait 30-60 s and re-run once before diagnosing (GOT-007; CRM-M-004).
- Verify deploys by reading the entity record through its real runtime path,
  not by test-suite green alone (PAT-002).

## 4. Schema code verification — values read back from org 2026-09-15

The option-set constants in the plugin code were verified by reading the
provisioned schema on 2026-09-15.  They travel with the solution; these
values are authoritative for the `msst_debtcollection` solution on this org.

| Class / method | Attribute | Verified values |
|---|---|---|
| `StatusTransitionMatrix.CaseStatus` | `statuscode` on `msst_dcpcollectioncase` | 463270200 New, 463270201 Assigned, 463270202 In Progress, 463270203 Pending Customer Response, 463270204 PTP Active, 463270205 PTP Broken, 463270206 Restructure Review, 463270207 Restructured, 463270208 Escalated to Supervisor, 463270209 Pending Legal Review, 463270210 Referred to Legal, 463270211 Under Legal Action, 463270212 Deceased/Insurance Review, 463270213 Settled, 463270214 Closed, 463270215 Written Off, 463270216 Reopened |
| `StatusTransitionMatrix.PtpStatus` | `statuscode` on `msst_dcpptprecord` | 463270220 Open (active), 463270221 Kept (inactive), 463270222 Partially Kept (active), 463270223 Broken (active), 463270224 Rescheduled (active), 463270225 Cancelled (inactive) |
| `ActivitySubjectComposer.GetActionTypeLabel` | `msst_actiontype` on `msst_dcpcollectionaction` | 463270081 Call, 463270082 Meeting, 463270083 Supervisor Review, 463270084 Field Visit, 463270085 Manual Note |
| `ActivitySubjectComposer.GetChannelLabel` | `msst_channel` on `msst_dcpcommunication` | 463270021 SMS, 463270022 Email, 463270023 Official Letter, 463270024 Call |

## 5. Correlation ID convention

The router sets `msst_correlationid` (text) on the entity it is creating or
updating before calling the CRM Web API. The `AuditLogWriter` reads this field
from `InputParameters["Target"]` and stores it in the audit row. When the
field is absent (direct CRM UI write), the plugin falls back to
`IPluginExecutionContext.CorrelationId` (CRM's own request GUID).

The router also sets `msst_sourcepath` to `"Router"`. Direct UI writes leave
the field absent; the plugin defaults to `"Plugin"`.
