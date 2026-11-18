<#
.SYNOPSIS
    Registers the "Survey Engine - Run Due Surveys" Windows Scheduled Task, every 15 minutes (ADR-005, ADR-010).

.DESCRIPTION
    Run once, as a local administrator, by QDB IT on the server that will call CRM. The task runs
    Invoke-RunDueSurveys.ps1 every 15 minutes from -At, indefinitely, under the AD service account,
    whether or not anyone is logged on. Each call sends the One-time surveys that are due; the daily
    work (postponed release, scheduled surveys, retention) runs on the first call of each day only,
    so -At is when that daily work happens. A run still going when the next is due makes the next
    one skip, never overlap. Windows asks for the service account's password; it is stored by Task
    Scheduler, never in a file.

.EXAMPLE
    .\Register-RunDueSurveysTask.ps1 -OrgUrl https://crm.qdb.local/QDB -ServiceAccount QDB\svc-crm-survey -LogPath D:\Logs\SurveyEngine -At 00:05
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OrgUrl,
    [Parameter(Mandatory = $true)][string]$ServiceAccount,
    [Parameter(Mandatory = $true)][string]$LogPath,
    [string]$At = '00:05',
    [int]$EveryMinutes = 15,
    [string]$TaskName = 'Survey Engine - Run Due Surveys'
)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'Invoke-RunDueSurveys.ps1'
if (-not (Test-Path $script)) { throw "Invoke-RunDueSurveys.ps1 must sit next to this script ($script not found)." }

$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -OrgUrl "{1}" -LogPath "{2}"' -f $script, $OrgUrl, $LogPath
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
# A repetition duration of 9999 days is "indefinitely" on every Windows Server Task Scheduler version;
# TimeSpan.MaxValue is rejected by some.
$trigger = New-ScheduledTaskTrigger -Once -At $At -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes) -RepetitionDuration (New-TimeSpan -Days 9999)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 5)
$credential = Get-Credential -UserName $ServiceAccount -Message "Password for $ServiceAccount (stored by Task Scheduler)"

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -User $credential.UserName -Password $credential.GetNetworkCredential().Password -RunLevel Limited `
    -Description 'Calls qdb_srv_RunDueSurveys every 15 minutes: due One-time surveys; once a day postponed release, scheduled surveys, retention (CSE-ENG-001).' | Out-Null

Write-Output "Registered '$TaskName' every $EveryMinutes minutes from $At as $ServiceAccount. Test now with: Start-ScheduledTask -TaskName '$TaskName'"
