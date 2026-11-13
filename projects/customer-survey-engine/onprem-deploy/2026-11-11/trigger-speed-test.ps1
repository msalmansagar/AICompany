<#
.SYNOPSIS
    Survey Engine trigger speed test for an on-prem TEST org (go-live checklist A3, NFR-CSE-006; runbook 9.3).

.DESCRIPTION
    Measures how long the survey trigger takes to create an invitation after a request record enters the
    trigger status. Target: 95% of invitations within 10 seconds, none over 60 seconds.

    Before running, QDB IT prepares at least 10 (ideally 20) records in the activated source's table, each
    named with -RecordPrefix (default SURVEY-SPEED-), each for a DIFFERENT test customer that has not been
    surveyed recently and has no real phone number or e-mail, each in a status just before the trigger
    status and of a type the trigger accepts. The script:
      1. finds the one active Event trigger (or -TriggerName) and its source;
      2. checks the prepared records;
      3. switches the two invitation dispatch steps off, saving their states to a file next to the report;
      4. moves each record into the trigger status, one second apart, reading the server's change time at once;
      5. waits for each record's invitation and measures createdon minus that change time (server clocks,
         1 second resolution);
      6. always puts the dispatch steps back and deletes the invitations and suppression rows it caused.
    The prepared records stay in the trigger status; delete them as QDB's own test process requires.
    If a run stops before step 6 finished, run it again with -RestoreOnly.

    Writes to the org: run it on the TEST orgs only, as a System Administrator (it changes plugin steps).
    Authenticates with Windows integrated authentication. Writes a JSON report; exits 1 when a check fails.

.PARAMETER OrgUrl
    The organisation URL, e.g. https://crm.qdb.local/QDB1

.PARAMETER RecordPrefix
    The start of the prepared records' primary name. Default SURVEY-SPEED-.

.PARAMETER TriggerName
    The trigger to test when more than one active Event trigger exists.

.PARAMETER RestoreOnly
    Only put back dispatch step states saved by an interrupted run.

.PARAMETER UseEnvironmentToken
    MSS testing only: authenticate with the bearer token in $env:SURVEY_SMOKE_TOKEN (cloud org).

.EXAMPLE
    .\trigger-speed-test.ps1 -OrgUrl https://crm.qdb.local/QDB1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OrgUrl,
    [string]$RecordPrefix = 'SURVEY-SPEED-',
    [string]$TriggerName,
    [switch]$RestoreOnly,
    [string]$ReportPath = (Join-Path (Get-Location) ('survey-trigger-speed-{0}.json' -f (Get-Date -Format 'yyyy-MM-dd-HHmm'))),
    [switch]$UseEnvironmentToken
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$ApiBase = '{0}/api/data/v9.0/' -f $OrgUrl.TrimEnd('/')
$RestoreFile = Join-Path (Split-Path -Parent $ReportPath) 'survey-trigger-speed-restore.json'
$Results = New-Object System.Collections.Generic.List[object]
$EventTrigger = 100000000
$MinimumRecords = 10
$TargetP95Seconds = 10
$TargetMaxSeconds = 60
$WaitSeconds = 150

# Add-Result, Get-AuthParameters and Invoke-Crm are the smoke test's own, so each script stays self-contained.
function Add-Result([string]$Id, [string]$Title, [bool]$Passed, [string]$Detail) {
    $status = if ($Passed) { 'PASS' } else { 'FAIL' }
    $Results.Add([pscustomobject]@{ id = $Id; status = $status; check = $Title; detail = $Detail })
    Write-Host ('  {0}  {1,-4} {2} {3}' -f $status, $Id, $Title, $(if ($Detail) { "($Detail)" } else { '' }))
}

function Get-AuthParameters {
    if ($UseEnvironmentToken) { return @{ Headers = @{ Authorization = 'Bearer ' + $env:SURVEY_SMOKE_TOKEN } } }
    return @{ UseDefaultCredentials = $true; Headers = @{} }
}

# One Web API call. Answers Ok, Status, Json and Message.
function Invoke-Crm([string]$Method, [string]$Path, $Body) {
    $auth = Get-AuthParameters
    $headers = $auth.Headers + @{ Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }
    $auth.Remove('Headers')
    $request = @{ Method = $Method; Uri = $ApiBase + $Path; Headers = $headers; UseBasicParsing = $true; ContentType = 'application/json; charset=utf-8' } + $auth
    if ($null -ne $Body) { $request.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5 -Compress)) }
    try {
        $response = Invoke-WebRequest @request
        $json = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }
        return [pscustomobject]@{ Ok = $true; Status = [int]$response.StatusCode; Json = $json; Message = '' }
    } catch [System.Net.WebException] {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $text = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return [pscustomobject]@{ Ok = $false; Status = $status; Json = $null; Message = $text }
    }
}

# Throws with the server's message when a call fails; for the steps that cannot continue without it.
function Invoke-CrmOrThrow([string]$Method, [string]$Path, $Body) {
    $response = Invoke-Crm $Method $Path $Body
    if (-not $response.Ok) { throw ('{0} {1} failed ({2}): {3}' -f $Method, $Path, $response.Status, $response.Message) }
    return $response.Json
}

# Windows PowerShell 5.1 leaves OData dates as strings; later versions parse them. Answers UTC either way.
function ConvertTo-UtcTime($Value) {
    if ($Value -is [DateTime]) { return $Value.ToUniversalTime() }
    return [DateTime]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
}

$AnyOf = { param([string]$Column, [string[]]$Values) [uri]::EscapeDataString((($Values | ForEach-Object { "$Column eq $_" }) -join ' or ')) }

# ── The trigger under test and its table ──

function Get-TriggerUnderTest {
    $query = 'qdb_survey_triggers?$select=qdb_name,qdb_status_values,qdb_type_values&$filter=qdb_trigger_kind eq {0} and qdb_is_active eq true' -f $EventTrigger
    $expand = '&$expand=qdb_survey_setup_id($select=qdb_is_active),qdb_source_id($select=qdb_table_logical_name,qdb_status_field,qdb_type_field,qdb_customer_lookup_field,qdb_is_active)'
    $live = @((Invoke-CrmOrThrow GET ($query + $expand)).value | Where-Object { $_.qdb_survey_setup_id.qdb_is_active -and $_.qdb_source_id.qdb_is_active })
    if ($TriggerName) { $live = @($live | Where-Object { $_.qdb_name -eq $TriggerName }) }
    $names = ($live | ForEach-Object { $_.qdb_name }) -join ', '
    Add-Result 'T1' 'Exactly one active Event trigger on an active setup and source' ($live.Count -eq 1) $(if ($live.Count -eq 1) { $names } else { "found $($live.Count): $names (use -TriggerName)" })
    if ($live.Count -ne 1) { return $null }
    $hasStatus = [bool](([string]$live[0].qdb_status_values).Trim())
    Add-Result 'T2' 'The trigger names at least one status' $hasStatus $(if ($hasStatus) { "status $($live[0].qdb_status_values)" } else { 'its status values are empty: fix the trigger (runbook 7.4)' })
    if (-not $hasStatus) { return $null }
    return $live[0]
}

function Get-TableInfo([string]$Table) {
    return Invoke-CrmOrThrow GET ("EntityDefinitions(LogicalName='{0}')?`$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute" -f $Table)
}

# The body that moves a record into the status: statuscode also needs its statecode.
function Get-StatusBody([string]$Table, [string]$Field, [int]$Value) {
    if ($Field -ne 'statuscode') { return @{ $Field = $Value } }
    $path = "EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata?`$select=LogicalName&`$expand=OptionSet" -f $Table
    $option = @((Invoke-CrmOrThrow GET $path).OptionSet.Options | Where-Object { $_.Value -eq $Value })[0]
    if (-not $option) { throw "status $Value is not a statuscode of $Table" }
    return @{ statecode = [int]$option.State; statuscode = $Value }
}

# ── The prepared records ──

function Get-TestRecords($Info, $Source) {
    $customer = '_{0}_value' -f $Source.qdb_customer_lookup_field
    $columns = @($Info.PrimaryIdAttribute, $Info.PrimaryNameAttribute, $Source.qdb_status_field, $customer) + @($Source.qdb_type_field | Where-Object { $_ })
    # Built first: inside a .NET method call's parentheses a comma separates the METHOD's arguments, so -f would get one value.
    $condition = "startswith({0},'{1}')" -f $Info.PrimaryNameAttribute, $RecordPrefix.Replace("'", "''")
    $filter = [uri]::EscapeDataString($condition)
    $rows = @((Invoke-CrmOrThrow GET ('{0}?$select={1}&$filter={2}' -f $Info.EntitySetName, ($columns -join ','), $filter)).value)
    return $rows | ForEach-Object { [pscustomobject]@{ Id = $_.($Info.PrimaryIdAttribute); Status = $_.($Source.qdb_status_field); Type = $(if ($Source.qdb_type_field) { $_.($Source.qdb_type_field) } else { $null }); Customer = $_.$customer } }
}

function Test-Records($Records, $Trigger) {
    $statusValues = @(([string]$Trigger.qdb_status_values).Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $typeValues = @(([string]$Trigger.qdb_type_values).Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $customers = @($Records | ForEach-Object { $_.Customer } | Where-Object { $_ })
    Add-Result 'P1' "At least $MinimumRecords records named $RecordPrefix*" ($Records.Count -ge $MinimumRecords) "$($Records.Count) found"
    Add-Result 'P2' 'None already in a trigger status' (@($Records | Where-Object { $statusValues -contains [string]$_.Status }).Count -eq 0) ('trigger status ' + ($statusValues -join ','))
    Add-Result 'P3' 'Each of a type the trigger accepts' (($typeValues.Count -eq 0) -or (@($Records | Where-Object { $typeValues -notcontains [string]$_.Type }).Count -eq 0)) ('types ' + ($typeValues -join ','))
    Add-Result 'P4' 'Each for a different customer' (($customers.Count -eq $Records.Count) -and (@($customers | Select-Object -Unique).Count -eq $customers.Count)) "$(@($customers | Select-Object -Unique).Count) distinct of $($Records.Count)"
    return @($Results | Where-Object { $_.id -like 'P*' -and $_.status -eq 'FAIL' }).Count -eq 0
}

# ── Dispatch steps: saved first, always put back ──

function Set-Step([string]$StepId, [bool]$IsEnabled) {
    $body = if ($IsEnabled) { @{ statecode = 0; statuscode = 1 } } else { @{ statecode = 1; statuscode = 2 } }
    [void](Invoke-CrmOrThrow PATCH "sdkmessageprocessingsteps($StepId)" $body)
}

function Stop-Dispatch {
    $filter = [uri]::EscapeDataString("contains(name,'InvitationDispatchPlugin')")
    $steps = @((Invoke-CrmOrThrow GET "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode&`$filter=$filter").value)
    $saved = @($steps | ForEach-Object { [pscustomobject]@{ id = $_.sdkmessageprocessingstepid; name = $_.name; isEnabled = ($_.statecode -eq 0) } })
    $saved | ConvertTo-Json -Depth 3 | Set-Content -Path $RestoreFile -Encoding UTF8
    foreach ($step in $saved) { Set-Step $step.id $false }
    Write-Host "  dispatch switched off for the run ($($saved.Count) step(s); states saved in $RestoreFile)"
}

function Restore-Dispatch {
    if (-not (Test-Path $RestoreFile)) { Write-Host '  no saved dispatch states: nothing to put back'; return $true }
    $failed = 0
    # Assigned first: Windows PowerShell 5.1's ConvertFrom-Json hands an array over as one object.
    $steps = Get-Content $RestoreFile -Raw | ConvertFrom-Json
    foreach ($step in $steps) {
        try { Set-Step $step.id ([bool]$step.isEnabled) } catch { $failed++; Write-Host "  RESTORE FAILED: $($step.name): $($_.Exception.Message)" }
    }
    if ($failed -eq 0) { Remove-Item $RestoreFile }
    Add-Result 'R1' 'Dispatch steps put back as they were' ($failed -eq 0) $(if ($failed -eq 0) { 'restored' } else { "$failed failed: run again with -RestoreOnly" })
    return ($failed -eq 0)
}

# ── Measurement ──

# Moves each record into the trigger status, one second apart; answers each record's server change time.
function Invoke-StatusChanges($Records, $Info, $StatusBody) {
    $changedAt = @{}
    foreach ($record in $Records) {
        [void](Invoke-CrmOrThrow PATCH ('{0}({1})' -f $Info.EntitySetName, $record.Id) $StatusBody)
        $row = Invoke-CrmOrThrow GET ('{0}({1})?$select=modifiedon' -f $Info.EntitySetName, $record.Id)
        $changedAt[[string]$record.Id] = ConvertTo-UtcTime $row.modifiedon
        Start-Sleep -Seconds 1
    }
    return $changedAt
}

# The earliest invitation createdon per source record, for the records that have one.
function Get-InvitationTimes([string[]]$RecordIds) {
    $quoted = $RecordIds | ForEach-Object { "'$_'" }
    $rows = @((Invoke-CrmOrThrow GET ('qdb_survey_invitations?$select=qdb_survey_invitationid,qdb_source_record_id,createdon&$filter={0}' -f (& $AnyOf 'qdb_source_record_id' $quoted))).value)
    $times = @{}
    foreach ($row in $rows) {
        $created = ConvertTo-UtcTime $row.createdon
        if (-not $times.ContainsKey($row.qdb_source_record_id) -or $created -lt $times[$row.qdb_source_record_id]) { $times[$row.qdb_source_record_id] = $created }
    }
    return $times
}

function Measure-Latency($ChangedAt) {
    $recordIds = [string[]]@($ChangedAt.Keys)
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    do { Start-Sleep -Seconds 3; $times = Get-InvitationTimes $recordIds } while ($times.Count -lt $recordIds.Count -and (Get-Date) -lt $deadline)
    $latencies = @($recordIds | ForEach-Object { if ($times.ContainsKey($_)) { [Math]::Round(($times[$_] - $ChangedAt[$_]).TotalSeconds) } else { $null } })
    $found = @($latencies | Where-Object { $null -ne $_ } | Sort-Object)
    $missing = $latencies.Count - $found.Count
    $rank = [Math]::Ceiling(0.95 * $latencies.Count) - 1
    $p95 = if ($rank -lt $found.Count) { $found[$rank] } else { $null }
    return [pscustomobject]@{ latenciesSeconds = $latencies; p95Seconds = $p95; maxSeconds = $(if ($missing -gt 0) { $null } else { $found[-1] }); missing = $missing }
}

function Remove-CausedRows([string[]]$RecordIds) {
    $quoted = $RecordIds | ForEach-Object { "'$_'" }
    $filter = & $AnyOf 'qdb_source_record_id' $quoted
    $invitations = @((Invoke-CrmOrThrow GET "qdb_survey_invitations?`$select=qdb_survey_invitationid&`$filter=$filter").value)
    $logs = @((Invoke-CrmOrThrow GET "qdb_survey_suppression_logs?`$select=qdb_survey_suppression_logid&`$filter=$filter").value)
    $deleted = @($invitations | ForEach-Object { (Invoke-Crm DELETE "qdb_survey_invitations($($_.qdb_survey_invitationid))").Ok }) + @($logs | ForEach-Object { (Invoke-Crm DELETE "qdb_survey_suppression_logs($($_.qdb_survey_suppression_logid))").Ok })
    Add-Result 'R2' 'Invitations and suppression rows the run caused deleted' (-not ($deleted -contains $false)) ("{0} of {1} deleted" -f @($deleted | Where-Object { $_ }).Count, $deleted.Count)
}

function Invoke-SpeedTest($Trigger) {
    $source = $Trigger.qdb_source_id
    $info = Get-TableInfo $source.qdb_table_logical_name
    $records = @(Get-TestRecords $info $source)
    if (-not (Test-Records $records $Trigger)) { return $null }
    $statusBody = Get-StatusBody $source.qdb_table_logical_name $source.qdb_status_field ([int](([string]$Trigger.qdb_status_values).Split(',')[0].Trim()))
    try {
        Stop-Dispatch
        return Measure-Latency (Invoke-StatusChanges $records $info $statusBody)
    } finally {
        [void](Restore-Dispatch)
        # Every prepared record, not only the ones moved: a run that stopped part-way leaves no invitation behind.
        Remove-CausedRows ([string[]]@($records | ForEach-Object { [string]$_.Id }))
    }
}

function Get-FailedCount { return @($Results | Where-Object { $_.status -eq 'FAIL' }).Count }

function Write-Report($Measurement) {
    if ($Measurement) {
        $isPass = ($Measurement.missing -eq 0) -and ($null -ne $Measurement.p95Seconds) -and ($Measurement.p95Seconds -le $TargetP95Seconds) -and ($Measurement.maxSeconds -le $TargetMaxSeconds)
        Add-Result 'S1' "p95 <= $TargetP95Seconds s and none over $TargetMaxSeconds s" $isPass ('p95 {0} s, max {1} s, missing {2}, latencies {3}' -f $Measurement.p95Seconds, $Measurement.maxSeconds, $Measurement.missing, ($Measurement.latenciesSeconds -join ','))
    }
    [pscustomobject]@{ kind = 'survey-trigger-speed'; org = $OrgUrl; ranAt = (Get-Date).ToUniversalTime().ToString('o'); recordPrefix = $RecordPrefix; measurement = $Measurement; checks = $Results } |
        ConvertTo-Json -Depth 5 | Set-Content -Path $ReportPath -Encoding UTF8
    Write-Host ("{0} of {1} checks passed. Report: {2}" -f ($Results.Count - (Get-FailedCount)), $Results.Count, $ReportPath)
}

Write-Host "Survey Engine trigger speed test on $OrgUrl"
$measurement = $null
try {
    if ($RestoreOnly) {
        [void](Restore-Dispatch)
    } elseif (Test-Path $RestoreFile) {
        Add-Result 'R0' 'No dispatch states left unrestored by an earlier run' $false "run again with -RestoreOnly first ($RestoreFile)"
    } else {
        $trigger = Get-TriggerUnderTest
        if ($trigger) { $measurement = Invoke-SpeedTest $trigger }
    }
} catch {
    # Whatever stopped the run, QDB IT still gets a report to send back.
    Add-Result 'E1' 'The run finished without an error' $false $_.Exception.Message
}
Write-Report $measurement
if ((Get-FailedCount) -gt 0) { exit 1 }
