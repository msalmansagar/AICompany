<#
.SYNOPSIS
  Validates a solution's customizations.xml against Microsoft's published on-prem XSD
  (CustomizationsSolution.xsd from Schemas.zip, Schemas\9.0.0.2090). Read-only.

.DESCRIPTION
  A 9.x on-prem server validates customizations.xml against its own schema before it changes
  anything, so an element it does not know fails the whole import. This reports every distinct
  violation (message, count, first line) so the kit can be corrected before an import window.
  Exit code 0 = valid, 1 = violations, 2 = bad input.

.EXAMPLE
  powershell -File validate-solution-xsd.ps1 -Customizations <dir>\customizations.xml -SchemaDir <dir>\Schemas\9.0.0.2090 -Report out.json
#>
param(
  [Parameter(Mandatory = $true)][string]$Customizations,
  [Parameter(Mandatory = $true)][string]$SchemaDir,
  [string]$Report
)

if (-not (Test-Path $Customizations) -or -not (Test-Path (Join-Path $SchemaDir 'CustomizationsSolution.xsd'))) {
  Write-Error 'customizations.xml or CustomizationsSolution.xsd not found'
  exit 2
}

$schemas = New-Object System.Xml.Schema.XmlSchemaSet
$schemas.XmlResolver = New-Object System.Xml.XmlUrlResolver
$null = $schemas.Add($null, (Join-Path $SchemaDir 'CustomizationsSolution.xsd'))
$schemas.Compile()

$violations = @{}
$settings = New-Object System.Xml.XmlReaderSettings
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$settings.Schemas = $schemas
$settings.ValidationFlags = $settings.ValidationFlags -bor [System.Xml.Schema.XmlSchemaValidationFlags]::ReportValidationWarnings
$settings.add_ValidationEventHandler({
  param($sender, $eventArgs)
  # Strip the "List of possible elements expected" tail so one cause counts once.
  $key = ($eventArgs.Message -replace "List of possible elements expected:.*$", '').Trim()
  if (-not $violations.ContainsKey($key)) {
    $violations[$key] = [ordered]@{ message = $key; severity = "$($eventArgs.Severity)"; count = 0; firstLine = $eventArgs.Exception.LineNumber }
  }
  $violations[$key].count++
})

$reader = [System.Xml.XmlReader]::Create($Customizations, $settings)
try { while ($reader.Read()) { } } finally { $reader.Close() }

$result = $violations.Values | Sort-Object { $_.firstLine }
foreach ($v in $result) { Write-Output ("{0,5}x  line {1,6}  {2}" -f $v.count, $v.firstLine, $v.message) }
Write-Output ("distinct violations: {0}" -f @($result).Count)
if ($Report) { @($result) | ConvertTo-Json -Depth 4 | Out-File -FilePath $Report -Encoding utf8 }
if (@($result).Count -gt 0) { exit 1 } else { exit 0 }
