#Requires -Version 5.1
<#
.SYNOPSIS
  Builds the DynamicFormEngine.Plugins assembly and registers it with Dataverse.

.PARAMETER Environment
  Dataverse environment URL. Defaults to $env:DATAVERSE_URL.

.PARAMETER Register
  When present, registers/updates the plugin assembly via PAC CLI after build.

.EXAMPLE
  .\build.ps1
  .\build.ps1 -Register -Environment "https://yourorg.crm.dynamics.com"
#>
param(
    [string]$Environment = $env:DATAVERSE_URL,
    [switch]$Register
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectDir = Join-Path $PSScriptRoot "DynamicFormEngine.Plugins"
$OutputDll  = Join-Path $ProjectDir "bin\Release\net462\DynamicFormEngine.Plugins.dll"

Write-Host "Building plugin assembly..." -ForegroundColor Cyan

dotnet build "$ProjectDir\DynamicFormEngine.Plugins.csproj" `
    --configuration Release `
    --nologo

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed — exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Build succeeded: $OutputDll" -ForegroundColor Green

if ($Register) {
    if (-not $Environment) {
        Write-Error "-Register requires -Environment or DATAVERSE_URL env var to be set."
        exit 1
    }

    Write-Host "Registering plugin with $Environment..." -ForegroundColor Cyan

    pac auth create --url $Environment
    pac plugin push --pluginFile $OutputDll

    Write-Host "Plugin registered." -ForegroundColor Green
}
