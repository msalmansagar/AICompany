<#
.SYNOPSIS
    Calls the qdb_srv_RunDueSurveys Custom API; the Scheduled Task runs it every 15 minutes
    (CSE-ENG-001 section 7.2, ADR-005, ADR-010). The daily work happens on the first call of each day.

.DESCRIPTION
    Run by a Windows Scheduled Task on a CRM or application server, under the AD service account,
    which must hold the Survey Scheduler role in CRM (no other role). Authenticates with Windows integrated
    authentication, so no password or secret is stored. Passes the server's local date as RunDate,
    so a run just after local midnight on the 1st is not read as the last day of the month in UTC.
    Runs the One-time pass and the daily passes as SEPARATE calls (Pass = OneTime, then Pass = Daily):
    each Custom API call is one database transaction, so a failure in one pass rolls back only its own
    work and the other pass still runs (DEF-CSE-002). Calls each pass again while IsComplete is false
    (the API stops each call within the plugin time limit), up to MaxCalls; a pass still running then
    continues in the next scheduled run. After a failed Daily call it calls Pass = RecordFailure, so
    repeated failures mark the scheduled survey Stuck on its trigger (ADR-011). Writes one log line per
    call and exits 1 if either pass failed, so the task shows "Last Run Result" as failed and monitoring
    can alert on it.

.PARAMETER OrgUrl
    The organisation URL, e.g. https://crm.qdb.local/QDB

.PARAMETER LogPath
    Folder for the daily log files.

.PARAMETER RunDate
    Optional yyyy-MM-dd, to re-run a missed day. Defaults to today's local date.

.EXAMPLE
    .\Invoke-RunDueSurveys.ps1 -OrgUrl https://crm.qdb.local/QDB -LogPath D:\Logs\SurveyEngine
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OrgUrl,
    [Parameter(Mandatory = $true)][string]$LogPath,
    [string]$RunDate = (Get-Date).ToString('yyyy-MM-dd'),
    [int]$MaxCalls = 10
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Write-Host, not Write-Output: output written inside a function becomes part of its return value, which made
# Invoke-Pass return "log lines + $false" (always true) so the script exited 0 after a failure (DEF-CSE-004).
function Write-RunLog([string]$Message) {
    if (-not (Test-Path $LogPath)) { New-Item -ItemType Directory -Path $LogPath | Out-Null }
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message
    Add-Content -Path (Join-Path $LogPath ('RunDueSurveys-{0:yyyyMMdd}.log' -f (Get-Date))) -Value $line -Encoding UTF8
    Write-Host $line
}

function Invoke-RunDueSurveysOnce([string]$Pass) {
    $uri = '{0}/api/data/v9.0/qdb_srv_RunDueSurveys' -f $OrgUrl.TrimEnd('/')
    $body = @{ RunDate = $RunDate; Pass = $Pass } | ConvertTo-Json
    $headers = @{ 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; Accept = 'application/json' }
    Invoke-RestMethod -Method Post -Uri $uri -Body $body -ContentType 'application/json; charset=utf-8' -Headers $headers -UseDefaultCredentials -TimeoutSec 180
}

# Runs one pass until it reports complete. Returns $true on success; logs and returns $false on any failure,
# so the caller still runs the other pass. A pass still running after MaxCalls is progress, not a failure: at HL's
# size a scheduled survey or a One-time send needs more calls than one run makes, and the next run continues it.
function Invoke-Pass([string]$Pass) {
    try {
        for ($call = 1; $call -le $MaxCalls; $call++) {
            $result = Invoke-RunDueSurveysOnce $Pass
            Write-RunLog ('RunDate {0}, {1} call {2}: {3}' -f $RunDate, $Pass, $call, $result.Summary)
            if ($result.IsComplete) { return $true }
        }
        Write-RunLog ('RunDate {0}, {1}: not complete after {2} calls; continues in the next scheduled run.' -f $RunDate, $Pass, $MaxCalls)
        return $true
    }
    catch {
        Write-RunLog ('RunDate {0}, {1}: FAILED - {2}' -f $RunDate, $Pass, $_.Exception.Message)
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-RunLog ('  detail: {0}' -f $_.ErrorDetails.Message) }
        return $false
    }
}

# A failed Daily call rolled back its own writes, so it could not count itself. This separate call counts it against
# the scheduled run it was working on; at the Survey Settings threshold that run shows Stuck (FR-011, ADR-011). Its own failure is
# logged and does not change the exit code, which is already 1.
function Register-DailyFailure {
    try {
        $result = Invoke-RunDueSurveysOnce 'RecordFailure'
        Write-RunLog ('RunDate {0}, RecordFailure: {1}' -f $RunDate, $result.Summary)
    }
    catch {
        Write-RunLog ('RunDate {0}, RecordFailure: FAILED - {1}' -f $RunDate, $_.Exception.Message)
    }
}

$isOneTimeOk = Invoke-Pass 'OneTime'
$isDailyOk = Invoke-Pass 'Daily'
if (-not $isDailyOk) { Register-DailyFailure }
if ($isOneTimeOk -and $isDailyOk) { exit 0 }
exit 1
