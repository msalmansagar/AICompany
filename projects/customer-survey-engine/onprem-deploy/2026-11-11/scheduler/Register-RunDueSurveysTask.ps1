<#
.SYNOPSIS
    Registers the daily "Survey Engine - Run Due Surveys" Windows Scheduled Task (ADR-005).

.DESCRIPTION
    Run once, as a local administrator, by QDB IT on the server that will call CRM. The task runs
    Invoke-RunDueSurveys.ps1 daily at a quiet hour under the AD service account, whether or not
    anyone is logged on. Windows asks for the service account's password; it is stored by Task
    Scheduler, never in a file.

.EXAMPLE
    .\Register-RunDueSurveysTask.ps1 -OrgUrl https://crm.qdb.local/QDB -ServiceAccount QDB\svc-crm-survey -LogPath D:\Logs\SurveyEngine -At 02:00
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OrgUrl,
    [Parameter(Mandatory = $true)][string]$ServiceAccount,
    [Parameter(Mandatory = $true)][string]$LogPath,
    [string]$At = '02:00',
    [string]$TaskName = 'Survey Engine - Run Due Surveys'
)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'Invoke-RunDueSurveys.ps1'
if (-not (Test-Path $script)) { throw "Invoke-RunDueSurveys.ps1 must sit next to this script ($script not found)." }

$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -OrgUrl "{1}" -LogPath "{2}"' -f $script, $OrgUrl, $LogPath
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)
$credential = Get-Credential -UserName $ServiceAccount -Message "Password for $ServiceAccount (stored by Task Scheduler)"

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -User $credential.UserName -Password $credential.GetNetworkCredential().Password -RunLevel Limited `
    -Description 'Calls qdb_srv_RunDueSurveys: postponed release, scheduled surveys, retention (CSE-ENG-001).' | Out-Null

Write-Output "Registered '$TaskName' daily at $At as $ServiceAccount. Test now with: Start-ScheduledTask -TaskName '$TaskName'"
