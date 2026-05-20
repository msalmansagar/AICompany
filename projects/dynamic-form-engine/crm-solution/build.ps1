#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the DynamicFormEngine Dataverse solution zip from the ./src directory.

.DESCRIPTION
    Removes any existing zip artefact, then compresses the contents of ./src/
    into DynamicFormEngine_1_0_0_0.zip at the solution root.
    The zip must contain solution.xml, customizations.xml, and [Content_Types].xml
    at its root — exactly as PAC CLI and the Dataverse import endpoint expect.

.NOTES
    Run from the crm-solution directory:
        cd projects/dynamic-form-engine/crm-solution
        .\build.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SOLUTION_NAME    = 'DynamicFormEngine'
$SOLUTION_VERSION = '1_0_0_0'
$ZIP_NAME         = "${SOLUTION_NAME}_${SOLUTION_VERSION}.zip"
$SRC_DIR          = Join-Path $PSScriptRoot 'src'
$ZIP_PATH         = Join-Path $PSScriptRoot $ZIP_NAME

# ── Step 1: Verify src directory exists ──────────────────────────────────────
if (-not (Test-Path $SRC_DIR)) {
    Write-Error "Source directory not found: $SRC_DIR"
    exit 1
}

$requiredFiles = @('solution.xml', 'customizations.xml', '[Content_Types].xml')
foreach ($file in $requiredFiles) {
    $filePath = Join-Path $SRC_DIR $file
    if (-not (Test-Path $filePath)) {
        Write-Error "Required file missing from src/: $file"
        exit 1
    }
}

# ── Step 2: Remove old zip if it exists ──────────────────────────────────────
if (Test-Path $ZIP_PATH) {
    Write-Host "Removing existing zip: $ZIP_NAME"
    Remove-Item $ZIP_PATH -Force
}

# ── Step 3: Compress src contents into zip ───────────────────────────────────
Write-Host "Building $ZIP_NAME from $SRC_DIR ..."

# Compress-Archive with -Path includes the src folder itself; we use
# the pattern src\* so files land at the zip root, not inside a src\ sub-folder.
Compress-Archive -Path (Join-Path $SRC_DIR '*') -DestinationPath $ZIP_PATH -CompressionLevel Optimal

if (-not (Test-Path $ZIP_PATH)) {
    Write-Error "Build failed — zip was not created."
    exit 1
}

$zipSize = (Get-Item $ZIP_PATH).Length
Write-Host ""
Write-Host "Build succeeded."
Write-Host "  Output : $ZIP_PATH"
Write-Host "  Size   : $([math]::Round($zipSize / 1KB, 1)) KB"
