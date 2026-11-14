<#
.SYNOPSIS
    Calls the qdb_srv_RunDueSurveys Custom API once a day (CSE-ENG-001 section 7.2, ADR-005).

.DESCRIPTION
    Run by a Windows Scheduled Task on a CRM or application server, under the AD service account,
    which must hold the Survey Scheduler role in CRM (no other role). Authenticates with Windows integrated
    authentication, so no password or secret is stored. Passes the server's local date as RunDate,
    so a run just after local midnight on the 1st is not read as the last day of the month in UTC.
    Calls again while IsComplete is false (the API stops each call within the plugin time limit).
    Writes one log line per call and exits 1 on any failure, so the task shows "Last Run Result"
    as failed and monitoring can alert on it.

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

function Write-RunLog([string]$Message) {
    if (-not (Test-Path $LogPath)) { New-Item -ItemType Directory -Path $LogPath | Out-Null }
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message
    Add-Content -Path (Join-Path $LogPath ('RunDueSurveys-{0:yyyyMMdd}.log' -f (Get-Date))) -Value $line -Encoding UTF8
    Write-Output $line
}

function Invoke-RunDueSurveysOnce {
    $uri = '{0}/api/data/v9.0/qdb_srv_RunDueSurveys' -f $OrgUrl.TrimEnd('/')
    $body = @{ RunDate = $RunDate } | ConvertTo-Json
    $headers = @{ 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; Accept = 'application/json' }
    Invoke-RestMethod -Method Post -Uri $uri -Body $body -ContentType 'application/json; charset=utf-8' -Headers $headers -UseDefaultCredentials -TimeoutSec 180
}

try {
    for ($call = 1; $call -le $MaxCalls; $call++) {
        $result = Invoke-RunDueSurveysOnce
        Write-RunLog ('RunDate {0}, call {1}: {2}' -f $RunDate, $call, $result.Summary)
        if ($result.IsComplete) { exit 0 }
    }
    Write-RunLog ('RunDate {0}: still not complete after {1} calls; investigate volume or failures.' -f $RunDate, $MaxCalls)
    exit 1
}
catch {
    Write-RunLog ('RunDate {0}: FAILED - {1}' -f $RunDate, $_.Exception.Message)
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-RunLog ('  detail: {0}' -f $_.ErrorDetails.Message) }
    exit 1
}
