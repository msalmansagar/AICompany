#Requires -Version 5.1
<#
.SYNOPSIS
    Deploys the DynamicFormEngine solution to a Dataverse environment via PAC CLI.

.DESCRIPTION
    Checks that pac CLI is on the PATH, then imports the pre-built zip using
    pac solution import.  The --activate-plugins flag is included so any
    registered plugin assemblies are activated on import.

    Prerequisites:
    1. Run .\build.ps1 first to produce the zip.
    2. Authenticate PAC CLI to the target environment:
           pac auth create --url https://<org>.crm.dynamics.com/
       or select an existing profile:
           pac auth select --index <n>

.NOTES
    Run from the crm-solution directory:
        cd projects/dynamic-form-engine/crm-solution
        .\deploy.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SOLUTION_NAME    = 'DynamicFormEngine'
$SOLUTION_VERSION = '1_0_0_0'
$ZIP_NAME         = "${SOLUTION_NAME}_${SOLUTION_VERSION}.zip"
$ZIP_PATH         = Join-Path $PSScriptRoot $ZIP_NAME

# ── Step 1: Check pac CLI is available ───────────────────────────────────────
try {
    $pacVersion = & pac help 2>&1 | Select-Object -First 1
    Write-Host "PAC CLI found: $pacVersion"
} catch {
    Write-Error "pac CLI not found. Install the Power Platform CLI: https://aka.ms/PowerAppsCLI"
    exit 1
}

# ── Step 2: Verify zip exists ─────────────────────────────────────────────────
if (-not (Test-Path $ZIP_PATH)) {
    Write-Error "Solution zip not found: $ZIP_PATH`nRun .\build.ps1 first."
    exit 1
}

# ── Step 3: Import solution ──────────────────────────────────────────────────
Write-Host ""
Write-Host "Importing $ZIP_NAME to the currently selected PAC environment ..."
Write-Host "(To change target, run: pac auth select --index <n>)"
Write-Host ""

pac solution import `
    --path $ZIP_PATH `
    --activate-plugins

if ($LASTEXITCODE -ne 0) {
    Write-Error "pac solution import failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Deployment succeeded."
Write-Host "  Solution : $SOLUTION_NAME"
Write-Host "  Version  : 1.0.0.0"
Write-Host ""
Write-Host "Next step: publish customizations."
Write-Host "  pac solution publish"
