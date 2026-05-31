<#
.SYNOPSIS
    Deploys Form Designer web resources directly to Dataverse via the Web API.

.DESCRIPTION
    Uploads every file from the Vite build output to CRM as web resources.
    For Dataverse online: authenticates via OAuth 2.0 device code flow (opens browser).
    For on-premise: uses Windows credentials (NTLM/Kerberos).
    Creates web resources that don't exist; updates those that do.
    Publishes all changes at the end.

.PARAMETER CrmUrl
    Base URL of your CRM organisation.
    Online:    https://yourorg.crm.dynamics.com
    On-prem:   http://crm2016/contoso

.PARAMETER ApiVersion
    OData API version. Defaults to 9.1 (works for CRM 2016+ and Dataverse).

.PARAMETER BuildDir
    Path to the Vite build output, relative to the repo root.
    Defaults to deploy\webresources\qdb_\form-designer

.PARAMETER AccessToken
    Optional. Provide a pre-acquired Bearer token to skip interactive login.

.EXAMPLE
    .\scripts\deploy.ps1 -CrmUrl "https://yourorg.crm.dynamics.com"

.EXAMPLE
    .\scripts\deploy.ps1 -CrmUrl "http://crm2016/contoso"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$CrmUrl,

    [string]$ApiVersion = '9.1',

    [string]$BuildDir = 'deploy\webresources\qdb_\form-designer',

    [string]$AccessToken = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Config -------------------------------------------------------------------

$CrmUrl    = $CrmUrl.TrimEnd('/')
$ApiBase   = "$CrmUrl/api/data/v$ApiVersion"
$RepoRoot  = Resolve-Path (Join-Path $PSScriptRoot '..')
$BuildPath = Join-Path $RepoRoot $BuildDir

$IsOnline  = $CrmUrl -match '\.dynamics\.com'

# CRM webresourcetype option set values
$TypeMap = @{
    '.html' = 1   # Webpage (HTML)
    '.css'  = 2   # Style Sheet (CSS)
    '.js'   = 3   # Script (JScript)
    '.xml'  = 4   # Data (XML)
    '.png'  = 5   # PNG format
    '.jpg'  = 6   # JPG format
    '.gif'  = 7   # GIF format
    '.ico'  = 10  # ICO format
    '.svg'  = 11  # Vector format (SVG)
}

# --- OAuth device code flow (Dataverse online only) ---------------------------

function Get-DataverseToken([string]$resourceUrl) {
    # Well-known public client ID for Power Platform / Dataverse tooling.
    # This is a Microsoft-published multi-tenant public app -- no secret required.
    $clientId = '51f81489-12ee-4a9e-aaae-a2591f45987d'
    $scope     = "$resourceUrl/.default"
    $authBase  = 'https://login.microsoftonline.com/common/oauth2/v2.0'

    Write-Host ''
    Write-Host 'Requesting device code from Microsoft login...'

    $deviceResp = Invoke-RestMethod -Method Post `
        -Uri "$authBase/devicecode" `
        -ContentType 'application/x-www-form-urlencoded' `
        -Body "client_id=$clientId&scope=$([Uri]::EscapeDataString($scope))"

    Write-Host ''
    Write-Host '======================================================'
    Write-Host $deviceResp.message
    Write-Host '======================================================'
    Write-Host ''

    # Poll until the user completes login or the code expires
    $interval  = [int]$deviceResp.interval
    $expiresIn = [int]$deviceResp.expires_in
    $elapsed   = 0

    while ($elapsed -lt $expiresIn) {
        Start-Sleep -Seconds $interval
        $elapsed += $interval

        try {
            $tokenResp = Invoke-RestMethod -Method Post `
                -Uri "$authBase/token" `
                -ContentType 'application/x-www-form-urlencoded' `
                -Body ("client_id=$clientId" +
                       "&grant_type=urn:ietf:params:oauth:grant-type:device_code" +
                       "&device_code=$([Uri]::EscapeDataString($deviceResp.device_code))")

            Write-Host 'Authenticated successfully.' -ForegroundColor Green
            return $tokenResp.access_token
        }
        catch {
            $errBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($errBody.error -eq 'authorization_pending') { continue }
            if ($errBody.error -eq 'authorization_declined') {
                throw 'Login was cancelled by the user.'
            }
            throw $_
        }
    }

    throw 'Device code expired before login completed.'
}

# --- Build OData request headers ----------------------------------------------

function Build-Headers([string]$token) {
    $h = @{
        'Content-Type'     = 'application/json; charset=utf-8'
        'Accept'           = 'application/json'
        'OData-MaxVersion' = '4.0'
        'OData-Version'    = '4.0'
    }
    if ($token) { $h['Authorization'] = "Bearer $token" }
    return $h
}

# --- HTTP helpers -------------------------------------------------------------

function Invoke-CrmGet([string]$rel, [string]$token) {
    return Invoke-RestMethod -Uri "$ApiBase/$rel" -Method Get `
        -UseDefaultCredentials:(-not $token) `
        -Headers (Build-Headers $token)
}

function Invoke-CrmPatch([string]$rel, [hashtable]$body, [string]$token) {
    return Invoke-RestMethod -Uri "$ApiBase/$rel" -Method Patch `
        -UseDefaultCredentials:(-not $token) `
        -Headers (Build-Headers $token) `
        -Body ($body | ConvertTo-Json -Depth 10)
}

function Invoke-CrmPost([string]$rel, [hashtable]$body, [string]$token) {
    $headers = Build-Headers $token
    $headers['Prefer'] = 'return=minimal'
    return Invoke-RestMethod -Uri "$ApiBase/$rel" -Method Post `
        -UseDefaultCredentials:(-not $token) `
        -Headers $headers `
        -Body ($body | ConvertTo-Json -Depth 10)
}

# --- Web resource operations --------------------------------------------------

function Find-WebResource([string]$name, [string]$token) {
    $encoded = [Uri]::EscapeDataString($name)
    $result  = Invoke-CrmGet "webresourceset?`$filter=name eq '$encoded'&`$select=webresourceid,name" $token
    if ($result.value -and $result.value.Count -gt 0) {
        return $result.value[0].webresourceid
    }
    return $null
}

function Deploy-WebResource([string]$name, [int]$type, [string]$base64, [string]$token) {
    $existingId = Find-WebResource $name $token

    $body = @{
        name            = $name
        displayname     = $name
        webresourcetype = $type
        content         = $base64
    }

    if ($existingId) {
        Write-Host "  UPDATE  $name"
        Invoke-CrmPatch "webresourceset($existingId)" $body $token | Out-Null
        return $existingId
    }
    else {
        Write-Host "  CREATE  $name"
        Invoke-CrmPost 'webresourceset' $body $token | Out-Null
        return $null
    }
}

function Publish-WebResources([string[]]$names, [string]$token) {
    $parts = $names | ForEach-Object { "<webresource>$_</webresource>" }
    $xml   = "<importexportxml><webresources>$($parts -join '')</webresources></importexportxml>"
    Invoke-CrmPost 'PublishXml' @{ ParameterXml = $xml } $token | Out-Null
}

# --- Main ---------------------------------------------------------------------

Write-Host ''
Write-Host 'Form Designer - Direct Deploy'
Write-Host ('-' * 48)
Write-Host "CRM URL : $CrmUrl"
Write-Host "API     : $ApiBase"
Write-Host "Source  : $BuildPath"
Write-Host ''

# Validate build output exists
if (-not (Test-Path $BuildPath)) {
    Write-Error "Build output not found at: $BuildPath`nRun: npm run build"
    exit 1
}

$files = Get-ChildItem -Path $BuildPath -Recurse -File
if ($files.Count -eq 0) {
    Write-Error 'No files found in build output. Run: npm run build'
    exit 1
}

# Acquire token for Dataverse online; skip for on-premise
$bearerToken = ''
if ($AccessToken) {
    $bearerToken = $AccessToken
    Write-Host 'Using provided access token.'
}
elseif ($IsOnline) {
    $bearerToken = Get-DataverseToken $CrmUrl
}
else {
    Write-Host 'On-premise detected: using Windows credentials (NTLM/Kerberos).'
}

Write-Host ''
Write-Host "Found $($files.Count) file(s) to deploy:"

$deployedNames = [System.Collections.Generic.List[string]]::new()
$failed        = [System.Collections.Generic.List[string]]::new()

foreach ($file in $files) {
    $relativePath    = $file.FullName.Substring($BuildPath.Length + 1).Replace('\', '/')
    $webResourceName = "qdb_/form-designer/$relativePath"
    $type            = if ($TypeMap.ContainsKey($file.Extension.ToLower())) { $TypeMap[$file.Extension.ToLower()] } else { 3 }
    $base64          = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))

    try {
        Deploy-WebResource $webResourceName $type $base64 $bearerToken | Out-Null
        $deployedNames.Add($webResourceName)
    }
    catch {
        Write-Host "  FAILED  $webResourceName" -ForegroundColor Red
        Write-Host "          $_" -ForegroundColor Red
        $failed.Add($webResourceName)
    }
}

Write-Host ''

if ($deployedNames.Count -gt 0) {
    Write-Host "Publishing $($deployedNames.Count) web resource(s)..."
    try {
        Publish-WebResources $deployedNames.ToArray() $bearerToken
        Write-Host 'Published successfully.' -ForegroundColor Green
    }
    catch {
        Write-Host "Publish step failed: $_" -ForegroundColor Red
    }
}

Write-Host ''
Write-Host ('-' * 48)
Write-Host "Deployed : $($deployedNames.Count) / $($files.Count)"
if ($failed.Count -gt 0) {
    Write-Host "Failed   : $($failed.Count)" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}
else {
    Write-Host 'All files deployed successfully.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Open in browser:'
    Write-Host "  $CrmUrl/WebResources/qdb_/form-designer/index.html"
}
Write-Host ''
