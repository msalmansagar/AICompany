# Building `qdb_RunReport` and `qdb_RunDashboard` on-premise

**Written 2026-08-19.** The schema is imported. This is the piece that was removed with the Custom
APIs and never replaced, and until it exists **every report run and every dashboard fails** — the
browser calls a message the organisation does not have.

> **Not verified.** There is no on-premises organisation here. Everything below is derived from this
> repository's own source, which is authoritative about the contract, and from how a Custom Action is
> defined. Prove it with the smoke test at the end before promising a date.

---

## Why this is small

Two things that looked like they would need porting do not.

**The plugin needs no code change.** `RunReportRequestReader` reads inputs by name —
`context.InputParameters["reportId"]` — and `RunReportPlugin` writes outputs by name —
`context.OutputParameters["resultJson"]`. That is identical under a Custom API and a Custom Action.
The plugin cannot tell which one invoked it.

**The web resources need no change.** They already call it as an unbound Action:

```js
getMetadata: () => ({ boundParameter: null, operationType: 0, operationName: "qdb_RunReport", ... })
```

`operationType: 0` is Action. A Custom Action with that unique name answers that exact request over
the same unbound POST.

So the whole job is: define two Actions, register two steps, activate.

---

## The contract

Names are case-sensitive and are the contract between three places — the browser's `parameterTypes`
map, the Action's arguments, and `ReportEngineParameters.cs`. A typo does not raise a name error: the
plugin reads a missing key as null and you get *"'reportId' must be a non-empty GUID"* or an empty
result, which sends you looking in the wrong place entirely.

### `qdb_RunReport`

Process type **Action**, entity **None (global)**.

| Input argument | Type | Required | Notes |
|---|---|---|---|
| `reportId` | String | Yes | GUID of the `qdb_reportdefinition` |
| `parametersJson` | String | No | `{}` when there are no runtime prompts |
| `format` | String | No | The browser sends `RUN` for an on-screen run |
| `async` | **Boolean** | No | The only non-String argument on either Action |
| `relationshipId` | String | No | Drilldown only; empty otherwise |
| `parentKey` | String | No | Drilldown only; empty otherwise |

| Output argument | Type | Written when |
|---|---|---|
| `resultJson` | String | Success — the shaped result. Empty string on failure. |
| `executionId` | String | Always |
| `mode` | String | Always — `SYNC` |
| `jobId` | String | Always — empty string today |
| `statusPollUrl` | String | Always — empty string today |
| `errorCode` | String | Always — empty string on success |
| `errorMessage` | String | Always — empty string on success |

All seven outputs are written on **both** the success and failure paths (`WriteSuccess` /
`WriteFailure` both call `WriteCommon`). Declare all seven or the plugin throws writing one that the
Action does not declare.

### `qdb_RunDashboard`

Process type **Action**, entity **None (global)**.

| Input | Type | | Output | Type |
|---|---|---|---|---|
| `dashboardId` | String | | `resultJson` | String |
| | | | `executionId` | String |
| | | | `errorCode` | String |
| | | | `errorMessage` | String |

Four outputs, not seven. `RunDashboardPlugin` writes only these.

---

## 🔴 The Actions cannot be created by inserting a record — proven on cloud

Tested against org5869857f on 2026-08-19 and cleaned up afterwards. Inserting a `workflow` row
with `category 3`, valid XAML and `statecode 1` **succeeds and reports itself as activated**, and
then:

| Check | Result |
|---|---|
| Workflow row created | ✅ |
| Reports `statecode 1` (activated) | ✅ |
| `sdkmessage` generated | ❌ **none** |
| Callable over the Web API | ❌ **404** |

Run twice to rule out the publisher prefix — once as `qdbprobe_RunReport` and once as
`qdb_RunReportProbe` under the organisation own prefix. Identical outcome, so the prefix is not
the cause.

**The message plumbing is not part of the workflow row.** `sdkmessage`, `sdkmessagepair` and the
request/response field rows that carry the eighteen argument names are created by the Process
designer and by solution import. A record insert produces an Action that looks finished and cannot
be called — the worst outcome available, and why `scripts/create-onprem-actions.mjs` now refuses to
run its create path.

**So build them by hand from the steps below**, or emit a solution package (the XAML that script
generates is verified — the platform accepted and activated it; only the messaging around it was
missing).

---

## Steps

**1. Create the Actions.** Settings → Processes → New. Category **Action**, Entity **None (global)**,
name **RunReport**. The publisher prefix is prepended automatically, so confirm the unique name comes
out as exactly `qdb_RunReport` — if your on-premises publisher prefix is not `qdb`, the message name
will not match what the web resources call and nothing will work. Add the arguments above under
Process Arguments. Repeat for **RunDashboard**.

**2. Leave the Action body empty.** The plugin does the work. An Action with no steps is valid; it
exists to define the message.

**3. Activate both.** An unactivated Action is not callable and does not appear as a message.

**4. Register the plugin steps.** Plugin Registration Tool → your `Qdb.ReportEngine.CrmPlugin`
assembly:

| Plugin type | Message | Stage | Mode |
|---|---|---|---|
| `Qdb.ReportEngine.CrmPlugin.RunReportPlugin` | `qdb_RunReport` | PostOperation | Synchronous |
| `Qdb.ReportEngine.CrmPlugin.RunDashboardPlugin` | `qdb_RunDashboard` | PostOperation | Synchronous |

Primary entity **none** on both. The message only appears in the list after step 3.

**5. Confirm the audit steps came across.** The solution carried three
(`ReportConfigurationAuditPlugin` on Create, Update and Delete of `qdb_reportdefinition`). If the
import dropped them: `node scripts/register-audit-steps.mjs <path-to-.env>`.

---

## Smoke test — prove it by a change in result

A run that returns rows proves less than it appears to. Prove each of these:

**1. The message exists.** In the browser console on any CRM page:

```js
Xrm.WebApi.online.execute({
  reportId: "<a real qdb_reportdefinition guid>",
  parametersJson: "{}", format: "RUN", async: false, relationshipId: "", parentKey: "",
  getMetadata: () => ({ boundParameter: null, operationType: 0, operationName: "qdb_RunReport",
    parameterTypes: {
      reportId:{typeName:"Edm.String",structuralProperty:1},
      parametersJson:{typeName:"Edm.String",structuralProperty:1},
      format:{typeName:"Edm.String",structuralProperty:1},
      async:{typeName:"Edm.Boolean",structuralProperty:1},
      relationshipId:{typeName:"Edm.String",structuralProperty:1},
      parentKey:{typeName:"Edm.String",structuralProperty:1}
    }})
}).then(r => r.json()).then(console.log);
```

A 404 means the Action is not activated or the unique name is wrong. `resultJson` with rows means the
whole path works.

**2. 🔴 Read `errorCode`, not the status code.** A refusal comes back as **HTTP 200 with
`errorCode`/`errorMessage` populated**. A check that only looks at the status reports a refusal as a
pass — that error has been made on this project before.

**3. Prove the plugin is really bound.** Deactivate the step, run again, and confirm you get an empty
result rather than rows. An Action with no plugin returns success and nothing, which reads exactly
like a report with no data.

**4. Prove security still applies.** Run as a user outside a report's access list and confirm
`ReportAccessGuard` refuses. Executes as the calling user, same as the Custom API did.

**5. Confirm the execution log wrote a row.** No data without a trail is the engine's own rule; if
`qdb_reportexecutionlog` is empty after a successful run, the plugin is not the one answering.

---

## What is still outstanding after this

- **Data.** The solution carried no records. Report definitions, data sources, columns, parameters,
  access rows and `qdb_reportribbonplacement` rows all need seeding or migrating.
- **Web resources.** Fourteen came with the solution; confirm with
  `node scripts/deploy-webresources.mjs <path-to-.env>`, which reports what is unchanged.
- **Performance is unmeasured.** A Custom Action instantiates a workflow on every call; a Custom API
  does not. C-6 measured the cloud path at 1.17s for 5,000 rows. Measure this one before promising
  anything — the headroom found on cloud may not survive.
