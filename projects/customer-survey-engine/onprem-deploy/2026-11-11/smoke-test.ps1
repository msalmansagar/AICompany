<#
.SYNOPSIS
    Survey Engine smoke test for an on-prem org (B9 item 6, runbook stage 9).

.DESCRIPTION
    Read-only by default: checks the Survey Settings row and the seven Custom APIs, then calls the four
    portal APIs with values that match nothing, which proves each plugin runs and answers as designed.

    With -WriteTest it also sends one survey end to end through the portal APIs: it creates a test
    customer (contact or account, per Survey Settings), a switched-off test setup and one Portal
    invitation; lists, opens and submits it; checks the response and that a second submit is refused;
    then deletes everything it created (the response goes with its invitation). Run -WriteTest on the
    test orgs. On production, run it only with the change owner's approval.

    Authenticates with Windows integrated authentication as the person running it, who must be a
    System Administrator for -WriteTest. -IntegrationCredential makes the four portal API calls as the
    portal backend's service account instead, which proves the Survey Integration role as well.

    Writes a JSON report and exits 1 when any check fails.

.PARAMETER OrgUrl
    The organisation URL, e.g. https://crm.qdb.local/HousingLoan

.PARAMETER FormCode
    A published survey form (Form Type = Survey) to send in -WriteTest.

.PARAMETER Language
    en or ar; the form must be published in it. Default en.

.PARAMETER IntegrationCredential
    The portal backend's service account (Get-Credential). Optional.

.PARAMETER UseEnvironmentToken
    MSS testing only: authenticate with the bearer token in $env:SURVEY_SMOKE_TOKEN (cloud org).

.EXAMPLE
    .\smoke-test.ps1 -OrgUrl https://crm.qdb.local/QDB1
.EXAMPLE
    .\smoke-test.ps1 -OrgUrl https://crm.qdb.local/QDB1 -WriteTest -FormCode srv-customer-feedback -IntegrationCredential (Get-Credential QDB\svc-portal)
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OrgUrl,
    [string]$FormCode,
    [ValidateSet('en', 'ar')][string]$Language = 'en',
    [switch]$WriteTest,
    [System.Management.Automation.PSCredential]$IntegrationCredential,
    [string]$ReportPath = (Join-Path (Get-Location) ('survey-smoke-test-{0}.json' -f (Get-Date -Format 'yyyy-MM-dd-HHmm'))),
    [switch]$UseEnvironmentToken
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 draws a progress bar for every web request, which makes each call take seconds.
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
if ($WriteTest -and -not $FormCode) { throw '-WriteTest needs -FormCode: a published survey form.' }

$ApiBase = '{0}/api/data/v9.0/' -f $OrgUrl.TrimEnd('/')
$Results = New-Object System.Collections.Generic.List[object]
$PendingStatus = 100000000
$SubmittedStatus = 100000002
$PortalChannel = 100000000
$ContactTable = 100000001
$SurveyApis = @('qdb_srv_ActivateSource', 'qdb_srv_DeactivateSource', 'qdb_srv_RunDueSurveys', 'qdb_srv_ListPendingSurveys', 'qdb_srv_GetSurvey', 'qdb_srv_SubmitResponse', 'qdb_srv_ValidateLinkToken')

function Add-Result([string]$Id, [string]$Title, [bool]$Passed, [string]$Detail) {
    $status = if ($Passed) { 'PASS' } else { 'FAIL' }
    $Results.Add([pscustomobject]@{ id = $Id; status = $status; check = $Title; detail = $Detail })
    Write-Host ('  {0}  {1,-4} {2} {3}' -f $status, $Id, $Title, $(if ($Detail) { "($Detail)" } else { '' }))
}

function Get-AuthParameters([bool]$AsIntegration) {
    if ($UseEnvironmentToken) { return @{ Headers = @{ Authorization = 'Bearer ' + $env:SURVEY_SMOKE_TOKEN } } }
    if ($AsIntegration -and $IntegrationCredential) { return @{ Credential = $IntegrationCredential; Headers = @{} } }
    return @{ UseDefaultCredentials = $true; Headers = @{} }
}

# One Web API call. Answers Ok, Status, Json, EntityId (from OData-EntityId on a create) and Message.
function Invoke-Crm([string]$Method, [string]$Path, $Body, [switch]$AsIntegration) {
    $auth = Get-AuthParameters $AsIntegration.IsPresent
    $headers = $auth.Headers + @{ Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }
    $auth.Remove('Headers')
    $request = @{ Method = $Method; Uri = $ApiBase + $Path; Headers = $headers; UseBasicParsing = $true; ContentType = 'application/json; charset=utf-8' } + $auth
    if ($null -ne $Body) { $request.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5 -Compress)) }
    try {
        $response = Invoke-WebRequest @request
        $json = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }
        $entityId = if ($response.Headers['OData-EntityId'] -match '\(([0-9a-fA-F-]{36})\)\s*$') { $Matches[1] } else { $null }
        return [pscustomobject]@{ Ok = $true; Status = [int]$response.StatusCode; Json = $json; EntityId = $entityId; Message = '' }
    } catch [System.Net.WebException] {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        # 5.1 has usually read the error body already; it keeps it in ErrorDetails.
        $text = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return [pscustomobject]@{ Ok = $false; Status = $status; Json = $null; EntityId = $null; Message = $text }
    }
}

function Test-Refusal($Response, [string]$Code) { return (-not $Response.Ok) -and $Response.Message -match [regex]::Escape($Code) }

# ── Read-only checks ──

function Get-CustomerLink {
    $settings = Invoke-Crm GET 'qdb_survey_settingses?$select=qdb_customer_table&$top=1'
    if (-not $settings.Ok) { Add-Result 'R2' 'Survey Settings row' $false $settings.Message.Substring(0, [Math]::Min(200, $settings.Message.Length)); return $null }
    $row = @($settings.Json.value)[0]
    Add-Result 'R2' 'Survey Settings row' ($null -ne $row) $(if ($row) { 'present' } else { 'none: enter it before -WriteTest (runbook 7.1)' })
    if ($row -and $row.qdb_customer_table -eq $ContactTable) { return @{ Table = 'contact'; Set = 'contacts'; Lookup = 'qdb_customer_contact_id' } }
    return @{ Table = 'account'; Set = 'accounts'; Lookup = 'qdb_customer_id' }
}

function Test-ReadOnly {
    $whoAmI = Invoke-Crm GET 'WhoAmI()'
    Add-Result 'R1' 'Signed in to CRM' $whoAmI.Ok $(if ($whoAmI.Ok) { 'user ' + $whoAmI.Json.UserId } else { "HTTP $($whoAmI.Status)" })
    $link = Get-CustomerLink
    $missing = @($SurveyApis | Where-Object { -not @((Invoke-Crm GET ("customapis?`$select=uniquename&`$filter=uniquename eq '{0}'" -f $_)).Json.value).Count })
    Add-Result 'R3' 'Seven survey Custom APIs exist' ($missing.Count -eq 0) $(if ($missing.Count) { 'missing: ' + ($missing -join ', ') } else { '' })
    $nobody = [guid]::NewGuid().ToString()
    $list = Invoke-Crm POST 'qdb_srv_ListPendingSurveys' @{ CustomerId = $nobody; Language = $Language } -AsIntegration
    Add-Result 'R4' 'ListPendingSurveys runs (unknown customer: empty list)' ($list.Ok -and $list.Json.SurveysJson -eq '[]') $(if ($list.Ok) { $list.Json.SurveysJson } else { "HTTP $($list.Status)" })
    $get = Invoke-Crm POST 'qdb_srv_GetSurvey' @{ InvitationId = $nobody; CallerCustomerId = $nobody; Language = $Language } -AsIntegration
    Add-Result 'R5' 'GetSurvey runs (unknown invitation: survey_not_found)' (Test-Refusal $get 'survey_not_found') "HTTP $($get.Status)"
    $token = Invoke-Crm POST 'qdb_srv_ValidateLinkToken' @{ Token = 'smoke-test-' + $nobody } -AsIntegration
    $tokenAnswered = ($token.Ok -and -not $token.Json.Valid) -or (Test-Refusal $token 'survey_')
    Add-Result 'R6' 'ValidateLinkToken runs (made-up token: refused)' $tokenAnswered $(if ($token.Ok) { 'Valid=false, ' + $token.Json.Reason } else { "HTTP $($token.Status), secure links off" })
    return $link
}

# ── Write test: one invitation through the portal APIs ──

function Get-PinnedVersion {
    $path = "qdb_form_render_caches?`$select=qdb_published_version&`$filter=qdb_form_code eq '{0}' and qdb_language_code eq '{1}'&`$orderby=qdb_published_version desc&`$top=1" -f $FormCode.Replace("'", "''"), $Language
    $row = @((Invoke-Crm GET $path).Json.value)[0]
    Add-Result 'W0' "Form $FormCode is published in $Language" ($null -ne $row) $(if ($row) { 'version ' + $row.qdb_published_version } else { 'publish it from the Form Designer first' })
    if ($row) { return [int]$row.qdb_published_version } else { return $null }
}

function New-Fixtures($Link, [int]$Version, [string]$Stamp) {
    $customerBody = if ($Link.Table -eq 'contact') { @{ firstname = 'Survey'; lastname = "Smoke Test $Stamp" } } else { @{ name = "Survey Smoke Test $Stamp" } }
    $fixtures = @{ CustomerId = (Invoke-Crm POST $Link.Set $customerBody).EntityId }
    $fixtures.SetupId = (Invoke-Crm POST 'qdb_survey_setups' @{ qdb_name = "Smoke test $Stamp"; qdb_form_code = $FormCode; qdb_is_active = $false }).EntityId
    $invitation = @{
        qdb_name = "Smoke test $Stamp"; qdb_form_code = $FormCode; qdb_pinned_version = $Version; qdb_language_code = $Language
        qdb_status = $PendingStatus; qdb_channel = $PortalChannel; qdb_generated_on = (Get-Date).ToUniversalTime().ToString('o')
        qdb_expires_on = (Get-Date).AddDays(1).ToUniversalTime().ToString('o'); qdb_dedupe_key = "SMOKE-TEST-$Stamp"
        "$($Link.Lookup)@odata.bind" = "/$($Link.Set)($($fixtures.CustomerId))"; 'qdb_survey_setup_id@odata.bind' = "/qdb_survey_setups($($fixtures.SetupId))"
    }
    $fixtures.InvitationId = (Invoke-Crm POST 'qdb_survey_invitations' $invitation).EntityId
    Add-Result 'W1' "Test $($Link.Table), setup and invitation created" ($fixtures.CustomerId -and $fixtures.SetupId -and $fixtures.InvitationId) "invitation $($fixtures.InvitationId)"
    return $fixtures
}

# The first question of the survey, answered with its first option, or a text value.
function Get-FirstAnswer($RuntimeJson) {
    $form = $RuntimeJson | ConvertFrom-Json
    $fields = @($form.tabs | Sort-Object displayOrder | ForEach-Object { $_.sections | Sort-Object displayOrder } | ForEach-Object { $_.fields | Sort-Object displayOrder } | Where-Object { $_.schemaName })
    if ($fields.Count -eq 0) { return $null }
    $value = if (@($fields[0].options).Count -gt 0 -and $fields[0].options[0].value) { [string]$fields[0].options[0].value } else { 'Smoke test' }
    return @{ questionCode = $fields[0].schemaName; value = $value }
}

function Test-PortalFlow($Fixtures) {
    $caller = @{ InvitationId = $Fixtures.InvitationId; CallerCustomerId = $Fixtures.CustomerId }
    $list = Invoke-Crm POST 'qdb_srv_ListPendingSurveys' @{ CustomerId = $Fixtures.CustomerId; Language = $Language } -AsIntegration
    Add-Result 'W2' 'ListPendingSurveys lists the invitation' ($list.Ok -and $list.Json.SurveysJson -match $Fixtures.InvitationId) "HTTP $($list.Status)"
    $survey = Invoke-Crm POST 'qdb_srv_GetSurvey' ($caller + @{ Language = $Language }) -AsIntegration
    $answer = if ($survey.Ok) { Get-FirstAnswer $survey.Json.RuntimeJson } else { $null }
    Add-Result 'W3' 'GetSurvey answers the pinned survey' ($survey.Ok -and $survey.Json.FormCode -eq $FormCode -and $null -ne $answer) $(if ($survey.Ok) { "v$($survey.Json.Version) $($survey.Json.RenderedLanguage), first question $($answer.questionCode)" } else { "HTTP $($survey.Status)" })
    if (-not $answer) { return }
    $answersJson = ConvertTo-Json @($answer) -Compress
    $submit = Invoke-Crm POST 'qdb_srv_SubmitResponse' ($caller + @{ AnswersJson = $answersJson }) -AsIntegration
    Add-Result 'W4' 'SubmitResponse stores the response' ($submit.Ok -and $submit.Json.ResponseId) $(if ($submit.Ok) { "response $($submit.Json.ResponseId), $($submit.Json.Status)" } else { $submit.Message.Substring(0, [Math]::Min(200, $submit.Message.Length)) })
    $invitation = (Invoke-Crm GET ("qdb_survey_invitations({0})?`$select=qdb_status" -f $Fixtures.InvitationId)).Json
    Add-Result 'W5' 'Invitation is Submitted' ($invitation.qdb_status -eq $SubmittedStatus) "status $($invitation.qdb_status)"
    $again = Invoke-Crm POST 'qdb_srv_SubmitResponse' ($caller + @{ AnswersJson = $answersJson }) -AsIntegration
    Add-Result 'W6' 'A second submit is refused' (Test-Refusal $again 'survey_already_submitted') "HTTP $($again.Status)"
}

function Remove-Fixtures($Link, $Fixtures) {
    $deleted = @()
    if ($Fixtures.InvitationId) { $deleted += (Invoke-Crm DELETE "qdb_survey_invitations($($Fixtures.InvitationId))").Ok }
    if ($Fixtures.SetupId) { $deleted += (Invoke-Crm DELETE "qdb_survey_setups($($Fixtures.SetupId))").Ok }
    if ($Fixtures.CustomerId) { $deleted += (Invoke-Crm DELETE "$($Link.Set)($($Fixtures.CustomerId))").Ok }
    Add-Result 'W7' 'Test rows deleted (the response goes with its invitation)' (-not ($deleted -contains $false)) ("{0} of {1} deleted" -f @($deleted | Where-Object { $_ }).Count, $deleted.Count)
}

function Invoke-WriteTest($Link) {
    $version = Get-PinnedVersion
    if ($null -eq $version) { return }
    $fixtures = @{}
    try {
        $fixtures = New-Fixtures $Link $version (Get-Date -Format 'yyyyMMddHHmmss')
        if ($fixtures.InvitationId) { Test-PortalFlow $fixtures }
    } finally {
        Remove-Fixtures $Link $fixtures
    }
}

Write-Host "Survey Engine smoke test on $OrgUrl$(if ($WriteTest) { ' (with write test)' } else { ' (read-only)' })"
$link = Test-ReadOnly
if ($WriteTest -and $link) { Invoke-WriteTest $link }
$failed = @($Results | Where-Object { $_.status -eq 'FAIL' }).Count
[pscustomobject]@{ kind = 'survey-smoke-test'; org = $OrgUrl; ranAt = (Get-Date).ToUniversalTime().ToString('o'); writeTest = $WriteTest.IsPresent; formCode = $FormCode; checks = $Results } |
    ConvertTo-Json -Depth 5 | Set-Content -Path $ReportPath -Encoding UTF8
Write-Host ("{0} of {1} checks passed. Report: {2}" -f ($Results.Count - $failed), $Results.Count, $ReportPath)
if ($failed -gt 0) { exit 1 }
