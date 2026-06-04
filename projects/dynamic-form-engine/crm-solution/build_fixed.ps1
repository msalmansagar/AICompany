#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the DynamicFormEngine Dataverse solution zip from the src directory.

.DESCRIPTION
    Removes any existing zip file, then compresses the contents of src into
    DynamicFormEngine_1_0_0_0.zip at the solution root.

.NOTES
    Run from the crm-solution directory:
        cd projects/dynamic-form-engine/crm-solution
        .\build_fixed.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SOLUTION_NAME = 'DynamicFormEngine'
$SOLUTION_VERSION = '1_0_0_0'
$ZIP_NAME = "$SOLUTION_NAME`_$SOLUTION_VERSION.zip"
$SRC_DIR = Join-Path -Path $PSScriptRoot -ChildPath 'src'
$ZIP_PATH = Join-Path -Path $PSScriptRoot -ChildPath $ZIP_NAME

# Step 1: Verify src directory exists
if (-not (Test-Path -LiteralPath $SRC_DIR -PathType Container)) {
    Write-Error "Source directory not found: $SRC_DIR"
    exit 1
}

$requiredFiles = @(
    'solution.xml',
    'customizations.xml',
    '[Content_Types].xml'
)

foreach ($file in $requiredFiles) {
    $filePath = Join-Path -Path $SRC_DIR -ChildPath $file
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        Write-Error "Required file missing from src: $file"
        exit 1
    }
}

# Step 2: Remove old zip if it exists
if (Test-Path -LiteralPath $ZIP_PATH -PathType Leaf) {
    Write-Host "Removing existing zip: $ZIP_NAME"
    Remove-Item -LiteralPath $ZIP_PATH -Force
}

# Step 3: Compress src contents into zip
Write-Host "Building $ZIP_NAME from $SRC_DIR ..."

$itemsToZip = Join-Path -Path $SRC_DIR -ChildPath '*'
Compress-Archive -Path $itemsToZip -DestinationPath $ZIP_PATH -CompressionLevel Optimal -Force

if (-not (Test-Path -LiteralPath $ZIP_PATH -PathType Leaf)) {
    Write-Host 'Build failed: ZIP package not created.' -ForegroundColor Red
    exit 1
}

$zipSize = (Get-Item -LiteralPath $ZIP_PATH).Length
$zipSizeKb = [math]::Round($zipSize / 1KB, 1)

Write-Host ''
Write-Host 'Build completed successfully!' -ForegroundColor Green
Write-Host "Package : $ZIP_PATH"
Write-Host "Size    : $zipSizeKb KB"
