#Requires -Version 5
# merge-plugin.ps1 — Produce a single self-contained CRM plugin assembly.
#
# CRM loads ONE dll into the sandbox, so Qdb.FormEngine.Core + Qdb.FormEngine.Data
# + Newtonsoft.Json must be merged INTO Qdb.FormEngine.Plugins.dll. Microsoft.Xrm.Sdk
# is provided by the CRM sandbox and is referenced (NOT merged).
#
#   Usage:  .\merge-plugin.ps1 [-Configuration Debug|Release]
#   Output: dist\Qdb.FormEngine.Plugins.dll   <-- register THIS in the Plugin Registration Tool
#
# Run after building the solution in Visual Studio (or MSBuild).

param([string]$Configuration = "Release")

$ErrorActionPreference = "Stop"
$base    = $PSScriptRoot
$binDir  = Join-Path $base "Qdb.FormEngine.Plugins\bin\$Configuration"
$distDir = Join-Path $base "dist"
$out     = Join-Path $distDir "Qdb.FormEngine.Plugins.dll"

$ilrepack = Get-ChildItem (Join-Path $base "packages\ILRepack.*\tools\ILRepack.exe") -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
if (-not $ilrepack) { throw "ILRepack.exe not found. Run: nuget install ILRepack -OutputDirectory packages" }

$primary = Join-Path $binDir "Qdb.FormEngine.Plugins.dll"
if (-not (Test-Path $primary)) { throw "Build output not found: $primary. Build the solution in $Configuration first." }

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# Primary first (keeps assembly name + public plugin types); dependencies are internalized.
$inputs = @(
  $primary,
  (Join-Path $binDir "Qdb.FormEngine.Core.dll"),
  (Join-Path $binDir "Qdb.FormEngine.Data.dll"),
  (Join-Path $binDir "Newtonsoft.Json.dll")
)

# Dataverse requires plugin assemblies to be strong-named. Sign the merged output
# with Qdb.FormEngine.snk if present (keep this key so re-registrations keep the
# same public key token = update, not duplicate).
$keyfile = Join-Path $base "Qdb.FormEngine.snk"

if (Test-Path $keyfile) {
  & $ilrepack.FullName /target:library /internalize "/keyfile:$keyfile" "/lib:$binDir" "/out:$out" @inputs
} else {
  Write-Warning "Qdb.FormEngine.snk not found - output will be UNSIGNED and Dataverse will reject it."
  & $ilrepack.FullName /target:library /internalize "/lib:$binDir" "/out:$out" @inputs
}
if ($LASTEXITCODE -ne 0) { throw "ILRepack failed (exit $LASTEXITCODE)" }

$sizeKb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Output ""
Write-Output "Merged self-contained assembly: $out ($sizeKb KB)"
Write-Output "Register THIS file in the Plugin Registration Tool (Sandbox isolation, Database location)."
