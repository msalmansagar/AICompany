<#
.SYNOPSIS
  Downloads every RDL from a standalone SSRS report server, so the estate can be graded offline.

.DESCRIPTION
  Uses the ReportService2010 SOAP endpoint, which every SSRS instance from 2008R2 onward exposes.
  Nothing needs installing on the report server and nothing is modified — ListChildren enumerates
  the catalog and GetItemDefinition returns each definition.

  It runs as YOU. The catalog only returns items your Windows account may see, so run it as an
  account that can see every folder or the inventory will be quietly short — an incomplete
  inventory is worse than none, because it produces an estimate everyone believes.

  Two alternatives, if this cannot be used:
    - Microsoft's ReportingServicesTools module:  Out-RsFolderContent -RsFolder / -Destination . -Recurse
    - The ReportServer database directly:
        SELECT Path, Name, CONVERT(varbinary(max), Content) FROM dbo.Catalog WHERE Type = 2
      Fastest for a large estate, but it bypasses permissions entirely — which is either the point
      or a problem, depending on who is asking.

.EXAMPLE
  .\extract-rdls.ps1 -ReportServerUrl "http://crmreports/ReportServer" -Destination .\rdls
#>
param(
  [Parameter(Mandatory = $true)][string]$ReportServerUrl,
  [string]$Destination = ".\rdls",
  [string]$Folder = "/"
)

$ErrorActionPreference = "Stop"
$endpoint = "$($ReportServerUrl.TrimEnd('/'))/ReportService2010.asmx?wsdl"

Write-Host "Connecting to $endpoint"
$rs = New-WebServiceProxy -Uri $endpoint -UseDefaultCredential
Write-Host "Connected as $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"

$items = $rs.ListChildren($Folder, $true) | Where-Object { $_.TypeName -eq "Report" }
Write-Host "Reports visible to this account: $($items.Count)"
if ($items.Count -eq 0) {
  Write-Warning "None found. Check the folder path, and that this account can see the catalog."
  return
}

if (-not (Test-Path $Destination)) { New-Item -ItemType Directory -Path $Destination | Out-Null }

# The catalog is a tree and report names repeat across folders, so the path is flattened into the
# file name. Losing the folder would merge two different reports that happen to share a name.
$manifest = @()
$failed = 0
foreach ($item in $items) {
  $safe = ($item.Path.TrimStart('/') -replace '[\\/:*?"<>|]', '_')
  $file = Join-Path $Destination "$safe.rdl"
  try {
    $definition = $rs.GetItemDefinition($item.Path)
    [System.IO.File]::WriteAllBytes($file, $definition)
    $manifest += [pscustomobject]@{
      Path = $item.Path; Name = $item.Name; File = $file
      Size = $definition.Length; ModifiedBy = $item.ModifiedBy; ModifiedDate = $item.ModifiedDate
    }
    Write-Host "  saved $($item.Path)"
  } catch {
    $failed++
    Write-Warning "  FAILED $($item.Path): $($_.Exception.Message)"
  }
}

$manifest | Export-Csv -Path (Join-Path $Destination "manifest.csv") -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "saved   : $($manifest.Count) of $($items.Count)"
if ($failed) { Write-Warning "failed  : $failed — these are missing from the inventory" }
Write-Host "manifest: $(Join-Path $Destination 'manifest.csv')  (path, owner and last-modified per report)"
Write-Host ""
Write-Host "Next:  node rdl-migrate.mjs $Destination"
