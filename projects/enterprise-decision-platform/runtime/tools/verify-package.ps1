<#
  Verifies a built Rule Engine plug-in package (qdb_EdpRuleRuntime.*.nupkg) before it can be
  released. Expected values are read, never hard-coded: the release version from
  runtime/Directory.Build.props, the plug-in types from deploy/registration/rule-engine-registration.json.

  Checks
    - nuspec id, and version == DataversePluginPackageVersion (the immutable package record)
    - both EDP assemblies carry AssemblyVersion == RuleEngineVersion.0 and are unsigned (ADR-18)
    - no Microsoft.Xrm / Microsoft.Crm assembly is shipped (the sandbox provides them)
    - System.Text.Json and NCalc are shipped (dependent-assembly model)
    - the IPlugin types in the package are exactly the contract's pluginTypes

  Usage (Windows PowerShell 5.1 or pwsh on Windows — plug-in assemblies target .NET Framework):
    ./runtime/tools/verify-package.ps1 -PackagePath runtime/src/EDP.RuleRuntime.Crm/bin/Release/qdb_EdpRuleRuntime.1.0.0.nupkg -SdkDirectory <folder with Microsoft.Xrm.Sdk.dll>
#>
param(
  [Parameter(Mandatory = $true)] [string] $PackagePath,
  [Parameter(Mandatory = $true)] [string] $SdkDirectory
)
$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$failures = New-Object System.Collections.Generic.List[string]

function Read-BuildProperty([string] $name) {
  [xml] $props = Get-Content (Join-Path $projectRoot 'runtime\Directory.Build.props')
  # @() keeps a single match an array; indexing a bare string would return its first character.
  return @($props.Project.PropertyGroup | ForEach-Object { $_.$name } | Where-Object { $_ })[0]
}

function Expand-Package([string] $path) {
  $target = Join-Path ([System.IO.Path]::GetTempPath()) ("edp-pkg-" + [guid]::NewGuid())
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path $path), $target)
  return $target
}

function Get-PublicKeyToken([System.Reflection.AssemblyName] $name) {
  return (($name.GetPublicKeyToken() | ForEach-Object { $_.ToString('x2') }) -join '')
}

$releaseVersion = Read-BuildProperty 'RuleEngineVersion'
$packageRecordVersion = Read-BuildProperty 'DataversePluginPackageVersion'
$contract = Get-Content (Join-Path $projectRoot 'deploy\registration\rule-engine-registration.json') -Raw | ConvertFrom-Json
$extracted = Expand-Package $PackagePath
$lib = Join-Path $extracted 'lib\net462'

[xml] $nuspec = Get-Content (Get-ChildItem $extracted -Filter *.nuspec | Select-Object -First 1).FullName
if ($nuspec.package.metadata.id -ne 'qdb_EdpRuleRuntime') { $failures.Add("nuspec id is '$($nuspec.package.metadata.id)'") }
if ($nuspec.package.metadata.version -ne $packageRecordVersion) { $failures.Add("nuspec version '$($nuspec.package.metadata.version)' is not the package record version '$packageRecordVersion'") }

foreach ($assemblyFile in 'EDP.RuleRuntime.Crm.dll', 'EDP.RuleRuntime.dll') {
  $name = [System.Reflection.AssemblyName]::GetAssemblyName((Join-Path $lib $assemblyFile))
  if ($name.Version.ToString() -ne "$releaseVersion.0") { $failures.Add("$assemblyFile is $($name.Version), expected $releaseVersion.0") }
  if (Get-PublicKeyToken $name) { $failures.Add("$assemblyFile is signed; the cloud package ships unsigned (ADR-18)") }
}

$sdkShipped = Get-ChildItem $lib -Filter *.dll | Where-Object { $_.Name -match '^Microsoft\.(Xrm|Crm)\.' }
if ($sdkShipped) { $failures.Add("Dataverse SDK assemblies shipped: $($sdkShipped.Name -join ', ')") }
foreach ($dependency in 'System.Text.Json.dll', 'NCalc.Core.dll', 'NCalc.Sync.dll') {
  if (-not (Test-Path (Join-Path $lib $dependency))) { $failures.Add("dependent assembly $dependency is missing") }
}

$searchDirectories = @($lib, (Resolve-Path $SdkDirectory).Path)
[AppDomain]::CurrentDomain.add_AssemblyResolve([System.ResolveEventHandler] {
  param($sender, $eventArgs)
  $shortName = ($eventArgs.Name -split ',')[0]
  foreach ($directory in $searchDirectories) {
    $candidate = Join-Path $directory "$shortName.dll"
    if (Test-Path $candidate) { return [System.Reflection.Assembly]::LoadFrom($candidate) }
  }
  return $null
})
$pluginInterface = [System.Reflection.Assembly]::LoadFrom((Join-Path $SdkDirectory 'Microsoft.Xrm.Sdk.dll')).GetType('Microsoft.Xrm.Sdk.IPlugin')
$pluginAssembly = [System.Reflection.Assembly]::LoadFrom((Join-Path $lib 'EDP.RuleRuntime.Crm.dll'))
$found = @($pluginAssembly.GetTypes() | Where-Object { $_.IsClass -and -not $_.IsAbstract -and $pluginInterface.IsAssignableFrom($_) } | ForEach-Object { $_.FullName } | Sort-Object)
$expected = @($contract.pluginTypes | Sort-Object)
$difference = Compare-Object $expected $found
if ($difference) { $failures.Add("IPlugin types differ from the contract: $($difference | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" })") }

# The extracted folder is left in the temp directory: the loaded assemblies stay locked by this
# process, and the folder holds nothing but the package contents.
Write-Output "extracted to: $extracted"
Write-Output "package: $PackagePath"
Write-Output "release $releaseVersion | package record $packageRecordVersion | IPlugin types $($found.Count)"
if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Output "FAIL  $_" }
  exit 1
}
Write-Output 'PASS  package verified'
